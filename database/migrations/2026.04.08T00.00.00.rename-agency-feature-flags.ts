/**
 * Migration: Rename feature flag keys from agency/branch terminology to location terminology.
 *
 * Renames 6 keys in the Strapi core_store (site-settings scope):
 *   planFree_multiAgency        → planFree_multiLocation
 *   planPro_multiAgency         → planPro_multiLocation
 *   planEnterprise_multiAgency  → planEnterprise_multiLocation
 *   planFree_branchComparison        → planFree_locationComparison
 *   planPro_branchComparison         → planPro_locationComparison
 *   planEnterprise_branchComparison  → planEnterprise_locationComparison
 *
 * Old keys are preserved temporarily for rollback safety.
 */

const KEY_RENAMES: [string, string][] = [
  ['planFree_multiAgency', 'planFree_multiLocation'],
  ['planPro_multiAgency', 'planPro_multiLocation'],
  ['planEnterprise_multiAgency', 'planEnterprise_multiLocation'],
  ['planFree_branchComparison', 'planFree_locationComparison'],
  ['planPro_branchComparison', 'planPro_locationComparison'],
  ['planEnterprise_branchComparison', 'planEnterprise_locationComparison'],
];

export async function up(knex: any) {
  for (const [oldKey, newKey] of KEY_RENAMES) {
    const fullOldKey = `plugin_content_manager_configuration_content_types::core::site-settings::${oldKey}`;
    const fullNewKey = `plugin_content_manager_configuration_content_types::core::site-settings::${newKey}`;

    // Try Strapi v5 core_store format first (key = plain key with type/name scope)
    const oldRow = await knex('strapi_core_store_settings')
      .where({ key: `core::site-settings::${oldKey}` })
      .first();

    if (oldRow) {
      // Copy value to new key
      const existing = await knex('strapi_core_store_settings')
        .where({ key: `core::site-settings::${newKey}` })
        .first();

      if (!existing) {
        await knex('strapi_core_store_settings').insert({
          key: `core::site-settings::${newKey}`,
          value: oldRow.value,
          type: oldRow.type,
          environment: oldRow.environment || null,
          tag: oldRow.tag || null,
        });
      }
      // Keep old key for rollback safety — can be cleaned up later
      continue;
    }

    // Fallback: try simpler key format (Strapi store adapter varies by version)
    const simpleOldRow = await knex('strapi_core_store_settings')
      .where({ key: oldKey })
      .first();

    if (simpleOldRow) {
      const existing = await knex('strapi_core_store_settings')
        .where({ key: newKey })
        .first();

      if (!existing) {
        await knex('strapi_core_store_settings').insert({
          key: newKey,
          value: simpleOldRow.value,
          type: simpleOldRow.type,
          environment: simpleOldRow.environment || null,
          tag: simpleOldRow.tag || null,
        });
      }
    }
  }
}

export async function down(knex: any) {
  // Rollback: remove the new keys (old keys were preserved)
  for (const [, newKey] of KEY_RENAMES) {
    await knex('strapi_core_store_settings')
      .where({ key: `core::site-settings::${newKey}` })
      .orWhere({ key: newKey })
      .del();
  }
}
