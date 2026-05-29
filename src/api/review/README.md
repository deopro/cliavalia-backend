# Review API Documentation

## Overview

The Review API allows authenticated users to create, read, update, and delete reviews for businesses. Each user can only create one review per business.

## Features

- ✅ Authenticated users can create reviews
- ✅ Public access to read reviews
- ✅ Users can only update/delete their own reviews
- ✅ One review per user per business (enforced at database, lifecycle, and controller levels)
- ✅ Rating validation (1-5 stars)
- ✅ Comprehensive review statistics

## Table Structure

```sql
CREATE TABLE reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  reviewText JSON NOT NULL,
  users_permissions_user_id INT NOT NULL,
  business_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_business_review UNIQUE (users_permissions_user_id, business_id),
  FOREIGN KEY (users_permissions_user_id) REFERENCES up_users(id),
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);
```

## Setup Instructions

### 1. Database Migration

Run the database migration to add the unique constraint:

```bash
# Connect to your MySQL database
mysql -u your_username -p your_database_name

# Run the migration file
source database/migrations/001_add_unique_constraint_reviews.sql
```

Or execute the SQL directly:

```sql
ALTER TABLE reviews
ADD CONSTRAINT unique_user_business_review 
UNIQUE (users_permissions_user_id, business_id);
```

### 2. Permissions Configuration

Configure permissions in Strapi Admin Panel:

**Path:** Settings → Users & Permissions Plugin → Roles

#### For **Authenticated** Role:
- ✅ `review.create` - Allow authenticated users to create reviews
- ✅ `review.find` - Allow authenticated users to view all reviews
- ✅ `review.findOne` - Allow authenticated users to view individual reviews
- ✅ `review.update` - Allow authenticated users to update reviews (ownership checked in controller)
- ✅ `review.delete` - Allow authenticated users to delete reviews (ownership checked in controller)

#### For **Public** Role:
- ✅ `review.find` - Allow public to view all reviews
- ✅ `review.findOne` - Allow public to view individual reviews
- ❌ `review.create` - Disable
- ❌ `review.update` - Disable
- ❌ `review.delete` - Disable

### 3. Restart Strapi

After making changes, restart your Strapi application:

```bash
npm run develop
# or
npm run start
```

## API Endpoints

### Create a Review

**POST** `/api/reviews`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "data": {
    "title": "Great service!",
    "rating": 5,
    "reviewText": [
      {
        "type": "paragraph",
        "children": [
          {
            "type": "text",
            "text": "This business provided excellent service. Highly recommend!"
          }
        ]
      }
    ],
    "business": 1
  }
}
```

**Response (201 Created):**
```json
{
  "data": {
    "id": 1,
    "title": "Great service!",
    "rating": 5,
    "reviewText": [...],
    "business": {
      "id": 1,
      "name": "Example Business",
      "logoUrl": "https://..."
    },
    "users_permissions_user": {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com"
    },
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-01T10:00:00.000Z"
  }
}
```

**Error Responses:**

- **401 Unauthorized:** User not logged in
  ```json
  {
    "error": {
      "status": 401,
      "message": "You must be logged in to create a review."
    }
  }
  ```

- **400 Bad Request:** Missing required fields
  ```json
  {
    "error": {
      "status": 400,
      "message": "Title, rating, and business are required."
    }
  }
  ```

- **400 Bad Request:** Invalid rating
  ```json
  {
    "error": {
      "status": 400,
      "message": "Rating must be between 1 and 5."
    }
  }
  ```

- **400 Bad Request:** Duplicate review
  ```json
  {
    "error": {
      "status": 400,
      "message": "You have already reviewed this business."
    }
  }
  ```

### Get All Reviews

**GET** `/api/reviews`

**Authentication:** Optional

**Query Parameters:**
- `filters[business][id][$eq]=1` - Filter by business ID
- `filters[users_permissions_user][id][$eq]=1` - Filter by user ID
- `pagination[page]=1` - Page number
- `pagination[pageSize]=10` - Items per page
- `sort=createdAt:desc` - Sort order

**Example:** Get all reviews for business with ID 1
```
GET /api/reviews?filters[business][id][$eq]=1&populate=*
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Great service!",
      "rating": 5,
      "reviewText": [...],
      "createdAt": "2025-11-01T10:00:00.000Z",
      "updatedAt": "2025-11-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "pageCount": 1,
      "total": 1
    }
  }
}
```

### Get Single Review

**GET** `/api/reviews/:id`

**Authentication:** Optional

**Response (200 OK):**
```json
{
  "data": {
    "id": 1,
    "title": "Great service!",
    "rating": 5,
    "reviewText": [...],
    "business": {
      "id": 1,
      "name": "Example Business",
      "logoUrl": "https://..."
    },
    "users_permissions_user": {
      "id": 1,
      "username": "john_doe"
    },
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-01T10:00:00.000Z"
  }
}
```

### Update a Review

**PUT** `/api/reviews/:id`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "data": {
    "title": "Updated title",
    "rating": 4,
    "reviewText": [...]
  }
}
```

**Response (200 OK):**
```json
{
  "data": {
    "id": 1,
    "title": "Updated title",
    "rating": 4,
    "reviewText": [...],
    ...
  }
}
```

**Error Responses:**

- **401 Unauthorized:** User not logged in
- **404 Not Found:** Review doesn't exist
- **403 Forbidden:** User doesn't own the review

### Delete a Review

**DELETE** `/api/reviews/:id`

**Authentication:** Required (Bearer token)

**Response (200 OK):**
```json
{
  "data": {
    "id": 1
  }
}
```

**Error Responses:**

- **401 Unauthorized:** User not logged in
- **404 Not Found:** Review doesn't exist
- **403 Forbidden:** User doesn't own the review

## Service Methods

The review service provides additional utility methods:

### hasUserReviewedBusiness
Check if a user has already reviewed a business.

```typescript
const hasReviewed = await strapi.service('api::review.review')
  .hasUserReviewedBusiness(userId, businessId);
```

### getReviewsByBusiness
Get all reviews for a specific business.

```typescript
const reviews = await strapi.service('api::review.review')
  .getReviewsByBusiness(businessId, { limit: 10 });
```

### getReviewsByUser
Get all reviews by a specific user.

```typescript
const reviews = await strapi.service('api::review.review')
  .getReviewsByUser(userId);
```

### getAverageRatingForBusiness
Calculate the average rating for a business.

```typescript
const avgRating = await strapi.service('api::review.review')
  .getAverageRatingForBusiness(businessId);
// Returns: 4.5
```

### getReviewStatsForBusiness
Get comprehensive review statistics for a business.

```typescript
const stats = await strapi.service('api::review.review')
  .getReviewStatsForBusiness(businessId);

// Returns:
// {
//   totalReviews: 10,
//   averageRating: 4.3,
//   ratingDistribution: {
//     1: 0,
//     2: 1,
//     3: 2,
//     4: 3,
//     5: 4
//   }
// }
```

### isReviewOwner
Check if a user owns a specific review.

```typescript
const isOwner = await strapi.service('api::review.review')
  .isReviewOwner(reviewId, userId);
```

## Frontend Integration

### Example: Create Review (Vue 3 + Nuxt)

```typescript
// composables/useReview.ts
export const useReview = () => {
  const config = useRuntimeConfig();
  const { getToken } = useAuth();

  const createReview = async (reviewData: {
    title: string;
    rating: number;
    reviewText: any;
    business: number;
  }) => {
    const token = getToken();
    
    const response = await $fetch(`${config.public.apiBase}/api/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        data: reviewData
      }
    });

    return response.data;
  };

  return {
    createReview
  };
};
```

### Example: Frontend Form Submission

```typescript
// In your Vue component (from write-review.vue)
const handleSubmit = async () => {
  if (!canSubmitQuick.value) {
    return;
  }

  isSubmitting.value = true;

  try {
    const { createReview } = useReview();
    
    // Convert content to Strapi blocks format
    const reviewText = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: form.value.content
          }
        ]
      }
    ];

    const reviewData = {
      title: form.value.title,
      rating: form.value.rating,
      reviewText: reviewText,
      business: form.value.businessId
    };

    const review = await createReview(reviewData);
    
    // Show success message
    alert('Avaliação enviada com sucesso!');
    
    // Reset form
    resetForm();
    
  } catch (error) {
    console.error('Error submitting review:', error);
    
    // Handle specific error cases
    if (error.response?.status === 400) {
      if (error.response.data.message.includes('already reviewed')) {
        alert('Você já avaliou esta empresa anteriormente.');
      } else {
        alert(error.response.data.message);
      }
    } else {
      alert('Erro ao enviar avaliação. Tente novamente.');
    }
  } finally {
    isSubmitting.value = false;
  }
};
```

## Testing

### Manual Testing with cURL

#### 1. Create a Review (Authenticated)

```bash
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Excellent service!",
      "rating": 5,
      "reviewText": [
        {
          "type": "paragraph",
          "children": [
            {
              "type": "text",
              "text": "I had a great experience with this business."
            }
          ]
        }
      ],
      "business": 1
    }
  }'
```

#### 2. Get All Reviews (Public)

```bash
curl -X GET ${SERVER_URL:-http://localhost:1337}/api/reviews?populate=*
```

#### 3. Get Reviews for a Specific Business

```bash
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews?filters[business][id][\$eq]=1&populate=*"
```

#### 4. Update a Review (Authenticated)

```bash
curl -X PUT ${SERVER_URL:-http://localhost:1337}/api/reviews/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Updated review title",
      "rating": 4
    }
  }'
```

#### 5. Delete a Review (Authenticated)

```bash
curl -X DELETE ${SERVER_URL:-http://localhost:1337}/api/reviews/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Security Considerations

1. **Authentication Required:** Users must be authenticated to create, update, or delete reviews
2. **Ownership Verification:** Users can only update/delete their own reviews
3. **Duplicate Prevention:** Multiple layers prevent duplicate reviews:
   - Controller validation
   - Lifecycle hook validation
   - Database unique constraint
4. **Rating Validation:** Rating must be between 1 and 5 (enforced at schema, controller, and lifecycle levels)
5. **Input Sanitization:** All inputs are validated before processing

## Troubleshooting

### Issue: "You have already reviewed this business"

**Cause:** User is trying to create a second review for the same business.

**Solution:** Update the existing review instead of creating a new one.

### Issue: Migration fails with "Duplicate entry"

**Cause:** There are existing duplicate reviews in the database.

**Solution:** The migration includes cleanup logic to remove duplicates. If it still fails, manually check for and remove duplicate reviews:

```sql
-- Find duplicate reviews
SELECT users_permissions_user_id, business_id, COUNT(*) as count
FROM reviews
GROUP BY users_permissions_user_id, business_id
HAVING COUNT(*) > 1;

-- Delete duplicates (keeping the oldest)
-- See migration file for cleanup query
```

### Issue: 401 Unauthorized

**Cause:** JWT token is missing, invalid, or expired.

**Solution:** Ensure the Authorization header includes a valid Bearer token.

## Contributing

When making changes to the review API:

1. Update the schema if adding new fields
2. Update controllers/services as needed
3. Update this documentation
4. Test all endpoints thoroughly
5. Update frontend integration code if API changes

## License

This API is part of the CliAvalia project.

