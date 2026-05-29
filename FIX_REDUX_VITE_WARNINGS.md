# Fix: Redux API Mismatch and Vite WebSocket Connection Issues

## Issues
1. **Redux API reducer path mismatch**: `There is a mismatch between slice and middleware for the reducerPath "adminApi"`
2. **WebSocket connection failure**: `Firefox can't establish a connection to the server at ws://localhost:5173/admin/?token=...`
3. **Vite server connection lost**: `[vite] server connection lost. Polling for restart...`

## Root Causes

### 1. Redux API Mismatch
This is a **known Strapi v5 warning** that occurs when:
- Multiple plugins or custom code create Redux Toolkit Query API instances
- The admin panel's internal API setup conflicts with plugin APIs
- This is typically a **non-critical warning** in development but can cause issues

### 2. WebSocket Connection
The Vite HMR (Hot Module Replacement) is trying to connect to port 5173, but:
- Strapi's admin panel runs on port 1337
- The WebSocket should connect to the same port as Strapi (1337), not a separate Vite port
- The HMR configuration was pointing to the wrong port

## Solutions Applied

### 1. Updated Vite Config (`src/admin/vite.config.ts`)
Removed explicit port configuration to let Strapi handle it automatically:

```typescript
server: {
  hmr: {
    protocol: 'ws',
    host: 'localhost',
    // Let Strapi handle the port automatically
    // Remove explicit port to avoid conflicts
  },
}
```

### 2. Updated Security Middleware (`config/middlewares.ts`)
Added explicit WebSocket connections for port 1337:

```typescript
'connect-src': [
  "'self'",
  'http://localhost:*',
  'ws://localhost:*',
  'ws://127.0.0.1:*',
  'ws://localhost:1337',
  'ws://127.0.0.1:1337',
],
```

## Next Steps

### 1. Restart Strapi Completely
```bash
# Docker
docker-compose down
docker-compose up -d strapi

# Local
# Stop Strapi (Ctrl+C)
npm run develop
```

### 2. Clear Browser Cache and Hard Refresh
- **Windows/Linux**: `Ctrl+Shift+R` or `Ctrl+F5`
- **Mac**: `Cmd+Shift+R`
- Or clear cache: `Ctrl+Shift+Delete` / `Cmd+Shift+Delete`

### 3. Check Strapi Logs
```bash
# Docker
docker-compose logs -f strapi

# Local
# Check terminal where Strapi is running
```

Look for:
- `Admin panel built successfully`
- `Server started on port 1337`
- No Vite-related errors

## About the Redux Warning

The `adminApi` reducer path mismatch is a **known Strapi v5 issue** and is typically:
- **Non-critical** in development
- Caused by Strapi's internal plugin system
- Usually doesn't affect functionality
- May be resolved in future Strapi updates

**If it causes actual crashes:**
1. Check for custom plugins that might be creating duplicate API instances
2. Ensure you're using Strapi v5.30.0 (latest stable)
3. Report to Strapi GitHub if it causes real issues

## Alternative: Disable HMR (If Issues Persist)

If WebSocket issues continue, you can disable HMR in development:

```typescript
// src/admin/vite.config.ts
server: {
  hmr: false, // Disable HMR
},
```

**Note**: This will disable hot reloading, requiring manual page refreshes.

## Verification

After restarting:
1. Open `${SERVER_URL:-http://localhost:1337}/admin`
2. Log in
3. Check browser console:
   - ✅ WebSocket connection should succeed
   - ✅ Vite connection should be established
   - ⚠️ Redux warning may still appear (non-critical)
4. Admin panel should function normally

## Troubleshooting

### If WebSocket Still Fails:
1. Check firewall settings
2. Ensure port 1337 is not blocked
3. Try accessing from `http://127.0.0.1:1337/admin` instead of `localhost`
4. Check if another service is using port 1337

### If Admin Panel Doesn't Load:
1. Rebuild admin panel:
   ```bash
   # Docker
   docker-compose exec strapi npm run build
   
   # Local
   npm run build
   ```
2. Clear Strapi cache:
   ```bash
   # Docker
   docker-compose exec strapi sh -c "rm -rf .cache build dist .strapi"
   
   # Local
   rm -rf .cache build dist .strapi
   ```

