import { buildPublishedReviewCountWhere } from "./publishedReviewCountWhere";

/**
 * computeUserLevel — recomputes a user's reviewer level from their current
 * published review count and returns the matching reviewer-level record ID.
 *
 * This is the authoritative server-side level computation. It is called from
 * review lifecycle hooks (afterCreate / afterUpdate / afterDelete) to keep the
 * `reviewer_level` FK on the User record in sync.
 *
 * Returns the numeric ID of the highest qualifying ReviewerLevel, or null when
 * no level has a min_reviews threshold of 0 and the user has no reviews yet.
 */

export async function computeUserLevel(
  strapiInstance: typeof strapi,
  userId: number,
): Promise<number | null> {
  // 1. Count the user's eligible published reviews (same filter as stats endpoints)
  const reviewCount: number = await strapiInstance.db
    .query("api::review.review")
    .count({
      where: buildPublishedReviewCountWhere(userId),
    });

  // 2. Load all configured levels, highest threshold first
  const levels: Array<{ id: number; min_reviews: number }> =
    await strapiInstance.db
      .query("api::reviewer-level.reviewer-level")
      .findMany({ orderBy: { min_reviews: "desc" } });

  if (!levels.length) return null;

  // 3. Find the first level whose threshold the user meets
  const matched = levels.find((l) => reviewCount >= l.min_reviews);
  return matched?.id ?? null;
}
