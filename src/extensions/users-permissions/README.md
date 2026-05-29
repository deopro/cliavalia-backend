# Users-Permissions Plugin Extension

This directory contains custom extensions to the Strapi 5 `users-permissions` plugin.

## Files Structure

```
src/extensions/users-permissions/
├── content-types/
│   └── user/
│       └── schema.json          # Extended user schema with firstName and lastName
├── controllers/
│   └── auth.ts                  # Extended auth controller with Google OAuth callback override
└── strapi-server.ts             # Main extension file that registers all extensions
```

## Extensions

### 1. Google OAuth Callback Extension (`controllers/auth.ts`)

**Purpose**: Extends the Google OAuth provider callback to properly map `firstName` and `lastName` from Google's user profile to Strapi's User Content Type fields.

**Features**:
- ✅ Maps Google profile `given_name` and `family_name` to Strapi `firstName` and `lastName`
- ✅ Sets `provider` field to `"google"` for all Google-authenticated users
- ✅ Handles multiple Google profile structures (nested name object, direct properties, displayName fallback)
- ✅ Validates and ensures `firstName` and `lastName` meet schema requirements (minLength: 3, maxLength: 80/30)
- ✅ Handles existing users by updating provider information without overwriting existing names
- ✅ Automatically confirms OAuth users (sets `confirmed: true`)
- ✅ Maintains `providers` array to track all authentication methods
- ✅ Generates unique usernames for new users

**How it works**:

1. Intercepts Google OAuth callback (`/api/connect/google/callback`)
2. Uses Strapi's `providers-registry` service to connect with Google and retrieve user profile
3. Extracts `firstName` and `lastName` using multiple fallback strategies:
   - Direct properties: `profile.given_name`, `profile.family_name`
   - Nested name object: `profile.name.givenName`, `profile.name.familyName`
   - Alternative names: `profile.first_name`, `profile.last_name`
   - Display name splitting: `profile.displayName`
   - Email prefix fallback (for firstName)
4. Validates extracted names to meet schema requirements
5. Creates new user or updates existing user with proper field mapping
6. Returns JWT token and user data including `firstName`, `lastName`, and `provider: "google"`

### 2. Email Confirmation URL Extension (`strapi-server.ts`)

**Purpose**: Overrides the email confirmation URL generation to use the frontend URL instead of the backend URL.

**Features**:
- Uses `FRONTEND_URL` environment variable for email confirmation links
- Ensures confirmation links point to `/connect?confirmation={token}&email={email}` on the frontend

## Configuration

### Environment Variables

Make sure these are set in your `.env` file:

```bash
# Frontend URL for email confirmations
FRONTEND_URL=http://localhost:3000

# Google OAuth credentials (configured in Strapi Admin)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### Strapi Admin Configuration

1. Go to **Settings** → **Users & Permissions Plugin** → **Providers**
2. Enable **Google** provider
3. Enter your Google OAuth credentials:
   - **Client ID**: Your Google OAuth Client ID
   - **Client Secret**: Your Google OAuth Client Secret
   - **Redirect URL**: `${SERVER_URL:-http://localhost:1337}/api/connect/google/callback` (development)
   - **Redirect URL**: `https://yourdomain.com/api/connect/google/callback` (production)

## Usage

Once configured, users can authenticate with Google:

1. Frontend redirects to: `/api/connect/google?redirect={frontend_callback_url}`
2. User authorizes on Google
3. Google redirects to: `/api/connect/google/callback?access_token=...`
4. Our extended callback:
   - Extracts `firstName` and `lastName` from Google profile
   - Creates or updates user with `provider: "google"`
   - Returns JWT token and user data
5. Frontend receives user data with proper `firstName` and `lastName` fields

## Testing

To test the Google OAuth extension:

1. Ensure Google OAuth is configured in Strapi Admin
2. Start Strapi backend: `npm run develop`
3. Attempt Google login from frontend
4. Check Strapi logs for:
   - `Google OAuth profile received:` - confirms profile was retrieved
   - `Extracted names from Google profile:` - confirms name extraction worked
5. Verify in Strapi Admin that the user has:
   - `firstName` and `lastName` populated
   - `provider` set to `"google"`
   - `providers` array includes `"google"`
   - `confirmed` set to `true`

## Troubleshooting

### Issue: firstName/lastName not being saved

**Check**:
- Ensure schema allows these fields (they're required with minLength: 3)
- Check Strapi logs for validation errors
- Verify Google profile contains name information

### Issue: Provider not being set to "google"

**Check**:
- Ensure the extension is loading (check Strapi startup logs)
- Verify the controller extension is properly registered in `strapi-server.ts`
- Check that `provider !== 'google'` condition is working correctly

### Issue: Username conflicts

**Fix**: The extension automatically generates unique usernames by appending numbers if conflicts occur (up to 10 attempts).

## Related Files

- `config/plugins.ts`: Users-permissions plugin configuration
- `src/extensions/users-permissions/content-types/user/schema.json`: User schema definition
- Frontend: `composables/auth/useSocialAuth.ts` - Handles Google OAuth flow





