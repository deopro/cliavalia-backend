# Fix: Strapi Admin CSP and Vite Connection Issues

## Issues
1. **Content-Security-Policy blocking eval**: `script-src 'self' 'unsafe-inline'` missing `'unsafe-eval'`
2. **Vite server connection lost**: WebSocket connection to Vite dev server failing

## Solutions Applied

### 1. Updated Security Middleware (`config/middlewares.ts`)

Added CSP configuration to allow `'unsafe-eval'` and WebSocket connections:

```typescript
{
  name: 'strapi::security',
  config: {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'connect-src': ["'self'", 'http://localhost:*', 'ws://localhost:*', 'ws://127.0.0.1:*'],
      },
    },
  },
}
```

### 2. Updated Vite Config (`src/admin/vite.config.ts`)

Added HMR (Hot Module Replacement) configuration:

```typescript
server: {
  hmr: {
    protocol: 'ws',
    host: 'localhost',
    port: 5173,
  },
}
```

## Next Steps

1. **Restart Strapi**:
   ```bash
   # If using Docker
   docker-compose restart strapi
   
   # If running locally
   # Stop Strapi (Ctrl+C) and restart:
   npm run develop
   ```

2. **Clear browser cache**:
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
   - Clear cached images and files
   - Or use Incognito/Private window

3. **Verify the fix**:
   - Open `${SERVER_URL:-http://localhost:1337}/admin`
   - Log in
   - Check browser console - CSP errors should be gone
   - Vite connection should be established

## If Issues Persist

### Option 1: Clear Strapi Cache
```bash
# Docker
docker-compose exec strapi sh -c "rm -rf .cache build dist .strapi node_modules/.cache"

# Local
rm -rf .cache build dist .strapi node_modules/.cache
```

### Option 2: Rebuild Admin Panel
```bash
# Docker
docker-compose exec strapi npm run build

# Local
npm run build
```

### Option 3: Check Port Conflicts
Ensure port 5173 is not being used by another application:
```bash
# Windows
netstat -ano | findstr :5173

# Linux/Mac
lsof -i :5173
```

## Notes

- The `'unsafe-eval'` directive is needed for Strapi's admin panel in development mode
- In production, consider using a more restrictive CSP policy
- The WebSocket connection is required for Vite's HMR (Hot Module Replacement) feature

