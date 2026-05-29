/**
 * Strapi's upload provider calls Cloudinary with only default actionOptions.
 * Cloudinary's `resource_type: 'auto'` often stores PDFs under the **image** API,
 * which yields `.../image/upload/...` URLs and strict delivery rules.
 * For PDFs we force **raw** upload so delivery URLs become `.../raw/upload/...`.
 */
import type { Core } from '@strapi/strapi';

function isPdfUploadFile(file: Record<string, unknown>): boolean {
  const mime = String(file.mime || file.type || '').toLowerCase();
  if (mime === 'application/pdf' || mime === 'application/x-pdf') return true;
  const name = String(file.name || file.originalFilename || '').toLowerCase();
  return name.endsWith('.pdf');
}

export function patchCloudinaryProviderForRawPdfs(strapi: Core.Strapi) {
  const provider = strapi.plugin('upload')?.provider as
    | {
        upload?: (file: unknown, options?: Record<string, unknown>) => Promise<unknown>;
        uploadStream?: (file: unknown, options?: Record<string, unknown>) => Promise<unknown>;
      }
    | undefined;

  if (!provider?.upload && !provider?.uploadStream) {
    strapi.log.warn('[UPLOAD] Cloudinary PDF patch skipped: upload provider not ready');
    return;
  }

  const cfg = strapi.config.get('plugin::upload') as {
    actionOptions?: { upload?: Record<string, unknown>; uploadStream?: Record<string, unknown> };
  };
  const defaultUpload = cfg?.actionOptions?.upload ?? {};
  const defaultStream = cfg?.actionOptions?.uploadStream ?? defaultUpload;

  const mergeUploadOptions = (
    file: unknown,
    base: Record<string, unknown>,
  ): Record<string, unknown> => {
    const f = file as Record<string, unknown>;
    let merged = base;
    if (isPdfUploadFile(f)) {
      merged = { ...merged, resource_type: 'raw' };
    }
    const folderPath = f.path;
    if (typeof folderPath === 'string' && folderPath.trim()) {
      merged = { ...merged, folder: folderPath.trim() };
    }
    return merged;
  };

  if (typeof provider.upload === 'function') {
    const original = provider.upload.bind(provider);
    provider.upload = (file: unknown, options?: Record<string, unknown>) => {
      const base = options ?? defaultUpload;
      const merged = mergeUploadOptions(file, base);
      return original(file, merged);
    };
  }

  if (typeof provider.uploadStream === 'function') {
    const originalStream = provider.uploadStream.bind(provider);
    provider.uploadStream = (file: unknown, options?: Record<string, unknown>) => {
      const base = options ?? defaultStream;
      const merged = mergeUploadOptions(file, base);
      return originalStream(file, merged);
    };
  }

  strapi.log.info(
    '[UPLOAD] Cloudinary provider patched: PDFs use resource_type=raw; file.path sets folder',
  );
}
