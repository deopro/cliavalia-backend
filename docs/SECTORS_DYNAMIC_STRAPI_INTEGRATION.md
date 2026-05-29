# Sectors Page - Dynamic Strapi 5 Integration

## Overview
The `sectors.vue` page has been completely rewritten to dynamically fetch and display Sector and Category data from Strapi 5 backend using modern, responsive card design with SSR support.

## Implementation Details

### 1. Data Fetching Strategy

#### Composable Used
- **`useAsyncData`** - Nuxt 4's built-in composable for SSR-friendly data fetching
- **Key**: `'sectors'` - Unique key for caching and deduplication
- **Server**: `true` - Enables Server-Side Rendering
- **Lazy**: `false` - Fetches data immediately (not lazy-loaded)

#### API Endpoint
```typescript
const response = await $apiFetch('/api/sectors', {
  params: {
    'populate[categories][fields][0]': 'name',
    'populate[categories][fields][1]': 'slug',
    'sort[0]': 'name:asc'
  }
})
```

**Query Parameters:**
- `populate[categories][fields][0]`: 'name' - Populate category names
- `populate[categories][fields][1]`: 'slug' - Populate category slugs
- `sort[0]`: 'name:asc' - Sort sectors alphabetically

### 2. TypeScript Interfaces

#### Strapi v5 Response Structure
```typescript
interface StrapiCategory {
  id: number
  attributes: {
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    publishedAt: string
  }
}

interface StrapiSector {
  id: number
  attributes: {
    name: string
    slug: string
    createdAt: string
    updatedAt: string
    publishedAt?: string
    categories?: {
      data: StrapiCategory[]
    }
  }
}

interface StrapiResponse {
  data: StrapiSector[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}
```

**Key Points:**
- Strapi v5 wraps data in `data` array
- Each item has `id` and `attributes`
- Nested relations are in `attributes.categories.data`
- All fields properly typed for TypeScript safety

### 3. Component States

#### Loading State (Skeletons)
```vue
<div v-if="status === 'pending'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div v-for="i in 3" :key="i" class="... animate-pulse">
    <!-- Skeleton content -->
  </div>
</div>
```

**Features:**
- Shows 3 animated skeleton cards
- Matches final card layout exactly
- Uses `animate-pulse` for smooth animation
- Respects dark mode

#### Error State
```vue
<div v-else-if="error" class="text-center py-12">
  <UIcon name="i-heroicons-exclamation-triangle" />
  <h3>Erro ao carregar sectores</h3>
  <button @click="refresh()">Tentar Novamente</button>
</div>
```

**Features:**
- Displays error icon and message
- Shows actual error details from API
- Provides "Retry" button using `refresh()` function
- Clean, centered design

#### Empty State
```vue
<div v-else-if="!sectors || sectors.length === 0" class="text-center py-12">
  <UIcon name="i-heroicons-folder-open" />
  <h3>Nenhum sector disponível</h3>
</div>
```

**Features:**
- Shown when no sectors exist in database
- Friendly empty state message
- Folder icon for visual context

### 4. Card Design

#### Modern Sector Card
```vue
<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-md hover:shadow-xl 
     border border-neutral-200 dark:border-neutral-700 overflow-hidden 
     transition-all duration-300 hover:-translate-y-1">
```

**Design Features:**
- White background with dark mode support
- Rounded corners (`rounded-xl`)
- Subtle shadow with hover enhancement (`shadow-md` → `shadow-xl`)
- Smooth hover lift effect (`hover:-translate-y-1`)
- Border for definition

#### Sector Header
```vue
<div class="bg-indigo-50 dark:bg-indigo-900/20 p-6 border-b border-indigo-100 dark:border-indigo-800/30">
  <NuxtLink :to="`/sectors/${sector.attributes.slug}`">
    <div class="shrink-0 w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
      <UIcon :name="getSectorIcon(sector.attributes.name)" />
    </div>
    <h3>{{ sector.attributes.name }}</h3>
  </NuxtLink>
</div>
```

**Design Features:**
- Light indigo background (`bg-indigo-50`) to separate from content
- Icon container with rounded corners
- Dynamic icon based on sector name
- Clickable title linking to sector detail page
- Hover effects on icon and text color

#### Category List
```vue
<NuxtLink :to="`/categories/${category.attributes.slug}`"
  class="flex items-center justify-between px-3 py-2 rounded-lg 
         hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
  <span>{{ category.attributes.name }}</span>
  <UIcon name="i-heroicons-chevron-right" 
    class="group-hover:translate-x-1 transition-all" />
</NuxtLink>
```

**Design Features:**
- Each category is a clickable link
- Subtle hover background
- Chevron icon that slides right on hover
- Color transition on hover
- Well-spaced list layout

### 5. Icon Mapping

#### Dynamic Icon Selection
```typescript
const getSectorIcon = (sectorName: string): string => {
  const iconMap: Record<string, string> = {
    'Bancos': 'i-heroicons-building-library',
    'Telecomunicações': 'i-heroicons-signal',
    'Retalho': 'i-heroicons-shopping-bag',
    'Seguros': 'i-heroicons-shield-check',
    'Saúde': 'i-heroicons-heart',
    'Educação': 'i-heroicons-academic-cap',
    'Tecnologia': 'i-heroicons-cpu-chip',
    'Alimentação': 'i-heroicons-cake',
    'Transporte': 'i-heroicons-truck',
    'Imobiliário': 'i-heroicons-home',
    'Energia': 'i-heroicons-bolt',
    'Entretenimento': 'i-heroicons-film'
  }
  
  return iconMap[sectorName] || 'i-heroicons-building-office'
}
```

**Features:**
- Maps sector names to appropriate Heroicons
- Uses Nuxt UI's `UIcon` component
- Falls back to generic building icon
- Easily extensible for new sectors

### 6. Routing Structure

#### Sector Detail Page
```vue
<NuxtLink :to="`/sectors/${sector.attributes.slug}`">
```
- Route: `/sectors/{slug}`
- Example: `/sectors/bancos`
- Uses sector's slug from Strapi

#### Category Detail Page
```vue
<NuxtLink :to="`/categories/${category.attributes.slug}`">
```
- Route: `/categories/{slug}`
- Example: `/categories/servicos-bancarios`
- Uses category's slug from Strapi

### 7. Responsive Design

#### Grid Layout
```vue
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

**Breakpoints:**
- **Mobile** (`default`): 1 column
- **Tablet** (`md:grid-cols-2`): 2 columns
- **Desktop** (`lg:grid-cols-3`): 3 columns

#### Spacing
- Gap between cards: `gap-6` (1.5rem)
- Card padding: `p-6` (1.5rem)
- Consistent spacing throughout

### 8. Dark Mode Support

All components support dark mode using Tailwind's `dark:` prefix:

```vue
<div class="bg-white dark:bg-neutral-800">
<h3 class="text-gray-900 dark:text-white">
<div class="bg-indigo-50 dark:bg-indigo-900/20">
```

**Color Scheme:**
- **Light Mode**: White backgrounds, indigo accents
- **Dark Mode**: Neutral 800/900 backgrounds, indigo 400 accents

### 9. Performance Optimizations

#### SSR Benefits
- Data fetched on server before page render
- Faster initial page load
- Better SEO (search engines see complete content)
- No loading flicker for initial render

#### Computed Property
```typescript
const sectors = computed(() => {
  return sectorsData.value?.data || []
})
```
- Extracts sectors from Strapi response
- Reactive to data changes
- Provides empty array fallback

#### Caching
- `useAsyncData` automatically caches with key `'sectors'`
- Subsequent navigations use cached data
- Reduces API calls

### 10. Error Handling

#### Network Errors
```typescript
error.message || 'Não foi possível carregar os dados. Tente novamente mais tarde.'
```

#### Empty Data
- Checks for `!sectors || sectors.length === 0`
- Shows friendly empty state

#### Retry Mechanism
```vue
<button @click="refresh()">Tentar Novamente</button>
```
- Uses `refresh()` from `useAsyncData`
- Re-fetches data on click

## Backend Requirements

### Strapi Content Types

#### Sector Schema
```json
{
  "singularName": "sector",
  "pluralName": "sectors",
  "attributes": {
    "name": { "type": "string", "required": true },
    "slug": { "type": "uid", "targetField": "name" },
    "categories": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::category.category",
      "mappedBy": "sector"
    }
  }
}
```

#### Category Schema
```json
{
  "singularName": "category",
  "pluralName": "categories",
  "attributes": {
    "name": { "type": "string", "required": true },
    "slug": { "type": "uid", "targetField": "name" },
    "sector": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::sector.sector",
      "inversedBy": "categories"
    }
  }
}
```

### API Permissions
Ensure the following permissions are enabled in Strapi:

**Public Role:**
- ✅ `sectors.find` - Allow fetching all sectors
- ✅ `sectors.findOne` - Allow fetching single sector
- ✅ `categories.find` - Allow fetching all categories
- ✅ `categories.findOne` - Allow fetching single category

## Testing Checklist

### Functionality
- [x] Page loads without errors
- [x] Sectors fetched from Strapi
- [x] Categories displayed under each sector
- [x] Loading skeletons shown during fetch
- [x] Error state displayed on API failure
- [x] Empty state shown when no data
- [x] Retry button refreshes data
- [x] Sector title links to `/sectors/{slug}`
- [x] Category links to `/categories/{slug}`
- [x] Icons display correctly for each sector

### Design
- [x] Cards have proper shadow and borders
- [x] Hover effects work smoothly
- [x] Indigo header stands out from content
- [x] Chevron icon slides on hover
- [x] Responsive grid (1/2/3 columns)
- [x] Dark mode colors correct
- [x] Typography hierarchy clear
- [x] Spacing consistent

### Performance
- [x] SSR renders content on server
- [x] No hydration errors
- [x] Data cached for navigation
- [x] Fast initial load
- [x] Smooth transitions

## Usage Example

### Sample Data in Strapi

**Sector: Bancos**
- Name: "Bancos"
- Slug: "bancos"
- Categories:
  - "Serviços Bancários" (slug: "servicos-bancarios")
  - "Crédito e Financiamento" (slug: "credito-financiamento")
  - "Seguros" (slug: "seguros")

**Sector: Telecomunicações**
- Name: "Telecomunicações"
- Slug: "telecomunicacoes"
- Categories:
  - "Internet" (slug: "internet")
  - "Telefonia Móvel" (slug: "telefonia-movel")
  - "TV por Assinatura" (slug: "tv-assinatura")

### Expected Output
The page will display cards for each sector with:
- Sector name as title with appropriate icon
- List of categories underneath
- All items clickable with proper routing
- Smooth hover effects

## Future Enhancements

### Potential Additions
1. **Search/Filter**: Add search bar to filter sectors
2. **Business Count**: Display number of businesses per sector/category
3. **Featured Sectors**: Highlight popular sectors
4. **Sector Images**: Add banner images to sector headers
5. **Pagination**: Support paginated sectors if list grows
6. **Sorting Options**: Allow users to sort by name, popularity, etc.
7. **Breadcrumbs**: Add breadcrumb navigation
8. **Meta Tags**: Individual meta tags per sector for SEO

### Performance
1. **Image Optimization**: Use Nuxt Image for sector banners
2. **Lazy Loading**: Lazy load sectors below fold
3. **Prefetching**: Prefetch sector detail pages on hover
4. **Static Generation**: Pre-render sectors at build time

## Troubleshooting

### Common Issues

**Issue**: "Cannot read properties of undefined (reading 'data')"
**Solution**: Check that Strapi is running and `/api/sectors` returns valid data

**Issue**: Categories not showing
**Solution**: Verify `populate` parameter is correct and categories are published in Strapi

**Issue**: Icons not displaying
**Solution**: Ensure `@nuxt/ui` module is installed and configured

**Issue**: Dark mode not working
**Solution**: Check that dark mode toggle is working and classes are properly applied

**Issue**: Links don't work
**Solution**: Verify slug fields exist in Strapi and are properly formatted

## Summary

The sectors page now:
- ✅ Dynamically fetches from Strapi 5
- ✅ Supports SSR for better performance
- ✅ Has loading, error, and empty states
- ✅ Uses modern card design with indigo headers
- ✅ Shows categories with clickable links
- ✅ Includes hover effects and transitions
- ✅ Fully responsive (mobile/tablet/desktop)
- ✅ Supports dark mode
- ✅ Has proper TypeScript typing
- ✅ No linter errors
- ✅ Production-ready

The implementation follows Nuxt 4 best practices and Strapi v5 conventions while providing an excellent user experience with modern UI/UX patterns.

