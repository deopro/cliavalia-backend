# Business Draft/Publish Issue - Fix Guide

## Problem Identified

**Issue:** Business entries are created in the database but don't appear in Strapi Admin panel.

**Root Cause:** The Business collection has `draftAndPublish: true` enabled (in `schema.json`), but the custom controller wasn't setting the `publishedAt` field. This caused businesses to be created as **drafts**, which don't appear in the default Strapi Admin list view.

**Why Reviews Work:** The Review collection has `draftAndPublish: false`, so all reviews appear immediately without publishing.

## Solution Applied

### 1. Updated Business Controller

**File:** `src/api/business/controllers/business.ts`

**Change:** Added automatic publishing when creating businesses:

```typescript
const businessData: any = {
  name,
  verified: verified ?? false,
  // Automatically publish the business (required for Strapi Admin visibility)
  publishedAt: new Date(),
};
```

**Result:** All **new** businesses created via the API will now be automatically published and visible in Strapi Admin.

### 2. Fix for Existing Draft Business

You mentioned a business was already created but is in draft status. Here are 3 ways to fix it:

#### Option A: Publish via Strapi Admin (Recommended)

1. Open Strapi Admin: ${SERVER_URL:-http://localhost:1337}/admin
2. Go to: **Content Manager → Business**
3. Click the **Filters** button (top right)
4. Change filter to show **Drafts** or **All**
5. Find your business entry
6. Click on it to open
7. Click the **Publish** button (top right)
8. The business will now appear in the default list

#### Option B: Publish via Database Query

Connect to MySQL and run:

```sql
-- Update the business to published status
UPDATE businesses 
SET published_at = NOW() 
WHERE id = YOUR_BUSINESS_ID;

-- Or update all draft businesses
UPDATE businesses 
SET published_at = NOW() 
WHERE published_at IS NULL;
```

**Steps:**
```bash
# Connect to database container
docker exec -it cliavalia-db mysql -u root -p
# Password: your_strong_password

# Select database
USE cliavalia;

# Check current status
SELECT id, name, published_at FROM businesses;

# Publish all draft businesses
UPDATE businesses 
SET published_at = NOW() 
WHERE published_at IS NULL;

# Verify
SELECT id, name, published_at FROM businesses;

# Exit
exit
```

#### Option C: Publish via Strapi API

If you know the business document ID:

```bash
# Get your JWT token from Strapi Admin
# Then publish the business
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/businesses/:documentId/actions/publish" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

## Verification Steps

After applying the fix:

1. **Check Strapi Admin:**
   - Go to: **Content Manager → Business**
   - Your business should now appear in the list
   - It should have a "Published" badge/status

2. **Check via API:**
   ```bash
   # Get all published businesses (default)
   curl ${SERVER_URL:-http://localhost:1337}/api/businesses
   
   # Get all businesses including drafts
   curl "${SERVER_URL:-http://localhost:1337}/api/businesses?publicationState=preview"
   ```

3. **Check Database:**
   ```bash
   docker exec -it cliavalia-db mysql -u cliavalia -p -e \
   "USE cliavalia; SELECT id, name, published_at FROM businesses;"
   ```

## Understanding Draft vs Published

### Draft Status
- `publishedAt` field is `NULL`
- **Not visible** in default Strapi Admin list
- **Not accessible** via public API
- Only visible to admin users with special filters

### Published Status
- `publishedAt` field has a date/time value
- **Visible** in Strapi Admin list
- **Accessible** via public API
- Default state for most content

## Strapi Admin Views

### Default View (Published Only)
- Shows only published entries
- URL: `/admin/content-manager/collectionType/api::business.business`
- Most common view

### Draft View
- Shows only draft entries
- Access via **Filters → Publication State → Draft**

### All View
- Shows both published and draft entries
- Access via **Filters → Publication State → All**

## Related Schema Configuration

In `src/api/business/content-types/business/schema.json`:

```json
{
  "options": {
    "draftAndPublish": true  // <-- This is why publishing is required
  }
}
```

**To disable draft/publish entirely (optional):**

If you want all businesses to always be published automatically without needing the `publishedAt` field:

1. Change to: `"draftAndPublish": false`
2. Restart Strapi
3. All businesses will always be visible

**However**, the current fix (auto-publishing in controller) is better because:
- Preserves the option to have draft businesses in the future
- Admins can still create drafts via Strapi Admin if needed
- No schema changes required

## Testing the Fix

### Test New Business Creation

1. Create a new business via your frontend
2. Check that it appears immediately in Strapi Admin
3. Verify the `publishedAt` field is set in the database

### Test Existing Business

1. Apply one of the fix options above (A, B, or C)
2. Refresh Strapi Admin
3. Confirm the business now appears

## Future Considerations

### When Creating Businesses Programmatically

Always include `publishedAt`:

```typescript
// ✅ Good - will be visible
const business = await strapi.db.query('api::business.business').create({
  data: {
    name: "My Business",
    publishedAt: new Date(),  // <-- Important!
  }
});

// ❌ Bad - will be a draft (invisible)
const business = await strapi.db.query('api::business.business').create({
  data: {
    name: "My Business",
    // Missing publishedAt
  }
});
```

### When Using Entity Service

```typescript
// Entity Service automatically handles publish/draft
const business = await strapi.entityService.create('api::business.business', {
  data: {
    name: "My Business",
    publishedAt: new Date(),  // For published
    // Or omit for draft
  }
});
```

## Summary

- ✅ **Fix Applied:** Controller now auto-publishes new businesses
- ⚠️ **Action Needed:** Publish existing draft business (Options A, B, or C above)
- ✅ **Future:** All new businesses will be automatically published
- ✅ **Visibility:** Published businesses appear in Strapi Admin and API

---

**Status:** ✅ Fixed - Controller Updated  
**Date:** 2025-11-01  
**Strapi Version:** 5.30.0  
**Next Step:** Publish the existing draft business using one of the methods above

