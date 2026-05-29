# Review API - Permissions Configuration Reference

This document provides a quick visual reference for configuring permissions in Strapi Admin Panel.

## Quick Setup

**Location:** Settings → Users & Permissions Plugin → Roles

## Authenticated Role Permissions

Users who are logged in should have these permissions:

### Review Collection Type

| Permission | Enabled | Description |
|------------|---------|-------------|
| `create` | ✅ Yes | Allow authenticated users to create reviews |
| `find` | ✅ Yes | Allow authenticated users to view all reviews |
| `findOne` | ✅ Yes | Allow authenticated users to view single review |
| `update` | ✅ Yes | Allow authenticated users to update reviews* |
| `delete` | ✅ Yes | Allow authenticated users to delete reviews* |

_*Note: Ownership verification is enforced in the controller. Users can only update/delete their own reviews._

### Visual Configuration

```
┌─────────────────────────────────────────────────────┐
│ Settings → Users & Permissions → Roles             │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Role: Authenticated                                 │
│                                                      │
│ ┌─────────────────────────────────────────────────┐│
│ │ Review                                          ││
│ │ ┌────────────────────────────────────────────┐ ││
│ │ │ [✓] create                                 │ ││
│ │ │ [✓] delete                                 │ ││
│ │ │ [✓] find                                   │ ││
│ │ │ [✓] findOne                                │ ││
│ │ │ [✓] update                                 │ ││
│ │ └────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────┘│
│                                                      │
│                          [Save]                     │
└─────────────────────────────────────────────────────┘
```

## Public Role Permissions

Anonymous users (not logged in) should have these permissions:

### Review Collection Type

| Permission | Enabled | Description |
|------------|---------|-------------|
| `create` | ❌ No | Prevent anonymous users from creating reviews |
| `find` | ✅ Yes | Allow public to view all reviews |
| `findOne` | ✅ Yes | Allow public to view single review |
| `update` | ❌ No | Prevent anonymous users from updating reviews |
| `delete` | ❌ No | Prevent anonymous users from deleting reviews |

### Visual Configuration

```
┌─────────────────────────────────────────────────────┐
│ Settings → Users & Permissions → Roles             │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Role: Public                                        │
│                                                      │
│ ┌─────────────────────────────────────────────────┐│
│ │ Review                                          ││
│ │ ┌────────────────────────────────────────────┐ ││
│ │ │ [ ] create                                 │ ││
│ │ │ [ ] delete                                 │ ││
│ │ │ [✓] find                                   │ ││
│ │ │ [✓] findOne                                │ ││
│ │ │ [ ] update                                 │ ││
│ │ └────────────────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────┘│
│                                                      │
│                          [Save]                     │
└─────────────────────────────────────────────────────┘
```

## Step-by-Step Instructions

### Configure Authenticated Role

1. **Navigate to Roles**
   - Click **Settings** in the left sidebar
   - Click **Users & Permissions Plugin**
   - Click **Roles**

2. **Edit Authenticated Role**
   - Click on the **Authenticated** role

3. **Find Review Section**
   - Scroll down to find the **Review** section
   - It should be under "Permissions" → "Application"

4. **Enable Permissions**
   - Check the boxes for: `create`, `delete`, `find`, `findOne`, `update`
   - All 5 checkboxes should be checked

5. **Save Changes**
   - Click the **Save** button at the top right

### Configure Public Role

1. **Edit Public Role**
   - Go back to the Roles list
   - Click on the **Public** role

2. **Find Review Section**
   - Scroll down to find the **Review** section

3. **Enable Permissions**
   - Check ONLY: `find` and `findOne`
   - Leave unchecked: `create`, `delete`, `update`

4. **Save Changes**
   - Click the **Save** button at the top right

## Verification

### Test Authenticated Access

```bash
# 1. Login to get JWT token
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/auth/local \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "password": "password123"
  }'

# Save the JWT token from response

# 2. Try to create a review (should succeed)
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Test Review",
      "rating": 5,
      "reviewText": [{"type": "paragraph", "children": [{"type": "text", "text": "Great!"}]}],
      "business": 1
    }
  }'

# Expected: 201 Created
```

### Test Public Access

```bash
# 1. Try to view reviews (should succeed)
curl -X GET ${SERVER_URL:-http://localhost:1337}/api/reviews

# Expected: 200 OK with reviews data

# 2. Try to create a review without token (should fail)
curl -X POST ${SERVER_URL:-http://localhost:1337}/api/reviews \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Test Review",
      "rating": 5,
      "reviewText": [{"type": "paragraph", "children": [{"type": "text", "text": "Great!"}]}],
      "business": 1
    }
  }'

# Expected: 403 Forbidden or 401 Unauthorized
```

## Permission Matrix

| Action | Endpoint | Authenticated | Public |
|--------|----------|---------------|--------|
| Create review | `POST /api/reviews` | ✅ Allowed | ❌ Forbidden |
| View all reviews | `GET /api/reviews` | ✅ Allowed | ✅ Allowed |
| View single review | `GET /api/reviews/:id` | ✅ Allowed | ✅ Allowed |
| Update own review | `PUT /api/reviews/:id` | ✅ Allowed* | ❌ Forbidden |
| Update other's review | `PUT /api/reviews/:id` | ❌ Forbidden** | ❌ Forbidden |
| Delete own review | `DELETE /api/reviews/:id` | ✅ Allowed* | ❌ Forbidden |
| Delete other's review | `DELETE /api/reviews/:id` | ❌ Forbidden** | ❌ Forbidden |

_*Requires authentication and ownership verification (enforced in controller)_  
_**Even if authenticated, users cannot modify others' reviews_

## Security Features

### 1. Authentication Layer
- Strapi's built-in JWT authentication
- Token required for protected routes
- Token expiration handling

### 2. Authorization Layer
- Role-based permissions (Authenticated vs Public)
- Controller-level ownership verification
- Prevents users from modifying others' reviews

### 3. Validation Layer
- Input validation in controller
- Schema-level validation (rating 1-5, required fields)
- Lifecycle hooks for business logic validation

### 4. Database Layer
- Unique constraint on (user_id, business_id)
- Foreign key constraints
- Data integrity at database level

## Common Issues

### Issue: 403 Forbidden on Create

**Symptoms:**
```json
{
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "Forbidden"
  }
}
```

**Solutions:**
1. ✅ Check that `create` permission is enabled for Authenticated role
2. ✅ Verify JWT token is valid and included in Authorization header
3. ✅ Restart Strapi after changing permissions

### Issue: Can See All Reviews but Can't Create

**Cause:** Public role has `find` enabled but Authenticated role doesn't have `create` enabled

**Solution:** Enable `create` permission for Authenticated role

### Issue: Permissions Don't Take Effect

**Cause:** Strapi needs to be restarted after permission changes

**Solution:**
```bash
# Stop Strapi (Ctrl+C)
# Then restart
npm run develop
```

## Best Practices

1. **Always restart Strapi** after changing permissions
2. **Test permissions** with both authenticated and public access
3. **Use proper error handling** in frontend for 401/403 errors
4. **Implement token refresh** for long-lived sessions
5. **Log permission errors** for debugging
6. **Document custom permission logic** in code comments
7. **Use environment variables** for sensitive configuration

## Additional Security Considerations

### Rate Limiting
Consider implementing rate limiting to prevent abuse:
- Limit review creation to X per hour per user
- Limit API calls per IP address
- Use Strapi middleware for rate limiting

### Content Moderation
Consider implementing content moderation:
- Review flagging system
- Admin review approval workflow
- Automated content filtering
- Profanity detection

### CORS Configuration
Ensure CORS is properly configured in `config/middlewares.ts`:
```typescript
{
  name: 'strapi::cors',
  config: {
    origin: ['http://localhost:3000'], // Your frontend URL
    credentials: true,
  },
}
```

## Support

For more information:
- [Strapi Permissions Documentation](https://docs.strapi.io/user-docs/users-roles-permissions/configuring-end-users-roles)
- [Review API Documentation](src/api/review/README.md)
- [Review Setup Guide](REVIEW_SETUP_GUIDE.md)

---

**Last Updated:** 2025-11-01  
**Strapi Version:** v5.x  
**Applies To:** Review API

