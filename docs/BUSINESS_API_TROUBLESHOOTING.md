# Business API - 400 Bad Request Troubleshooting Guide

## Quick Fix (Most Common Issue)

The 400 error is most likely caused by **missing permissions**. Follow these steps:

### Step 1: Enable Business Create Permission

1. Open Strapi Admin Panel: ${SERVER_URL:-http://localhost:1337}/admin
2. Navigate to: **Settings** → **Users & Permissions Plugin** → **Roles**
3. Click on **Authenticated** role
4. Scroll down to find **Business** section
5. Enable these permissions:
   - ✅ `create` - Allow authenticated users to create businesses
   - ✅ `find` - Allow authenticated users to view all businesses
   - ✅ `findOne` - Allow authenticated users to view single business
   - ✅ `update` - Allow authenticated users to update businesses
   - ✅ `delete` - Allow authenticated users to delete businesses

### Step 2: Restart Strapi (IMPORTANT!)

Permissions changes require a restart:
```bash
# Stop and restart the Docker container
cd cliavalia-backend
docker compose restart strapi
```

---

## Additional Debugging Steps

If the permission fix doesn't work, try these steps:

### 1. Check Backend Logs for Detailed Error

```bash
# View detailed Strapi logs
cd cliavalia-backend
docker logs cliavalia-backend --tail=100 --follow

# Then try to create a business from the frontend
# You should see detailed error messages in the logs
```

### 2. Verify Sector and Category IDs

The sector and category IDs must exist in the database:

```bash
# Test if sectors API works
curl ${SERVER_URL:-http://localhost:1337}/api/sectors

# Test if categories API works
curl ${SERVER_URL:-http://localhost:1337}/api/categories
```

Both should return data with `id` and `name` fields.

### 3. Test API Directly with cURL

```bash
# Get your JWT token from browser console after logging in
# Look for: localStorage.getItem('jwt')

# Test creating a business (replace YOUR_JWT_TOKEN with actual token)
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

**Expected Responses:**

✅ **Success (200):**
```json
{
  "data": {
    "id": 1,
    "documentId": "xxx",
    "name": "Test Business",
    "sector": { ... },
    "category": { ... }
  }
}
```

❌ **Forbidden (403):** Permission not enabled
```json
{
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "Forbidden"
  }
}
```

❌ **Bad Request (400):** Validation error
```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "name is required" // or other validation message
  }
}
```

### 4. Check Database Tables

Verify that sectors and categories exist:

```bash
# Connect to MySQL database
docker exec -it cliavalia-db mysql -u root -p
# Password: your_strong_password (from docker-compose.yml)

# Check database
USE cliavalia;

# List sectors
SELECT id, name FROM sectors LIMIT 10;

# List categories
SELECT id, name FROM categories LIMIT 10;

# Exit
exit
```

### 5. Verify Frontend is Sending Correct Data

Open browser console (F12) and look for:
```
Selected data: {
  name: "Business Name",
  sectorId: 1,
  categoryId: 2,
  ...
}

Creating business with data: {
  "data": {
    "name": "Business Name",
    "sector": 1,
    "category": 2,
    "verified": false
  }
}
```

### 6. Check Business Name Length

The business name must be between 3-100 characters (defined in schema):
- ❌ "AB" - Too short (< 3 characters)
- ✅ "ABC Company" - Valid
- ✅ "Very Long Business Name..." - Valid (< 100 chars)

---

## Common Error Messages and Solutions

### Error: "Forbidden"
**Cause:** `create` permission not enabled for Authenticated role  
**Solution:** Enable permission in Strapi admin (see Step 1 above)

### Error: "name is required"
**Cause:** Business name is empty or not provided  
**Solution:** Ensure the business name field is filled

### Error: "name must be at least 3 characters"
**Cause:** Business name is too short  
**Solution:** Enter at least 3 characters

### Error: "sector must be a number" or "Invalid sector"
**Cause:** Invalid sector ID or sector doesn't exist  
**Solution:** Verify sector ID exists in database

### Error: "Unauthorized"
**Cause:** User is not logged in or JWT token is invalid  
**Solution:** Log in again and ensure token is being sent

---

## Strapi v5 Relation Format

In Strapi v5, relations should be created using **numeric IDs**:

✅ **Correct:**
```javascript
{
  data: {
    name: "Business Name",
    sector: 1,         // numeric ID
    category: 2,       // numeric ID
    verified: false
  }
}
```

❌ **Incorrect (Strapi v4 style):**
```javascript
{
  data: {
    name: "Business Name",
    sector: {
      connect: [1]     // Old Strapi v4 format
    }
  }
}
```

❌ **Incorrect (using documentId):**
```javascript
{
  data: {
    name: "Business Name",
    sector: "abc123"   // documentId is not used for relations
  }
}
```

---

## Testing Checklist

- [ ] Business create permission enabled for Authenticated role
- [ ] Strapi restarted after permission change
- [ ] User is logged in (JWT token present)
- [ ] Business name is 3-100 characters
- [ ] Sector ID exists in database
- [ ] Category ID exists in database
- [ ] Sector and category are numeric IDs (not strings or objects)
- [ ] No null values in required fields

---

## Still Having Issues?

1. **Check browser console** for detailed error messages
2. **Check Strapi logs** with `docker logs cliavalia-backend --follow`
3. **Try the cURL test** to isolate frontend/backend issues
4. **Verify database data** to ensure sectors/categories exist

---

## Permission Configuration Reference

### Authenticated Role - Business Permissions

| Permission | Should be enabled? | Description |
|------------|-------------------|-------------|
| `create` | ✅ Yes | Allow users to create businesses |
| `find` | ✅ Yes | Allow users to list businesses |
| `findOne` | ✅ Yes | Allow users to view single business |
| `update` | ⚠️ Optional | Allow users to update businesses |
| `delete` | ⚠️ Optional | Allow users to delete businesses |

### Public Role - Business Permissions

| Permission | Should be enabled? | Description |
|------------|-------------------|-------------|
| `create` | ❌ No | Only authenticated users can create |
| `find` | ✅ Yes | Public can view business list |
| `findOne` | ✅ Yes | Public can view business details |
| `update` | ❌ No | Public cannot update |
| `delete` | ❌ No | Public cannot delete |

---

**Last Updated:** 2025-11-01  
**Strapi Version:** v5.30.0  
**Status:** ✅ Ready for Production

