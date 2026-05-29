// Strapi 5 uses link tables for relations — there is no users_permissions_user_id
// column on the reviews table. Instead, the relation is stored in
// reviews_users_permissions_user_lnk (user_id FK → up_users.id ON DELETE CASCADE).
//
// The current CASCADE behaviour already achieves what we need:
// when a user is hard-deleted the link row is removed and the review becomes
// effectively anonymous (users_permissions_user = null when populated).
//
// For the scheduled-deletion (grace-period) path we explicitly delete rows
// from the link table in orphanReviewsForUsers() using strapi.db.connection(),
// so no schema change is required.
//
// This migration is intentionally a no-op to avoid touching a schema that is
// already correct. It exists only so that Strapi's migration runner records it
// as applied and does not error on startup.

export async function up(_knex: any) {
  // No-op: Strapi 5 link-table FK already behaves correctly.
}

export async function down(_knex: any) {
  // No-op.
}