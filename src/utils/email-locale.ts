export type EmailLocale = "pt" | "en";

const OBJECT_LOCALE_KEYS = [
  "locale",
  "language",
  "preferredLocale",
  "acceptLanguage",
  "accept-language",
] as const;

function normalizeLocaleToken(value: string): EmailLocale | null {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  const primaryToken = normalizedValue
    .split(",")
    .map((token) => token.split(";")[0]?.trim())
    .find(Boolean);

  if (!primaryToken) {
    return null;
  }

  const compactToken = primaryToken.replace(/_/g, "-");

  if (
    compactToken === "en"
    || compactToken.startsWith("en-")
    || compactToken === "english"
  ) {
    return "en";
  }

  if (
    compactToken === "pt"
    || compactToken.startsWith("pt-")
    || compactToken === "portuguese"
    || compactToken === "portugues"
  ) {
    return "pt";
  }

  return null;
}

function extractLocale(candidate: unknown): EmailLocale | null {
  if (!candidate) {
    return null;
  }

  if (typeof candidate === "string") {
    return normalizeLocaleToken(candidate);
  }

  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const resolved = extractLocale(item);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  if (typeof candidate === "object") {
    for (const key of OBJECT_LOCALE_KEYS) {
      const resolved = extractLocale((candidate as Record<string, unknown>)[key]);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

export function normalizeEmailLocale(candidate?: unknown, fallback: EmailLocale = "pt"): EmailLocale {
  return extractLocale(candidate) ?? fallback;
}

export function resolveEmailLocale(...candidates: unknown[]): EmailLocale {
  for (const candidate of candidates) {
    const resolved = extractLocale(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return "pt";
}

export function getLocalizedEmailText(
  localeLike: unknown,
  values: Record<EmailLocale, string>,
): string {
  return values[resolveEmailLocale(localeLike)];
}
