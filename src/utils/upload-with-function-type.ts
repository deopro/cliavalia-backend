import type { Core } from '@strapi/strapi';
import {
  isUploadFunctionType,
  type UploadFunctionType,
} from '../constants/upload-function-types';

type UploadableFile = Record<string, unknown>;

function normalizeFiles(input: unknown): UploadableFile[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list.filter(Boolean) as UploadableFile[];
}

export async function uploadFilesWithFunctionType(
  strapi: Core.Strapi,
  rawFiles: unknown,
  functionType: UploadFunctionType,
  fileInfo?: {
    name?: string;
    alternativeText?: string | null;
    caption?: string | null;
  },
) {
  if (!isUploadFunctionType(functionType)) {
    throw new Error('Invalid functionType');
  }

  const files = normalizeFiles(rawFiles);

  if (files.length === 0) {
    throw new Error('No files provided');
  }

  // Strapi upload service reads `path` from `data` (metas), not from the multipart file.
  // @strapi/provider-upload-cloudinary maps entity.path → Cloudinary `folder`.
  return strapi.plugins.upload.services.upload.upload({
    data: {
      fileInfo: {
        name: fileInfo?.name ?? 'upload',
        alternativeText: fileInfo?.alternativeText ?? null,
        caption: fileInfo?.caption ?? null,
      },
      path: functionType,
    },
    files,
  });
}
