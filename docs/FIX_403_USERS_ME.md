# Fix 403 Forbidden on GET /api/users/me

## Problem

`GET ${SERVER_URL:-http://localhost:1337}/api/users/me?populate=role` returns **403 Forbidden**.

This happens when the frontend middleware checks the current user's role (consumer vs business) before allowing access to `/user/*` routes.

## Root Cause

Strapi uses role-based permissions. The **Authenticated** and **Business User** roles must have explicit permission to read User data via the `findOne` action.

## Solution

### 1. Enable User permissions for both roles

1. **Open Strapi Admin**
   ```
   ${SERVER_URL:-http://localhost:1337}/admin
   ```

2. **Go to Roles**
   - Settings → Users & Permissions Plugin → **Roles**

3. **Edit Authenticated role**
   - Click **Authenticated**
   - Scroll to **User** (under users-permissions)
   - Enable:
     - ✅ **findOne** (required for /api/users/me)
     - ✅ **update** (required for profile updates)
   - Click **Save**

4. **Edit Business User role**
   - Click **Business User** (if it exists)
   - Under **User**, enable:
     - ✅ **findOne**
     - ✅ **update**
   - Click **Save**

### 2. Restart Strapi

After changing permissions, restart the backend:

```bash
# If using npm
cd cliavalia-backend && npm run develop

# If using Docker
docker-compose restart
```

### 3. Verify

```bash
# Login first to get a JWT
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{"identifier":"your@email.com","password":"yourpassword"}'

# Use the JWT from the response
curl "${SERVER_URL:-http://localhost:1337}/api/users/me?populate=role" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected: **200 OK** with user object including `role`.

## Related

- The frontend stores tokens in `localStorage`: `token_consumer` (consumer) and `token_business` (business)
- `/user/*` routes use the consumer token
- Ensure you're logged in with the correct portal before accessing `/user/*` pages
