# Complete Strapi Permissions Checklist

## Overview
This document lists ALL permissions that need to be enabled in Strapi for your frontend to work correctly.

## Access Strapi Admin
```
${SERVER_URL:-http://localhost:1337}/admin
```
Navigate to: **Settings → Roles → Public**

---

## ✅ Required Permissions

### 1. Review (Critical - Homepage)
Without these, reviews won't load on the homepage:
- [x] **find** - List all reviews
- [x] **findOne** - Get single review details

### 2. Business (Critical - Multiple Pages)
Without these, business data won't load anywhere:
- [x] **find** - List all businesses
- [x] **findOne** - Get single business details
- [x] **create** - Allow authenticated users to add businesses

### 3. Sector (Critical - Industries/Sectors Page)
Without these, the industries/sectors page won't work:
- [x] **find** - List all sectors
- [x] **findOne** - Get single sector details

### 4. Category (Critical - Filters & Navigation)
Without these, category filters and navigation won't work:
- [x] **find** - List all categories
- [x] **findOne** - Get single category details

### 5. Spotlight (Critical - Homepage Hero)
Without these, spotlight logos won't show on homepage:
- [x] **find** - List all spotlights
- [x] **findOne** - Get single spotlight details

### 6. Province (Optional - Location Filters)
For location-based filtering:
- [x] **find** - List all provinces
- [x] **findOne** - Get single province details

### 7. Municipality (Optional - Location Filters)
For location-based filtering:
- [x] **find** - List all municipalities
- [x] **findOne** - Get single municipality details

### 8. Users-permissions → User (Critical - Reviews & Auth)
Without these, user data won't show in reviews:
- [x] **find** - List users (for populating review authors)
- [x] **findOne** - Get single user details
- [x] **me** - Get current logged-in user (already enabled by default)

---

## Permission Matrix

| Content Type | find | findOne | create | update | delete |
|--------------|------|---------|--------|--------|--------|
| Review       | ✅   | ✅      | 🔐     | 🔐     | 🔐     |
| Business     | ✅   | ✅      | 🔐     | 🔐     | ❌     |
| Sector       | ✅   | ✅      | ❌     | ❌     | ❌     |
| Category     | ✅   | ✅      | ❌     | ❌     | ❌     |
| Spotlight    | ✅   | ✅      | ❌     | ❌     | ❌     |
| Province     | ✅   | ✅      | ❌     | ❌     | ❌     |
| Municipality | ✅   | ✅      | ❌     | ❌     | ❌     |
| User         | ✅   | ✅      | -      | 🔐     | 🔐     |

**Legend:**
- ✅ = Enable for Public role
- 🔐 = Only for Authenticated role (already configured)
- ❌ = Keep disabled for Public role (admin only)
- `-` = Not applicable

---

## Step-by-Step Instructions

### 1. Open Strapi Admin
```
${SERVER_URL:-http://localhost:1337}/admin
```

### 2. Navigate to Public Role
```
Settings (⚙️) → USERS & PERMISSIONS PLUGIN → Roles → Public
```

### 3. Scroll Down to Permissions Section

### 4. Enable Each Permission
For each content type listed above, check the appropriate boxes.

### 5. Click Save
Blue "Save" button at top right corner.

---

## Testing Each Permission

### Test Reviews (Homepage)
```bash
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[pageSize]=2"
```
Should return JSON with reviews.

**Frontend:** Check homepage - reviews should load

### Test Businesses (Search & Pages)
```bash
curl "${SERVER_URL:-http://localhost:1337}/api/businesses?pagination[pageSize]=2"
```
Should return JSON with businesses.

**Frontend:** Search for a business - results should appear

### Test Sectors (Industries Page)
```bash
curl "${SERVER_URL:-http://localhost:1337}/api/sectors?populate=categories"
```
Should return JSON with sectors and categories.

**Frontend:** Go to `/industries` - sectors should load

### Test Spotlights (Homepage Hero)
```bash
curl "${SERVER_URL:-http://localhost:1337}/api/spotlights?pagination[limit]=9"
```
Should return JSON with spotlight logos.

**Frontend:** Check homepage hero - logo grid should load

---

## What Happens If Permissions Are Missing?

| Missing Permission | User Experience |
|-------------------|-----------------|
| Review find | Homepage shows "Loading..." forever or empty |
| Business find | Search doesn't work, no businesses show |
| Sector find | Industries page shows empty or 403 error |
| Category find | Category filters don't load |
| Spotlight find | Homepage hero section empty/broken |
| User find | Reviews show "Anónimo" instead of usernames |

---

## Common Issues After Enabling Permissions

### Issue 1: Still Getting 403
**Solution:**
1. Make sure you clicked **Save** after enabling permissions
2. Clear browser cache (Ctrl+Shift+Delete)
3. Restart Strapi container:
   ```bash
   cd cliavalia-backend
   docker-compose restart
   ```

### Issue 2: Some Data Loads, Others Don't
**Solution:**
- Double-check you enabled permissions for ALL related content types
- Reviews need: Review + Business + Category + Sector + User
- Businesses need: Business + Sector + Category + Province + Municipality

### Issue 3: Can't Create Reviews/Businesses
**Solution:**
- `create` permissions should only be enabled for **Authenticated** role, not Public
- Check if user is logged in before trying to create content

### Issue 4: Data Shows But Relations Are Null
**Solution:**
- Enable `find` and `findOne` for related content types
- For example, if Business.category is null, enable Category permissions

---

## Security Notes

### ✅ Safe to Enable for Public:
- `find` and `findOne` for read-only content
- Content that should be visible to everyone

### ⚠️ Never Enable for Public:
- `create`, `update`, `delete` on most content types
- Admin endpoints
- User management (except `find` for displaying usernames)

### 🔐 Authenticated Users Only:
- Creating reviews
- Creating businesses (user-submitted)
- Updating own profile
- Deleting own content

---

## Quick Verification Checklist

After enabling all permissions, verify:

- [ ] Homepage loads with spotlight logos
- [ ] Homepage shows recent reviews
- [ ] Search for businesses works
- [ ] Industries/Sectors page loads
- [ ] Category filters load
- [ ] Review cards show company names
- [ ] Review cards show reviewer names
- [ ] No 403 errors in browser console
- [ ] No infinite loading spinners

---

## Related Documentation

- `quick-fix-permissions.md` - Quick 5-minute fix guide
- `DIAGNOSE_AND_FIX_REVIEWS.md` - Detailed review troubleshooting
- `FIX_REVIEWS_PERMISSIONS.md` - Reviews-specific permissions
- `test-reviews-api.sh` - API testing script

---

## Support Commands

```bash
# Test all endpoints
cd cliavalia-backend

# Reviews
curl ${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[pageSize]=1

# Businesses  
curl ${SERVER_URL:-http://localhost:1337}/api/businesses?pagination[pageSize]=1

# Sectors
curl ${SERVER_URL:-http://localhost:1337}/api/sectors?pagination[pageSize]=1

# Categories
curl ${SERVER_URL:-http://localhost:1337}/api/categories?pagination[pageSize]=1

# Spotlights
curl ${SERVER_URL:-http://localhost:1337}/api/spotlights?pagination[limit]=1

# Check Strapi health
curl ${SERVER_URL:-http://localhost:1337}/_health

# View logs
docker logs cliavalia-backend --tail 50
```

---

## Summary

The most critical permissions to enable RIGHT NOW:
1. **Review** - find, findOne
2. **Business** - find, findOne  
3. **Sector** - find, findOne
4. **Category** - find, findOne
5. **Spotlight** - find, findOne
6. **User** - find, findOne

Enable these 5 content types with `find` and `findOne`, click Save, and your app should work! 🎉









