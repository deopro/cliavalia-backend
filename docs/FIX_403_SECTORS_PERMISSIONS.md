# Fix: 403 Forbidden Error on /api/sectors

## Error Details

```
GET ${SERVER_URL:-http://localhost:1337}/api/sectors
[HTTP/1.1 403 Forbidden 68ms]

⚠️ API Client: Response error: 403 Forbidden
```

## Root Cause

The **Public role** in Strapi does not have permission to access the `sectors` endpoint. By default, Strapi protects all API endpoints and requires explicit permission grants.

## Solution: Enable API Permissions

### Step 1: Access Strapi Admin

1. Open your browser and navigate to:
   ```
   ${SERVER_URL:-http://localhost:1337}/admin
   ```

2. Log in with your Strapi admin credentials

### Step 2: Navigate to Roles & Permissions

1. Click on **Settings** (⚙️) in the left sidebar
2. Under **USERS & PERMISSIONS PLUGIN**, click on **Roles**
3. Click on the **Public** role

### Step 3: Enable Sector Permissions

In the Permissions section, find **SECTOR** and enable:

- ✅ **find** - Allows fetching all sectors (GET /api/sectors)
- ✅ **findOne** - Allows fetching a single sector (GET /api/sectors/:id)

### Step 4: Enable Category Permissions (If Needed)

Since sectors populate categories, also enable:

- ✅ **Category → find**
- ✅ **Category → findOne**

### Step 5: Save Changes

1. Scroll to the top or bottom of the page
2. Click the **Save** button (green button in top-right)
3. Wait for the success notification

### Step 6: Verify the Fix

Refresh your frontend page:
```
http://localhost:3000/sectors
```

The sectors should now load without the 403 error.

## Visual Guide

### Before (403 Error)
```
Settings → Roles → Public
├─ SECTOR
│  ☐ find        ← DISABLED (causes 403)
│  ☐ findOne
│  ☐ create
│  ☐ update
│  ☐ delete
```

### After (Working)
```
Settings → Roles → Public
├─ SECTOR
│  ✅ find        ← ENABLED
│  ✅ findOne     ← ENABLED
│  ☐ create
│  ☐ update
│  ☐ delete
```

## Alternative: Using Strapi CLI (Advanced)

If you prefer to set permissions via code, you can create a bootstrap script:

**File**: `src/index.ts`

```typescript
export default {
  async bootstrap({ strapi }) {
    // Set permissions on bootstrap
    const publicRole = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: 'public' } });

    const sectorPermissions = await strapi
      .query('plugin::users-permissions.permission')
      .findMany({
        where: {
          role: publicRole.id,
          action: { $in: ['api::sector.sector.find', 'api::sector.sector.findOne'] }
        }
      });

    // Enable permissions
    for (const permission of sectorPermissions) {
      await strapi
        .query('plugin::users-permissions.permission')
        .update({
          where: { id: permission.id },
          data: { enabled: true }
        });
    }

    console.log('✅ Sector permissions enabled');
  }
};
```

## Troubleshooting

### Still Getting 403 After Enabling Permissions?

**1. Clear Strapi Cache**
```bash
# Stop Strapi
docker-compose down

# Remove cache
rm -rf .cache

# Start Strapi
docker-compose up -d
```

**2. Check if Sector Content Type Exists**

Navigate to: **Content Manager** → Check if **Sector** appears in the left sidebar

If not, you need to create the Sector content type first.

**3. Verify Permission Was Saved**

Go back to **Settings → Roles → Public** and confirm the checkboxes are still enabled. Sometimes the page needs a refresh.

**4. Check Browser Console for Additional Errors**

Open Developer Tools (F12) and check the Console and Network tabs for more details.

### Creating Sector Content Type (If It Doesn't Exist)

If you haven't created the Sector content type yet:

1. Go to **Content-Type Builder**
2. Click **Create new collection type**
3. Display name: `Sector`
4. Click **Continue**
5. Add fields:
   - **name** (Text, required)
   - **slug** (UID, target field: name)
6. Add relation to Category:
   - Type: **oneToMany**
   - Related to: **Category**
   - Field name: `categories`
7. Click **Finish**
8. Click **Save**
9. **Restart Strapi** (Docker will auto-restart)

Then go back and enable the permissions as described above.

## Permission Matrix for Sectors Page

For the sectors page to work fully, enable these permissions:

| Content Type | Permission | Required For |
|--------------|-----------|--------------|
| Sector | find | Fetching all sectors |
| Sector | findOne | Clicking on sector details |
| Category | find | Populating categories under sectors |
| Category | findOne | Clicking on category details |

All of these should be enabled on the **Public** role.

## Testing the API Directly

You can test if the permissions are working by visiting this URL in your browser:

```
${SERVER_URL:-http://localhost:1337}/api/sectors?populate=categories
```

**Expected Response (Success):**
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "name": "Bancos",
        "slug": "bancos",
        "categories": {
          "data": [...]
        }
      }
    }
  ]
}
```

**Response if Still 403:**
```json
{
  "data": null,
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "Forbidden"
  }
}
```

## Summary of Fix

1. ✅ Go to Strapi Admin (${SERVER_URL:-http://localhost:1337}/admin)
2. ✅ Settings → Users & Permissions → Roles → Public
3. ✅ Enable: **Sector → find** and **Sector → findOne**
4. ✅ Enable: **Category → find** and **Category → findOne**
5. ✅ Click **Save**
6. ✅ Refresh frontend page

The 403 error should be resolved and sectors should load correctly!

## Additional Notes

### Why Public Role?

The sectors page is accessed by **unauthenticated users** (anyone can view sectors). Therefore, the **Public role** needs these permissions.

If you wanted sectors to be visible only to authenticated users, you would:
1. Keep Public permissions disabled
2. Enable permissions on **Authenticated** role instead
3. Add authentication check to the sectors page

### Security Considerations

Enabling `find` and `findOne` on Public role is safe for:
- ✅ Read-only data (sectors, categories)
- ✅ Public information (business listings, reviews)

Do NOT enable on Public role:
- ❌ `create` - Users could create sectors
- ❌ `update` - Users could modify sectors
- ❌ `delete` - Users could delete sectors

These should only be enabled for **Authenticated** or **Admin** roles.

## Related Documentation

- [Strapi Permissions Guide](https://docs.strapi.io/user-docs/users-roles-permissions/configuring-end-users-roles)
- [Strapi Public API](https://docs.strapi.io/dev-docs/api/rest)
- Previous fix: `TROUBLESHOOTING_403_HYDRATION.md` (different 403 issue for user reviews)

