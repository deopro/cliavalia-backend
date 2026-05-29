# Diagnose and Fix Reviews Display Issue

## Problem Identified ✅

The Strapi API returns reviews with a basic request, but returns empty when:
1. Adding pagination parameters
2. Adding populate parameters (for related data)
3. Fetching from the frontend

### Test Results:
```bash
✅ Basic request: Returns 5 reviews
❌ With pagination: Returns empty
❌ With populate: Returns empty
```

## Root Cause

**Strapi Permissions Not Configured** for the Public role to:
1. Access the `find` and `findOne` actions on Reviews
2. Populate related content (Business, Category, Sector, Users)

## Step-by-Step Fix

### 1. Access Strapi Admin Panel
Open your browser: `${SERVER_URL:-http://localhost:1337}/admin`

### 2. Configure Review Permissions

#### Navigate to Settings
1. Click **Settings** (⚙️ gear icon) in the left sidebar
2. Under **USERS & PERMISSIONS PLUGIN**, click **Roles**
3. Click on **Public** role

#### Enable Review Permissions
Scroll down and find **Review**, then enable:
- ✅ **find** - List reviews
- ✅ **findOne** - Get single review

#### Enable Related Content Permissions

**Business:**
- ✅ **find**
- ✅ **findOne**

**Category:**
- ✅ **find**
- ✅ **findOne**  

**Sector:**
- ✅ **find**
- ✅ **findOne**

**Users-permissions (User):**
- ✅ **find**
- ✅ **findOne**

### 3. Save Changes
Click the **Save** button at the top right corner.

### 4. Verify It Works

#### Test in Terminal:
```bash
cd cliavalia-backend
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[pageSize]=2&populate[users_permissions_user][fields][0]=username&populate[business][populate][0]=category" | jq '.'
```

You should see JSON with reviews and populated relations.

#### Test in Browser:
1. Open browser console (F12)
2. Navigate to your frontend home page
3. Look for these console messages:
```
Fetching reviews - page: 1
Reviews response: { data: [...], meta: {...} }
Reviews loaded: 8
```

### 5. Restart Frontend (if needed)
```bash
cd cliavalia-frontend
npm run dev
```

## What You Should See

### ✅ Before Fix
**Console:**
```
Fetching reviews - page: 1
Error fetching reviews: FetchError: 403 Forbidden
Error details: { status: 403, statusText: "Forbidden" }
```

**UI:**
- Loading spinner forever OR
- Error message: "Não foi possível carregar as avaliações"

### ✅ After Fix  
**Console:**
```
Fetching reviews - page: 1
Reviews response: { 
  data: [
    { 
      id: 1, 
      rating: 5, 
      title: "Great service!", 
      business: { name: "Quasatis" },
      users_permissions_user: { username: "john" }
    },
    ...
  ], 
  meta: { pagination: { total: 5 } } 
}
Reviews loaded: 8
Loading complete. isLoading: false
```

**UI:**
- Reviews cards display
- Company names show
- Reviewer names show
- Ratings display correctly

## Alternative: Add Test Data

If you have no reviews in the database:

### Option 1: Via Strapi Admin
1. Go to `${SERVER_URL:-http://localhost:1337}/admin`
2. Click **Content Manager** → **Review**
3. Click **Create new entry**
4. Fill in:
   - Title: "Great experience!"
   - Rating: 5
   - Review Text: "This company provided excellent service..."
   - Select a Business
   - Select a User
5. Click **Publish**

### Option 2: Via API (after permissions are set)
```bash
# You'll need an authentication token for this
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "data": {
      "title": "Great service!",
      "rating": 5,
      "reviewText": "Excellent experience with this company.",
      "business": 1,
      "users_permissions_user": 1
    }
  }'
```

## Troubleshooting

### Issue 1: Still getting 403
**Solution:** 
- Clear browser cache and cookies
- Restart the Strapi container:
  ```bash
  cd cliavalia-backend
  docker-compose restart
  ```

### Issue 2: Reviews show but missing business/user names
**Solution:**
- Verify Business, Category, Sector permissions are enabled
- Check that reviews in database have valid relations

### Issue 3: Empty reviews array after fix
**Solution:**
- Add test reviews via Strapi Admin
- Check that reviews are published (not draft)

### Issue 4: reviewText shows as JSON blocks
This is expected! The component transforms this. The format is:
```json
[{
  "type": "paragraph",
  "children": [{"text": "Review content here", "type": "text"}]
}]
```

The component extracts the text properly.

## Related Files

- **Frontend Component**: `cliavalia-frontend/components/home/RecentReviewsSection.vue`
- **Strapi Controller**: `cliavalia-backend/src/api/review/controllers/review.ts`
- **Strapi Schema**: `cliavalia-backend/src/api/review/content-types/review/schema.json`
- **Test Script**: `cliavalia-backend/test-reviews-api.sh`
- **Permissions Guide**: `cliavalia-backend/FIX_REVIEWS_PERMISSIONS.md`

## Quick Test Commands

```bash
# Test basic API (works even without permissions)
curl ${SERVER_URL:-http://localhost:1337}/api/reviews

# Test with params (requires permissions)
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[pageSize]=2"

# Test with populate (requires all permissions)
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?populate[business]=true&populate[users_permissions_user]=true"

# Check Strapi health
curl ${SERVER_URL:-http://localhost:1337}/_health

# View Strapi logs
docker logs cliavalia-backend --tail 50
```

## Summary

The issue was **Strapi permissions**. The Reviews endpoint works, but the Public role doesn't have permission to:
1. Use query parameters (pagination, filters)
2. Populate related content (business, user, category, sector)

**Fix:** Enable `find` and `findOne` permissions for Review, Business, Category, Sector, and User in Strapi Admin → Settings → Roles → Public.

After applying the fix, your reviews will display correctly on the homepage! 🎉









