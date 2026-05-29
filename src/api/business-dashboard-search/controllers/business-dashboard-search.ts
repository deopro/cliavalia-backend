type SearchScope = 'all' | 'pages' | 'reviews' | 'locations' | 'settings' | 'reports';
type SearchGroupKey = Exclude<SearchScope, 'all'>;
type SearchItemKind = 'page' | 'review' | 'location' | 'setting' | 'report';

interface SearchItem {
  id: string;
  entityId?: number | string;
  kind: SearchItemKind;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
  preview?: string;
  metadata?: Record<string, unknown>;
}

interface StaticSearchItem {
  id: string;
  kind: SearchItemKind;
  title: string;
  subtitle?: string;
  href: string;
  keywords?: string[];
}

const GROUP_ORDER: SearchGroupKey[] = ['pages', 'reviews', 'locations', 'settings', 'reports'];
const MAX_LIMIT = 8;

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeScope(scope: unknown): SearchScope {
  if (scope === 'pages' || scope === 'reviews' || scope === 'locations' || scope === 'settings' || scope === 'reports') {
    return scope;
  }

  return 'all';
}

function normalizeQuery(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}

function clampLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 6;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function buildSearchPageHref(query: string, scope: SearchGroupKey, selected?: string): string {
  const params = new URLSearchParams();

  if (query) {
    params.set('q', query);
  }

  params.set('scope', scope);

  if (selected) {
    params.set('selected', selected);
  }

  const queryString = params.toString();
  return queryString
    ? `/business/dashboard/search?${queryString}`
    : '/business/dashboard/search';
}

function buildCanonicalReviewHref(reviewId: number | string): string {
  const params = new URLSearchParams();
  params.set('sort', 'new');
  params.set('selectedReview', String(reviewId));
  return `/business/dashboard/reviews?${params.toString()}`;
}

function buildCanonicalLocationHref(locationId: number | string): string {
  const params = new URLSearchParams();
  params.set('selectedLocation', String(locationId));
  return `/business/dashboard/locations?${params.toString()}`;
}

function extractPlainText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => extractPlainText(entry)).filter(Boolean).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => extractPlainText(entry))
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

function excerpt(value: string, maxLength = 140): string {
  const normalized = value.trim().replace(/\s+/g, ' ');

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function scoreText(query: string, ...fields: Array<string | undefined>): number {
  if (!query) {
    return 1;
  }

  const needle = query.toLowerCase();
  const tokens = tokenizeQuery(query);
  let best = 0;

  for (const field of fields) {
    if (!field) {
      continue;
    }

    const haystack = field.toLowerCase();

    if (haystack === needle) {
      best = Math.max(best, 500);
    } else if (haystack.startsWith(needle)) {
      best = Math.max(best, 320);
    } else if (haystack.includes(needle)) {
      best = Math.max(best, 180);
    }

    if (tokens.length > 1) {
      const coveredTokens = tokens.filter((token) => haystack.includes(token)).length;
      if (coveredTokens > 0) {
        best = Math.max(best, coveredTokens * 90 + (coveredTokens === tokens.length ? 140 : 0));
      }
    }
  }

  return best;
}

function mapStaticItems(items: StaticSearchItem[], query: string, limit: number): SearchItem[] {
  const normalizedQuery = query.toLowerCase();

  return items
    .map((item) => {
      const score = scoreText(
        normalizedQuery,
        item.title,
        item.subtitle,
        ...(item.keywords ?? []),
      );

      return {
        ...item,
        score,
      };
    })
    .filter((item) => !query || item.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);
}

function getReviewerName(user: any): string {
  const firstName = String(user?.firstName || '').trim();
  const lastName = String(user?.lastName || '').trim();

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) {
    return firstName;
  }

  return String(user?.username || user?.email || 'Reviewer').trim() || 'Reviewer';
}

function getLocationLabel(entity: any): string | undefined {
  const municipality = entity?.municipality?.name;
  const province = entity?.province?.name;

  if (municipality && province) {
    return `${municipality}, ${province}`;
  }

  return municipality || province || undefined;
}

function buildStaticGroups(business: any, query: string, limit: number, locale: string) {
  const isPt = locale === 'pt' || locale === 'pt-PT' || locale === 'pt-BR';

  const pages: StaticSearchItem[] = [
    {
      id: 'page:dashboard',
      kind: 'page',
      title: 'Dashboard',
      subtitle: isPt
        ? 'Visão geral, KPIs e actividade recente do negócio'
        : 'Overview, KPIs, and recent business activity',
      href: '/business/dashboard',
      keywords: ['painel', 'overview', 'resumo', 'kpi'],
    },
    {
      id: 'page:reviews',
      kind: 'page',
      title: isPt ? 'Gerir avaliações' : 'Manage reviews',
      subtitle: isPt
        ? 'Ver todas as avaliações do negócio com filtros'
        : 'Open all business reviews with canonical filters',
      href: '/business/dashboard/reviews',
      keywords: ['avaliacoes', 'avaliações', 'reviews', 'feedback'],
    },
    {
      id: 'page:reviews-inbox',
      kind: 'page',
      title: isPt ? 'Caixa de entrada' : 'Reviews inbox',
      subtitle: isPt
        ? 'Ver avaliações recebidas e conversas não lidas'
        : 'See incoming reviews and unread conversations',
      href: '/business/dashboard/reviews/inbox',
      keywords: ['caixa de entrada', 'inbox', 'mensagens'],
    },
    {
      id: 'page:reviews-flagged',
      kind: 'page',
      title: isPt ? 'Avaliações sinalizadas' : 'Flagged reviews',
      subtitle: isPt
        ? 'Ver avaliações moderadas e sinalizadas que precisam de atenção'
        : 'Open moderated and flagged reviews that need attention',
      href: '/business/dashboard/reviews/flagged',
      keywords: ['sinalizadas', 'flagged', 'moderacao', 'moderação'],
    },
    {
      id: 'page:locations',
      kind: 'page',
      title: isPt ? 'Localizações' : 'Locations',
      subtitle: business?.name
        ? (isPt
            ? `Gerir localizações e filiais de ${business.name}`
            : `Manage locations and branches for ${business.name}`)
        : (isPt
            ? 'Gerir localizações e filiais do seu negócio'
            : 'Manage locations and branches for your business'),
      href: '/business/dashboard/locations',
      keywords: ['localizacoes', 'localizações', 'locations', 'branches', 'filiais'],
    },
    {
      id: 'page:share-promote',
      kind: 'page',
      title: isPt ? 'Partilhar e promover' : 'Share and promote',
      subtitle: isPt
        ? 'Aumentar visibilidade com ferramentas de partilha e promoção'
        : 'Grow visibility with profile sharing and promotion tools',
      href: '/business/dashboard/share-promote',
      keywords: ['partilhar', 'promover', 'share', 'growth'],
    },
  ];

  const settings: StaticSearchItem[] = [
    {
      id: 'setting:public-profile',
      kind: 'setting',
      title: isPt ? 'Perfil público' : 'Public profile',
      subtitle: isPt
        ? 'Actualizar logótipo, descrição, galeria e detalhes públicos do negócio'
        : 'Update logo, description, gallery, and public business details',
      href: '/business/dashboard/settings/public-profile',
      keywords: ['perfil publico', 'perfil público', 'settings', 'configuracoes', 'configurações'],
    },
  ];

  const reports: StaticSearchItem[] = [
    {
      id: 'report:business-reports',
      kind: 'report',
      title: isPt ? 'Relatórios' : 'Reports',
      subtitle: isPt
        ? 'Acompanhar tendências, classificações, insights e exportar um relatório do negócio'
        : 'Track trends, ratings, insights, and export a business report',
      href: '/business/dashboard/reports',
      keywords: ['reports', 'relatorio', 'relatório', 'relatorios', 'relatórios', 'insights', 'trends', 'export'],
    },
  ];

  return {
    pages: mapStaticItems(pages, query, limit),
    settings: mapStaticItems(settings, query, limit),
    reports: mapStaticItems(reports, query, limit),
  };
}

async function authenticateUserFromToken(ctx: any): Promise<any> {
  if (ctx.state.user) return ctx.state.user;

  const authHeader =
    ctx.request?.header?.authorization ||
    ctx.request?.headers?.authorization;

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.replace('Bearer ', '').trim();
    const jwt = strapi.plugin('users-permissions').service('jwt');
    const payload = await jwt.verify(token);
    const userId = payload.id || payload.user?.id || payload;

    const user = await strapi.db
      .query('plugin::users-permissions.user')
      .findOne({ where: { id: userId }, populate: ['role'] });

    if (user) {
      ctx.state.user = user;
      return user;
    }
  } catch {
    // Token verification failed
  }

  return null;
}

export default {
  async search(ctx: any) {
    const user = await authenticateUserFromToken(ctx);

    if (!user) {
      return ctx.unauthorized('You must be logged in to search the business dashboard.');
    }

    const scope = normalizeScope(ctx.query?.scope);
    const query = normalizeQuery(ctx.query?.q);
    const limit = clampLimit(ctx.query?.limit);

    try {
      const reviewService = strapi.service('api::review.review') as any;
      const business = await reviewService.getOwnedBusinessByUser(user.id);

      if (!business) {
        return ctx.notFound('Business not found for this user.');
      }

      const locale = typeof ctx.query?.locale === 'string' ? ctx.query.locale : 'pt';
      const staticGroups = buildStaticGroups(business, query, limit, locale);
      const shouldQueryReviews = Boolean(query) && (scope === 'all' || scope === 'reviews');
      const shouldQueryLocations = Boolean(query) && (scope === 'all' || scope === 'locations');

      let reviewItems: SearchItem[] = [];
      let locationItems: SearchItem[] = [];

      if (shouldQueryReviews) {
        const reviews = await strapi.db.query('api::review.review').findMany({
          where: {
            business: business.id,
            $or: [
              { title: { $containsi: query } },
              { reviewText: { $containsi: query } },
              { users_permissions_user: { username: { $containsi: query } } },
              { users_permissions_user: { firstName: { $containsi: query } } },
              { users_permissions_user: { lastName: { $containsi: query } } },
            ],
          },
          populate: {
            users_permissions_user: {
              fields: ['id', 'username', 'firstName', 'lastName', 'email'],
            },
            business: {
              fields: ['id', 'name', 'slug'],
            },
          },
          orderBy: { createdAt: 'desc' },
          limit,
        });

        reviewItems = (reviews || [])
          .map((review: any) => {
            const reviewerName = getReviewerName(review.users_permissions_user);
            const reviewBody = extractPlainText(review.reviewText || review.content || '');
            const subtitle = `${reviewerName} • ${review.rating}/5`;
            const score = scoreText(query, review.title, reviewBody, reviewerName) + Number(review.rating || 0);

            return {
              id: `review:${review.id}`,
              entityId: review.id,
              kind: 'review' as const,
              title: String(review.title || 'Review without title').trim(),
              subtitle,
              href: buildCanonicalReviewHref(review.id),
              score,
              preview: excerpt(reviewBody || subtitle),
              metadata: {
                rating: review.rating,
                isRead: review.isRead,
                hasReply: Boolean(review.businessReply && String(review.businessReply).trim()),
                canonicalHref: buildCanonicalReviewHref(review.id),
              },
            };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, limit);
      }

      if (shouldQueryLocations) {
        const agencies = await strapi.db.query('api::agency.agency').findMany({
          where: {
            business: business.id,
            $or: [
              { name: { $containsi: query } },
              { address: { $containsi: query } },
              { municipality: { name: { $containsi: query } } },
              { province: { name: { $containsi: query } } },
            ],
          },
          populate: {
            municipality: { fields: ['id', 'name'] },
            province: { fields: ['id', 'name'] },
          },
          orderBy: { updatedAt: 'desc' },
          limit,
        });

        locationItems = (agencies || [])
          .map((agency: any) => {
            const locationLabel = getLocationLabel(agency);
            const score = scoreText(query, agency.name, agency.address, locationLabel) + (agency.approvalStatus === 'approved' ? 4 : 0);

            return {
              id: `location:${agency.id}`,
              entityId: agency.id,
              kind: 'location' as const,
              title: String(agency.name || 'Location').trim(),
              subtitle: locationLabel || agency.address || 'Business location',
              href: buildCanonicalLocationHref(agency.id),
              score,
              preview: excerpt(String(agency.address || locationLabel || '')),
              metadata: {
                approvalStatus: agency.approvalStatus || null,
                location: locationLabel || null,
                canonicalHref: buildCanonicalLocationHref(agency.id),
              },
            };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, limit);
      }

      const groups = GROUP_ORDER
        .filter((groupKey) => scope === 'all' || scope === groupKey)
        .map((groupKey) => {
          if (groupKey === 'pages') {
            return { key: groupKey, total: staticGroups.pages.length, items: staticGroups.pages };
          }

          if (groupKey === 'settings') {
            return { key: groupKey, total: staticGroups.settings.length, items: staticGroups.settings };
          }

          if (groupKey === 'reports') {
            return { key: groupKey, total: staticGroups.reports.length, items: staticGroups.reports };
          }

          if (groupKey === 'reviews') {
            return { key: groupKey, total: reviewItems.length, items: reviewItems };
          }

          return { key: groupKey, total: locationItems.length, items: locationItems };
        });

      const topResults = groups
        .flatMap((group) => group.items)
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
        .slice(0, limit);

      ctx.body = {
        data: {
          query,
          scope,
          topResults,
          groups,
          meta: {
            business: {
              id: business.id,
              name: business.name,
              slug: business.slug,
            },
          },
        },
      };
    } catch (error: any) {
      strapi.log.error('[BUSINESS-DASHBOARD-SEARCH] search error:', error);
      return ctx.internalServerError('Error searching the business dashboard.');
    }
  },
};