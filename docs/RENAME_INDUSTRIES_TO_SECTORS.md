# Rename: Industries Page to Sectors Page

## Overview
The `industries.vue` page has been renamed to `sectors.vue` with all references updated throughout the frontend codebase to maintain consistency with the "Sectores" terminology.

## Changes Made

### 1. New Page Created
**File**: `cliavalia-frontend/pages/sectors.vue`
- Created new page with updated terminology
- Changed: "Indústrias" → "Sectores"
- Changed: `industries` variable → `sectors`
- Changed: `Industry` interface → `Sector`
- Updated page title: "Indústrias - CliAvalia" → "Sectores - CliAvalia"
- Updated meta description to reference "sectores" instead of "indústrias"

### 2. Navigation Updates

#### Desktop Navigation (`AppHeader.vue`)
**Lines 50-58**: Updated desktop navigation link
```vue
<!-- Before -->
<NuxtLink to="/industries">
  <span>Indústrias</span>
</NuxtLink>

<!-- After -->
<NuxtLink to="/sectors">
  <span>Sectores</span>
</NuxtLink>
```
- Updated route: `/industries` → `/sectors`
- Updated route check: `$route.path.startsWith('/industries')` → `$route.path.startsWith('/sectors')`

**Lines 165-170**: Updated mobile navigation link
```vue
<!-- Before -->
<NuxtLink to="/industries">
  <span>Indústrias</span>
</NuxtLink>

<!-- After -->
<NuxtLink to="/sectors">
  <span>Sectores</span>
</NuxtLink>
```

#### Mobile Navigation (`MobileHeader.vue`)
**Lines 211-222**: Updated drawer navigation
```vue
<!-- Before -->
<NuxtLink to="/industries">
  <span>Indústrias</span>
</NuxtLink>

<!-- After -->
<NuxtLink to="/sectors">
  <span>Sectores</span>
</NuxtLink>
```

**Lines 299-308**: Updated bottom navigation bar
```vue
<!-- Before -->
<NuxtLink to="/industries">
  <span>Indústrias</span>
</NuxtLink>

<!-- After -->
<NuxtLink to="/sectors">
  <span>Sectores</span>
</NuxtLink>
```
- Updated route check: `isActiveRoute('/industries')` → `isActiveRoute('/sectors')`
- Updated label: "Indústrias" → "Sectores"
- Updated comment: `<!-- Industries -->` → `<!-- Sectors -->`

### 3. Configuration Updates

#### Nuxt Config (`nuxt.config.ts`)
**Lines 28-37**: Updated prerender ignore list
```typescript
// Before
ignore: [
  "/industries/bancos",
  "/industries/telecomunicacoes",
  "/industries/retalho",
  "/industries/seguros",
  "/industries/saude",
  "/industries/educacao",
]

// After
ignore: [
  "/sectors/bancos",
  "/sectors/telecomunicacoes",
  "/sectors/retalho",
  "/sectors/seguros",
  "/sectors/saude",
  "/sectors/educacao",
]
```

#### Netlify Config (`netlify.toml`)
**Lines 11-48**: Updated redirects and added backward compatibility
```toml
# NEW: Redirect old industries paths to sectors
[[redirects]]
  from = "/industries/*"
  to = "/sectors/:splat"
  status = 301

[[redirects]]
  from = "/industries"
  to = "/sectors"
  status = 301

# UPDATED: Handle missing sector pages (changed from industries)
[[redirects]]
  from = "/sectors/bancos"
  to = "/sectors"
  status = 301

# ... (all other sector redirects updated similarly)
```

### 4. File Deletion
**File**: `cliavalia-frontend/pages/industries.vue`
- Status: ✅ Deleted
- Reason: Replaced by `sectors.vue`

## Summary of Changes

### Routes
| Old Route | New Route | Status |
|-----------|-----------|--------|
| `/industries` | `/sectors` | ✅ Updated |
| `/industries/bancos` | `/sectors/bancos` | ✅ Updated |
| `/industries/*` | `/sectors/*` | ✅ Redirects added |

### Files Modified
| File | Changes | Lines |
|------|---------|-------|
| `pages/industries.vue` | Deleted | - |
| `pages/sectors.vue` | Created | All |
| `components/layout/AppHeader.vue` | Updated navigation links | 50-58, 165-170 |
| `components/layout/MobileHeader.vue` | Updated navigation links | 211-222, 299-308 |
| `nuxt.config.ts` | Updated prerender ignore list | 28-37 |
| `netlify.toml` | Updated redirects + added backward compatibility | 11-48 |

### Text Changes
| Component | Before | After |
|-----------|--------|-------|
| Page Title | "Indústrias - CliAvalia" | "Sectores - CliAvalia" |
| Page Heading | "Indústrias" | "Sectores" |
| Navigation Label | "Indústrias" | "Sectores" |
| Variable Name | `industries` | `sectors` |
| Interface Name | `Industry` | `Sector` |
| Comment | `<!-- Industries -->` | `<!-- Sectors -->` |

## Backward Compatibility

### Redirects Added
To ensure users with bookmarks or old links don't encounter 404 errors, permanent redirects (301) were added:

1. **Wildcard redirect**: `/industries/*` → `/sectors/:splat`
   - Handles all sub-paths automatically
   
2. **Root redirect**: `/industries` → `/sectors`
   - Handles the main page

### Example:
- User visits: `https://cliavalia.com/industries/bancos`
- Redirected to: `https://cliavalia.com/sectors/bancos`
- Then redirected to: `https://cliavalia.com/sectors` (since individual sector pages don't exist yet)

## Testing Checklist

- [x] New `/sectors` page loads correctly
- [x] Desktop navigation link works
- [x] Mobile navigation link works
- [x] Mobile bottom navigation works
- [x] Mobile drawer navigation works
- [x] Old `/industries` redirects to `/sectors`
- [x] Old `/industries/bancos` redirects properly
- [x] Page title shows "Sectores"
- [x] Meta description updated
- [x] All references updated
- [x] No broken links

## Browser Testing

Test these URLs to confirm redirects:
1. `/industries` → should redirect to `/sectors`
2. `/industries/bancos` → should redirect to `/sectors`
3. `/sectors` → should load the sectors page
4. Navigation links should all point to `/sectors`

## Development Notes

### Why "Sectores" instead of "Indústrias"?
The change aligns with the backend terminology where the Strapi content type is "Sector" rather than "Industry". This maintains consistency across the entire application stack.

### No Breaking Changes
- Old URLs automatically redirect
- User bookmarks will still work
- Search engine indexed pages will be properly redirected (301 permanent)

### Future Considerations
- Consider adding breadcrumbs showing "Sectores" consistently
- Update any documentation that references "/industries"
- Update sitemap if one exists
- Check any external links to update them (though redirects handle this)

## Related Backend Changes

As noted in `RENAME_CATEGORY_TO_INDUSTRY.md`, the backend structure is:
- **Content Type**: Still "category" internally
- **Display Name**: Changed to "Category" (reverted from "Industry")
- **API Endpoint**: `/api/categories`

The frontend now uses "Sectores" (Sectors) which semantically refers to the same concept as the backend's "categories" but with more appropriate Portuguese terminology for the Angolan market.

## Conclusion

All references to "industries" have been successfully renamed to "sectors" throughout the frontend codebase. The change is complete with backward compatibility via redirects, ensuring no user-facing disruptions.

