/**
 * review-draft controller
 *
 * Enforces that users can only access their own drafts.
 * Uses direct DB queries (like the review controller) to support
 * both numeric ID and documentId lookups.
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::review-draft.review-draft',
  ({ strapi }) => ({
    async create(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Deves fazer login para guardar um rascunho.');
      }

      const body = ctx.request.body?.data ?? ctx.request.body ?? {};

      try {
        const draft = await strapi.db
          .query('api::review-draft.review-draft')
          .create({
            data: {
              ...body,
              users_permissions_user: user.id,
            },
            populate: {
              business: { fields: ['id', 'name'] },
              experiencePhotos: true,
              audioReview: true,
            },
          });

        return ctx.created({ data: draft });
      } catch (error: any) {
        strapi.log.error('Error creating review draft:', error);
        return ctx.internalServerError('Ocorreu um erro ao guardar o rascunho.');
      }
    },

    async find(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Deves fazer login para ver os teus rascunhos.');
      }

      ctx.query = {
        ...ctx.query,
        filters: {
          ...(ctx.query.filters as Record<string, unknown> || {}),
          users_permissions_user: { id: { $eq: user.id } },
        },
      };

      return super.find(ctx);
    },

    async update(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Deves fazer login para atualizar um rascunho.');
      }

      const { id } = ctx.params;

      const isNumeric = /^\d+$/.test(String(id));
      const where = isNumeric ? { id: Number(id) } : { documentId: String(id) };

      const draft = await strapi.db
        .query('api::review-draft.review-draft')
        .findOne({
          where,
          populate: ['users_permissions_user'],
        });

      if (!draft) {
        return ctx.notFound('Rascunho não encontrado.');
      }
      if (draft.users_permissions_user?.id !== user.id) {
        return ctx.forbidden('Só podes atualizar os teus próprios rascunhos.');
      }

      const body = ctx.request.body?.data ?? ctx.request.body ?? {};

      try {
        const updated = await strapi.db
          .query('api::review-draft.review-draft')
          .update({
            where: { id: draft.id },
            data: body,
            populate: {
              business: { fields: ['id', 'name'] },
              experiencePhotos: true,
              audioReview: true,
            },
          });

        return { data: updated };
      } catch (error: any) {
        strapi.log.error('Error updating review draft:', error);
        return ctx.internalServerError('Ocorreu um erro ao atualizar o rascunho.');
      }
    },

    async delete(ctx) {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized('Deves fazer login para eliminar um rascunho.');
      }

      const { id } = ctx.params;

      const isNumeric = /^\d+$/.test(String(id));
      const where = isNumeric ? { id: Number(id) } : { documentId: String(id) };

      const draft = await strapi.db
        .query('api::review-draft.review-draft')
        .findOne({
          where,
          populate: ['users_permissions_user'],
        });

      if (!draft) {
        return ctx.notFound('Rascunho não encontrado.');
      }
      if (draft.users_permissions_user?.id !== user.id) {
        return ctx.forbidden('Só podes eliminar os teus próprios rascunhos.');
      }

      try {
        await strapi.db
          .query('api::review-draft.review-draft')
          .delete({ where: { id: draft.id } });

        return { data: { id: draft.id } };
      } catch (error: any) {
        strapi.log.error('Error deleting review draft:', error);
        return ctx.internalServerError('Ocorreu um erro ao eliminar o rascunho.');
      }
    },
  })
);
