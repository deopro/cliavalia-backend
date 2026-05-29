# Review View Throttle Implementation

## Overview

This document describes the implementation of a 24-hour unique view count throttle for authenticated users on the `review` content type in Strapi 5.

## Implementation Summary

### 1. New Model: `review-view-log`

**Location:** `src/api/review-view-log/content-types/review-view-log/schema.json`

A new collection type has been created to track when authenticated users view reviews. This model includes:

- **`review`** (oneWay relation): Links to the `review` content type
- **`viewer`** (oneToOne relation): Links to `plugin::users-permissions.user`
- **`viewedAt`** (DateTime): Timestamp of the view (indexed for fast lookups)

### 2. Service Method: `incrementUniqueViews`

**Location:** `src/api/review/services/review.ts`

A new asynchronous method `incrementUniqueViews(reviewId: number, userId: number)` has been added to the review service.

**Logic:**
1. Calculates the 24-hour threshold (current time minus 24 hours)
2. Queries `ReviewViewLog` for an existing record where:
   - `review.id` equals `reviewId`
   - `viewer.id` equals `userId`
   - `viewedAt` is greater than the 24-hour threshold
3. **If log found:** Returns immediately without incrementing (throttled)
4. **If log not found:**
   - Increments the `views` field in the review table
   - Creates a new `ReviewViewLog` entry with current timestamp

### 3. Controller Method: `incrementView`

**Location:** `src/api/review/controllers/review.ts`

The existing `incrementView` method has been updated to:

1. Extract `reviewId` from URL parameters
2. Get authenticated `userId` from `ctx.state.user` (with manual JWT verification for public routes)
3. **For authenticated users:** Call `incrementUniqueViews` service method (24-hour throttle applies)
4. **For anonymous users:** Increment view count directly (no throttle, maintains backward compatibility)

### 4. Custom Route

**Location:** `src/api/review/routes/custom-review.ts`

The route `POST /api/reviews/:id/view` already exists and is configured as:
- **Public endpoint** (`auth: false`)
- Handler: `review.incrementView`
- Supports both authenticated and anonymous users

## How It Works

### For Authenticated Users

1. User makes a request to `POST /api/reviews/:id/view` with JWT token
2. Controller extracts user ID from JWT token
3. Service checks if user viewed this review in the last 24 hours
4. If **not viewed recently:**
   - View count is incremented
   - New log entry is created
   - Returns updated view count
5. If **viewed recently:**
   - Returns current view count without incrementing
   - Logs debug message

### For Anonymous Users

1. User makes a request to `POST /api/reviews/:id/view` without authentication
2. View count is incremented directly (no throttle)
3. Returns updated view count

## Database Schema

After restarting Strapi, the following table will be created:

```sql
CREATE TABLE review_view_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  review_id INT NOT NULL,
  viewer_id INT NOT NULL,
  viewed_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_id) REFERENCES up_users(id) ON DELETE CASCADE,
  INDEX idx_viewed_at (viewed_at),
  INDEX idx_review_viewer (review_id, viewer_id)
);
```

## Setup Instructions

### 1. Restart Strapi

After adding the new model, restart Strapi to create the database table:

```bash
# If using Docker
docker-compose restart strapi

# If running locally
npm run develop
```

### 2. Verify Model Creation

1. Open Strapi Admin: `${SERVER_URL:-http://localhost:1337}/admin`
2. Go to **Content-Type Builder**
3. Verify `Review View Log` appears in the list
4. Check that all fields are correctly configured

### 3. Test the Implementation

#### Test Authenticated User View Throttle

```bash
# Get JWT token from browser localStorage or login endpoint
TOKEN="your_jwt_token_here"

# First view (should increment)
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/reviews/1/view" \
  -H "Authorization: Bearer $TOKEN"

# Response: { "data": { "views": 1 } }

# Second view within 24 hours (should NOT increment)
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/reviews/1/view" \
  -H "Authorization: Bearer $TOKEN"

# Response: { "data": { "views": 1 } } (same count)
```

#### Test Anonymous User View

```bash
# Anonymous view (always increments)
curl -X POST "${SERVER_URL:-http://localhost:1337}/api/reviews/1/view"

# Response: { "data": { "views": 2 } }
```

## Performance Considerations

- The `viewedAt` field should be indexed for fast lookups (Strapi will create this automatically)
- Consider adding a composite index on `(review_id, viewer_id, viewed_at)` for optimal query performance
- Old log entries (older than 24 hours) can be cleaned up periodically to prevent table bloat

## Future Enhancements

1. **Automatic Cleanup:** Add a cron job to delete log entries older than 30 days
2. **Analytics:** Track view patterns and generate reports
3. **Configurable Throttle:** Make the 24-hour window configurable via Strapi settings
4. **Batch Operations:** Optimize for high-traffic scenarios

## Troubleshooting

### Issue: View count not incrementing for authenticated users

**Check:**
1. Verify JWT token is valid and user is authenticated
2. Check Strapi logs for errors
3. Verify `review-view-log` table exists in database
4. Check that the service method is being called (check logs)

### Issue: View count increments every time (throttle not working)

**Check:**
1. Verify `ReviewViewLog` entries are being created
2. Check the `viewedAt` field is being set correctly
3. Verify the date comparison logic in the service method
4. Check database timezone settings

### Issue: Anonymous users not incrementing views

**Check:**
1. Verify the route is public (`auth: false`)
2. Check controller logic for anonymous user handling
3. Verify review exists and is accessible

## Related Files

- `src/api/review-view-log/content-types/review-view-log/schema.json` - Model schema
- `src/api/review/services/review.ts` - Service with `incrementUniqueViews` method
- `src/api/review/controllers/review.ts` - Controller with `incrementView` method
- `src/api/review/routes/custom-review.ts` - Custom route definition








































