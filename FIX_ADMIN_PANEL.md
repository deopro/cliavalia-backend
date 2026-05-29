# Fix: Strapi v5 Content Manager Loading Issue

## Error
```
Uncaught (in promise) TypeError: checkUserHasPermissions is not a function
```

## Quick Fix (Choose One Method)

### Method 1: Using the Fix Script (Recommended)

**Windows (PowerShell):**
```powershell
.\fix-admin-panel.ps1
```

**Linux/Mac/Git Bash:**
```bash
chmod +x fix-admin-panel.sh
./fix-admin-panel.sh
```

### Method 2: Manual Steps

#### If Running in Docker:

1. **Stop the container:**
   ```bash
   docker-compose stop strapi
   ```

2. **Clear cache inside container:**
   ```bash
   docker-compose exec strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache"
   ```

3. **Restart and rebuild:**
   ```bash
   docker-compose up -d strapi
   ```
   
   Wait for Strapi to start, then rebuild admin:
   ```bash
   docker-compose exec strapi npm run build
   ```

4. **Restart container:**
   ```bash
   docker-compose restart strapi
   ```

#### If Running Locally (npm):

1. **Stop Strapi** (Ctrl+C if running)

2. **Clear cache:**
   ```bash
   rm -rf .cache build dist .strapi node_modules/.cache
   ```

3. **Rebuild admin panel:**
   ```bash
   npm run build
   ```

4. **Start Strapi:**
   ```bash
   npm run develop
   ```

### Method 3: Nuclear Option (Complete Clean Rebuild)

If the above doesn't work:

```bash
# Stop everything
docker-compose down  # or npm stop

# Remove all cache and build files
rm -rf .cache build dist .strapi node_modules/.cache node_modules

# Reinstall dependencies
npm install

# Rebuild
npm run build

# Start
docker-compose up -d  # or npm run develop
```

## What Causes This?

This error occurs when:
- Admin panel build cache is corrupted
- Strapi v5 admin dependencies are out of sync
- Build artifacts are incomplete or missing

## Verification

After applying the fix:
1. Open `${SERVER_URL:-http://localhost:1337}/admin`
2. Navigate to **Content Manager**
3. The page should load without errors
4. You should be able to see your content types

## Still Not Working?

1. **Check Strapi version:**
   ```bash
   npm list @strapi/strapi
   ```
   Should show `5.30.0`

2. **Check browser console** for other errors

3. **Clear browser cache** (Ctrl+Shift+Delete)

4. **Try incognito/private window**

5. **Check Docker logs:**
   ```bash
   docker-compose logs strapi
   ```

## Related Issues

- [Strapi GitHub Issue #21151](https://github.com/strapi/strapi/issues/21151)
- [Strapi v5 Migration Guide](https://docs-next.strapi.io/cms/migration/v4-to-v5/breaking-changes/admin-panel-rbac-store-updated)


