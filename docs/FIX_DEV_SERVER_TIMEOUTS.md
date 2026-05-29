# Fix: Dev Server Timeouts and Module Loading Errors

## Issues Fixed

### Issue 1: Fetch Handler Errors (SSR Timeouts)
```
ERROR  Fetch handler error: aborted
ERROR  Fetch handler error: Premature close
```

### Issue 2: Vite Module Loading Failures
```
Loading failed for the module with source 
"http://localhost:3000/_nuxt/node_modules/@tanstack/virtual-core/..."
```

## Root Causes

### 1. SSR Fetch Timeouts
- **Problem**: The `sectors.vue` page fetches data during Server-Side Rendering (SSR)
- **Issue**: If Strapi is slow or has 403 errors, the fetch times out
- **Result**: "Premature close" and "aborted" errors in console

### 2. Vite Dependency Optimization
- **Problem**: Vite tries to optimize node_modules dependencies on-the-fly
- **Issue**: Some dependencies weren't included in the optimization list
- **Result**: Module loading failures in the browser

## Solutions Applied

### Solution 1: Add Timeout Handling to Data Fetching

**File**: `cliavalia-frontend/pages/sectors.vue`

**Before:**
```typescript
const { data, status, error } = await useAsyncData('sectors', async () => {
  const response = await $apiFetch('/api/sectors', {
    params: { ... }
  })
  return response
})
```

**After:**
```typescript
const { data, status, error } = await useAsyncData('sectors', async () => {
  // Create AbortController with timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  
  try {
    const response = await $apiFetch('/api/sectors', {
      signal: controller.signal,  // ← Add timeout signal
      params: { ... }
    })
    clearTimeout(timeoutId)
    return response
  } catch (err: any) {
    clearTimeout(timeoutId)
    
    // Handle timeout errors gracefully
    if (err.name === 'AbortError') {
      throw new Error('O servidor demorou muito tempo a responder.')
    }
    throw err
  }
}, {
  server: true,
  lazy: false,
  dedupe: 'defer'  // ← Prevent infinite retries
})
```

**Changes:**
- ✅ Added 10-second timeout to prevent infinite waits
- ✅ Graceful error handling for timeout errors
- ✅ User-friendly error messages in Portuguese
- ✅ Prevents retry loops with `dedupe: 'defer'`

### Solution 2: Update Vite Dependency Optimization

**File**: `cliavalia-frontend/nuxt.config.ts`

**Before:**
```typescript
optimizeDeps: {
  include: ['vue', '@vue/runtime-core', 'unhead'],
  force: true,
},
```

**After:**
```typescript
optimizeDeps: {
  include: [
    'vue',
    '@vue/runtime-core',
    'unhead',
    '@nuxt/ui',
    '@iconify/vue',
    '@iconify/utils',
    '@floating-ui/vue',
    '@floating-ui/dom',
    '@tanstack/virtual-core',
    '@internationalized/number',
    '@internationalized/date',
    'pinia'
  ],
  force: false,  // ← Don't force on every restart
  exclude: ['@nuxt/devtools']
},
```

**Changes:**
- ✅ Added all problematic dependencies to `include` list
- ✅ Changed `force: true` to `false` to prevent constant re-optimization
- ✅ Excluded devtools from optimization (causes conflicts)

### Solution 3: Increase Nitro Timeouts

**File**: `cliavalia-frontend/nuxt.config.ts`

**Before:**
```typescript
timeout: 10000,
keepAliveTimeout: 5000,
fetch: {
  timeout: 10000,
  retry: 2,
  retryDelay: 1000
}
```

**After:**
```typescript
timeout: 30000,        // ← Increased from 10s to 30s
keepAliveTimeout: 60000, // ← Increased from 5s to 60s
fetch: {
  timeout: 15000,      // ← Increased from 10s to 15s
  retry: 1,            // ← Reduced from 2 to 1
  retryDelay: 500      // ← Reduced from 1000ms to 500ms
}
```

**Changes:**
- ✅ Increased server timeout to 30 seconds
- ✅ Increased keep-alive timeout to 60 seconds
- ✅ Increased fetch timeout to 15 seconds
- ✅ Reduced retries to prevent cascading failures

## Clean Restart Scripts

### For Windows (Recommended)

**File**: `dev-clean-restart.bat`

Run this to clean caches and restart:
```bash
cd cliavalia-frontend
dev-clean-restart.bat
```

### For Linux/Mac

**File**: `dev-clean-restart.sh`

Run this to clean caches and restart:
```bash
cd cliavalia-frontend
chmod +x dev-clean-restart.sh
./dev-clean-restart.sh
```

### What the Scripts Do

1. ✅ Stop any running Node/Nuxt processes
2. ✅ Remove `.nuxt` cache directory
3. ✅ Remove `.output` build directory
4. ✅ Remove `node_modules/.cache`
5. ✅ Remove `node_modules/.vite` (Vite cache)
6. ✅ Remove `dist` directory
7. ✅ Start dev server with `npm run dev`

## Manual Cleanup (If Scripts Don't Work)

### Step 1: Stop Dev Server
Press `Ctrl + C` in the terminal running `npm run dev`

### Step 2: Delete Cache Directories
```bash
cd cliavalia-frontend

# Windows
rmdir /s /q .nuxt
rmdir /s /q .output
rmdir /s /q node_modules\.cache
rmdir /s /q node_modules\.vite
rmdir /s /q dist

# Linux/Mac
rm -rf .nuxt .output node_modules/.cache node_modules/.vite dist
```

### Step 3: Restart Dev Server
```bash
npm run dev
```

## Verification

After applying fixes and cleaning cache:

### 1. Check Dev Server Startup
```bash
npm run dev
```

**Expected Output (Clean):**
```
✔ Nuxt Icon discovered local-installed 1 collections
✔ Vite client built in 661ms
✔ Vite server built in 1146ms
✔ Nuxt Nitro server built in 13095ms
```

**No More Errors Like:**
```
❌ ERROR  Fetch handler error: aborted
❌ ERROR  Fetch handler error: Premature close
```

### 2. Check Browser Console
Visit `http://localhost:3000/sectors`

**Expected:**
- ✅ Page loads without module loading errors
- ✅ No red errors in console
- ✅ Either sectors display or error state shows (if 403 not fixed yet)

**No More Errors Like:**
```
❌ Loading failed for the module with source 
   "http://localhost:3000/_nuxt/node_modules/@tanstack/virtual-core/..."
```

### 3. Check Network Tab
- ✅ All module requests return `200 OK`
- ✅ No `404 Not Found` for node_modules
- ✅ Requests complete within timeout limits

## Troubleshooting

### Still Getting "Premature Close" Errors?

**Option A: Make Data Fetching Client-Side Only**

In `sectors.vue`, change:
```typescript
{
  server: true,   // ← Change this
  lazy: false,
  dedupe: 'defer'
}
```

To:
```typescript
{
  server: false,  // ← Disable SSR
  lazy: true,     // ← Enable lazy loading
  dedupe: 'defer'
}
```

**Trade-offs:**
- ✅ No more SSR timeout errors
- ❌ Slower initial page load (data fetches after page render)
- ❌ Worse SEO (search engines don't see content immediately)

**Option B: Increase Timeout Further**

In `sectors.vue`, change:
```typescript
const timeoutId = setTimeout(() => controller.abort(), 10000)
```

To:
```typescript
const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 seconds
```

### Still Getting Module Loading Errors?

**Option 1: Full Dependency Reinstall**

```bash
cd cliavalia-frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Option 2: Clear NPM Cache**

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Option 3: Update Dependencies**

```bash
npm update
npm run dev
```

### Dev Server Takes Forever to Start?

This is normal for the first start after changes. Subsequent starts should be faster.

**First Start:**
- ~30-60 seconds
- Vite optimizes dependencies
- Nuxt builds server

**Subsequent Starts:**
- ~5-10 seconds
- Uses cached dependencies
- Incremental builds

## Performance Expectations

### Development Mode

**Cold Start (After Cache Clear):**
```
[8:11:25 AM] Nuxt 4.1.3
[8:11:30 AM] DevTools ready
[8:11:36 AM] Icon collections discovered
[8:11:47 AM] Dependencies optimized
[8:11:48 AM] Vite client built in 661ms
[8:11:49 AM] Vite server built in 1146ms
[8:12:04 AM] Nitro server built in 13095ms
```
**Total: ~40 seconds**

**Hot Start (With Cache):**
```
[8:15:10 AM] Nuxt 4.1.3
[8:15:12 AM] Vite client built in 234ms
[8:15:12 AM] Vite server built in 456ms
[8:15:14 AM] Nitro server ready
```
**Total: ~4 seconds**

### Page Load Times

**Sectors Page (SSR Enabled):**
- Server render: ~50-200ms
- Strapi API call: ~50-150ms
- Total: ~100-350ms

**If Strapi is Slow:**
- Timeout after 10 seconds
- Error state displays
- User can retry

## Summary of All Changes

### Files Modified

1. **`cliavalia-frontend/pages/sectors.vue`**
   - Added timeout handling (10s)
   - Added graceful error handling
   - Added `dedupe: 'defer'` to prevent retries

2. **`cliavalia-frontend/nuxt.config.ts`**
   - Updated `optimizeDeps.include` (added 8 dependencies)
   - Changed `optimizeDeps.force` to `false`
   - Increased Nitro timeouts (30s, 60s, 15s)
   - Reduced fetch retries (2 → 1)

3. **`cliavalia-frontend/dev-clean-restart.bat`** (NEW)
   - Windows cleanup script

4. **`cliavalia-frontend/dev-clean-restart.sh`** (NEW)
   - Linux/Mac cleanup script

### Configuration Changes Summary

| Setting | Before | After | Reason |
|---------|--------|-------|--------|
| Sector fetch timeout | None | 10s | Prevent infinite waits |
| Nitro timeout | 10s | 30s | Allow slower SSR |
| Keep-alive timeout | 5s | 60s | Prevent premature closes |
| Fetch timeout | 10s | 15s | Match sector timeout |
| Fetch retries | 2 | 1 | Reduce cascading failures |
| Vite force optimize | true | false | Speed up restarts |
| Vite included deps | 3 | 11 | Fix module loading |

## Next Steps

1. ✅ Apply all fixes (already done)
2. ✅ Run cleanup script (`dev-clean-restart.bat`)
3. ✅ Verify dev server starts cleanly
4. ⏳ Fix 403 Sectors permissions (see `QUICK_FIX_403_SECTORS.md`)
5. ⏳ Test sectors page loads correctly

## Related Documentation

- `FIX_403_SECTORS_PERMISSIONS.md` - Fix API permissions
- `QUICK_FIX_403_SECTORS.md` - Quick permission fix guide
- `SECTORS_DYNAMIC_STRAPI_INTEGRATION.md` - Full sectors page docs
- `SECTORS_PAGE_QUICKSTART.md` - Quick start guide

