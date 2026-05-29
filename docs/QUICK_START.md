# Review API - Quick Start Guide

**For experienced developers who want to get up and running fast.**

---

## 🚀 30-Second Setup

### 1. Run Database Migration

```bash
mysql -u root -p your_database < database/migrations/001_add_unique_constraint_reviews.sql
```

### 2. Configure Permissions

**Strapi Admin → Settings → Users & Permissions → Roles:**

- **Authenticated:** Enable all 5 review permissions (`create`, `find`, `findOne`, `update`, `delete`)
- **Public:** Enable only 2 permissions (`find`, `findOne`)

### 3. Restart Strapi

```bash
npm run develop
```

### 4. Test

```bash
# Get JWT token
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@example.com", "password": "password"}'

# Create review
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Great service!",
      "rating": 5,
      "reviewText": [{"type": "paragraph", "children": [{"type": "text", "text": "Excellent!"}]}],
      "business": 1
    }
  }'
```

---

## 📋 What You Got

### API Endpoints

```
POST   /api/reviews          - Create review (auth required)
GET    /api/reviews          - List reviews (public)
GET    /api/reviews/:id      - Get review (public)
PUT    /api/reviews/:id      - Update review (auth + owner)
DELETE /api/reviews/:id      - Delete review (auth + owner)
```

### Key Features

- ✅ One review per user per business
- ✅ Rating validation (1-5)
- ✅ Ownership verification
- ✅ Multi-layer duplicate prevention
- ✅ Comprehensive error handling

### Files Created

```
src/api/review/
├── controllers/review.ts       - CRUD logic
├── routes/review.ts            - Route config
├── services/review.ts          - Business logic
├── content-types/review/
│   └── lifecycles.ts           - Hooks
├── validators/review.ts        - Validation
├── types/review.d.ts           - TypeScript types
└── utils/helpers.ts            - Utilities
```

---

## 🎨 Frontend Integration

### Vue/Nuxt Composable

```typescript
// composables/useReviews.ts
export const useReviews = () => {
  const config = useRuntimeConfig();
  const { getToken } = useAuth();

  const createReview = async (data: {
    title: string;
    rating: number;
    content: string;
    businessId: number;
  }) => {
    return await $fetch(`${config.public.apiBase}/api/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: {
        data: {
          title: data.title,
          rating: data.rating,
          reviewText: [{
            type: 'paragraph',
            children: [{ type: 'text', text: data.content }]
          }],
          business: data.businessId
        }
      }
    });
  };

  return { createReview };
};
```

### Usage in Component

```typescript
const { createReview } = useReviews();

const handleSubmit = async () => {
  try {
    await createReview({
      title: form.value.title,
      rating: form.value.rating,
      content: form.value.content,
      businessId: form.value.businessId
    });
    alert('Review created!');
  } catch (error) {
    if (error.response?.data?.error?.message.includes('already reviewed')) {
      alert('You already reviewed this business.');
    } else {
      alert('Error creating review.');
    }
  }
};
```

---

## 🔍 Service Methods

```typescript
// In your Strapi code
const reviewService = strapi.service('api::review.review');

// Check if user reviewed business
const hasReviewed = await reviewService.hasUserReviewedBusiness(userId, businessId);

// Get business stats
const stats = await reviewService.getReviewStatsForBusiness(businessId);
// Returns: { totalReviews, averageRating, ratingDistribution }

// Get average rating
const avgRating = await reviewService.getAverageRatingForBusiness(businessId);
```

---

## 🐛 Common Issues

### "You have already reviewed this business"
**Cause:** User trying to create duplicate review  
**Fix:** This is expected behavior. Update existing review instead.

### 403 Forbidden on Create
**Cause:** Permissions not configured  
**Fix:** Enable `create` for Authenticated role, restart Strapi

### Constraint already exists error
**Cause:** Migration already run  
**Fix:** This is fine, constraint exists

---

## 📚 Full Documentation

For detailed information:
- **Complete Setup:** See `REVIEW_SETUP_GUIDE.md`
- **Permissions Config:** See `PERMISSIONS_SETUP.md`
- **API Reference:** See `src/api/review/README.md`
- **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md`

---

**That's it! You're ready to go.** 🎉

