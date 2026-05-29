/**
 * Migration: Rename 'status' column to 'claim_status' in business_claims table
 * 
 * This is needed because 'status' is a reserved field name in Strapi v5
 * that conflicts with document status handling.
 */

export async function up(knex: any) {
  const tableName = 'business_claims';
  
  // Check if table exists
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) {
    console.log(`[MIGRATION] Table ${tableName} does not exist, skipping migration`);
    return;
  }

  // Check if old column exists
  const hasStatusColumn = await knex.schema.hasColumn(tableName, 'status');
  const hasClaimStatusColumn = await knex.schema.hasColumn(tableName, 'claim_status');

  if (hasStatusColumn && !hasClaimStatusColumn) {
    console.log(`[MIGRATION] Renaming 'status' to 'claim_status' in ${tableName}`);
    await knex.schema.alterTable(tableName, (table: any) => {
      table.renameColumn('status', 'claim_status');
    });
    console.log(`[MIGRATION] Successfully renamed column`);
  } else if (hasClaimStatusColumn) {
    console.log(`[MIGRATION] Column 'claim_status' already exists in ${tableName}, skipping`);
  } else {
    console.log(`[MIGRATION] Column 'status' not found in ${tableName}, creating 'claim_status'`);
    await knex.schema.alterTable(tableName, (table: any) => {
      table.string('claim_status').defaultTo('pending');
    });
  }
}

export async function down(knex: any) {
  const tableName = 'business_claims';
  
  const tableExists = await knex.schema.hasTable(tableName);
  if (!tableExists) {
    return;
  }

  const hasClaimStatusColumn = await knex.schema.hasColumn(tableName, 'claim_status');
  const hasStatusColumn = await knex.schema.hasColumn(tableName, 'status');

  if (hasClaimStatusColumn && !hasStatusColumn) {
    console.log(`[MIGRATION] Rolling back: Renaming 'claim_status' to 'status' in ${tableName}`);
    await knex.schema.alterTable(tableName, (table: any) => {
      table.renameColumn('claim_status', 'status');
    });
  }
}















