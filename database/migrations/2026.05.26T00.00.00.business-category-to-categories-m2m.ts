/**
 * Migration: copy legacy businesses.category_id into categories M2M link table.
 *
 * Run after Strapi schema sync creates `businesses_categories_lnk` (or equivalent).
 * Safe to re-run: skips rows that already exist in the link table.
 */

const LINK_TABLE_CANDIDATES = [
  'businesses_categories_lnk',
  'businesses_category_lnk',
  'businesses_categories_links',
];

export async function up(knex: any) {
  const hasCategoryColumn = await knex.schema.hasColumn('businesses', 'category_id');
  if (!hasCategoryColumn) {
    return;
  }

  let linkTable: string | null = null;
  for (const candidate of LINK_TABLE_CANDIDATES) {
    if (await knex.schema.hasTable(candidate)) {
      linkTable = candidate;
      break;
    }
  }
  if (!linkTable) {
    return;
  }

  const rows = await knex('businesses')
    .whereNotNull('category_id')
    .select('id', 'category_id');

  if (!rows.length) {
    return;
  }

  const linkColumns = await knex(linkTable).columnInfo();
  const businessCol = linkColumns.business_id
    ? 'business_id'
    : linkColumns.business_ord
      ? 'business_id'
      : null;
  const categoryCol = linkColumns.category_id ? 'category_id' : null;

  if (!businessCol || !categoryCol) {
    return;
  }

  for (const row of rows) {
    const businessId = row.id;
    const categoryId = row.category_id;
    if (businessId == null || categoryId == null) continue;

    const existing = await knex(linkTable)
      .where({ [businessCol]: businessId, [categoryCol]: categoryId })
      .first();

    if (existing) continue;

    const insert: Record<string, unknown> = {
      [businessCol]: businessId,
      [categoryCol]: categoryId,
    };

    await knex(linkTable).insert(insert);
  }
}

export async function down() {
  // Data migration is not reversed automatically.
}
