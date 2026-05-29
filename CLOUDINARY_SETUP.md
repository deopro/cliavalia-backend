# Cloudinary Setup Guide

## Problem

You're seeing this error when trying to upload files through Strapi:

```
Error uploading to cloudinary: Unknown API key your_cloudinary_api_key
```

This happens because Strapi is configured with placeholder Cloudinary credentials.

## Solution

### Step 1: Get Your Cloudinary Credentials

1. Go to [Cloudinary Dashboard](https://cloudinary.com/console)
2. Sign in or create a free account
3. Once logged in, you'll see your **Cloud Name**, **API Key**, and **API Secret** on the dashboard

### Step 2: Configure Strapi Backend

You have two options:

#### Option A: Using .env file (Recommended)

1. Copy the example environment file:

   ```bash
   cd cliavalia-backend
   cp .env.example .env
   ```

2. Edit `.env` and update the Cloudinary section with your actual credentials:

   ```bash
   CLOUDINARY_NAME=your_actual_cloud_name
   CLOUDINARY_KEY=your_actual_api_key
   CLOUDINARY_SECRET=your_actual_api_secret
   CLOUDINARY_URL=cloudinary://your_actual_api_key:your_actual_api_secret@your_actual_cloud_name
   ```

3. Restart your Docker containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

#### Option B: Update docker-compose.yml directly

1. Edit `cliavalia-backend/docker-compose.yml`
2. Replace the placeholder values in the Cloudinary Configuration section (lines 43-46):

   ```yaml
   CLOUDINARY_NAME: your_actual_cloud_name
   CLOUDINARY_KEY: your_actual_api_key
   CLOUDINARY_SECRET: your_actual_api_secret
   CLOUDINARY_URL: cloudinary://your_actual_api_key:your_actual_api_secret@your_actual_cloud_name
   ```

3. Restart your Docker containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Step 3: Verify Configuration

1. Open Strapi Admin Panel: ${SERVER_URL:-http://localhost:1337}/admin
2. Go to **Media Library**
3. Try uploading an image
4. It should now upload successfully to Cloudinary

## Fallback Mechanism

Even if Strapi's Cloudinary plugin fails, the frontend has a fallback mechanism that uploads directly to Cloudinary. Make sure you also have Cloudinary credentials in your frontend `.env.local`:

```bash
# In cliavalia-frontend/.env.local
CLOUDINARY_NAME=your_actual_cloud_name
CLOUDINARY_KEY=your_actual_api_key
CLOUDINARY_SECRET=your_actual_api_secret
```

## Troubleshooting

### Still getting errors?

1. **Check credentials are correct**: Double-check that you copied the exact values from Cloudinary dashboard
2. **Restart containers**: Make sure you restarted Docker containers after updating credentials
3. **Check logs**:
   ```bash
   docker-compose logs strapi
   ```
4. **Verify environment variables**: Check that the environment variables are being loaded:
   ```bash
   docker-compose exec strapi env | grep CLOUDINARY
   ```

### Cloudinary Free Tier Limits

- 25 GB storage
- 25 GB monthly bandwidth
- 25,000 transformations per month

For production, consider upgrading to a paid plan.
