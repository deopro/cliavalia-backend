# Review Feature Setup Guide

This guide will walk you through setting up the review feature in your CliAvalia Strapi v5 backend.

## Prerequisites

- Strapi v5 installed and running
- MySQL database configured
- Users & Permissions plugin installed (default in Strapi)
- Business collection type already created

## Step-by-Step Setup

### Step 1: Database Migration

The unique constraint prevents users from creating multiple reviews for the same business.

#### Option A: Using MySQL Command Line

```bash
# Connect to MySQL
mysql -u your_username -p

# Select your database
USE your_database_name;

# Run the migration
source database/migrations/001_add_unique_constraint_reviews.sql;
```

#### Option B: Manual SQL Execution

```sql
-- Connect to your MySQL database and run:

ALTER TABLE reviews
ADD CONSTRAINT unique_user_business_review 
UNIQUE (users_permissions_user_id, business_id);
```

#### Option C: Using Docker (if using docker-compose)

```bash
# Copy migration file to container
docker cp database/migrations/001_add_unique_constraint_reviews.sql cliavalia-mysql:/tmp/

# Execute migration
docker exec -i cliavalia-mysql mysql -uroot -p"your_password" your_database_name < /tmp/001_add_unique_constraint_reviews.sql
```

### Step 2: Verify Files Are Created

Ensure these files exist in your project:

```
src/api/review/
├── content-types/
│   └── review/
│       ├── schema.json (already exists)
│       └── lifecycles.ts (new)
├── controllers/
│   └── review.ts (new)
├── routes/
│   └── review.ts (new)
├── services/
│   └── review.ts (new)
├── validators/
│   └── review.ts (new)
└── README.md (new)
```

### Step 3: Configure Permissions in Strapi Admin

1. **Start Strapi** (if not already running):
   ```bash
   npm run develop
   ```

2. **Open Strapi Admin Panel:**
   - Navigate to `${SERVER_URL:-http://localhost:1337}/admin`
   - Log in with your admin credentials

3. **Configure Authenticated Role:**
   - Go to: **Settings** (left sidebar) → **Users & Permissions Plugin** → **Roles**
   - Click on **Authenticated** role
   - Scroll to **Review** section
   - Enable these permissions:
     - ✅ `create` - Allow users to create reviews
     - ✅ `find` - Allow users to view all reviews
     - ✅ `findOne` - Allow users to view single review
     - ✅ `update` - Allow users to update reviews (ownership is verified in controller)
     - ✅ `delete` - Allow users to delete reviews (ownership is verified in controller)
   - Click **Save** button (top right)

4. **Configure Public Role:**
   - Go back to **Roles** page
   - Click on **Public** role
   - Scroll to **Review** section
   - Enable these permissions:
     - ✅ `find` - Allow public to view all reviews
     - ✅ `findOne` - Allow public to view single review
     - ❌ `create` - Keep disabled
     - ❌ `update` - Keep disabled
     - ❌ `delete` - Keep disabled
   - Click **Save** button (top right)

### Step 4: Restart Strapi

After making changes, restart your Strapi server:

```bash
# Stop the server (Ctrl+C)
# Then restart
npm run develop

# Or for production
npm run start
```

### Step 5: Test the API

#### Test 1: Create a Review (Requires Authentication)

First, get a JWT token by logging in:

```bash
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "password": "your_password"
  }'
```

Then create a review using the token:

```bash
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Great service!",
      "rating": 5,
      "reviewText": [
        {
          "type": "paragraph",
          "children": [
            {
              "type": "text",
              "text": "This business provided excellent service."
            }
          ]
        }
      ],
      "business": 1
    }
  }'
```

**Expected Response:** `201 Created` with review data

#### Test 2: Try Creating Duplicate Review

Run the same request again with the same token and business ID.

**Expected Response:** `400 Bad Request` with message "You have already reviewed this business."

#### Test 3: Get All Reviews (No Authentication Required)

```bash
curl -X GET ${SERVER_URL:-http://localhost:1337}/api/reviews?populate=*
```

**Expected Response:** `200 OK` with array of reviews

#### Test 4: Get Reviews for Specific Business

```bash
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews?filters[business][id][\$eq]=1&populate=*"
```

**Expected Response:** `200 OK` with filtered reviews

## Verification Checklist

Use this checklist to ensure everything is set up correctly:

- [ ] Database migration executed successfully
- [ ] Unique constraint exists on `reviews` table
- [ ] All TypeScript files are in correct directories
- [ ] No TypeScript compilation errors
- [ ] Strapi server starts without errors
- [ ] Authenticated role has correct permissions
- [ ] Public role has correct permissions
- [ ] Can create review when authenticated
- [ ] Cannot create duplicate review for same business
- [ ] Can view reviews without authentication
- [ ] Cannot create review without authentication
- [ ] Can update own review
- [ ] Cannot update other user's review
- [ ] Can delete own review
- [ ] Cannot delete other user's review

## Common Issues and Solutions

### Issue 1: "Constraint already exists" error during migration

**Solution:** The constraint has already been added. You can verify with:
```sql
SHOW CREATE TABLE reviews;
```

### Issue 2: TypeScript compilation errors

**Solution:** Ensure you have the correct Strapi v5 dependencies:
```bash
npm install @strapi/strapi @strapi/utils
```

### Issue 3: "Review not found" when trying to update/delete

**Solution:** Ensure the review ID exists and the user owns the review. Check with:
```bash
curl -X GET ${SERVER_URL:-http://localhost:1337}/api/reviews/:id \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Issue 4: Cannot create review - 403 Forbidden

**Solution:** Check that:
1. You're using a valid JWT token
2. The Authenticated role has `create` permission enabled
3. The token hasn't expired

### Issue 5: Duplicate reviews still being created

**Solution:** This shouldn't happen if all layers are working. Check:
1. Database constraint exists: `SHOW CREATE TABLE reviews;`
2. Lifecycle hook file exists and has no syntax errors
3. Controller validation is working
4. Strapi server was restarted after adding files

## Integration with Frontend

### Update Business Form Submission

In your `write-review.vue` component, update the `handleSubmit` function:

```typescript
const handleSubmit = async () => {
  if (!canSubmitQuick.value) {
    alert('Por favor, preencha todos os campos obrigatórios.');
    return;
  }

  isSubmitting.value = true;

  try {
    const config = useRuntimeConfig();
    const token = localStorage.getItem('jwt'); // Or use your auth store

    // Convert plain text content to Strapi blocks format
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

    const response = await $fetch(`${config.public.apiBase}/api/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        data: {
          title: form.value.title,
          rating: form.value.rating,
          reviewText: reviewText,
          business: form.value.businessId
        }
      }
    });

    // Success
    alert('Avaliação enviada com sucesso! Obrigado por partilhar a sua experiência.');
    resetForm();
    navigateTo('/user/dashboard'); // Redirect to user dashboard

  } catch (error: any) {
    console.error('Error submitting review:', error);
    
    // Handle specific error cases
    if (error.response?.status === 400) {
      const message = error.response._data?.error?.message || error.message;
      
      if (message.includes('already reviewed')) {
        alert('Você já avaliou esta empresa. Por favor, edite sua avaliação existente.');
      } else {
        alert(message);
      }
    } else if (error.response?.status === 401) {
      alert('Você precisa estar autenticado para criar uma avaliação.');
      navigateTo('/login');
    } else {
      alert('Erro ao enviar avaliação. Tente novamente.');
    }
  } finally {
    isSubmitting.value = false;
  }
};
```

### Create Review Composable

Create a composable for better organization:

```typescript
// composables/useReviews.ts
export const useReviews = () => {
  const config = useRuntimeConfig();
  const { getToken } = useAuth(); // Your auth composable

  const createReview = async (data: {
    title: string;
    rating: number;
    content: string;
    businessId: number;
  }) => {
    const token = getToken();
    
    if (!token) {
      throw new Error('Authentication required');
    }

    // Convert plain text to Strapi blocks format
    const reviewText = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: data.content
          }
        ]
      }
    ];

    const response = await $fetch(`${config.public.apiBase}/api/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: {
        data: {
          title: data.title,
          rating: data.rating,
          reviewText: reviewText,
          business: data.businessId
        }
      }
    });

    return response.data;
  };

  const getReviewsByBusiness = async (businessId: number) => {
    const response = await $fetch(
      `${config.public.apiBase}/api/reviews?filters[business][id][$eq]=${businessId}&populate=*`
    );
    return response.data;
  };

  const getUserReviews = async () => {
    const token = getToken();
    
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await $fetch(`${config.public.apiBase}/api/reviews?populate=*`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    return response.data;
  };

  const updateReview = async (reviewId: number, data: Partial<{
    title: string;
    rating: number;
    content: string;
  }>) => {
    const token = getToken();
    
    if (!token) {
      throw new Error('Authentication required');
    }

    const body: any = {
      data: {}
    };

    if (data.title) body.data.title = data.title;
    if (data.rating) body.data.rating = data.rating;
    if (data.content) {
      body.data.reviewText = [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: data.content
            }
          ]
        }
      ];
    }

    const response = await $fetch(`${config.public.apiBase}/api/reviews/${reviewId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body
    });

    return response.data;
  };

  const deleteReview = async (reviewId: number) => {
    const token = getToken();
    
    if (!token) {
      throw new Error('Authentication required');
    }

    await $fetch(`${config.public.apiBase}/api/reviews/${reviewId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
  };

  return {
    createReview,
    getReviewsByBusiness,
    getUserReviews,
    updateReview,
    deleteReview
  };
};
```

## Next Steps

After completing this setup:

1. **Test Thoroughly:** Test all CRUD operations
2. **Update Frontend:** Integrate the API with your Vue components
3. **Add Error Handling:** Implement proper error handling in frontend
4. **Add Loading States:** Show loading indicators during API calls
5. **Add Success Messages:** Show success feedback to users
6. **Implement Review Editing:** Allow users to edit their existing reviews
7. **Add Review Statistics:** Display average ratings and review counts on business pages

## Additional Features to Consider

- **Review Moderation:** Add admin approval workflow
- **Review Reporting:** Allow users to report inappropriate reviews
- **Review Replies:** Allow business owners to reply to reviews
- **Review Voting:** Allow users to upvote/downvote reviews
- **Review Photos:** Support image uploads with reviews (already in schema)
- **Review Sorting:** Sort by date, rating, helpfulness, etc.

## Support

For issues or questions:
1. Check the [Review API Documentation](src/api/review/README.md)
2. Review Strapi v5 documentation: https://docs.strapi.io/
3. Check the backend logs for detailed error messages

## Summary

You now have a fully functional review system with:
- ✅ User authentication
- ✅ One review per user per business constraint
- ✅ CRUD operations
- ✅ Ownership verification
- ✅ Input validation
- ✅ Public read access
- ✅ Comprehensive error handling
- ✅ Service methods for additional functionality

Happy coding! 🚀

