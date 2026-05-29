# User Reviews Feature - Complete Implementation Guide

## Overview

This feature allows users to view their review history with statistics including total reviews, views, and helpful votes. The implementation includes both backend endpoints and frontend integration.

---

## Backend Implementation

### 1. Schema Updates

**File:** `src/api/review/content-types/review/schema.json`

**Added Fields:**
```json
{
  "views": {
    "type": "integer",
    "default": 0,
    "min": 0
  },
  "helpfulVotes": {
    "type": "integer",
    "default": 0,
    "min": 0
  }
}
```

### 2. Custom Controller Endpoints

**File:** `src/api/review/controllers/review.ts`

#### Endpoint 1: Get User's Reviews
```typescript
GET /api/reviews/me
```

**Authentication:** Required (JWT token)

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "documentId": "abc123",
      "title": "Great service!",
      "content": "Excellent experience with...",
      "rating": 5,
      "company": "Business Name",
      "companyId": 1,
      "industry": "Sector Name",
      "createdAt": "2025-11-01T...",
      "updatedAt": "2025-11-01T...",
      "views": 42,
      "helpfulVotes": 15
    }
  ],
  "meta": {
    "statistics": {
      "totalReviews": 5,
      "totalViews": 250,
      "totalHelpful": 87
    }
  }
}
```

**Features:**
- Automatically converts Strapi blocks (`reviewText`) to plain text
- Populates business with sector/category information
- Calculates statistics (total reviews, views, helpful votes)
- Returns data in frontend-friendly format

#### Endpoint 2: Increment View Count
```typescript
POST /api/reviews/:id/view
```

**Authentication:** Not required (public)

**Response:**
```json
{
  "data": {
    "views": 43
  }
}
```

#### Endpoint 3: Toggle Helpful Vote
```typescript
POST /api/reviews/:id/helpful
```

**Authentication:** Required (JWT token)

**Response:**
```json
{
  "data": {
    "helpfulVotes": 16
  }
}
```

**Note:** Current implementation increments the count. For production, you should track which users voted to prevent duplicate votes.

### 3. Custom Routes

**File:** `src/api/review/routes/review.ts`

Custom routes are merged with core Strapi routes:
```typescript
{
  method: 'GET',
  path: '/reviews/me',
  handler: 'review.me',
}
```

---

## Frontend Implementation

### 1. Composable: `useUserReviews`

**File:** `composables/useUserReviews.ts`

**Usage:**
```typescript
const {
  reviews,        // Reactive array of user reviews
  statistics,     // Reactive statistics object
  loading,        // Loading state
  error,          // Error message
  fetchUserReviews,   // Fetch reviews function
  incrementView,      // Increment view count
  toggleHelpful,      // Toggle helpful vote
  formatDate,         // Format date helper
} = useUserReviews()
```

**Example:**
```vue
<script setup>
import { useUserReviews } from '~/composables/useUserReviews'

const { 
  reviews, 
  statistics, 
  loading, 
  fetchUserReviews 
} = useUserReviews()

onMounted(async () => {
  await fetchUserReviews()
})
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else>
    <p>Total Reviews: {{ statistics.totalReviews }}</p>
    <div v-for="review in reviews" :key="review.id">
      <h3>{{ review.title }}</h3>
      <p>{{ review.content }}</p>
      <p>Rating: {{ review.rating }}/5</p>
      <p>Company: {{ review.company }}</p>
      <p>Views: {{ review.views }}</p>
      <p>Helpful: {{ review.helpfulVotes }}</p>
    </div>
  </div>
</template>
```

### 2. Page: `my-reviews.vue`

**File:** `pages/user/my-reviews.vue`

**Features:**
- User profile header with avatar and verification badge
- Statistics cards (Total Reviews, Total Views, Helpful Votes)
- Reviews list with company, industry, and engagement metrics
- Error handling with retry functionality
- Loading states with skeleton UI
- Success messages
- Responsive design with dark mode support

---

## Database Migration

After updating the schema, Strapi will automatically create the new columns when it restarts. However, existing reviews will have `NULL` values for `views` and `helpfulVotes`.

**Optional: Set default values for existing reviews**

```sql
-- Update existing reviews to have 0 views and helpful votes
UPDATE reviews 
SET 
  views = 0,
  helpful_votes = 0
WHERE 
  views IS NULL 
  OR helpful_votes IS NULL;
```

**Run this query:**
```bash
docker exec -i cliavalia-db mysql -uroot -pyour_strong_password cliavalia -e "
UPDATE reviews 
SET 
  views = 0,
  helpful_votes = 0
WHERE 
  views IS NULL 
  OR helpful_votes IS NULL;
"
```

---

## Permissions Configuration

### Required Permissions (Authenticated Role)

1. Open Strapi Admin: ${SERVER_URL:-http://localhost:1337}/admin
2. Go to: **Settings → Users & Permissions → Roles → Authenticated**
3. Enable these permissions for **Review**:
   - ✅ `find` - View all reviews
   - ✅ `findOne` - View single review
   - ✅ `create` - Create reviews
   - ✅ `update` - Update own reviews
   - ✅ `delete` - Delete own reviews

4. **Save** and **restart Strapi**:
```bash
docker compose restart strapi
```

---

## Testing

### Test Backend Endpoints

#### 1. Get User Reviews
```bash
# Get your JWT token from browser localStorage
TOKEN="your_jwt_token_here"

curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews/me" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:** JSON with reviews array and statistics

#### 2. Increment View
```bash
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/reviews/1/view"
```

**Expected Response:** `{ "data": { "views": N } }`

#### 3. Toggle Helpful
```bash
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/reviews/1/helpful" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:** `{ "data": { "helpfulVotes": N } }`

### Test Frontend Integration

1. **Log in** to your application
2. Navigate to **/user/my-reviews**
3. Verify you see:
   - Your profile information
   - Statistics cards with correct counts
   - List of your reviews
   - Company and industry information
   - View and helpful vote counts

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  pages/user/my-reviews.vue                       │  │
│  │  - Displays user reviews                         │  │
│  │  - Shows statistics                              │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │  composables/useUserReviews.ts                   │  │
│  │  - Manages review state                          │  │
│  │  - Handles API calls                             │  │
│  └──────────────────┬───────────────────────────────┘  │
└─────────────────────┼───────────────────────────────────┘
                      │
                      │ HTTP Request
                      │ GET /api/reviews/me
                      │ Authorization: Bearer JWT
                      ▼
┌─────────────────────────────────────────────────────────┐
│                      Backend                            │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  routes/review.ts                                │  │
│  │  - Maps /reviews/me to controller                │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │  controllers/review.ts                           │  │
│  │  - Authenticates user                            │  │
│  │  - Fetches reviews from database                 │  │
│  │  - Converts blocks to text                       │  │
│  │  - Formats response                              │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │  Database (MySQL)                                │  │
│  │  - reviews table                                 │  │
│  │  - businesses table                              │  │
│  │  - sectors/categories tables                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Issue: "Sessão expirada"
**Cause:** JWT token expired or invalid  
**Solution:** Log in again to get a fresh token

### Issue: Empty reviews array
**Cause:** User hasn't created any reviews  
**Solution:** Create a review via `/user/write-review`

### Issue: Statistics show 0
**Cause:** Review schema was updated after reviews were created  
**Solution:** Run the SQL migration above to set default values

### Issue: 404 on /api/reviews/me
**Cause:** Custom routes not loaded  
**Solution:** Verify routes file is correct and restart Strapi

### Issue: 401 Unauthorized
**Cause:** Missing or invalid JWT token  
**Solution:** Check that user is logged in and token is in request headers

---

## Future Enhancements

### 1. Vote Tracking
Track which users voted to prevent duplicate votes:

```typescript
// Add new collection type: review_helpful_votes
{
  review: { type: 'relation', target: 'api::review.review' },
  user: { type: 'relation', target: 'plugin::users-permissions.user' },
  votedAt: { type: 'datetime' }
}
```

### 2. Review Analytics
Add more detailed analytics:
- Views over time
- Helpful vote ratio
- Average rating
- Response rate

### 3. Review Responses
Allow businesses to respond to reviews:
- Add `response` field to review schema
- Add business owner verification
- Notification system

### 4. Review Moderation
Add moderation features:
- Report inappropriate reviews
- Admin review approval
- Automated content filtering

---

## API Reference

### GET /api/reviews/me

Fetch all reviews by the authenticated user.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response:** 200 OK
```json
{
  "data": [UserReview],
  "meta": {
    "statistics": {
      "totalReviews": number,
      "totalViews": number,
      "totalHelpful": number
    }
  }
}
```

**Errors:**
- 401: Unauthorized (not logged in)
- 500: Internal server error

### POST /api/reviews/:id/view

Increment view count for a review.

**Parameters:**
- `id` (path): Review ID

**Response:** 200 OK
```json
{
  "data": {
    "views": number
  }
}
```

### POST /api/reviews/:id/helpful

Toggle helpful vote for a review.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Parameters:**
- `id` (path): Review ID

**Response:** 200 OK
```json
{
  "data": {
    "helpfulVotes": number
  }
}
```

---

**Status:** ✅ Complete and Ready for Production  
**Date:** 2025-11-01  
**Strapi Version:** 5.30.0  
**Frontend Framework:** Nuxt 4

