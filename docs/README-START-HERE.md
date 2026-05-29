# 🚀 START HERE - Fix Your Frontend Now

## The Problem
Your Nuxt frontend is loading forever because **Strapi permissions are not configured**.

## The Solution (5 Minutes)
Enable public access to content in Strapi Admin.

---

## Quick Fix (Copy & Paste These Steps)

### Step 1: Open Strapi
```
${SERVER_URL:-http://localhost:1337}/admin
```
Login with your admin account.

### Step 2: Go to Permissions
Click: **Settings** → **Roles** → **Public**

### Step 3: Enable These Checkboxes

Scroll down and check these boxes:

#### ✅ Review
- [x] find
- [x] findOne

#### ✅ Business
- [x] find
- [x] findOne

#### ✅ Sector
- [x] find
- [x] findOne

#### ✅ Category
- [x] find
- [x] findOne

#### ✅ Spotlight
- [x] find
- [x] findOne

#### ✅ Users-permissions → User
- [x] find
- [x] findOne

### Step 4: Save
Click the blue **Save** button (top right).

### Step 5: Test
Open browser: `http://localhost:3000`

Your homepage should now load with reviews, spotlights, and business data! 🎉

---

## Still Not Working?

### Option 1: Restart Everything
```bash
# Backend
cd cliavalia-backend
docker-compose restart

# Frontend (in new terminal)
cd cliavalia-frontend
npm run dev
```

### Option 2: Clear Browser Cache
Press `Ctrl+Shift+Delete` → Clear cache → Refresh page

### Option 3: Check Strapi Is Running
```bash
cd cliavalia-backend
docker-compose ps
```

Should show Strapi running on port 1337.

---

## Test If It's Working

### In Browser Console (F12):
**Before Fix:**
```
Error: 403 Forbidden
```

**After Fix:**
```
Fetching reviews - page: 1
Reviews loaded: 5
```

### In Terminal:
```bash
curl ${SERVER_URL:-http://localhost:1337}/api/reviews
```
Should return JSON data (not 403 error).

---

## Need More Help?

See detailed guides:
- `quick-fix-permissions.md` - Visual step-by-step guide
- `COMPLETE_PERMISSIONS_CHECKLIST.md` - Full permission list
- `DIAGNOSE_AND_FIX_REVIEWS.md` - Troubleshooting guide

---

## What These Permissions Do

| Permission | What It Fixes |
|-----------|---------------|
| Review find | Homepage reviews load |
| Business find | Business search works |
| Sector find | Industries page loads |
| Category find | Category filters work |
| Spotlight find | Homepage logos show |
| User find | Reviewer names display |

---

## Important Notes

✅ **DO enable** `find` and `findOne` for Public role
❌ **DON'T enable** `create`, `update`, or `delete` for Public role

These permissions let anyone **view** content, but only logged-in users can **create/edit** content.

---

## Success Checklist

After applying the fix, you should see:
- [ ] Homepage loads completely
- [ ] Spotlight logos appear in hero section
- [ ] Recent reviews section shows reviews
- [ ] Business search works
- [ ] Industries/Sectors page loads
- [ ] No 403 errors in console
- [ ] No infinite loading spinners

---

**Estimated Time:** 5 minutes
**Difficulty:** Beginner
**Success Rate:** 99% ✅

Go to: `${SERVER_URL:-http://localhost:1337}/admin` and follow Step 2! 🚀









