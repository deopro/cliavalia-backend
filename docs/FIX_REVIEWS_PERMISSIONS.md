# Fix Reviews Endpoint Permissions

## Problem
The Reviews section is loading indefinitely because the `/api/reviews` endpoint is not publicly accessible in Strapi.

## Solution
Enable public access to the `find` and `findOne` actions for the Review content type in Strapi.

## Steps to Fix

### 1. Access Strapi Admin Panel
1. Open your browser and go to: `${SERVER_URL:-http://localhost:1337}/admin`
2. Login with your admin credentials

### 2. Navigate to Roles & Permissions
1. Click on **Settings** (gear icon) in the left sidebar
2. Under **USERS & PERMISSIONS PLUGIN**, click on **Roles**
3. Click on **Public** role

### 3. Enable Review Permissions
Scroll down to find **Review** under the permissions list and enable:
- ✅ **find** - Allow fetching list of reviews
- ✅ **findOne** - Allow fetching individual reviews

### 4. Enable Related Content Permissions (Required for Population)
Since reviews populate related content, you also need to enable permissions for:

#### Business
- ✅ **find**
- ✅ **findOne**

#### Category
- ✅ **find**
- ✅ **findOne**

#### Sector
- ✅ **find**
- ✅ **findOne**

#### Users-permissions (User)
- ✅ **find** (if you want to show reviewer info)
- ✅ **findOne**

### 5. Save Changes
1. Click the **Save** button at the top right
2. You should see a success notification

### 6. Verify It Works
1. Open the browser console (F12)
2. Refresh your frontend page
3. You should see:
   ```
   Fetching reviews - page: 1
   Reviews response: { data: [...], meta: {...} }
   Reviews loaded: 8
   ```

## What You Should See

### ✅ Before Fix (Console Errors)
```
Error fetching reviews: FetchError: 403 Forbidden
Error details: { status: 403, statusText: "Forbidden", ... }
```

### ✅ After Fix (Success)
```
Fetching reviews - page: 1
Reviews response: { data: [...], meta: { pagination: {...} } }
Reviews loaded: 8
Loading complete. isLoading: false
```

## Testing the API Directly

You can test the endpoint directly in your browser:
```
${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[page]=1&pagination[pageSize]=8&populate[users_permissions_user][fields][0]=username&populate[users_permissions_user][fields][1]=email&populate[business][populate][0]=category&populate[business][populate][1]=sector
```

If permissions are correct, you should see JSON data, not a 403 error.

## Common Issues

### Issue 1: Still Getting 403 After Enabling Permissions
**Solution:** Clear your browser cache and refresh the page.

### Issue 2: Empty Reviews Array
**Solution:** Make sure you have reviews in your Strapi database. Go to Content Manager → Reviews to check.

### Issue 3: Missing Related Data (null business/user)
**Solution:** Verify the relations exist in Strapi and the permissions for those content types are enabled.

## Alternative: Using Server API Route

If you want to keep the Strapi API private, you can modify the component to use the server API route at `/api/reviews` which handles authentication server-side. This requires updating the fetch URLs in the component.

## Related Files
- Frontend Component: `cliavalia-frontend/components/home/RecentReviewsSection.vue`
- Strapi Schema: `cliavalia-backend/src/api/review/content-types/review/schema.json`
- Server API Route: `cliavalia-frontend/server/api/reviews.get.ts`









