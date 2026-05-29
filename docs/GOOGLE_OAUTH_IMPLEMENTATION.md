# Google OAuth: Firstname, Lastname & Avatar Implementation

This document describes the implementation for automatically fetching and saving `firstname`, `lastname`, and `avatar` (profile photo) from Google when users sign up or log in via Google OAuth.

## Overview

- **Backend (Strapi 5):** Extended the Google provider to fetch from `https://www.googleapis.com/oauth2/v3/userinfo` and map:
  - `given_name` → `firstName`
  - `family_name` → `lastName`
  - `picture` → `profileImage` (avatar)

- **Frontend (Nuxt 4):** Uses `useSocialAuth` composable with redirect flow; callback page captures JWT and user data.

## Database Schema (User Content-Type)

Ensure your User Content-Type in Strapi Admin has these fields:

| Field         | Type    | Required | Notes                                      |
|---------------|---------|----------|--------------------------------------------|
| `firstName`   | string  | Yes      | minLength: 3, maxLength: 80                 |
| `lastName`    | string  | Yes      | minLength: 3, maxLength: 30                 |
| `profileImage`| string  | No       | Stores Google profile photo URL (avatar)    |

Your schema at `src/extensions/users-permissions/content-types/user/schema.json` already includes:
- `firstName`, `lastName`, `profileImage`

**Note:** The implementation uses `profileImage` for the avatar. If you prefer an `avatar` field, add it to the schema and update the auth controller mapping.

## Backend Implementation

### 1. Provider Extension (`src/index.ts`)

In `bootstrap()`, the Google provider is extended via `providers-registry.add()`:
- Fetches user info from `https://www.googleapis.com/oauth2/v3/userinfo`
- Adds `profile` scope to grant config for `given_name`, `family_name`, `picture`
- Returns `{ username, email, firstName, lastName, profileImage }`

### 2. Auth Controller (`src/extensions/users-permissions/controllers/auth.ts`)

The OAuth callback:
- Fetches Google userinfo before calling `providers.connect()` to ensure we have avatar data
- Maps `given_name` → `firstName`, `family_name` → `lastName`, `picture` → `profileImage`
- Saves for both **new users** (registration) and **existing users** (login)
- Updates `profileImage` only when the user has no existing avatar

## Frontend Implementation (Nuxt 4)

### 1. Initiate Google Login

```ts
// composables/auth/useSocialAuth.ts
const loginWithGoogle = async () => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.strapiApiUrl;
  const redirectUrl = `${window.location.origin}/auth/callback?provider=google`;
  const googleAuthUrl = `${baseUrl}/api/connect/google?redirect=${encodeURIComponent(redirectUrl)}`;
  window.location.href = googleAuthUrl;
};
```

### 2. Callback Page (`pages/auth/callback.vue`)

- Reads `jwt` from query params (set by Strapi redirect)
- Calls `handleSocialAuthCallback(provider, jwt, true)`
- Validates JWT via `/api/users/me` and persists auth state

### 3. Handle Callback & Persist Auth

```ts
// In handleSocialAuthCallback when JWT is present:
const response = await $apiFetch("/api/users/me", {
  headers: { Authorization: `Bearer ${token}` },
});
persistAuth(token, response, "consumer");
```

The user object from `/api/users/me` includes `profileImage` (avatar).

### 4. Display User Data

```vue
<script setup>
const { user, getUserProfileImage, getUserDisplayName } = useAuth();
</script>
<template>
  <img v-if="getUserProfileImage" :src="getUserProfileImage" alt="Avatar" />
  <span>{{ getUserDisplayName }}</span>
</template>
```

## Environment Variables

- `NUXT_PUBLIC_STRAPI_API_URL` – Strapi backend URL (e.g. `${SERVER_URL:-http://localhost:1337}`)
- `FRONTEND_URL` – Frontend URL for redirects (e.g. `http://localhost:3000`). **In production this must be set** to your frontend origin (e.g. `https://your-app.com`), otherwise after Google sign-in users are redirected to `http://localhost:3000`.

## Google OAuth Setup

1. **Strapi Admin:** Settings → Users & Permissions → Providers → Google  
   - Enable Google  
   - Add Client ID and Client Secret from [Google Cloud Console](https://console.cloud.google.com/)  
   - Add redirect URI: `{STRAPI_URL}/api/connect/google/callback`

2. **Google Cloud Console:**  
   - Create OAuth 2.0 credentials (Web application)  
   - Authorized redirect URIs: `${SERVER_URL:-http://localhost:1337}/api/connect/google/callback` (and production URL)

## Flow Summary

1. User clicks “Login with Google” → redirect to Strapi `/api/connect/google`
2. Strapi redirects to Google OAuth
3. User authorizes → Google redirects to Strapi `/api/connect/google/callback`
4. Strapi exchanges code for token, fetches userinfo, creates/updates user, issues JWT
5. Strapi redirects to frontend `/auth/callback?jwt=...`
6. Frontend validates JWT, fetches user via `/api/users/me`, persists auth
