/**
 * Extended User Controller for users-permissions plugin
 * Overrides user update endpoint to properly handle user updates
 */

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  scheduleUserAccountDeletion,
} from '../services/account-deletion';

export default (plugin: any) => {
  // Store the original update method
  const originalUpdate = plugin.controllers.user.update;

  const resolveAuthenticatedUser = async (ctx: any): Promise<any> => {
    let user = ctx.state.user;

    if (user) {
      return user;
    }

    const authHeader = ctx.request?.header?.authorization ||
      ctx.request?.headers?.authorization ||
      ctx.headers?.authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    try {
      const token = authHeader.replace('Bearer ', '').trim();
      const jwt = strapi.plugin('users-permissions').service('jwt');
      const payload = await jwt.verify(token);
      const userId = payload.id || payload.user?.id || payload;

      user = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: userId },
        populate: ['role'],
      });

      if (user) {
        ctx.state.user = user;
      }

      return user;
    } catch (error) {
      strapi.log.error('Error verifying JWT token:', error);
      return null;
    }
  };

  // Override the update method
  plugin.controllers.user.update = async (ctx: any) => {
    const { id } = ctx.params;
    const { body } = ctx.request;

    // Get user from state (populated by JWT middleware)
    let user = await resolveAuthenticatedUser(ctx);

    // If still no user, return unauthorized
    if (!user) {
      return ctx.unauthorized('You must be logged in to update your profile.');
    }

    // For /api/users/me endpoint, use the authenticated user's ID
    const userId = id === 'me' ? user.id : id;

    // Verify the user is updating their own profile
    if (userId !== user.id) {
      return ctx.forbidden('You can only update your own profile.');
    }

    try {
      // Prepare update data - only include fields that exist on the user schema.
      // Note: User schema has no "country" attribute; "province" is a relation (oneToOne to Province).
      const updateData: any = {};

      if (body.firstName !== undefined) {
        updateData.firstName = body.firstName;
      }
      if (body.lastName !== undefined) {
        updateData.lastName = body.lastName;
      }
      if (body.phoneNumber !== undefined) {
        updateData.phoneNumber = body.phoneNumber;
      }
      if (body.profileImage !== undefined) {
        updateData.profileImage = body.profileImage;
      }
      if (body.coverPhoto !== undefined) {
        updateData.coverPhoto = body.coverPhoto;
      }
      if (body.showProvinceOnPublicProfile !== undefined) {
        updateData.showProvinceOnPublicProfile = !!body.showProvinceOnPublicProfile;
      }

      // Province is a relation (oneToOne) - same pattern as role: set ID directly.
      if (body.province !== undefined) {
        const raw = body.province;
        if (raw === null || raw === '') {
          updateData.province = null;
        } else if (typeof raw === 'number' && Number.isInteger(raw)) {
          updateData.province = raw;
        } else if (typeof raw === 'string') {
          const asNum = Number.parseInt(raw, 10);
          if (!Number.isNaN(asNum)) {
            updateData.province = asNum;
          } else {
            // Frontend sends form value: slug (e.g. "luanda", "cuanza-norte") or name (e.g. "Luanda")
            // Match by name (case-insensitive) or by name-as-slug (spaces -> hyphens)
            const provinces = await strapi.db.query('api::province.province').findMany({
              where: {},
            });
            const rawLower = raw.toLowerCase().trim();
            const match = Array.isArray(provinces)
              ? provinces.find((p: any) => {
                  const name = (p?.name || '').toLowerCase();
                  const nameAsSlug = name.replace(/\s+/g, '-');
                  return name === rawLower || nameAsSlug === rawLower;
                })
              : null;
            if (match?.id) {
              updateData.province = match.id;
            }
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        // No valid fields to update - return current user
        const current = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: { id: userId },
          populate: ['role', 'province'],
        });
        if (!current) return ctx.notFound('User not found');
        const { password, resetPasswordToken, confirmationToken, ...userResponse } = current;
        return ctx.send(userResponse);
      }

      // Update the user using Strapi's query API (same pattern as firstName/lastName/role)
      const updatedUser = await strapi.db.query('plugin::users-permissions.user').update({
        where: { id: userId },
        data: updateData,
        populate: ['role', 'province'],
      });

      if (!updatedUser) {
        return ctx.notFound('User not found');
      }

      // Return the updated user (excluding sensitive fields)
      const { password, resetPasswordToken, confirmationToken, ...userResponse } = updatedUser;

      return ctx.send(userResponse);
    } catch (error: any) {
      strapi.log.error('Error updating user:', error?.message ?? error);
      if (error?.stack) strapi.log.debug(error.stack);
      return ctx.internalServerError('An error occurred while updating the user profile.');
    }
  };

  const originalDestroy = plugin.controllers.user.destroy;

  plugin.controllers.user.destroy = async (ctx: any) => {
    const { id } = ctx.params;

    if (id !== 'me') {
      return originalDestroy(ctx);
    }

    const user = await resolveAuthenticatedUser(ctx);
    if (!user) {
      return ctx.unauthorized('You must be logged in to delete your profile.');
    }

    try {
      const result = await scheduleUserAccountDeletion(
        strapi,
        user.id,
        ctx.request?.headers?.['accept-language'],
      );

      ctx.body = {
        success: true,
        status: 'pending_deletion',
        gracePeriodDays: ACCOUNT_DELETION_GRACE_DAYS,
        scheduledDeletionAt: result.scheduledDeletionAt,
        alreadyPending: result.alreadyPending,
      };
      return;
    } catch (error: any) {
      if (error?.status === 403) {
        return ctx.forbidden(error.message);
      }
      if (error?.status === 404) {
        return ctx.notFound(error.message);
      }
      if (error?.status === 400) {
        return ctx.badRequest(error.message);
      }

      strapi.log.error('Error scheduling account deletion:', error?.message ?? error);
      if (error?.stack) strapi.log.debug(error.stack);
      return ctx.internalServerError('Failed to schedule account deletion.');
    }
  };

  return plugin;
};

