/**
 * Shared filter for counting reviews that qualify toward reviewer level /
 * public stats (published, live, not flagged, not awaiting entity approval).
 */
export function buildPublishedReviewCountWhere(userId: number) {
  return {
    users_permissions_user: { id: userId },
    is_published: true,
    awaitingEntityApproval: { $ne: true },
    $and: [
      { moderation_status: { $ne: "Sinalizada" } },
      { moderation_status: { $ne: "Flagged" } },
    ],
  };
}
