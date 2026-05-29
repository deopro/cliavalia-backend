import type { Core } from "@strapi/strapi";

const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * POST /api/qr/scan
   *
   * Tracks a QR code scan for a given business.
   * Public endpoint — rate-limited to 1 log per IP per business per hour.
   */
  async scan(ctx) {
    const { businessSlug } = ctx.request.body ?? {};

    if (!businessSlug || typeof businessSlug !== "string") {
      return ctx.badRequest("businessSlug is required");
    }

    // Sanitise slug: only allow URL-safe characters
    const slug = businessSlug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return ctx.badRequest("Invalid business slug");
    }

    try {
      // Look up business by slug
      const business = await strapi.db
        .query("api::business.business")
        .findOne({
          where: { slug },
          select: ["id"],
        });

      if (!business) {
        return ctx.notFound("Business not found");
      }

      // Rate-limit: 1 scan per IP per business per hour
      const ip =
        ctx.request.ip ||
        ctx.request.headers["x-forwarded-for"] ||
        "unknown";

      const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

      const recentScan = await strapi.db
        .query("api::qr-scan-log.qr-scan-log")
        .findOne({
          where: {
            business: business.id,
            referer: ip,
            scannedAt: { $gte: oneHourAgo },
          },
        });

      if (recentScan) {
        return ctx.send({ data: { deduplicated: true } }, 200);
      }

      // Create scan log entry
      await strapi.db.query("api::qr-scan-log.qr-scan-log").create({
        data: {
          business: business.id,
          scannedAt: new Date(),
          userAgent: (ctx.request.headers["user-agent"] || "").slice(0, 255),
          referer: (typeof ip === "string" ? ip : String(ip)).slice(0, 255),
        },
      });

      return ctx.send({ data: { tracked: true } }, 201);
    } catch (error: any) {
      strapi.log.error("QR scan tracking error:", {
        slug,
        error: error.message,
      });
      return ctx.internalServerError(
        "An error occurred while tracking the QR scan."
      );
    }
  },

  /**
   * GET /api/qr/analytics
   *
   * Returns QR analytics for the authenticated business owner.
   * Auth: false on the route — we verify the JWT manually here.
   */
  async analytics(ctx) {
    try {
      // Manual JWT verification
      const authHeader = ctx.request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return ctx.unauthorized("Authorization header required");
      }

      const token = authHeader.replace("Bearer ", "");
      let userId: number;
      try {
        const jwtService = strapi.plugin("users-permissions").service("jwt");
        const payload = await jwtService.verify(token);
        userId = payload.id;
      } catch {
        return ctx.unauthorized("Invalid or expired token");
      }

      if (!userId) {
        return ctx.unauthorized("Authentication required");
      }

      // Find the business owned by this user
      const business = await strapi.db
        .query("api::business.business")
        .findOne({
          where: { owner: userId },
          select: ["id"],
        });

      if (!business) {
        return ctx.notFound("No business found for this user");
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);

      // Fetch all scan logs for this business
      const allScans = await strapi.db
        .query("api::qr-scan-log.qr-scan-log")
        .findMany({
          where: { business: business.id },
          select: ["scannedAt", "createdAt"],
          orderBy: { scannedAt: "desc" },
        });

      // Fetch all reviews with source=qr for this business
      const allQrReviews = await strapi.db
        .query("api::review.review")
        .findMany({
          where: { business: business.id, source: "qr" },
          select: ["createdAt"],
          orderBy: { createdAt: "desc" },
        });

      const totalScans = allScans.length;
      const totalReviewsFromQr = allQrReviews.length;
      const conversionRate =
        totalScans > 0
          ? Math.round((totalReviewsFromQr / totalScans) * 100 * 10) / 10
          : 0;

      const scansLast30Days = allScans.filter((s) => {
        const d = s.scannedAt || s.createdAt;
        return d && new Date(d) >= thirtyDaysAgo;
      }).length;

      const reviewsLast30Days = allQrReviews.filter(
        (r) => r.createdAt && new Date(r.createdAt) >= thirtyDaysAgo,
      ).length;

      const dailyScans = buildDailyBreakdown(
        allScans,
        thirtyDaysAgo,
        now,
        (s) => s.scannedAt || s.createdAt,
      );
      const dailyReviews = buildDailyBreakdown(
        allQrReviews,
        thirtyDaysAgo,
        now,
        (r) => r.createdAt,
      );

      return ctx.send({
        totalScans,
        totalReviewsFromQr,
        conversionRate,
        scansLast30Days,
        reviewsLast30Days,
        dailyScans,
        dailyReviews,
      });
    } catch (error: any) {
      strapi.log.error("QR analytics error:", { error: error.message });
      return ctx.internalServerError(
        "An error occurred while loading QR analytics."
      );
    }
  },
});

function buildDailyBreakdown<T extends Record<string, unknown>>(
  items: T[],
  from: Date,
  to: Date,
  getDate: (item: T) => unknown,
): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    buckets.set(current.toISOString().slice(0, 10), 0);
    current.setDate(current.getDate() + 1);
  }

  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    const day = new Date(raw as string | Date).toISOString().slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
