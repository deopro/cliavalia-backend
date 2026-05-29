# User Reviews Feature - Quick Start Guide

## ✅ What Was Implemented

### Backend (Strapi)
1. **Added Schema Fields** to Review model:
   - `views` (integer, default: 0)
   - `helpfulVotes` (integer, default: 0)

2. **Created 3 New Endpoints**:
   - `GET /api/reviews/me` - Get current user's reviews with statistics
   - `POST /api/reviews/:id/view` - Increment view count
   - `POST /api/reviews/:id/helpful` - Increment helpful votes

3. **Custom Routes File**: `src/api/review/routes/custom-review.ts`

### Frontend (Nuxt 4)
1. **Created Composable**: `composables/useUserReviews.ts`
   - Fetches user reviews from backend
   - Manages statistics
   - Handles errors and loading states

2. **Updated Page**: `pages/user/my-reviews.vue`
   - Uses new composable
   - Displays reviews and statistics
   - Shows company and industry information

---

## 🚀 Quick Test

### 1. Enable Permissions (IMPORTANT!)

```bash
# 1. Open Strapi Admin
open ${SERVER_URL:-http://localhost:1337}/admin

# 2. Go to Settings → Users & Permissions → Roles → Authenticated
# 3. Enable these Review permissions:
#    - find
#    - findOne
#    - create
#    - update
#    - delete
# 4. Click Save
# 5. Restart Strapi
docker compose restart strapi
```

### 2. Test the API

```bash
# Get your JWT token from browser console:
# localStorage.getItem('jwt')

TOKEN="your_jwt_token"

# Test: Get user reviews
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews/me" \
  -H "Authorization: Bearer $TOKEN"

# Expected Response:
# {
#   "data": [...reviews...],
#   "meta": {
#     "statistics": {
#       "totalReviews": N,
#       "totalViews": N,
#       "totalHelpful": N
#     }
#   }
# }
```

### 3. Test the Frontend

1. Log in to your app
2. Navigate to `/user/my-reviews`
3. You should see:
   - Profile header
   - Statistics cards
   - List of your reviews with company names

---

## 📋 Files Modified/Created

### Backend
- ✅ `src/api/review/content-types/review/schema.json` (updated)
- ✅ `src/api/review/controllers/review.ts` (updated)
- ✅ `src/api/review/routes/custom-review.ts` (created)

### Frontend
- ✅ `composables/useUserReviews.ts` (created)
- ✅ `pages/user/my-reviews.vue` (updated)

### Documentation
- ✅ `USER_REVIEWS_FEATURE.md` (complete guide)
- ✅ `USER_REVIEWS_QUICKSTART.md` (this file)

---

## 🎯 Next Steps

1. ✅ Strapi is running with new endpoints
2. ⚠️ **Enable permissions** (see step 1 above)
3. ⚠️ **Test the endpoints** (see step 2 above)
4. ⚠️ **Test the frontend page** (see step 3 above)

---

## 📝 Response Format

The `/api/reviews/me` endpoint returns:

```typescript
{
  data: [
    {
      id: number,
      documentId: string,
      title: string,
      content: string,          // Auto-converted from blocks
      rating: number,
      company: string,           // From business relation
      companyId: number,
      industry: string,          // From business.sector/category
      createdAt: string,
      updatedAt: string,
      views: number,
      helpfulVotes: number
    }
  ],
  meta: {
    statistics: {
      totalReviews: number,
      totalViews: number,
      totalHelpful: number
    }
  }
}
```

---

## ⚡ Key Features

- ✅ Automatic text conversion (Strapi blocks → plain text)
- ✅ Populated business information (name, sector, category)
- ✅ Pre-calculated statistics
- ✅ Authentication required for `/me` endpoint
- ✅ Error handling with Portuguese messages
- ✅ Loading states
- ✅ Dark mode support (frontend)
- ✅ Responsive design (frontend)

---

**Status:** ✅ Implementation Complete  
**Strapi Status:** ✅ Running (port 1337)  
**Next Action:** Enable permissions and test!

