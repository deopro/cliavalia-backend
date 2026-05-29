# Fix: 400 Bad Request Error on User Dashboard

## Issue
The user dashboard page (`/user/index.vue`) was throwing a `400 Bad Request` error when fetching reviews:

```
GET ${SERVER_URL:-http://localhost:1337}/api/reviews?filters[user][id][$eq]=11&populate=*&sort=createdAt:desc
[HTTP/1.1 400 Bad Request]
```

## Root Cause
The error was caused by three issues with the Strapi v5 query syntax:

1. **Wrong filter path**: `filters[user][id][$eq]` instead of `filters[users_permissions_user][id][$eq]`
   - The relation name in the Review schema is `users_permissions_user`, not `user`

2. **Invalid populate syntax**: `populate=*` is too broad and causes errors in Strapi v5
   - Wildcard population can fail with complex nested relations
   - Strapi v5 requires explicit nested population syntax

3. **Wrong sort syntax**: `sort=createdAt:desc` instead of `sort[0]=createdAt:desc`
   - Strapi v5 uses array-style parameters for sorting

## Solution

### Before (Incorrect)
```javascript
const response = await $apiFetch(
  `/api/reviews?filters[user][id][$eq]=${userId}&populate=*&sort=createdAt:desc`,
  { signal: controller.signal }
)
```

### After (Correct)
```javascript
const response = await $apiFetch('/api/reviews', {
  signal: controller.signal,
  params: {
    'filters[users_permissions_user][id][$eq]': userId,
    'populate[business][populate][0]': 'sector',
    'populate[business][populate][1]': 'category',
    'populate[users_permissions_user]': true,
    'sort[0]': 'createdAt:desc',
  }
})
```

## Key Changes

### 1. Correct Filter Path
```javascript
// ❌ Wrong
'filters[user][id][$eq]': userId

// ✅ Correct
'filters[users_permissions_user][id][$eq]': userId
```

### 2. Explicit Nested Population
```javascript
// ❌ Wrong - causes 400 error
populate: '*'

// ✅ Correct - explicit nested population
'populate[business][populate][0]': 'sector',
'populate[business][populate][1]': 'category',
'populate[users_permissions_user]': true,
```

This explicitly populates:
- The `business` relation
- Within `business`, populate `sector` and `category`
- The `users_permissions_user` relation

### 3. Array-style Sort
```javascript
// ❌ Wrong
sort: 'createdAt:desc'

// ✅ Correct
'sort[0]': 'createdAt:desc'
```

### 4. Correct Data Access
Also updated the code to access `review.business?.name` instead of `review.company?.name`:

```javascript
// ❌ Wrong
details: review.company?.name || review.company || 'Empresa'

// ✅ Correct
details: review.business?.name || 'Empresa'
```

## Files Modified

### `cliavalia-frontend/pages/user/index.vue`

**Lines 371-389**: Updated `fetchUserReviews` function
- Changed from URL query string to params object
- Fixed filter path to `users_permissions_user`
- Replaced `populate=*` with explicit nested population
- Updated sort syntax to array format

**Lines 319-356**: Updated `buildActivitiesFromReviews` function
- Changed `review.company?.name` to `review.business?.name`

## Strapi v5 Query Best Practices

### Filter Syntax
```javascript
// Single condition
'filters[fieldName][$eq]': value

// Nested relation
'filters[relationName][id][$eq]': id

// Multiple conditions
'filters[$and][0][field1][$eq]': value1
'filters[$and][1][field2][$eq]': value2
```

### Population Syntax
```javascript
// Simple relation
'populate[relationName]': true

// Nested relation (one level)
'populate[relationName][populate]': 'nestedField'

// Nested relation (multiple fields)
'populate[relationName][populate][0]': 'field1'
'populate[relationName][populate][1]': 'field2'

// Deep nesting
'populate[relation1][populate][relation2][populate]': 'field'
```

### Sort Syntax
```javascript
// Single sort
'sort[0]': 'field:asc'  // or 'field:desc'

// Multiple sorts
'sort[0]': 'field1:desc'
'sort[1]': 'field2:asc'
```

### Pagination Syntax
```javascript
'pagination[page]': 1
'pagination[pageSize]': 25
'pagination[withCount]': true
```

## Why This Works

1. **Correct Relation Name**: Matches the actual relation name in the Review schema
2. **Explicit Population**: Strapi v5 knows exactly what to populate, avoiding ambiguity
3. **Proper Syntax**: Uses the correct parameter format expected by Strapi v5
4. **Using params object**: Nuxt's `$apiFetch` properly encodes the params object

## Testing

To verify the fix works:

1. Navigate to `/user` (dashboard page)
2. Check browser console - no 400 errors
3. Statistics should load correctly (Total Reviews, Views, Helpful Votes)
4. Recent Activity should display user's reviews with business names
5. All data should match what's in the database

## Related Files

1. **`cliavalia-frontend/composables/useUserReviews.ts`**
   - Uses the same correct query syntax
   - Reference implementation for Strapi v5 queries

2. **`cliavalia-frontend/pages/user/my-reviews.vue`**
   - Uses the `useUserReviews` composable
   - Also works correctly with proper query syntax

## Lessons Learned

1. **Never use `populate=*` in Strapi v5** - always be explicit
2. **Check relation names** in the schema, don't assume
3. **Use params object** instead of query string for complex queries
4. **Array-style parameters** are required for sort, filters with operators
5. **Nested population** requires bracket notation with indices
6. **Consistency matters** - use the same approach across all API calls

## Prevention

To avoid similar issues in the future:

1. ✅ Always check the schema for correct relation names
2. ✅ Use explicit population syntax, never wildcards
3. ✅ Test API queries in Strapi's REST API documentation first
4. ✅ Use the `params` object for complex queries
5. ✅ Follow the working examples in `useUserReviews.ts`
6. ✅ Check browser console for query parameter errors

## Summary

The 400 Bad Request error was caused by incorrect Strapi v5 query syntax. The fix involved:
- Correcting the filter path to match the actual relation name
- Replacing `populate=*` with explicit nested population
- Using proper array-style sort syntax
- Updating data access to use the correct property names

The dashboard now successfully fetches and displays user reviews, statistics, and recent activity.

