export const UPLOAD_FUNCTION_TYPES = [
  'review-experiences',
  'user-verification-image',
  'user-verification-doc',
  'user-report-evidence',
  'business-verification',
  'user-profile-media',
  'business-profile-media',
  'payment-evidence',
] as const;

export type UploadFunctionType = (typeof UPLOAD_FUNCTION_TYPES)[number];

export function isUploadFunctionType(value: unknown): value is UploadFunctionType {
  return (
    typeof value === 'string' &&
    (UPLOAD_FUNCTION_TYPES as readonly string[]).includes(value)
  );
}
