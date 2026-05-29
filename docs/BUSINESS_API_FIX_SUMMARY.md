# Business API - 400 Error Fix Summary

## Problem Diagnosed

**Error:** "Invalid key sector" when creating a business via POST `/api/businesses`

**Root Cause:** The default Strapi v5 REST API controller was rejecting the `sector` and `category` relation fields, even though they were sent in the correct format (numeric IDs).

## Solution Applied

Created a **custom Business controller** (similar to the Review controller pattern) that:
1. Authenticates the user before allowing business creation
2. Validates the business name (3-100 characters)
3. Uses `strapi.db.query()` to create the business with proper relation handling
4. Handles optional fields gracefully (address, logoUrl, website, phone)
5. Returns populated data with sector and category information

## Files Modified

### 1. Backend: Custom Business Controller
**File:** `src/api/business/controllers/business.ts`

```typescript
export default factories.createCoreController('api::business.business', ({ strapi }) => ({
  async create(ctx) {
    // Custom logic to handle relations properly
    const business = await strapi.db.query('api::business.business').create({
      data: {
        name,
        sector,    // Numeric ID, properly handled
        category,  // Numeric ID, properly handled
        verified: false,
      },
      populate: {
        sector: { fields: ['id', 'name', 'slug'] },
        category: { fields: ['id', 'name', 'slug'] }
      }
    });
    return ctx.created({ data: business });
  }
}));
```

### 2. Frontend: Improved AddBusinessModal
**File:** `components/ui/AddBusinessModal.vue`

**Changes:**
- Added detailed logging for debugging
- Removed null values from request payload
- Ensured IDs are sent as numbers
- Enhanced error handling to display actual backend error messages

## Testing Instructions

### 1. Verify Strapi is Running

```bash
docker ps | grep cliavalia-backend
# Should show container running on port 1337
```

### 2. Check Permissions (Most Important!)

1. Open Strapi Admin: ${SERVER_URL:-http://localhost:1337}/admin
2. Go to: **Settings** → **Users & Permissions** → **Roles** → **Authenticated**
3. Find **Business** section and enable:
   - ✅ `create`
   - ✅ `find`
   - ✅ `findOne`
   - ✅ `update` (optional)
   - ✅ `delete` (optional)
4. **Click Save**
5. **Restart Strapi** (important for permissions to take effect):
   ```bash
   cd cliavalia-backend
   docker compose restart strapi
   ```

### 3. Test Business Creation

1. Log in to the frontend as an authenticated user
2. Try to create a business with:
   - Business name: At least 3 characters
   - Sector: Any valid sector from the dropdown
   - Category: Any valid category for that sector
   - Province: Any valid province
   - Municipality: Any valid municipality

3. Check browser console (F12) for debug logs:
   ```
   Selected data: { name: "...", sectorId: 17, categoryId: 22 }
   Creating business with data: { ... }
   ```

### 4. Expected Results

✅ **Success (201 Created):**
```json
{
  "data": {
    "id": 1,
    "documentId": "xxx",
    "name": "Business Name",
    "sector": {
      "id": 17,
      "name": "Sector Name",
      "slug": "sector-slug"
    },
    "category": {
      "id": 22,
      "name": "Category Name",
      "slug": "category-slug"
    },
    "verified": false,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

❌ **Still Getting 400?** Check these:
1. Are you logged in? (Check for JWT token in localStorage)
2. Did you enable permissions and restart Strapi?
3. Are sector and category IDs valid? (Test with `/api/sectors` and `/api/categories`)
4. Check Strapi logs: `docker logs cliavalia-backend --tail=50`

❌ **Getting 403 Forbidden?**
- Permissions not enabled for Authenticated role
- Solution: Follow step 2 above (Check Permissions)

## Debugging Commands

### Check Strapi Logs
```bash
docker logs cliavalia-backend --tail=50 --follow
```

### Test Sectors API
```bash
curl ${SERVER_URL:-http://localhost:1337}/api/sectors
```

### Test Categories API
```bash
curl ${SERVER_URL:-http://localhost:1337}/api/categories
```

### Test Business Creation with cURL
```bash
# Get your JWT token from browser console: localStorage.getItem('jwt')
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/businesses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Test Business",
      "sector": 1,
      "category": 1,
      "verified": false
    }
  }'
```

## Architecture Pattern

This fix follows the same pattern used in the Review API:

```
Frontend Request
     ↓
REST API Endpoint (/api/businesses)
     ↓
Custom Controller (business.ts)
     ↓
strapi.db.query() method
     ↓
Database (proper relation handling)
```

**Benefits:**
- Full control over validation
- Proper authentication checks
- Better error messages
- Consistent with Review API pattern
- Handles relations correctly in Strapi v5

## Related Documentation

- **Permissions Setup:** `PERMISSIONS_SETUP.md`
- **Troubleshooting Guide:** `BUSINESS_API_TROUBLESHOOTING.md`
- **Business Schema:** `src/api/business/content-types/business/schema.json`
- **Review API Example:** `src/api/review/controllers/review.ts`

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| 400 "Invalid key sector" | Default controller rejecting relations | ✅ Fixed with custom controller |
| 403 Forbidden | Permissions not enabled | Enable create permission |
| 401 Unauthorized | User not logged in | Log in and get JWT token |
| 400 "name is required" | Empty business name | Enter at least 3 characters |
| Permissions don't work | Strapi not restarted | Restart: `docker compose restart strapi` |

## Next Steps

1. ✅ Custom controller created and deployed
2. ✅ Strapi restarted (confirmed running)
3. ⚠️ **YOU NEED TO:** Enable permissions in Strapi Admin
4. ⚠️ **YOU NEED TO:** Test business creation from frontend
5. ⚠️ **YOU NEED TO:** Verify the fix works

## Success Criteria

- [ ] User can create a business from the frontend
- [ ] Business is saved with proper sector and category relations
- [ ] Business appears in the database
- [ ] Business can be retrieved via GET `/api/businesses`
- [ ] No more "Invalid key sector" error

---

**Status:** ✅ Backend Fix Applied - Awaiting Frontend Testing  
**Date:** 2025-11-01  
**Strapi Version:** 5.30.0  
**Author:** AI Assistant

