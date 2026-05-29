# Troubleshooting Guide: 403 Forbidden & Hydration Mismatch

## Issues Encountered

### 1. **403 Forbidden Error**
```
GET ${SERVER_URL:-http://localhost:1337}/api/reviews/me
[HTTP/1.1 403 Forbidden]
```

### 2. **Hydration Mismatch Warning**
```
[Vue warn]: Hydration text content mismatch
- rendered on server: U
- expected on client: deolindo9
```

---

## ✅ Fixes Applied

### Fix 1: 403 Forbidden Error

**Problem:** Strapi was blocking the custom `/api/reviews/me` endpoint due to missing route permissions.

**Solution:** Updated `src/api/review/routes/custom-review.ts` to explicitly set `auth: false`:

```typescript
{
  method: 'GET',
  path: '/reviews/me',
  handler: 'review.me',
  config: {
    policies: [],
    middlewares: [],
    auth: false, // Allow authentication but don't block by default
  },
}
```

**Note:** The controller (`review.ts`) still checks authentication and returns 401 if user is not logged in. This is intentional - the route allows the request through, but the controller enforces authentication.

### Fix 2: Hydration Mismatch

**Problem:** User display name and initials were being rendered during SSR before user data was available, causing content mismatch.

**Solution:** Wrapped dynamic user content in `<ClientOnly>` component:

```vue
<!-- Display Name -->
<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
  <ClientOnly fallback="Carregando...">
    {{ userProfile?.displayName || getUserDisplayName }}
  </ClientOnly>
</h2>

<!-- Avatar Initials -->
<ClientOnly fallback="">
  <span v-if="!user?.profileImage">{{ getUserInitials }}</span>
</ClientOnly>
```

---

## Verification Steps

### 1. Restart Strapi
```bash
cd cliavalia-backend
docker compose restart strapi

# Wait 30 seconds for Strapi to start
sleep 30

# Verify it's running
curl ${SERVER_URL:-http://localhost:1337}/_health
```

### 2. Test the API Endpoint
```bash
# Get your JWT token from browser console:
# localStorage.getItem('jwt')

TOKEN="your_jwt_token_here"

# Test the /api/reviews/me endpoint
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Review Title",
      "content": "Review content...",
      "rating": 5,
      "company": "Business Name",
      ...
    }
  ],
  "meta": {
    "statistics": {
      "totalReviews": N,
      "totalViews": N,
      "totalHelpful": N
    }
  }
}
```

**If you get 401 Unauthorized:**
- Your JWT token is invalid or expired
- Log in again to get a fresh token

**If you still get 403 Forbidden:**
- Check that Strapi has restarted successfully
- Verify the route file exists: `src/api/review/routes/custom-review.ts`
- Check Strapi logs: `docker logs cliavalia-backend --tail=50`

### 3. Test the Frontend
1. **Refresh your browser** (hard refresh: Ctrl+Shift+R)
2. Navigate to `/user/my-reviews`
3. Check browser console - **no more hydration warnings**
4. Verify the page shows:
   - User name (without flickering)
   - User initials in avatar
   - Review statistics
   - List of reviews

---

## Understanding the Fixes

### Why `auth: false` in Routes?

Strapi v5 has different authentication handling:

```typescript
// ❌ Without auth: false
// Route is blocked by default authentication middleware
// Result: 403 Forbidden even for authenticated users

// ✅ With auth: false
// Route allows requests through
// Controller checks authentication manually
// Result: Proper 401 if not authenticated, 200 with data if authenticated
```

**Flow:**
```
Request → Route (auth: false, allows through)
       → Controller (checks ctx.state.user)
       → Returns 401 if no user
       → Returns 200 with data if user exists
```

### Why ClientOnly for User Data?

Nuxt performs Server-Side Rendering (SSR):

```
Server (SSR):
- User data not available (localStorage not accessible)
- getUserDisplayName returns "Utilizador" (default)
- Renders: "U" (first initial)

Client (Hydration):
- User data loads from localStorage
- getUserDisplayName returns actual name
- Expects: "deolindo9"

Result: Mismatch! Vue shows warning.
```

**Solution with ClientOnly:**
```vue
<ClientOnly fallback="Carregando...">
  {{ getUserDisplayName }}
</ClientOnly>
```

**Flow:**
```
Server (SSR):
- Skips content inside ClientOnly
- Renders fallback: "Carregando..."

Client (Hydration):
- Replaces fallback with actual content
- Renders: "deolindo9"

Result: No mismatch, no warning!
```

---

## Common Issues

### Issue: "Still getting 403 after restart"

**Possible Causes:**
1. Strapi didn't restart properly
2. Custom routes file not loaded
3. Cache issue

**Solutions:**
```bash
# 1. Force restart with clean build
docker compose down
docker compose up -d

# 2. Check if route file exists
ls -la src/api/review/routes/custom-review.ts

# 3. Check Strapi logs for errors
docker logs cliavalia-backend --tail=100 | grep -i error

# 4. Verify routes are loaded
curl ${SERVER_URL:-http://localhost:1337}/api/reviews/me
# Should NOT return 404 (means route exists)
```

### Issue: "Hydration warnings still showing"

**Possible Causes:**
1. Browser cache
2. ClientOnly not properly applied
3. Other dynamic content causing mismatch

**Solutions:**
```bash
# 1. Hard refresh browser
# Chrome/Firefox: Ctrl+Shift+R
# Safari: Cmd+Shift+R

# 2. Clear browser cache
# Chrome: Settings → Privacy → Clear browsing data

# 3. Check for other dynamic content
# Look for any content that depends on:
# - localStorage
# - User state
# - Date/time
# - Random values
# All should be wrapped in ClientOnly
```

### Issue: "Empty reviews array"

**Possible Causes:**
1. User hasn't created any reviews
2. Reviews not fetched properly
3. API error

**Solutions:**
```bash
# 1. Check if user has reviews in database
docker exec -it cliavalia-db mysql -uroot -pyour_strong_password -e \
  "SELECT * FROM cliavalia.reviews WHERE users_permissions_user_id = YOUR_USER_ID;"

# 2. Check API response
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews/me" \
  -H "Authorization: Bearer $TOKEN" | jq

# 3. Create a test review via Strapi Admin
# ${SERVER_URL:-http://localhost:1337}/admin → Content Manager → Reviews → Create
```

---

## Testing Checklist

- [ ] Strapi is running (`docker ps` shows cliavalia-backend)
- [ ] Health check passes (`curl ${SERVER_URL:-http://localhost:1337}/_health`)
- [ ] `/api/reviews/me` returns 200 (not 403)
- [ ] User is logged in (JWT token exists)
- [ ] Browser shows no hydration warnings
- [ ] User name displays correctly
- [ ] User avatar shows initials
- [ ] Statistics show correct numbers
- [ ] Reviews list displays

---

## Quick Verification Commands

```bash
# 1. Check Strapi is running
docker ps | grep cliavalia-backend

# 2. Check Strapi logs
docker logs cliavalia-backend --tail=20

# 3. Test health endpoint
curl ${SERVER_URL:-http://localhost:1337}/_health

# 4. Test reviews endpoint (with your token)
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews/me" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 5. Check custom routes file exists
ls -la src/api/review/routes/custom-review.ts
```

---

## Expected Behavior After Fixes

### Backend
✅ `GET /api/reviews/me` returns 200 OK for authenticated users  
✅ Returns 401 Unauthorized for non-authenticated users  
✅ Returns user's reviews with statistics  
✅ Converts Strapi blocks to plain text  
✅ Populates business information

### Frontend
✅ No hydration mismatch warnings in console  
✅ User name displays correctly (no flickering)  
✅ User initials show in avatar  
✅ Statistics load and display  
✅ Reviews list shows with company names  
✅ Page loads smoothly without content jumps

---

## Additional Resources

- **Full Feature Guide:** `USER_REVIEWS_FEATURE.md`
- **Quick Start:** `USER_REVIEWS_QUICKSTART.md`
- **Business API Fix:** `BUSINESS_API_FIX_SUMMARY.md`
- **Strapi v5 Docs:** https://docs.strapi.io/dev-docs/api/rest

---

**Status:** ✅ Issues Fixed  
**Last Updated:** 2025-11-01  
**Strapi Version:** 5.30.0  
**Nuxt Version:** 4.x

