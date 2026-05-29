# Fix 401 Unauthorized for Custom Routes

## Problem

Custom route `/api/reviews/me` returns **401 Unauthorized** even with valid JWT token.

**Root Cause:** Strapi v5 requires explicit configuration for custom routes to work with the built-in authentication system.

---

## ✅ Solution: Use Strapi's Entity Service Instead

Instead of fighting with custom route permissions, let's modify the frontend to use Strapi's standard REST API with proper filters.

### Option 1: Query with User Filter (Recommended)

**Frontend Change:**

Update `composables/useUserReviews.ts`:

```typescript
const fetchUserReviews = async (): Promise<boolean> => {
  loading.value = true
  error.value = null

  try {
    const { $apiFetch } = useNuxtApp() as any
    
    // Get current user first
    const userResponse = await $apiFetch('/api/users/me')
    const userId = userResponse.id
    
    // Fetch reviews with user filter using standard Strapi REST API
    const response = await $apiFetch('/api/reviews', {
      params: {
        'filters[users_permissions_user][id][$eq]': userId,
        'populate[business][populate][0]': 'sector',
        'populate[business][populate][1]': 'category',
        'sort[0]': 'createdAt:desc',
      }
    })

    // Process and format reviews...
    // (conversion logic stays the same)
    
    return true
  } catch (err) {
    // error handling...
  }
}
```

**No backend changes needed!** This uses the existing `find` endpoint with filters.

### Option 2: Keep Custom Route (Complex)

If you want to keep the custom route, you need to:

1. **Create a custom policy:**

```typescript
// src/api/review/policies/is-authenticated.ts
export default (policyContext, config, { strapi }) => {
  if (policyContext.state.user) {
    return true;
  }
  return false;
};
```

2. **Update route to use policy:**

```typescript
{
  method: 'GET',
  path: '/reviews/me',
  handler: 'review.me',
  config: {
    policies: ['is-authenticated'],
    middlewares: [],
  },
}
```

3. **Register in Strapi Admin:**
   - Go to Settings → Users & Permissions → Roles
   - You won't see custom routes listed
   - Need to manually test

---

## 🚀 Recommended Implementation

Use **Option 1** - it's simpler, uses standard Strapi APIs, and doesn't require permission configuration.

### Step-by-Step

1. **Update the composable:**

```bash
cd cliavalia-frontend
```

Edit `composables/useUserReviews.ts`:

```typescript
export const useUserReviews = () => {
  const reviews = ref<UserReview[]>([])
  const statistics = ref<ReviewStatistics>({
    totalReviews: 0,
    totalViews: 0,
    totalHelpful: 0,
  })
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchUserReviews = async (): Promise<boolean> => {
    loading.value = true
    error.value = null

    try {
      const { $apiFetch } = useNuxtApp() as any
      
      // Get current user
      const userResponse = await $apiFetch('/api/users/me')
      if (!userResponse || !userResponse.id) {
        error.value = 'Erro ao obter informações do utilizador'
        return false
      }
      
      // Fetch reviews using standard Strapi REST API with filters
      const response = await $apiFetch('/api/reviews', {
        params: {
          'filters[users_permissions_user][id][$eq]': userResponse.id,
          'populate[business][populate][0]': 'sector',
          'populate[business][populate][1]': 'category',
          'populate[users_permissions_user]': true,
          'sort[0]': 'createdAt:desc',
        }
      })

      if (response.data) {
        // Convert Strapi blocks to plain text
        reviews.value = response.data.map((review: any) => {
          let content = ''
          if (review.reviewText && Array.isArray(review.reviewText)) {
            content = review.reviewText
              .map((block: any) => {
                if (block.type === 'paragraph' && block.children) {
                  return block.children
                    .map((child: any) => child.text || '')
                    .join('')
                }
                return ''
              })
              .join(' ')
              .trim()
          }

          return {
            id: review.id,
            documentId: review.documentId,
            title: review.title,
            content: content || 'Sem conteúdo',
            rating: review.rating,
            company: review.business?.name || 'Empresa não especificada',
            companyId: review.business?.id,
            industry: review.business?.sector?.name || review.business?.category?.name || 'Indústria não especificada',
            createdAt: review.createdAt,
            updatedAt: review.updatedAt,
            views: review.views || 0,
            helpfulVotes: review.helpfulVotes || 0,
          }
        })

        // Calculate statistics
        statistics.value = {
          totalReviews: reviews.value.length,
          totalViews: reviews.value.reduce((sum, r) => sum + r.views, 0),
          totalHelpful: reviews.value.reduce((sum, r) => sum + r.helpfulVotes, 0),
        }
        
        return true
      } else {
        reviews.value = []
        statistics.value = {
          totalReviews: 0,
          totalViews: 0,
          totalHelpful: 0,
        }
        return true
      }
    } catch (err: any) {
      console.error('Error fetching user reviews:', err)

      if (err?.response?.status === 401 || err?.status === 401) {
        error.value = 'Sessão expirada. Por favor, faz login novamente.'
      } else if (err?.response?.status === 403 || err?.status === 403) {
        error.value = 'Não tens permissão para aceder a estes dados.'
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        error.value = 'Erro do servidor. Tenta novamente mais tarde.'
      } else {
        error.value = 'Erro ao carregar avaliações. Tenta novamente.'
      }

      reviews.value = []
      statistics.value = {
        totalReviews: 0,
        totalViews: 0,
        totalHelpful: 0,
      }
      return false
    } finally {
      loading.value = false
    }
  }

  // ... rest of the composable stays the same
}
```

2. **Enable permissions in Strapi Admin:**

```
Settings → Users & Permissions → Roles → Authenticated

Review:
✅ find
✅ findOne
✅ create
✅ update
✅ delete

Save and restart Strapi
```

3. **Test:**

```bash
# In browser console:
localStorage.getItem('jwt')

# Test standard API
curl -X GET "${SERVER_URL:-http://localhost:1337}/api/reviews?filters[users_permissions_user][id][$eq]=YOUR_USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Why This Solution is Better

### ✅ Advantages
- Uses standard Strapi REST API
- Permissions work out of the box
- No custom route configuration needed
- Better compatibility with Strapi v5
- Easier to debug
- Follows Strapi best practices

### ❌ Disadvantages of Custom Routes
- Require complex permission setup
- Not visible in Strapi Admin permissions
- Authentication middleware issues
- More maintenance

---

## Migration Steps

1. Keep `src/api/review/routes/custom-review.ts` for `/view` and `/helpful` endpoints
2. Remove the `/reviews/me` route (or keep it disabled)
3. Update frontend to use standard `/api/reviews` with filters
4. Enable Review permissions in Strapi Admin
5. Test and verify

---

## Testing

After implementing Option 1:

```bash
# 1. Get user ID
curl ${SERVER_URL:-http://localhost:1337}/api/users/me \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Get user's reviews
curl "${SERVER_URL:-http://localhost:1337}/api/reviews?filters[users_permissions_user][id][\$eq]=USER_ID&populate=*" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return 200 OK with reviews
```

---

## Summary

**Current Issue:** 401 on `/api/reviews/me`  
**Root Cause:** Custom routes don't inherit standard auth in Strapi v5  
**Best Solution:** Use standard `/api/reviews` with user ID filter  
**Status:** Simpler, works out of the box, follows Strapi conventions

---

**Recommendation:** Implement Option 1 (use standard API with filters)

