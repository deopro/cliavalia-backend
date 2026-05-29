import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

type StrapiInstance = Core.Strapi;

export type CategoryWithSector = {
  id: number;
  name?: string;
  slug?: string;
  sector?: { id: number; name?: string } | number | null;
};

export type ResolvedBusinessCategories = {
  categoryIds: number[];
  categories: CategoryWithSector[];
  sectorId: number | null;
};

function toNumberId(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const parsed = Number((value as { id: unknown }).id);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectIdsFromUnknown(value: unknown, target: Set<number>): void {
  if (value == null) return;

  if (Array.isArray(value)) {
    for (const entry of value) collectIdsFromUnknown(entry, target);
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('[')) {
      try {
        collectIdsFromUnknown(JSON.parse(trimmed), target);
        return;
      } catch {
        // fall through
      }
    }
    if (trimmed.includes(',')) {
      for (const part of trimmed.split(',')) collectIdsFromUnknown(part, target);
      return;
    }
    const id = toNumberId(trimmed);
    if (id != null) target.add(id);
    return;
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if ('set' in obj) {
      collectIdsFromUnknown(obj.set, target);
      return;
    }
    if ('connect' in obj) {
      collectIdsFromUnknown(obj.connect, target);
      return;
    }
    if ('id' in obj) {
      const id = toNumberId(obj);
      if (id != null) target.add(id);
    }
    return;
  }

  const id = toNumberId(value);
  if (id != null) target.add(id);
}

/** Parse legacy + new category fields into unique numeric IDs. */
export function parseCategoryIdsFromInput(source: Record<string, unknown>): number[] {
  const ids = new Set<number>();

  collectIdsFromUnknown(source.category, ids);
  collectIdsFromUnknown(source.categoryId, ids);
  collectIdsFromUnknown(source.categories, ids);
  collectIdsFromUnknown(source.categoryIds, ids);

  // FormData may repeat categoryIds[] keys
  const repeated = source['categoryIds[]'];
  collectIdsFromUnknown(repeated, ids);

  return [...ids];
}

/** Document Service / admin-dashboard updates (replace full relation set). */
export function buildCategoriesRelationPayload(
  categoryIds: number[],
): { set: number[] } | { disconnect: true } {
  if (categoryIds.length === 0) {
    return { disconnect: true };
  }
  return { set: categoryIds };
}

/** Strapi DB query layer (create / update via db.query). */
export function buildCategoriesConnectPayload(
  categoryIds: number[],
): { connect: number[] } | { disconnect: true } {
  if (categoryIds.length === 0) {
    return { disconnect: true };
  }
  return { connect: categoryIds };
}

export async function resolveCategoriesAndSector(
  strapi: StrapiInstance,
  categoryIds: number[],
  options?: { required?: boolean },
): Promise<ResolvedBusinessCategories> {
  const uniqueIds = [...new Set(categoryIds.filter((id) => Number.isFinite(id)))];

  if (uniqueIds.length === 0) {
    if (options?.required) {
      throw new errors.ValidationError('At least one category is required.');
    }
    return { categoryIds: [], categories: [], sectorId: null };
  }

  const categories = (await strapi.db.query('api::category.category').findMany({
    where: { id: { $in: uniqueIds } },
    populate: { sector: { fields: ['id', 'name'] } },
  })) as CategoryWithSector[];

  if (categories.length !== uniqueIds.length) {
    throw new errors.ValidationError('One or more categories are invalid.');
  }

  const sectorIds = new Set<number>();
  for (const category of categories) {
    const sectorRef = category.sector;
    const sectorId =
      typeof sectorRef === 'object' && sectorRef !== null
        ? Number(sectorRef.id)
        : Number(sectorRef);
    if (Number.isFinite(sectorId)) {
      sectorIds.add(sectorId);
    }
  }

  if (sectorIds.size === 0) {
    throw new errors.ValidationError(
      'Selected categories must belong to a sector.',
    );
  }

  if (sectorIds.size > 1) {
    throw new errors.ValidationError(
      'All selected categories must belong to the same sector.',
    );
  }

  return {
    categoryIds: uniqueIds,
    categories,
    sectorId: [...sectorIds][0] ?? null,
  };
}

/** Add `categories` array and legacy `category` alias (first item). */
export function enrichBusinessCategoryFields<T extends Record<string, unknown>>(
  business: T | null | undefined,
): T | null | undefined {
  if (!business || typeof business !== 'object') return business;

  const rawCategories = (business as { categories?: unknown }).categories;
  const rawCategory = (business as { category?: unknown }).category;

  let categories: unknown[] = [];
  if (Array.isArray(rawCategories)) {
    categories = rawCategories;
  } else if (rawCategory) {
    categories = Array.isArray(rawCategory) ? rawCategory : [rawCategory];
  }

  const first = categories[0] ?? null;

  return {
    ...business,
    categories,
    category: (business as { category?: unknown }).category ?? first,
  } as T;
}

export function enrichBusinessListCategoryFields<T extends Record<string, unknown>>(
  items: T[],
): T[] {
  return items.map((item) => enrichBusinessCategoryFields(item) as T);
}

export type BusinessCategoryRelationKey = 'category' | 'categories';

/** Relation attribute name on Business per loaded Strapi schema. */
export function getBusinessCategoryRelationKey(
  strapi: StrapiInstance,
): BusinessCategoryRelationKey {
  const attrs = strapi.contentType('api::business.business').attributes as Record<
    string,
    unknown
  >;
  if (attrs.categories) return 'categories';
  if (attrs.category) return 'category';
  return 'categories';
}

const CATEGORY_POPULATE_DETAIL = {
  fields: ['id', 'name', 'slug'],
  populate: { sector: { fields: ['id', 'name'] } },
} as const;

/** Populate block for business category relation(s). */
export function getBusinessCategoriesPopulate(
  strapi: StrapiInstance,
): Record<string, typeof CATEGORY_POPULATE_DETAIL> {
  const key = getBusinessCategoryRelationKey(strapi);
  return { [key]: CATEGORY_POPULATE_DETAIL };
}

/** @deprecated Use getBusinessCategoriesPopulate(strapi) — kept for spread sites. */
export const BUSINESS_CATEGORIES_POPULATE = {
  categories: CATEGORY_POPULATE_DETAIL,
} as const;

/** Map populate `categories` ↔ `category` to match the live schema. */
export function normalizeBusinessPopulateInput(
  strapi: StrapiInstance,
  populate: unknown,
): unknown {
  if (!populate || typeof populate !== 'object' || Array.isArray(populate)) {
    return populate;
  }
  const key = getBusinessCategoryRelationKey(strapi);
  const legacyKey: BusinessCategoryRelationKey =
    key === 'categories' ? 'category' : 'categories';
  const obj = populate as Record<string, unknown>;
  if (legacyKey in obj && !(key in obj)) {
    const { [legacyKey]: value, ...rest } = obj;
    return { ...rest, [key]: value };
  }
  return populate;
}

function remapFilterCategoryKeys(
  strapi: StrapiInstance,
  node: unknown,
): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }
  const key = getBusinessCategoryRelationKey(strapi);
  const legacyKey: BusinessCategoryRelationKey =
    key === 'categories' ? 'category' : 'categories';
  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(obj)) {
    if (field === '$and' || field === '$or') {
      const list = Array.isArray(value) ? value : [value];
      out[field] = list.map((entry) => remapFilterCategoryKeys(strapi, entry));
      continue;
    }
    if (field === legacyKey) {
      out[key] = value;
      continue;
    }
    out[field] = value;
  }
  return out;
}

/** Map filters `categories` ↔ `category` to match the live schema. */
export function normalizeBusinessFiltersInput(
  strapi: StrapiInstance,
  filters: unknown,
): unknown {
  return remapFilterCategoryKeys(strapi, filters);
}

/** Document Service / db.query category relation write payload. */
export function applyBusinessCategoriesToData(
  strapi: StrapiInstance,
  data: Record<string, unknown>,
  categoryIds: number[],
): void {
  const key = getBusinessCategoryRelationKey(strapi);
  delete data.category;
  delete data.categories;
  delete data.categoryId;
  delete data.categoryIds;

  if (key === 'categories') {
    data.categories = buildCategoriesRelationPayload(categoryIds);
    return;
  }

  if (categoryIds.length === 0) {
    data.category = { disconnect: true };
    return;
  }

  // Legacy manyToOne: persist first category only until schema is migrated.
  data.category = { connect: categoryIds[0] };
}

/** db.query create/update connect payload. */
export function applyBusinessCategoriesConnectToData(
  strapi: StrapiInstance,
  data: Record<string, unknown>,
  categoryIds: number[],
): void {
  const key = getBusinessCategoryRelationKey(strapi);
  delete data.category;
  delete data.categories;

  if (key === 'categories') {
    data.categories = buildCategoriesConnectPayload(categoryIds);
    return;
  }

  if (categoryIds.length === 0) {
    data.category = { disconnect: true };
    return;
  }

  data.category = { connect: [categoryIds[0]] };
}
