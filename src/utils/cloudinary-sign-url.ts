/**
 * Cloudinary often returns 401 (X-Cld-Error: deny or ACL failure) for unsigned PDF URLs
 * when PDF/ZIP delivery is restricted. Admin dashboard should serve time-limited signed URLs.
 *
 * Uses `provider_metadata.resource_type` from the upload plugin when present so the signed
 * URL matches how the asset was stored (image vs raw vs video).
 */
import { v2 as cloudinary } from 'cloudinary';

export type ParsedCloudinaryUrl = {
  cloudName: string;
  resourceType: 'image' | 'video' | 'raw';
  version?: string;
  publicId: string;
};

function parseTailAfterUpload(tail: string[]): { version?: string; publicId: string } | null {
  if (tail.length === 0) return null;
  if (/^v\d+$/i.test(tail[0]!)) {
    const version = tail[0]!.replace(/^v/i, '');
    const rest = tail.slice(1);
    if (rest.length === 0) return null;
    return { version, publicId: rest.map((s) => decodeURIComponent(s)).join('/') };
  }
  if (tail.length >= 2 && /^v\d+$/i.test(tail[1]!)) {
    const version = tail[1]!.replace(/^v/i, '');
    const rest = tail.slice(2);
    if (rest.length === 0) return null;
    return { version, publicId: rest.map((s) => decodeURIComponent(s)).join('/') };
  }
  return { publicId: tail.map((s) => decodeURIComponent(s)).join('/') };
}

export function parseCloudinaryDeliveryUrl(urlStr: string): ParsedCloudinaryUrl | null {
  try {
    const u = new URL(urlStr);
    if (!u.hostname.toLowerCase().includes('cloudinary')) return null;
    const segments = u.pathname.split('/').filter(Boolean);
    const upIdx = segments.indexOf('upload');
    if (upIdx < 2 || upIdx >= segments.length - 1) return null;
    const cloudName = segments[0]!;
    const resourceType = segments[1]!;
    if (resourceType !== 'image' && resourceType !== 'video' && resourceType !== 'raw') {
      return null;
    }
    const tail = segments.slice(upIdx + 1);
    const parsed = parseTailAfterUpload(tail);
    if (!parsed) return null;
    return {
      cloudName,
      resourceType: resourceType as ParsedCloudinaryUrl['resourceType'],
      version: parsed.version,
      publicId: parsed.publicId,
    };
  } catch {
    return null;
  }
}

let configuredForCloud: string | null = null;

function ensureConfigMatchesCloud(cloudNameFromUrl: string): boolean {
  const envName = process.env.CLOUDINARY_NAME;
  if (!envName || envName !== cloudNameFromUrl) {
    return false;
  }
  if (configuredForCloud !== envName) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_NAME,
      api_key: process.env.CLOUDINARY_KEY,
      api_secret: process.env.CLOUDINARY_SECRET,
    });
    configuredForCloud = envName;
  }
  return true;
}

function readProviderResourceType(
  media: Record<string, unknown>,
): ParsedCloudinaryUrl['resourceType'] | undefined {
  const pm = (media.provider_metadata ?? media.providerMetadata) as
    | { resource_type?: string }
    | undefined;
  const rt = pm?.resource_type;
  if (rt === 'raw' || rt === 'image' || rt === 'video') return rt;
  return undefined;
}

/** Build a signed HTTPS URL for the same asset (original file, no UI transformations). */
export function cloudinarySignedDeliveryUrl(
  originalUrl: string,
  opts?: { resourceType?: ParsedCloudinaryUrl['resourceType'] },
): string | null {
  const parsed = parseCloudinaryDeliveryUrl(originalUrl);
  if (!parsed) return null;
  if (!ensureConfigMatchesCloud(parsed.cloudName)) return null;
  const resourceType = opts?.resourceType ?? parsed.resourceType;
  try {
    const cloudinaryOpts: {
      resource_type: ParsedCloudinaryUrl['resourceType'];
      secure: boolean;
      sign_url: boolean;
      version?: string;
    } = {
      resource_type: resourceType,
      secure: true,
      sign_url: true,
    };
    if (parsed.version) {
      cloudinaryOpts.version = parsed.version;
    }
    return cloudinary.url(parsed.publicId, cloudinaryOpts);
  } catch {
    return null;
  }
}

export function isPdfMediaUrl(url: string, mime?: string, name?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf' || m === 'application/x-pdf') return true;
  if ((name || '').toLowerCase().endsWith('.pdf')) return true;
  return /\.pdf($|\?)/i.test(url);
}

async function enrichUploadFileFromDb(
  strapi: { db?: { query: (uid: string) => { findOne: (args: unknown) => Promise<unknown> } } },
  media: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hasPm =
    (media.provider_metadata && typeof media.provider_metadata === 'object') ||
    (media.providerMetadata && typeof media.providerMetadata === 'object');
  if (hasPm) return media;
  const rawId = media.id;
  if (rawId == null || !strapi?.db) return media;
  const id = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isFinite(id)) return media;
  try {
    const row = (await strapi.db.query('plugin::upload.file').findOne({
      where: { id },
    })) as { provider_metadata?: unknown } | null;
    if (row?.provider_metadata && typeof row.provider_metadata === 'object') {
      return { ...media, provider_metadata: row.provider_metadata };
    }
  } catch {
    /* ignore */
  }
  return media;
}

export function signCloudinaryPdfMediaFieldSynced(
  media: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!media || typeof media !== 'object') return media;
  const url = media.url;
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return media;
  const mime = typeof media.mime === 'string' ? media.mime : undefined;
  const name = typeof media.name === 'string' ? media.name : undefined;
  if (!isPdfMediaUrl(url, mime, name)) return media;

  const parsed = parseCloudinaryDeliveryUrl(url);
  const metaRt = readProviderResourceType(media);
  const resourceType = metaRt ?? parsed?.resourceType;
  const signed = cloudinarySignedDeliveryUrl(url, resourceType ? { resourceType } : undefined);
  if (!signed) return media;
  return { ...media, url: signed };
}

export async function signCloudinaryPdfMediaFieldAsync(
  strapi: {
    db?: { query: (uid: string) => { findOne: (args: unknown) => Promise<unknown> } };
  },
  media: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown> | null | undefined> {
  if (!media || typeof media !== 'object') return media;
  const enriched = await enrichUploadFileFromDb(strapi, media);
  return signCloudinaryPdfMediaFieldSynced(enriched);
}

export async function signBusinessClaimCloudinaryPdfsAsync(
  strapi: {
    db?: { query: (uid: string) => { findOne: (args: unknown) => Promise<unknown> } };
  },
  claim: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!claim || typeof claim !== 'object') return claim;
  const out = { ...claim };
  for (const field of ['licenseFile', 'officialLetter', 'idCopy'] as const) {
    const v = out[field];
    if (v && typeof v === 'object') {
      out[field] = await signCloudinaryPdfMediaFieldAsync(strapi, v as Record<string, unknown>);
    }
  }
  return out;
}
