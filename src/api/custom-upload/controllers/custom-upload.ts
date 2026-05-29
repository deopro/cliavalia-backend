import { isUploadFunctionType } from '../../../constants/upload-function-types';
import { uploadFilesWithFunctionType } from '../../../utils/upload-with-function-type';

function normalizeSingleFile(input: unknown): unknown {
  if (!input) return null;
  return Array.isArray(input) ? input[0] : input;
}

export default {
  async upload(ctx) {
    const user = ctx.state.user;
    if (!user?.id) {
      return ctx.unauthorized('You must be logged in to upload files.');
    }

    const body = ctx.request?.body ?? {};
    const functionType = body.functionType;

    if (!functionType || typeof functionType !== 'string') {
      return ctx.badRequest('functionType is required.');
    }

    if (!isUploadFunctionType(functionType)) {
      return ctx.badRequest(
        `Invalid functionType. Allowed values: ${[
          'review-experiences',
          'user-verification-image',
          'user-verification-doc',
          'user-report-evidence',
          'business-verification',
          'user-profile-media',
          'business-profile-media',
          'payment-evidence',
        ].join(', ')}`,
      );
    }

    const rawFiles = ctx.request.files?.files;
    if (!rawFiles) {
      return ctx.badRequest('At least one file is required (field name: files).');
    }

    const files = Array.isArray(rawFiles) ? rawFiles : [rawFiles];
    const firstFile = normalizeSingleFile(rawFiles) as
      | { originalFilename?: string; name?: string }
      | null;
    const defaultName =
      firstFile?.originalFilename || firstFile?.name || 'upload';

    try {
      const uploaded = await uploadFilesWithFunctionType(
        strapi,
        files,
        functionType,
        { name: defaultName, alternativeText: null, caption: null },
      );

      return ctx.send(uploaded);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      strapi.log.error('[custom-upload] Upload failed:', message);

      if (message === 'No files provided') {
        return ctx.badRequest(message);
      }

      return ctx.internalServerError('Failed to upload file. Please try again.');
    }
  },
};
