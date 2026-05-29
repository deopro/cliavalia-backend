# Rename Category to Industry - Complete Guide

## Current State
- **Display Name**: "Industry" (in Strapi Admin UI) ✓
- **API Name**: "category" (endpoints: `/api/categories`)
- **Database Table**: "categories"
- **Folder**: `src/api/category/`
- **Relations**: Referenced by Business and Sector schemas

## Why the Database Hasn't Changed

When you change the `displayName` in Strapi Admin, it only updates the UI label. To fully rename a collection type, you need to update:

1. Schema files
2. Folder structure
3. Database table (optional - can keep old name)
4. All references in related schemas
5. Controller/Service/Route files

## Decision: What to Rename?

### Option A: UI Only (RECOMMENDED - Already Done)
**Status**: ✅ Complete

The `displayName` is "Industry" in the Strapi Admin. The API and database remain "category" internally.

**Advantages**:
- No code changes
- No database migration
- No breaking changes
- Admin UI shows "Industry"

**When to use**: When you only want to change how it appears to content editors in the admin panel.

### Option B: Full Rename (Complex)
**Status**: ⚠️ Requires multiple steps

Everything renamed to "industry":
- API endpoints: `/api/industries`
- Database table: `industries`
- Folder: `src/api/industry/`

**When to use**: When you want complete consistency across the entire stack, or when integrating with external systems that expect "industry" terminology.

## Steps for Full Rename (Option B)

⚠️ **WARNING**: This will require:
- Strapi server restart
- Database migration
- Potential data loss if not done carefully
- Frontend updates to use new API endpoints

### Step 1: Backup Database
```bash
# From the backend directory
docker-compose exec postgres pg_dump -U strapi strapi > backup_before_rename.sql
```

### Step 2: Stop Strapi
```bash
docker-compose down
```

### Step 3: Rename Folder Structure
```bash
# Rename the API folder
mv src/api/category src/api/industry
```

### Step 4: Update Category/Industry Schema
Update `src/api/industry/content-types/industry/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "categories",  // Keep old name to avoid migration
  "info": {
    "singularName": "industry",     // Changed
    "pluralName": "industries",     // Changed
    "displayName": "Industry"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string"
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "sector": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::sector.sector",
      "inversedBy": "industries"     // Changed
    },
    "businesses": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::business.business",
      "mappedBy": "industry"          // Changed
    }
  }
}
```

**Important**: We keep `collectionName: "categories"` to avoid renaming the database table.

### Step 5: Update Business Schema
Update `src/api/business/content-types/business/schema.json`:

Change line 57-62:
```json
"category": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "api::category.category",
  "inversedBy": "businesses"
}
```

To:
```json
"industry": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "api::industry.industry",
  "inversedBy": "businesses"
}
```

### Step 6: Update Sector Schema
Update `src/api/sector/content-types/sector/schema.json`:

Change line 21-26:
```json
"categories": {
  "type": "relation",
  "relation": "oneToMany",
  "target": "api::category.category",
  "mappedBy": "sector"
}
```

To:
```json
"industries": {
  "type": "relation",
  "relation": "oneToMany",
  "target": "api::industry.industry",
  "mappedBy": "sector"
}
```

### Step 7: Rename TypeScript Files
```bash
cd src/api/industry

# Rename controller
mv controllers/category.ts controllers/industry.ts

# Rename service  
mv services/category.ts services/industry.ts

# Rename routes
mv routes/category.ts routes/industry.ts
```

### Step 8: Update TypeScript File Content

**controllers/industry.ts**:
```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::industry.industry');
```

**services/industry.ts**:
```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::industry.industry');
```

**routes/industry.ts**:
```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::industry.industry');
```

### Step 9: Update Database Relations (if needed)

If you kept `collectionName: "categories"`, you may need to update foreign key column names:

```sql
-- Update column name in businesses table
ALTER TABLE businesses 
RENAME COLUMN category_id TO industry_id;

-- Update column name in categories table (if sector relationship changed)
-- Check your actual column names first
```

### Step 10: Update Frontend

Update any frontend code that references `/api/categories`:

```typescript
// Old
const response = await $apiFetch('/api/categories')

// New
const response = await $apiFetch('/api/industries')
```

Also update any references to `category` property in business data.

### Step 11: Start Strapi
```bash
docker-compose up -d
```

### Step 12: Verify

1. Check Strapi Admin - "Industry" should appear
2. Check API endpoints - `/api/industries` should work
3. Check database - data should be intact
4. Test creating/editing industries
5. Test business relations

## Recommended Approach: Hybrid Solution

**Keep the current setup** (Option A) but with clarification:

1. ✅ `displayName: "Industry"` - Admin UI shows "Industry"
2. ✅ `singularName: "category"` - API remains `/api/categories`
3. ✅ `collectionName: "categories"` - Database table stays the same
4. ✅ Add API alias for frontend consistency

### Create an Alias Route (Best of Both Worlds)

Create `src/api/industry/routes/industry.ts`:

```typescript
export default {
  routes: [
    {
      method: 'GET',
      path: '/industries',
      handler: 'category.find',
    },
    {
      method: 'GET',
      path: '/industries/:id',
      handler: 'category.findOne',
    },
    {
      method: 'POST',
      path: '/industries',
      handler: 'category.create',
    },
    {
      method: 'PUT',
      path: '/industries/:id',
      handler: 'category.update',
    },
    {
      method: 'DELETE',
      path: '/industries/:id',
      handler: 'category.delete',
    },
  ],
};
```

This gives you:
- `/api/categories` (original - still works)
- `/api/industries` (new - alias)
- Admin UI shows "Industry"
- No database changes needed

## Troubleshooting

### Issue: Relations not working after rename
**Solution**: Make sure ALL references are updated:
- Business schema
- Sector schema
- Any custom controllers/services

### Issue: API endpoints return 404
**Solution**: 
- Clear Strapi cache: `rm -rf .cache`
- Rebuild admin: `npm run build`
- Restart Strapi

### Issue: Database errors
**Solution**:
- Check `collectionName` matches your database table
- If you renamed the table, update `collectionName` to match
- Verify foreign key column names match

## Summary

**Current Status**: You only changed `displayName` to "Industry", which is the **safest and recommended** approach.

**Next Steps**:
1. **Keep as-is** - Admin shows "Industry", API uses "category" (recommended)
2. **Add alias routes** - Support both `/api/categories` and `/api/industries`
3. **Full rename** - Follow all 12 steps above (most complex, highest risk)

**My Recommendation**: Keep the current setup. It's working, safe, and follows Strapi best practices. The `displayName` change is sufficient for most use cases.

