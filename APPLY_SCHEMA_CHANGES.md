# Apply Schema Changes - Review Fields

## Problem
After updating `schema.json` to add `experienceTags` and `experiencePhotos` fields, they don't appear in the Strapi admin panel.

## Solution
Strapi v5 requires a **server restart** to pick up schema changes. The schema file is correct, but Strapi needs to reload it.

## Steps to Apply Changes

### If Running in Docker (Recommended)

1. **Restart the Strapi container:**
   ```bash
   cd cliavalia-backend
   docker-compose restart strapi
   ```

   Or if that doesn't work:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

2. **Wait for Strapi to fully start** (check logs):
   ```bash
   docker-compose logs -f strapi
   ```
   
   Look for: `[INFO] Strapi started successfully`

3. **Clear browser cache** and refresh the admin panel:
   - Open `${SERVER_URL:-http://localhost:1337}/admin`
   - Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

4. **Verify the fields appear:**
   - Go to **Content Manager** → **Review**
   - Click **Create new entry**
   - You should see:
     - `experienceTags` (JSON field)
     - `experiencePhotos` (Media field, multiple files)

### If Running Locally (npm)

1. **Stop Strapi** (if running):
   - Press `Ctrl+C` in the terminal where Strapi is running

2. **Restart Strapi:**
   ```bash
   cd cliavalia-backend
   npm run develop
   ```

3. **Wait for Strapi to fully start** (look for the success message)

4. **Clear browser cache** and refresh the admin panel

5. **Verify the fields appear** as described above

## If Fields Still Don't Appear

### Option 1: Clear Build Cache and Rebuild

```bash
# Stop Strapi
docker-compose stop strapi  # or Ctrl+C if local

# Clear cache
rm -rf .cache build dist .strapi

# Restart
docker-compose up -d  # or npm run develop
```

### Option 2: Force Admin Panel Rebuild

```bash
# Stop Strapi
docker-compose stop strapi

# Rebuild admin panel
docker-compose exec strapi npm run build

# Restart
docker-compose restart strapi
```

### Option 3: Verify Schema File Location

Ensure the schema file is at:
```
cliavalia-backend/src/api/review/content-types/review/schema.json
```

And that it contains:
```json
{
  "attributes": {
    ...
    "experienceTags": {
      "type": "json"
    },
    "experiencePhotos": {
      "type": "media",
      "multiple": true,
      "required": false,
      "allowedTypes": ["images", "videos"]
    }
  }
}
```

## Verification Checklist

- [ ] Strapi server restarted successfully
- [ ] No errors in Strapi logs
- [ ] Browser cache cleared
- [ ] Admin panel refreshed
- [ ] Fields visible in Content Manager → Review → Create new entry

## Expected Result

After restarting, when you create a new Review entry in the admin panel, you should see:

1. **experienceTags** - A JSON field where you can enter an array of strings
2. **experiencePhotos** - A media field that allows uploading multiple images/videos

These fields are **optional**, so existing reviews won't be affected.

