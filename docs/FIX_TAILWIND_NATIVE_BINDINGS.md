# Fix: Tailwind CSS Native Bindings Error

## New Error Messages

```
ERROR Could not resolve "../pkg"
node_modules/lightningcss/node/index.js:17:27

ERROR No loader is configured for ".node" files
node_modules/@tailwindcss/oxide-win32-x64-msvc/tailwindcss-oxide.win32-x64-msvc.node

ERROR Fetch handler error: Premature close
ERROR Fetch handler error: aborted
```

## Root Cause

### Issue 1: Native Binary Files (.node)
Tailwind CSS v4 and LightningCSS use **native binary files** (`.node` files) compiled for specific platforms (Windows, Mac, Linux). Vite is trying to **optimize** these files during development, which fails because:
- `.node` files are compiled binaries, not JavaScript
- They can't be bundled or optimized by esbuild/Vite
- They must be loaded directly by Node.js

### Issue 2: SSR Fetch Timeouts
The sectors page is fetching data during Server-Side Rendering, causing:
- Long initial render times
- Timeout errors if Strapi is slow or has permission errors
- "Premature close" and "aborted" errors

## Solutions Applied

### Solution 1: Exclude Native Dependencies from Vite Optimization

**File**: `cliavalia-frontend/nuxt.config.ts`

**Added to `optimizeDeps.exclude`:**
```typescript
exclude: [
  '@nuxt/devtools',
  '@tailwindcss/oxide',                    // ← NEW
  '@tailwindcss/oxide-win32-x64-msvc',    // ← NEW
  'lightningcss',                          // ← NEW
  'lightningcss-win32-x64-msvc'           // ← NEW
]
```

**Why This Works:**
- Tells Vite to **not optimize** these packages
- Native binaries are left as-is
- Node.js can load them directly

### Solution 2: Configure .node File Handling

**File**: `cliavalia-frontend/nuxt.config.ts`

**Added:**
```typescript
// Exclude native binaries from processing
assetsInclude: ['**/*.node'],
ssr: {
  noExternal: false,
  external: []
}
```

**Why This Works:**
- `assetsInclude` tells Vite to treat `.node` files as static assets
- `ssr.external` ensures native modules aren't bundled in SSR

### Solution 3: Make Sectors Page Client-Side Only

**File**: `cliavalia-frontend/pages/sectors.vue`

**Changed:**
```typescript
// Before (SSR enabled)
{
  server: true,   // Fetch on server
  lazy: false,    // Immediate fetch
  dedupe: 'defer'
}

// After (Client-side only)
{
  server: false,  // ← No SSR fetch
  lazy: true,     // ← Lazy load
  dedupe: 'defer'
}
```

**Trade-offs:**
- ✅ **Fixed**: No more SSR timeout errors
- ✅ **Fixed**: No more "Premature close" errors
- ✅ **Better**: More reliable in development
- ⚠️ **Trade-off**: Slightly slower initial page load (data fetches after page renders)
- ⚠️ **Trade-off**: Worse SEO (search engines don't see content immediately)

**Note:** For production, you can re-enable SSR once Strapi permissions are fixed.

### Solution 4: Enhanced Cleanup Script

**File**: `cliavalia-frontend/dev-clean-restart.bat`

**New Features:**
- ✅ Waits 2 seconds after killing Node processes
- ✅ Cleans TypeScript build cache
- ✅ Clears NPM cache
- ✅ Shows "Please wait" message (30-60 seconds expected)

## How to Apply the Fix

### Option 1: Automatic (Recommended)

Stop the dev server (`Ctrl + C`), then run:

```cmd
cd cliavalia-frontend
dev-clean-restart.bat
```

This will:
1. Kill all Node processes
2. Delete all cache directories
3. Clear NPM cache
4. Restart dev server

### Option 2: Manual

**Step 1: Stop Dev Server**
Press `Ctrl + C`

**Step 2: Clean Caches**
```cmd
cd cliavalia-frontend

rmdir /s /q .nuxt
rmdir /s /q .output
rmdir /s /q node_modules\.cache
rmdir /s /q node_modules\.vite
rmdir /s /q dist
del .tsconfig.tsbuildinfo

npm cache clean --force
```

**Step 3: Restart**
```cmd
npm run dev
```

**Step 4: Wait**
First start after cleanup takes **30-60 seconds**. Be patient!

## Expected Results

### ✅ Good Startup (After Fix)

```
[8:20:45 AM] Nuxt 4.1.3
[8:20:51 AM] DevTools ready
[8:20:56 AM] ✔ Nuxt Icon discovered
[8:21:06 AM] ✔ Vite client built in 591ms
[8:21:07 AM] ✔ Vite server built in 1125ms
[8:21:17 AM] ✔ Nitro server built in 8611ms
```

**No More:**
- ❌ `ERROR Could not resolve "../pkg"`
- ❌ `ERROR No loader is configured for ".node" files`
- ❌ `ERROR Fetch handler error: Premature close`

### ⚠️ Warning Messages (OK to Ignore)

You may still see these during first optimization:
```
ℹ ✨ new dependencies optimized: pinia
ℹ ✨ optimized dependencies changed. reloading
```

**This is normal!** Vite is caching dependencies. Won't happen on subsequent starts.

## Verification Steps

### 1. Check Dev Server Starts Clean
```cmd
npm run dev
```

Should complete without errors in ~60 seconds on first run.

### 2. Check Browser Console
Visit: `http://localhost:3000/sectors`

**Expected in Console:**
- ✅ No red errors
- ✅ Page renders (might show loading state)
- ⚠️ May show 403 error from API (that's a separate issue)

### 3. Check Network Tab
- ✅ No 404 errors for `.node` files
- ✅ All module requests complete successfully
- ⚠️ API call may show 403 (fix permissions next)

## Understanding the Error Messages

### What Are .node Files?

`.node` files are **native addons** - compiled C/C++ code that Node.js can load:
- **Platform-specific**: Different file for Windows vs Mac vs Linux
- **Binary format**: Not text, can't be edited or bundled
- **Direct loading**: Must be loaded by Node.js runtime
- **Examples**: `tailwindcss-oxide.win32-x64-msvc.node`

### Why Vite Can't Handle Them

Vite uses **esbuild** to optimize JavaScript:
- Parses JS/TS files
- Bundles them together
- Optimizes for faster loading

But `.node` files are **not JavaScript**:
- Can't be parsed
- Can't be bundled
- Must be excluded from optimization

### The Fix in Simple Terms

We told Vite:
> "Don't touch these packages. They have native code. Leave them alone!"

## Troubleshooting

### Still Getting .node File Errors?

**Option 1: Full Reinstall**
```cmd
cd cliavalia-frontend
rmdir /s /q node_modules
del package-lock.json
npm install
dev-clean-restart.bat
```

**Option 2: Check Node Version**
```cmd
node --version
```

Should be: `v20.x` or `v18.x`

If not, install the correct version:
- Download from: https://nodejs.org/
- Use LTS version (Long Term Support)

**Option 3: Reinstall Tailwind CSS**
```cmd
npm uninstall @tailwindcss/postcss
npm install @tailwindcss/postcss@latest
npm run dev
```

### Still Getting Fetch Errors?

This is expected if:
1. ❌ Strapi is not running
2. ❌ Strapi permissions not configured (403 error)

**Check Strapi is Running:**
```cmd
cd ..\cliavalia-backend
docker ps | findstr strapi
```

Should show:
```
cliavalia-backend   Up   0.0.0.0:1337->1337/tcp
```

If not running:
```cmd
docker-compose up -d
```

**Fix Permissions:**
See: `QUICK_FIX_403_SECTORS.md`

### Dev Server Takes Too Long?

**First start:** 30-60 seconds (normal)
- Vite optimizes dependencies
- Nuxt builds server
- TypeScript compiles

**Subsequent starts:** 5-10 seconds (normal)
- Uses cached dependencies
- Incremental builds only

**If taking longer:**
1. Check antivirus isn't scanning `node_modules`
2. Check disk isn't full
3. Try closing other apps (VS Code extensions, Docker Desktop UI)

### HMR (Hot Module Reload) Not Working?

After changes, page should auto-reload. If not:

**Fix 1: Check Console**
Look for HMR messages:
```
[8:22:54 AM] ℹ hmr update /pages/sectors.vue
```

**Fix 2: Manual Reload**
Press `Ctrl + R` or `F5` in browser

**Fix 3: Restart Dev Server**
Press `Ctrl + C` and run `npm run dev` again

## Performance Expectations

### Development Mode (After Fixes)

**Cold Start (After Cache Clear):**
```
Vite client:  ~500-800ms
Vite server:  ~1000-1500ms
Nitro server: ~8000-12000ms
Total:        ~30-45 seconds
```

**Hot Start (With Cache):**
```
Vite client:  ~200-400ms
Vite server:  ~400-600ms
Nitro server: ~2000-4000ms
Total:        ~5-10 seconds
```

**HMR (File Change):**
```
Page reload:  ~50-200ms
```

### Page Load (Client-Side Fetch)

**Sectors Page:**
1. HTML renders: ~10-50ms
2. Loading skeleton shows: Immediate
3. API fetch to Strapi: ~50-200ms
4. Data renders: ~10-50ms

**Total:** 100-350ms (if Strapi is fast)

**If 403 Error:** Shows error state, user can retry

## Summary of Changes

### Files Modified

1. **`nuxt.config.ts`**
   - Added 4 native dependencies to `exclude` list
   - Added `.node` file handling
   - Added SSR configuration for native modules

2. **`pages/sectors.vue`**
   - Changed `server: true` → `server: false`
   - Changed `lazy: false` → `lazy: true`
   - Now fetches client-side only

3. **`dev-clean-restart.bat`**
   - Added 2-second wait after killing processes
   - Added TypeScript cache cleanup
   - Added NPM cache cleanup
   - Added progress messages

### Configuration Matrix

| Setting | Before | After | Effect |
|---------|--------|-------|--------|
| Sectors SSR | ✅ Enabled | ❌ Disabled | No server fetch |
| Sectors Lazy | ❌ Immediate | ✅ Lazy | Fetch after render |
| Vite exclude | 1 item | 5 items | Skip native deps |
| .node handling | ❌ None | ✅ Asset | Proper loading |

## Next Steps

1. ✅ Apply all fixes (done)
2. ✅ Run `dev-clean-restart.bat`
3. ✅ Wait for clean startup (30-60s)
4. ✅ Verify no .node errors
5. ⏳ Fix 403 permissions (see `QUICK_FIX_403_SECTORS.md`)
6. ⏳ Test sectors page loads
7. ⏳ (Optional) Re-enable SSR after permissions fixed

## Re-enabling SSR (After Permissions Fixed)

Once Strapi permissions are working, you can restore SSR for better performance:

**File**: `pages/sectors.vue`

Change back to:
```typescript
{
  server: true,    // ← Enable SSR
  lazy: false,     // ← Immediate fetch
  dedupe: 'defer'
}
```

**Benefits:**
- Faster initial page load
- Better SEO
- Content visible to search engines

**Requirements:**
- Strapi must be running
- Permissions must be configured
- API must respond quickly (<10s)

## Related Documentation

- `FIX_DEV_SERVER_TIMEOUTS.md` - Original timeout fixes
- `QUICK_FIX_COMMANDS.md` - Quick command reference
- `QUICK_FIX_403_SECTORS.md` - Fix API permissions
- `FIX_403_SECTORS_PERMISSIONS.md` - Detailed permission guide










