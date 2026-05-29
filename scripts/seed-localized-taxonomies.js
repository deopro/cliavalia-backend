#!/usr/bin/env node

/**
 * Seed localized sectors and categories.
 *
 * - Duplicates `sector` and `category` records from the base locale (default: pt) into a target locale (default: en)
 * - Respects existing localizations (won't duplicate if already present)
 * - Keeps sector/category relations by linking localized categories to the corresponding localized sector when available
 * - Accepts optional translation overrides via JSON:
 *     {
 *       "sectors": { "Original PT Name": "Translated EN Name" },
 *       "categories": { "Original PT Name": "Translated EN Name" }
 *     }
 *
 * Usage:
 *   BASE_LOCALE=pt TARGET_LOCALE=en TRANSLATION_MAP=./seed-localized-taxonomies.map.json npm run seed:i18n-taxonomies
 */

const fs = require('fs')
const path = require('path')
const createStrapi = require('@strapi/strapi')

const BASE_LOCALE = process.env.BASE_LOCALE || 'pt'
const TARGET_LOCALE = process.env.TARGET_LOCALE || 'en'
const TRANSLATION_MAP = process.env.TRANSLATION_MAP || path.join(__dirname, 'seed-localized-taxonomies.map.json')

const loadTranslations = () => {
  if (!fs.existsSync(TRANSLATION_MAP)) {
    return { sectors: {}, categories: {} }
  }
  try {
    const raw = fs.readFileSync(TRANSLATION_MAP, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    console.warn('Could not read translation map, falling back to original names.', err)
    return { sectors: {}, categories: {} }
  }
}

const tMap = loadTranslations()

const getLocalizedName = (type, name) => {
  return (tMap[type] && tMap[type][name]) || name
}

const getLocalizationsArray = (entity) => {
  // Handles both flat and nested formats
  if (!entity) return []
  if (Array.isArray(entity.localizations)) return entity.localizations
  if (entity.localizations && Array.isArray(entity.localizations.data)) return entity.localizations.data
  if (entity.attributes && entity.attributes.localizations) {
    if (Array.isArray(entity.attributes.localizations)) return entity.attributes.localizations
    if (Array.isArray(entity.attributes.localizations.data)) return entity.attributes.localizations.data
  }
  return []
}

const getField = (entity, field) => {
  if (!entity) return undefined
  if (entity[field] !== undefined) return entity[field]
  if (entity.attributes && entity.attributes[field] !== undefined) return entity.attributes[field]
  return undefined
}

const findLocalizationByLocale = (entity, locale) => {
  const locs = getLocalizationsArray(entity)
  return locs.find((loc) => getField(loc, 'locale') === locale)
}

async function main() {
  console.log('Starting localized taxonomies seed...')
  console.log(`Base locale: ${BASE_LOCALE}, target locale: ${TARGET_LOCALE}`)

  const app = await createStrapi().load()

  try {
    // Load base sectors with localizations and categories (with their localizations)
    const baseSectors = await app.entityService.findMany('api::sector.sector', {
      locale: BASE_LOCALE,
      populate: {
        localizations: true,
        categories: {
          populate: { localizations: true }
        }
      },
      pagination: { pageSize: 1000 }
    })

    const sectorLocaleMap = new Map()

    // Seed sectors
    for (const sector of baseSectors) {
      const existing = findLocalizationByLocale(sector, TARGET_LOCALE)
      if (existing) {
        sectorLocaleMap.set(sector.id, existing.id)
        continue
      }

      const name = getLocalizedName('sectors', getField(sector, 'name'))

      const created = await app.entityService.create('api::sector.sector', {
        data: {
          name,
          locale: TARGET_LOCALE,
          localizations: [sector.id]
        }
      })

      sectorLocaleMap.set(sector.id, created.id)
      console.log(`Created sector (${TARGET_LOCALE}): ${name} (id ${created.id})`)
    }

    // Seed categories
    const baseCategories = await app.entityService.findMany('api::category.category', {
      locale: BASE_LOCALE,
      populate: {
        localizations: true,
        sector: true
      },
      pagination: { pageSize: 1000 }
    })

    for (const category of baseCategories) {
      const existing = findLocalizationByLocale(category, TARGET_LOCALE)
      if (existing) continue

      const localizedSectorId =
        (category.sector && sectorLocaleMap.get(category.sector.id || category.sector)) ||
        (category.sector && (category.sector.id || category.sector)) ||
        null

      const name = getLocalizedName('categories', getField(category, 'name'))

      await app.entityService.create('api::category.category', {
        data: {
          name,
          locale: TARGET_LOCALE,
          sector: localizedSectorId,
          localizations: [category.id]
        }
      })

      console.log(`Created category (${TARGET_LOCALE}): ${name} (linked sector: ${localizedSectorId || 'base'})`)
    }

    console.log('Localized taxonomies seed completed.')
  } catch (error) {
    console.error('Seed failed:', error)
    process.exitCode = 1
  } finally {
    await app.destroy()
  }
}

main()


































