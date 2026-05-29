# Quick Fix - Enable Strapi Permissions (5 Minutes)

## Problem
Your frontend is loading forever because Strapi returns `403 Forbidden` when trying to fetch reviews with parameters.

## Solution
Enable public access to Reviews and related content in Strapi Admin.

## Steps (Follow Exactly)

### 1. Open Strapi Admin
```
${SERVER_URL:-http://localhost:1337}/admin
```
Login with your admin credentials.

### 2. Go to Permissions
```
Left Sidebar → Settings (⚙️) → USERS & PERMISSIONS PLUGIN → Roles → Public
```

### 3. Enable These Checkboxes

Scroll down and find each section, then check the boxes:

#### ✅ Review
- [x] find
- [x] findOne

#### ✅ Business  
- [x] find
- [x] findOne

#### ✅ Category
- [x] find
- [x] findOne

#### ✅ Sector
- [x] find
- [x] findOne

#### ✅ Users-permissions → User
- [x] find
- [x] findOne

### 4. Save
Click the blue **Save** button at the top right.

### 5. Test
Open your frontend in browser:
```
http://localhost:3000
```

You should see reviews loading on the homepage! 🎉

## Visual Checklist

```
Settings (⚙️)
  └── USERS & PERMISSIONS PLUGIN
       └── Roles
            └── Public (click here)
                 └── Permissions section
                      ├── Review
                      │    ├── ✅ find
                      │    └── ✅ findOne
                      ├── Business
                      │    ├── ✅ find
                      │    └── ✅ findOne
                      ├── Category
                      │    ├── ✅ find
                      │    └── ✅ findOne
                      ├── Sector
                      │    ├── ✅ find
                      │    └── ✅ findOne
                      └── Users-permissions
                           └── User
                                ├── ✅ find
                                └── ✅ findOne
```

## Verify It Works

### In Browser Console (F12):
**Before Fix:**
```
Error fetching reviews: 403 Forbidden
```

**After Fix:**
```
Fetching reviews - page: 1
Reviews loaded: 5
```

### In Terminal:
```bash
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?pagination[pageSize]=2"
```

Should return JSON with review data.

## Still Not Working?

1. **Clear browser cache** (Ctrl+Shift+Delete)
2. **Restart Strapi:**
   ```bash
   cd cliavalia-backend
   docker-compose restart
   ```
3. **Restart frontend:**
   ```bash
   cd cliavalia-frontend  
   npm run dev
   ```

## Need Help?
See detailed guide: `DIAGNOSE_AND_FIX_REVIEWS.md`









