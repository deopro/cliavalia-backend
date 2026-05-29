# Sectors Page - Quick Start Guide

## What Changed?

The `sectors.vue` page now **dynamically fetches data from Strapi 5** instead of using hard-coded mock data.

## Before & After

### Before ❌
```typescript
const sectors = ref([
  { id: 1, name: 'Bancos', slug: 'bancos', ... }
  // Hard-coded data
])
```

### After ✅
```typescript
const { data, status, error } = await useAsyncData('sectors', async () => {
  const response = await $apiFetch('/api/sectors', {
    params: { 'populate[categories]': true }
  })
  return response
})
```

## Quick Setup

### 1. Ensure Strapi is Running
```bash
cd cliavalia-backend
docker-compose up -d
```

### 2. Check API Permissions
Navigate to: `${SERVER_URL:-http://localhost:1337}/admin/settings/users-permissions/roles`

**Public Role** should have:
- ✅ `sectors.find`
- ✅ `sectors.findOne`
- ✅ `categories.find`
- ✅ `categories.findOne`

### 3. Add Test Data in Strapi Admin

**Create Sector:**
1. Go to Content Manager → Sectors → Create new entry
2. Fill in:
   - Name: "Bancos"
   - (Slug will auto-generate)
3. Click **Save** and **Publish**

**Create Category:**
1. Go to Content Manager → Categories → Create new entry
2. Fill in:
   - Name: "Serviços Bancários"
   - Select Sector: "Bancos"
3. Click **Save** and **Publish**

### 4. Test the Page
```bash
cd cliavalia-frontend
npm run dev
```

Visit: `http://localhost:3000/sectors`

## Features

### ✨ Modern Design
- **Card Layout**: Clean, modern sector cards
- **Indigo Headers**: Sector names stand out with light indigo background
- **Category List**: Nested categories displayed below each sector
- **Icons**: Dynamic icons based on sector name (Heroicons)
- **Hover Effects**: Smooth transitions and lift on hover

### 🎨 UI States

#### Loading
```
┌─────────────────┐
│ ▓▓▓▓▓▓  ▓▓▓▓▓  │  <- Animated skeleton
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│ ▓▓▓▓▓  ▓▓▓▓▓▓  │
└─────────────────┘
```

#### Loaded
```
┌─────────────────┐
│ 🏦 Bancos       │  <- Clickable header
├─────────────────┤
│ Categorias:     │
│ • Crédito       │  <- Clickable category
│ • Seguros       │
└─────────────────┘
```

#### Error
```
    ⚠️
Erro ao carregar sectores
[Tentar Novamente]  <- Button to retry
```

#### Empty
```
    📂
Nenhum sector disponível
```

### 🔗 Routing

**Sector Page**: `/sectors/{slug}`
- Example: `/sectors/bancos`
- Links from sector title

**Category Page**: `/categories/{slug}`
- Example: `/categories/servicos-bancarios`
- Links from category items

### 📱 Responsive

```
Mobile    Tablet    Desktop
[Card]    [Card][Card]    [Card][Card][Card]
[Card]    [Card][Card]    [Card][Card][Card]
[Card]    [Card][Card]    [Card][Card][Card]
```

## API Details

### Request
```http
GET ${SERVER_URL:-http://localhost:1337}/api/sectors
  ?populate[categories][fields][0]=name
  &populate[categories][fields][1]=slug
  &sort[0]=name:asc
```

### Response
```json
{
  "data": [
    {
      "id": 1,
      "attributes": {
        "name": "Bancos",
        "slug": "bancos",
        "categories": {
          "data": [
            {
              "id": 1,
              "attributes": {
                "name": "Serviços Bancários",
                "slug": "servicos-bancarios"
              }
            }
          ]
        }
      }
    }
  ]
}
```

## Icon Mapping

The page automatically selects icons based on sector name:

| Sector | Icon |
|--------|------|
| Bancos | 🏦 building-library |
| Telecomunicações | 📡 signal |
| Retalho | 🛍️ shopping-bag |
| Seguros | 🛡️ shield-check |
| Saúde | ❤️ heart |
| Educação | 🎓 academic-cap |
| Tecnologia | 💻 cpu-chip |
| Alimentação | 🍰 cake |
| Transporte | 🚚 truck |
| Imobiliário | 🏠 home |
| Energia | ⚡ bolt |
| Entretenimento | 🎬 film |
| *Default* | 🏢 building-office |

## Dark Mode

Automatically supports dark mode:
- Light backgrounds → Dark backgrounds
- Dark text → Light text
- Indigo accents adapt

## Common Issues

### ❌ Page shows "Erro ao carregar sectores"
**Fix**: Check that Strapi is running:
```bash
docker ps | grep strapi
```

### ❌ Empty state shows despite data in Strapi
**Fix**: Check API permissions (see Step 2 above)

### ❌ Categories not showing
**Fix**: Ensure categories are published in Strapi Admin

### ❌ Icons not displaying
**Fix**: `@nuxt/ui` should be in `nuxt.config.ts`:
```typescript
modules: ["@nuxt/ui"]
```

## Development Tips

### Add New Sector
```typescript
// In Strapi Admin:
1. Content Manager → Sectors → Create
2. Name: "Your Sector"
3. Save & Publish

// Icon will auto-select based on name
// Or add custom mapping in getSectorIcon()
```

### Customize Card Design
```vue
<!-- In sectors.vue -->
<div class="bg-indigo-50 dark:bg-indigo-900/20">
      ↑ Change color here
```

### Add Business Count
```typescript
// In Strapi schema, add:
"businessCount": { "type": "integer", "default": 0 }

// Then display in card:
<span>{{ sector.attributes.businessCount }}+ empresas</span>
```

## Next Steps

1. **Create Sector Detail Page**: `pages/sectors/[slug].vue`
2. **Create Category Detail Page**: `pages/categories/[slug].vue`
3. **Add Search**: Filter sectors by name
4. **Add Descriptions**: Show sector descriptions in cards
5. **Add Images**: Upload sector banner images

## Summary

✅ **Dynamic**: Fetches from Strapi (no mock data)  
✅ **Modern**: Clean card design with animations  
✅ **Responsive**: Works on mobile, tablet, desktop  
✅ **Fast**: SSR-enabled for quick initial load  
✅ **Accessible**: Proper states (loading, error, empty)  
✅ **Dark Mode**: Full theme support  

The page is production-ready and follows Nuxt 4 + Strapi v5 best practices!

