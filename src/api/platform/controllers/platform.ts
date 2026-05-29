/**
 * Platform controller — GET /api/platform/stats
 * Returns aggregate platform stats for the public plans page.
 * No authentication required.
 */

export default {
  async stats(ctx: any) {
    try {
      const [reviewCount, businessCount] = await Promise.all([
        strapi.db.query('api::review.review').count({
          where: { publishedAt: { $notNull: true } },
        }),
        strapi.db.query('api::business.business').count({
          where: { publishedAt: { $notNull: true } },
        }),
      ]);

      ctx.body = { data: { reviewCount, businessCount } };
    } catch {
      ctx.body = { data: { reviewCount: 0, businessCount: 0 } };
    }
  },
};
