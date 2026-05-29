# Quick Fix: 403 Forbidden on /api/sectors

## The Problem
```
❌ GET ${SERVER_URL:-http://localhost:1337}/api/sectors
   [HTTP/1.1 403 Forbidden]
```

## The Solution (2 Minutes)

### Step 1: Open Strapi Admin
```
${SERVER_URL:-http://localhost:1337}/admin
```

### Step 2: Navigate to Permissions
```
Settings (⚙️) → Users & Permissions → Roles → Public
```

### Step 3: Enable These Permissions

Scroll down to find **SECTOR** and check:
```
SECTOR
  ✅ find
  ✅ findOne
```

If sectors have categories, also enable:
```
CATEGORY
  ✅ find
  ✅ findOne
```

### Step 4: Save
Click the green **Save** button in the top-right corner.

### Step 5: Test
Refresh your page at `http://localhost:3000/sectors`

## Done! ✅

Your sectors page should now load without errors.

---

## Still Not Working?

### Check 1: Sector Content Type Exists?
Go to **Content Manager** in Strapi. Do you see **Sector** in the left menu?

- **YES**: Good, permissions should fix it
- **NO**: You need to create the Sector content type first

### Check 2: Any Data in Sectors?
Click **Content Manager → Sector**. Are there any entries?

- **YES**: Data should show on frontend
- **NO**: Create a test sector:
  - Name: "Test Sector"
  - Click **Save**
  - Click **Publish**

### Check 3: Clear Cache
```bash
docker-compose restart strapi
```

---

## Visual Navigation Map

```
Strapi Admin (${SERVER_URL:-http://localhost:1337}/admin)
│
├─ 📄 Content Manager         (for adding data)
│   └─ Sector
│       └─ [Create new entry]
│
└─ ⚙️ Settings                 (for permissions)
    └─ Users & Permissions plugin
        └─ Roles
            └─ Public          ← YOU ARE HERE
                └─ Permissions
                    └─ SECTOR
                        ├─ ✅ find
                        └─ ✅ findOne
```

---

## Quick Test

After enabling permissions, test directly in your browser:

```
${SERVER_URL:-http://localhost:1337}/api/sectors
```

Should return:
```json
{
  "data": [...],  ← Your sectors
  "meta": {...}
}
```

NOT:
```json
{
  "error": {
    "status": 403,  ← Permission error
    "message": "Forbidden"
  }
}
```

---

## Why This Happens

Strapi **protects all APIs by default**. You must explicitly grant permissions for:
- Public users (unauthenticated)
- Authenticated users
- Specific roles

The sectors page is public, so we enable it on the **Public** role.

---

## Next Steps After Fix

1. ✅ Permissions enabled
2. ✅ Page loads
3. → Add sectors in Strapi
4. → Add categories under sectors
5. → See them on the frontend!

---

**Need more help?** See the full guide: `FIX_403_SECTORS_PERMISSIONS.md`

