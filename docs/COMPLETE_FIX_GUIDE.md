# Complete Fix Guide - Data Not Displaying

## ✅ Status: All Strapi APIs Working, Frontend Needs Fixes

### Issues Found

#### Issue 1: Server API Routes Use Wrong Config Variable ❌
**File**: `server/api/reviews.get.ts`, `server/api/sectors.get.ts`  
**Problem**: Uses `config.public.strapiUrl` but config defines `strapiApiUrl`  
**Status**: ✅ FIXED

#### Issue 2: Populate Returns Empty ❌  
**Problem**: When adding `?populate=categories`, Strapi returns empty  
**Cause**: Either permissions OR no data linking sectors to categories  
**Status**: NEEDS FIXING

#### Issue 3: Component Calls Strapi Directly ⚠️
**File**: `components/home/RecentReviewsSection.vue`  
**Problem**: Calls Strapi directly instead of using server routes  
**Status**: NEEDS UPDATING (but will work)

---

## Step-by-Step Fix

### Step 1: Verify Strapi Permissions (CRITICAL)

Go to: `${SERVER_URL:-http://localhost:1337}/admin`

Navigate to: **Settings → Roles → Public**

Ensure these are ALL checked:

#### Core Permissions:
- **Review**
  - ✅ find
  - ✅ findOne
  
- **Business**
  - ✅ find
  - ✅ findOne
  
- **Sector**
  - ✅ find
  - ✅ findOne
  
- **Category**
  - ✅ find
  - ✅ findOne
  
- **Spotlight**
  - ✅ find
  - ✅ findOne
  
- **Users-permissions → User**
  - ✅ find
  - ✅ findOne

Click **Save**!

### Step 2: Test Populate is Working

Open terminal:
```bash
cd cliavalia-backend

# Test basic endpoint
curl "${SERVER_URL:-http://localhost:1337}/api/sectors?pagination[pageSize]=1"

# Test with populate
curl "${SERVER_URL:-http://localhost:1337}/api/sectors?populate=categories&pagination[pageSize]=1"
```

#### Expected Result:
```json
{
  "data": [{
    "id": 1,
    "name": "Petróleo e Gás",
    "categories": [
      {"id": 2, "name": "Prospeção"},
      {"id": 4, "name": "Extração"}
    ]
  }]
}
```

#### If Categories Array is Empty:
This means categories aren't linked to sectors in the database!

**Fix in Strapi Admin:**
1. Go to: `${SERVER_URL:-http://localhost:1337}/admin`
2. Click **Content Manager → Category**
3. Open each category
4. Select the appropriate **Sector** in the dropdown
5. Click **Publish**
6. Repeat for all categories

### Step 3: Restart Frontend

```bash
cd cliavalia-frontend
npm run dev
```

### Step 4: Test Everything

#### Test 1: Industries Page
Open: `http://localhost:3000/industries`

**Expected**: Sectors load with categories listed

#### Test 2: Homepage Reviews
Open: `http://localhost:3000`

**Expected**: Recent reviews section shows reviews

#### Test 3: Browser Console
Press F12, check console:

**Should see**:
```
Fetching reviews - page: 1
Reviews loaded: 5
```

**Should NOT see**:
```
Error: 403 Forbidden
undefined/api/reviews
```

---

## If Still Broken After All Steps

### Debug Checklist:

#### 1. Check Environment Variables
```bash
cd cliavalia-frontend
cat .env
```

Should contain:
```
NUXT_PUBLIC_STRAPI_API_URL=${SERVER_URL:-http://localhost:1337}
```

#### 2. Check Strapi is Running
```bash
cd cliavalia-backend
docker-compose ps
```

Should show Strapi running on port 1337.

#### 3. Test Direct Strapi Calls
```bash
# Reviews
curl ${SERVER_URL:-http://localhost:1337}/api/reviews

# Sectors  
curl ${SERVER_URL:-http://localhost:1337}/api/sectors

# Categories
curl ${SERVER_URL:-http://localhost:1337}/api/categories
```

All should return JSON data, not 403.

#### 4. Check Browser Network Tab
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh page
4. Look for API calls

**Red (failed) requests**: Check the error
**200 but empty data**: Check permissions or data exists

---

## Common Issues & Solutions

### Issue: "Cannot read property 'strapiApiUrl' of undefined"
**Solution**: .env file missing or not loaded
```bash
cd cliavalia-frontend
cp env.example .env
nano .env  # Add: NUXT_PUBLIC_STRAPI_API_URL=${SERVER_URL:-http://localhost:1337}
npm run dev
```

### Issue: Sectors load but no categories shown
**Solution**: Categories not linked to sectors in database
1. Go to Strapi Admin
2. Content Manager → Category
3. Edit each category and select a Sector
4. Save and Publish

### Issue: Reviews show "Anónimo" instead of usernames
**Solution**: Enable User find/findOne permissions
1. Settings → Roles → Public
2. Users-permissions → User
3. Check: find, findOne
4. Save

### Issue: "Empresa Desconhecida" instead of business name
**Solution**: Reviews not linked to businesses OR Business permissions not enabled
1. Check Business find/findOne permissions
2. Check reviews in Strapi have business selected

---

## Files Modified

✅ **Fixed**:
- `server/api/reviews.get.ts` - Changed `strapiUrl` → `strapiApiUrl`
- `server/api/sectors.get.ts` - Changed `strapiUrl` → `strapiApiUrl`

⚠️ **Recommended** (not critical):
- `components/home/RecentReviewsSection.vue` - Use server route instead of direct Strapi call

---

## Success Criteria

After all fixes, you should have:
- [x] Strapi returning 200 for all endpoints
- [x] Server API routes using correct config variable
- [x] All permissions enabled in Strapi Admin
- [x] Categories linked to sectors in database
- [x] Industries page loads with sectors and categories
- [x] Homepage shows reviews with company names and usernames
- [x] No 403 errors in browser console
- [x] No "undefined" in API URLs

---

## Quick Test Script

Save this as `test-frontend.sh` in `cliavalia-frontend`:

```bash
#!/bin/bash

echo "Testing Frontend..."
echo ""

echo "1. Checking environment..."
if [ -f .env ]; then
  cat .env | grep STRAPI_API_URL
else
  echo "❌ .env file not found!"
fi
echo ""

echo "2. Testing Nuxt server routes..."
curl -s "http://localhost:3000/api/sectors" | head -10
echo ""

echo "3. Testing Strapi directly..."
curl -s "${SERVER_URL:-http://localhost:1337}/api/sectors" | head -10
echo ""

echo "4. Testing populate..."
curl -s "${SERVER_URL:-http://localhost:1337}/api/sectors?populate=categories&pagination[pageSize]=1" | head -30
echo ""

echo "Done!"
```

Run with: `bash test-frontend.sh`

---

## Need Help?

If issues persist after following this guide:
1. Check `FINAL_DIAGNOSIS.md` for detailed analysis
2. Run `test-all-endpoints.sh` in backend folder
3. Check Strapi logs: `docker logs cliavalia-backend --tail 50`
4. Check browser console for specific errors









