/**
 * Review lifecycle hooks
 *
 * These hooks enforce business rules at the data layer:
 * - Two-layer moderation pipeline:
 *   1. Layer 1: OpenAI Moderation API (safety check for hate, harassment, violence, self-harm, sexual content)
 *   2. Layer 2: GPT-4o-mini quality check (spam, PII, relevance, PT-BR/PT-PT language sensitivity)
 * - Prevent duplicate reviews (one review per user per business)
 * - Validate rating range
 */

import { OpenAI, toFile } from "openai";
import { computeUserLevel } from "../../utils/computeUserLevel";

const MODERATION_MODEL = "omni-moderation-latest";
const IMAGE_SEXUAL_SCORE_THRESHOLD = 0.18;

type ModerationInputItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type PhotoRef =
  | { kind: "id"; value: number }
  | { kind: "documentId"; value: string };

/**
 * Translate OpenAI moderation category names to Portuguese
 */
function translateModerationCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    hate: "Discurso de Ódio",
    "hate/threatening": "Discurso de Ódio/Ameaçador",
    harassment: "Assédio",
    "harassment/threatening": "Assédio/Ameaçador",
    "self-harm": "Autoflagelação",
    "self-harm/intent": "Intenção de Autoflagelação",
    "self-harm/instructions": "Instruções de Autoflagelação",
    sexual: "Conteúdo Sexual",
    "sexual/minors": "Conteúdo Sexual com Menores",
    violence: "Violência",
    "violence/graphic": "Violência Gráfica",
    spam: "Spam",
    illegal: "Ilegal",
    "illegal/violent": "Ilegal/Violento",
  };

  return categoryMap[category.toLowerCase()] || category;
}

/**
 * Remove AI/IA references from moderation messages
 * Users should not see that AI is being used for moderation
 */
function sanitizeModerationReason(reason: string): string {
  if (!reason) return reason;
  
  // Remove references to AI/IA and related terms (case-insensitive)
  let sanitized = reason
    .replace(/\bIA\b/gi, "")
    .replace(/\bAI\b/gi, "")
    .replace(/\binteligência artificial\b/gi, "")
    .replace(/\bartificial intelligence\b/gi, "")
    .replace(/\bmodelo de contexto\b/gi, "")
    .replace(/\bcontext model\b/gi, "")
    .replace(/\bmoderador\b/gi, "sistema")
    .replace(/\bmoderator\b/gi, "system")
    // Clean up double spaces, leading/trailing punctuation
    .replace(/\s+/g, " ")
    .replace(/^[:\s,.-]+/, "")
    .replace(/[:\s,.-]+$/, "")
    .trim();
  
  // Remove phrases that reference AI confirmation
  sanitized = sanitized
    .replace(/Confirmação\s+da\s+(IA|AI|inteligência artificial|modelo de contexto).*?:\s*/gi, "")
    .replace(/Confirmation\s+by\s+(AI|IA|artificial intelligence|context model).*?:\s*/gi, "")
    .replace(/Inicialmente\s+sinalizada.*?(IA|AI|inteligência artificial|modelo de contexto).*?,\s*mas\s+aprovada.*?\.\s*Razão:\s*/gi, "")
    .replace(/Initially\s+flagged.*?(AI|IA|artificial intelligence|context model).*?,\s+but\s+approved.*?\.\s*Reason:\s*/gi, "")
    .trim();
  
  // If the result is empty or too short, provide a generic message
  if (!sanitized || sanitized.length < 3) {
    return "Conteúdo viola as políticas da plataforma.";
  }
  
  return sanitized;
}

// Lazy initialization of OpenAI client
let openai: OpenAI | null = null;

/**
 * Get or initialize the OpenAI client
 * Returns null if API key is not configured
 */
function getOpenAIClient(): OpenAI | null {
  if (openai) {
    return openai;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    openai = new OpenAI({
      apiKey: apiKey,
    });
    return openai;
  } catch (error) {
    // Log warning if possible, but don't fail if strapi is not available
    if (typeof console !== "undefined" && console.warn) {
      console.warn("Failed to initialize OpenAI client:", error);
    }
    return null;
  }
}

function getServerUrl(): string {
  return (
    process.env.SERVER_URL ||
    process.env.PUBLIC_URL ||
    process.env.APP_URL ||
    process.env.KINSTA_URL ||
    (strapi as any).config?.get?.("server.url") ||
    ""
  );
}

function normalizeMediaUrl(url: string): string {
  if (!url) return url;

  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) {
    return url;
  }

  const serverUrl = getServerUrl().replace(/\/$/, "");
  if (!serverUrl) {
    return url.startsWith("/") ? url : `/${url}`;
  }

  return url.startsWith("/") ? `${serverUrl}${url}` : `${serverUrl}/${url}`;
}

function getMediaId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value && typeof value === "object") {
    const record = value as { id?: unknown; documentId?: unknown };
    if (typeof record.id === "number" && Number.isFinite(record.id)) {
      return record.id;
    }
    if (typeof record.documentId === "string" && record.documentId.trim()) {
      const parsed = Number(record.documentId);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

function getMediaDocumentId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const record = value as { documentId?: unknown };
    if (typeof record.documentId === "string" && record.documentId.trim()) {
      return record.documentId.trim();
    }
  }

  return null;
}

function unwrapMediaRelationPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const relationPayload = value as {
      connect?: unknown[];
      set?: unknown[];
      data?: unknown[];
    };

    if (Array.isArray(relationPayload.set)) {
      return relationPayload.set;
    }
    if (Array.isArray(relationPayload.connect)) {
      return relationPayload.connect;
    }
    if (Array.isArray(relationPayload.data)) {
      return relationPayload.data;
    }
  }

  return [];
}

function extractPhotoRefs(experiencePhotos: unknown): PhotoRef[] {
  const payloadItems = unwrapMediaRelationPayload(experiencePhotos);
  const refs: PhotoRef[] = [];
  const seen = new Set<string>();

  for (const item of payloadItems) {
    const id = getMediaId(item);
    if (id !== null) {
      const key = `id:${id}`;
      if (!seen.has(key)) {
        refs.push({ kind: "id", value: id });
        seen.add(key);
      }
      continue;
    }

    const documentId = getMediaDocumentId(item);
    if (documentId) {
      const key = `documentId:${documentId}`;
      if (!seen.has(key)) {
        refs.push({ kind: "documentId", value: documentId });
        seen.add(key);
      }
    }
  }

  return refs;
}

async function resolveReviewImageUrls(experiencePhotos: unknown): Promise<string[]> {
  const refs = extractPhotoRefs(experiencePhotos);
  if (refs.length === 0) {
    return [];
  }

  const photoIds = refs.filter((ref): ref is { kind: "id"; value: number } => ref.kind === "id").map((ref) => ref.value);
  const photoDocumentIds = refs
    .filter((ref): ref is { kind: "documentId"; value: string } => ref.kind === "documentId")
    .map((ref) => ref.value);

  try {
    const whereClauses: Array<Record<string, unknown>> = [];
    if (photoIds.length > 0) {
      whereClauses.push({ id: { $in: photoIds } });
    }
    if (photoDocumentIds.length > 0) {
      whereClauses.push({ documentId: { $in: photoDocumentIds } });
    }

    if (whereClauses.length === 0) {
      return [];
    }

    const fileRecords = await (strapi as any).db.query("plugin::upload.file").findMany({
      where: whereClauses.length === 1 ? whereClauses[0] : { $or: whereClauses },
      select: ["id", "documentId", "url", "mime"],
    });

    const fileById = new Map<number, { url?: string | null; mime?: string | null }>();
    const fileByDocumentId = new Map<string, { url?: string | null; mime?: string | null }>();
    for (const fileRecord of fileRecords || []) {
      if (typeof fileRecord?.id === "number") {
        fileById.set(fileRecord.id, fileRecord);
      }
      if (typeof fileRecord?.documentId === "string" && fileRecord.documentId) {
        fileByDocumentId.set(fileRecord.documentId, fileRecord);
      }
    }

    return refs
      .map((ref) => {
        if (ref.kind === "id") {
          return fileById.get(ref.value);
        }
        return fileByDocumentId.get(ref.value);
      })
      .filter((fileRecord): fileRecord is { url?: string | null; mime?: string | null } => !!fileRecord)
      .filter((fileRecord) => typeof fileRecord.mime === "string" && fileRecord.mime.startsWith("image/"))
      .map((fileRecord) => normalizeMediaUrl(String(fileRecord.url || "")))
      .filter((url) => !!url);
  } catch (error) {
    strapi.log.error("[MODERATION] Could not resolve review image URLs:", error);
    return [];
  }
}

/**
 * Transcribe an audio review file using OpenAI Whisper.
 * Looks up the file URL from Strapi's media library, downloads it, and
 * sends it to the Whisper API. Returns the transcript text, or an empty
 * string on any failure (which the caller treats as an empty review,
 * triggering the existing "Pending" fallback in runModerationWorkflow).
 */
async function transcribeAudioReview(audioFileId: number): Promise<string> {
  const client = getOpenAIClient();
  if (!client) return '';

  try {
    // Retrieve file metadata stored by Strapi's upload plugin
    const fileRecord = await (strapi as any).db.query('plugin::upload.file').findOne({
      where: { id: audioFileId },
      select: ['url', 'mime', 'name', 'ext'],
    });

    if (!fileRecord?.url) {
      strapi.log.warn(`[WHISPER] No URL found for file ID ${audioFileId}`);
      return '';
    }

    // Download the audio from Cloudinary
    const response = await fetch(fileRecord.url);
    if (!response.ok) {
      strapi.log.warn(`[WHISPER] Failed to download audio: HTTP ${response.status} for file ID ${audioFileId}`);
      return '';
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = fileRecord.mime || 'audio/mpeg';
    const ext = (fileRecord.ext || '.mp3').replace(/^\./, '');
    const filename = `audio.${ext}`;

    // Wrap the buffer into a File object accepted by the OpenAI SDK
    const file = await toFile(buffer, filename, { type: mime });

    // Transcribe — pass language hint to bias towards Portuguese
    const transcription = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });

    return transcription.text?.trim() || '';
  } catch (error) {
    strapi.log.error('[WHISPER] Transcription error:', error);
    return '';
  }
}

/**
 * Layer 2: Quality and Context Check using GPT-4o-mini
 * Checks for spam, PII, relevance, and handles PT-BR vs PT-PT language sensitivity
 * @param reviewText The review text to check
 * @returns JSON object with is_valid, reason, and category
 */
async function runQualityContextCheck(
  reviewText: string
): Promise<{
  is_valid: boolean;
  reason: string;
  category: "spam" | "pii" | "off_topic" | "quality" | "valid";
  detected_language: string;
}> {
  const client = getOpenAIClient();
  if (!client) {
    // If OpenAI is not configured, default to pending for manual review
    return {
      is_valid: false,
      reason: "Revisão manual necessária.",
      category: "quality",
      detected_language: "unknown",
    };
  }

  const SYSTEM_PROMPT = `You are a content moderation expert for a business review platform. Your task is to check review content for quality, relevance, spam, and PII (personally identifiable information). You must be extremely sensitive to language variants, especially Brazilian Portuguese (PT-BR) vs European Portuguese (PT-PT).

CRITICAL LANGUAGE SENSITIVITY RULES:
- "gozar" in PT-BR means "to enjoy/have fun" (e.g., "Fui gozar na praia" = "I went to enjoy the beach"). Only flag if used in a clearly sexual context.
- "gozar" in PT-PT can mean "to orgasm" but context matters. Flag ONLY if clearly explicit/sexual.
- "rapariga" in PT-BR (especially Brazil) means "girl" and is neutral/acceptable. Flag ONLY if used in PT-PT context as a derogatory term.
- "viado" or "bicha": These can be used as derogatory terms (flag as hate speech) OR as reclaimed terms within LGBTQ+ communities (context-dependent). Flag ONLY if the sentiment is clearly aggressive, derogatory, or used as a slur targeting someone.
- Consider regional variations: Angolan Portuguese, Mozambican Portuguese may have different slang usage.

VALID REVIEW GUIDANCE:
- Approve authentic first-person complaints, criticism, frustration, disappointment, or negative sentiment about service, systems, account issues, delays, support, pricing, staff, product quality, or user experience.
- Do NOT mark a review as invalid just because it has spelling mistakes, informal grammar, regional wording, repeated punctuation, mild all-caps emphasis, or emotional expressions such as "estou triste", "aborrecido", "chateado", "frustrado", or similar.
- Short but meaningful reviews are valid if they clearly describe a real experience or problem.
- A review remains valid even if it is poorly written, colloquial, or mixes PT-BR/PT-PT variants, as long as a reasonable human can understand the experience being described.
- Audio transcription disfluencies are valid. Do NOT reject content just because it contains hesitations, fillers, repetitions, self-corrections, or spoken-language fragments such as "ok", "sei la", "vamos dizer", "ja nem sei", "tipo", "hum", or repeated time estimates.
- Reviews that describe delays, waiting time, process friction, confusion, or uncertainty after a real experience are valid even if the wording is rambling or conversational.
- Example of VALID review: "BAI estou a duas semanas que não consigo actualizar a minha conta por falta de sistema. Isso está me deixar triste e aborrecido."
- Example of VALID transcribed audio review: "Ok, o processo ai e bem demorado, vamos dizer uma semana, sei la, uma semana ou duas, tambem ja nem sei mais."

CHECK FOR:
1. SPAM: Phone numbers, email addresses, links to competitors/external sites, promotional content
2. PII: Personal information like full addresses, phone numbers, email addresses, social security numbers
3. OFF_TOPIC: Reviews about shipping/delivery if this is a product review platform (e.g., "The mailman was late" when reviewing a product, not the shipping service)
4. QUALITY: Gibberish, incoherent text, random characters, obvious nonsense, or text with no understandable review content. Do NOT use this category for mere spelling/grammar issues.

RESPONSE FORMAT:
You MUST return ONLY a JSON object with this exact structure:
{
  "is_valid": boolean,
  "reason": "string explaining the decision",
  "category": "spam" | "pii" | "off_topic" | "quality" | "valid",
  "detected_language": "ISO 639-1 two-letter code of the review text language, e.g. pt, en, es, fr, de"
}

Categories:
- "valid": Content is acceptable
- "spam": Contains spam indicators (links, promotional content, competitor mentions)
- "pii": Contains personal identifiable information
- "off_topic": Not relevant to business/product review
- "quality": Poor quality, gibberish, or other quality issues

Be strict with spam and PII, but lenient with language variants and cultural context.

IMPORTANT: Never mention AI, IA, artificial intelligence, or automated systems in your response. Write the reason as if it came from a human moderation team. Use neutral, professional language.
IMPORTANT: Always write the "reason" field in European Portuguese (PT-PT), regardless of the language of the review content.`;

  try {
    const chatCompletion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Review this text for quality, spam, PII, and relevance: "${reviewText}"`,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const content = chatCompletion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from GPT-4o-mini");
    }

    const jsonResponse = JSON.parse(content);

    // Validate response structure
    if (
      typeof jsonResponse.is_valid !== "boolean" ||
      !jsonResponse.reason ||
      !jsonResponse.category
    ) {
      strapi.log.warn(
        "Invalid response format from GPT-4o-mini, defaulting to pending",
        jsonResponse
      );
      return {
        is_valid: false,
        reason: "Revisão manual necessária.",
        category: "quality",
        detected_language: "unknown",
      };
    }

    // Validate category
    const validCategories = ["spam", "pii", "off_topic", "quality", "valid"];
    if (!validCategories.includes(jsonResponse.category)) {
      jsonResponse.category = "quality";
    }

    // Sanitize reason to remove any AI/IA references
    const sanitizedReason = sanitizeModerationReason(jsonResponse.reason);

    // Extract detected language (ISO 639-1 code)
    const detectedLang = typeof jsonResponse.detected_language === "string"
      ? jsonResponse.detected_language.toLowerCase().trim().slice(0, 5)
      : "unknown";

    return {
      is_valid: jsonResponse.is_valid,
      reason: sanitizedReason,
      category: jsonResponse.category,
      detected_language: detectedLang || "unknown",
    };
  } catch (error) {
    strapi.log.error("GPT-4o-mini Quality Check Error:", error);
    // If the check fails, default to pending for manual review
    return {
      is_valid: false,
      reason: "Revisão manual necessária.",
      category: "quality",
      detected_language: "unknown",
    };
  }
}

async function runBorderlineQualityReviewCheck(
  reviewText: string,
  detectedLanguage: string
): Promise<{ should_approve: boolean; reason: string }> {
  const client = getOpenAIClient();
  if (!client) {
    return {
      should_approve: false,
      reason: "Revisao manual necessaria.",
    };
  }

  const SYSTEM_PROMPT = `You are reviewing a borderline business review that was initially marked as a quality issue.

Your job is to prevent false positives.

APPROVE the review if it is understandable and describes a real customer experience, complaint, frustration, delay, service issue, account problem, system outage, staff interaction, pricing concern, or product/service dissatisfaction.

DO NOT reject a review only because it has:
- spelling mistakes
- informal grammar
- mixed Portuguese variants (PT-BR, PT-PT, Angolan Portuguese, Mozambican Portuguese)
- emotional wording such as sadness, frustration, annoyance, or disappointment
- short length, if it still communicates a concrete experience
- audio transcription disfluencies, including hesitations, filler words, repeated fragments, corrections, uncertainty, or conversational spoken phrasing

REJECT only if the text is truly gibberish, meaningless, random characters, obvious nonsense, or not actually a review.

Example that MUST be approved:
"BAI estou a duas semanas que nao consigo actualizar a minha conta por falta de sistema. Isso esta me deixar triste e aborrecido."

Example that MUST also be approved:
"Ok, o processo ai e bem demorado, vamos dizer uma semana, sei la, uma semana ou duas, tambem ja nem sei mais."

Return ONLY JSON in this format:
{
  "should_approve": boolean,
  "reason": "short explanation in European Portuguese"
}`;

  try {
    const chatCompletion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Detected language: ${detectedLanguage || "unknown"}\nReview text: "${reviewText}"`,
        },
      ],
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
    });

    const content = chatCompletion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from borderline quality check");
    }

    const parsed = JSON.parse(content);
    const shouldApprove = parsed?.should_approve === true;
    const reason = sanitizeModerationReason(
      typeof parsed?.reason === "string"
        ? parsed.reason
        : "Revisao manual necessaria."
    );

    return {
      should_approve: shouldApprove,
      reason,
    };
  } catch (error) {
    strapi.log.error("Borderline quality review check error:", error);
    return {
      should_approve: false,
      reason: "Revisao manual necessaria.",
    };
  }
}

function containsLikelyPii(text: string): boolean {
  return (
    /https?:\/\//i.test(text) ||
    /www\./i.test(text) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
    /\+?\d[\d\s().-]{7,}\d/.test(text)
  );
}

function looksLikeMeaningfulColloquialReview(reviewText: string): boolean {
  const trimmed = reviewText.trim();
  if (!trimmed || containsLikelyPii(trimmed)) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  const words = trimmed.match(/\p{L}+/gu) || [];
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const letters = (trimmed.match(/[\p{L}]/gu) || []).length;
  const alphaRatio = letters / Math.max(trimmed.length, 1);

  const experiencePatterns = [
    /\b(processo|servi[cç]o|atendimento|conta|sistema|pedido|apoio|suporte|empresa|produto|aplicativo|app|site|login)\b/i,
    /\b(demora|demorado|demorou|lento|espera|semana|semanas|dia|dias|horas|atraso)\b/i,
    /\b(n[aã]o consigo|nao consigo|j[aá] nem sei|ja nem sei|tive|fui|estou|estava|aconteceu|resolver|resposta)\b/i,
    /\b(triste|frustrad|aborrecid|chatead|insatisfeit|confus|complicad)\w*\b/i,
  ];

  const hasExperienceSignal = experiencePatterns.some((pattern) =>
    pattern.test(lower),
  );

  const gibberishLike =
    uniqueWords.size <= 2 ||
    alphaRatio < 0.45 ||
    /^[a-z\s]{0,6}$/i.test(trimmed) ||
    /(.{1,3})\1{4,}/i.test(trimmed);

  return words.length >= 8 && uniqueWords.size >= 5 && hasExperienceSignal && !gibberishLike;
}

/**
 * Two-layer moderation workflow - reusable function for both create and update
 * Layer 1: OpenAI Moderation API (safety check)
 * Layer 2: GPT-4o-mini (quality, spam, PII, relevance check)
 * @param reviewText The review text to moderate
 * @param data The data object to update with moderation results
 */
async function runModerationWorkflow(
  reviewText: string,
  data: any,
  imageUrls: string[] = []
): Promise<void> {
  // Default original locale
  if (!data.originalLocale || data.originalLocale === "unknown") {
    data.originalLocale = "unknown";
  }

  // Ensure reviewText is a string
  const textToModerate = typeof reviewText === "string" ? reviewText.trim() : String(reviewText).trim();
  const hasTextContent = textToModerate.length > 0;

  const client = getOpenAIClient();
  
  // If OpenAI is not configured, set to pending for manual review
  if (!client) {
    strapi.log.warn(
      "OpenAI API key not configured. Reviews will require manual moderation."
    );
    data.is_published = false;
    data.moderation_status = "Pending Manual Review";
    data.moderation_reason =
      "Serviço de moderação não configurado. Revisão manual necessária.";
    data.flag_source = "system";
    data.originalLocale = "unknown";
    return;
  }

  // ============================================================================
  // LAYER 1: Safety Check - OpenAI Moderation API
  // ============================================================================
  try {
    let moderationInput: ModerationInputItem[] = [];
    if (textToModerate) {
      moderationInput.push({ type: "text", text: textToModerate });
    }
    
    // Try to include images for moderation
    let moderationResponse: any = null;
    let imagesModerationFailed = false;
    
    try {
      for (const imageUrl of imageUrls) {
        moderationInput.push({ type: "image_url", image_url: { url: imageUrl } });
      }
      
      moderationResponse = await client.moderations.create({
        model: MODERATION_MODEL,
        input: moderationInput.length > 0 ? moderationInput : textToModerate,
      });
    } catch (imageError) {
      // If image moderation fails, fall back to text-only moderation
      strapi.log.warn("[MODERATION] Image moderation failed, falling back to text-only:", {
        error: imageError instanceof Error ? imageError.message : String(imageError),
        imageCount: imageUrls.length,
      });
      imagesModerationFailed = true;
      
      // Retry with text only
      moderationResponse = await client.moderations.create({
        model: MODERATION_MODEL,
        input: textToModerate,
      });
    }

    const primaryResult = moderationResponse.results[0];

    const sexualAppliedToImage = !imagesModerationFailed && 
      Array.isArray(primaryResult?.category_applied_input_types?.sexual)
      ? (primaryResult.category_applied_input_types.sexual as string[]).includes("image")
      : false;
    const sexualScore = Number(primaryResult?.category_scores?.sexual ?? 0);
    const hasImageSexualSignal =
      imageUrls.length > 0 &&
      !imagesModerationFailed &&
      sexualAppliedToImage &&
      Number.isFinite(sexualScore) &&
      sexualScore >= IMAGE_SEXUAL_SCORE_THRESHOLD;

    if (primaryResult.flagged || hasImageSexualSignal) {
      // Check specific categories: hate, harassment, violence, self-harm, sexual
      const flaggedCategories: string[] = [];
      const criticalCategories = ["hate", "harassment", "violence", "self-harm", "sexual"];
      
      for (const category of criticalCategories) {
        if (primaryResult.categories[category as keyof typeof primaryResult.categories] === true) {
          flaggedCategories.push(category);
        }
      }

      // Stricter nudity enforcement for image inputs:
      // even if top-level flagged=false, treat strong sexual score on images as policy violation.
      if (hasImageSexualSignal && !flaggedCategories.includes("sexual")) {
        flaggedCategories.push("sexual");
      }

      // If any critical category is flagged, save as flagged and STOP (don't proceed to Layer 2)
      if (flaggedCategories.length > 0) {
        const categoryDisplay = flaggedCategories
          .map(cat => translateModerationCategory(cat))
          .join(", ");
        
        data.is_published = false;
        data.moderation_status = "Sinalizada";
        data.moderation_reason = sanitizeModerationReason(
          `Violação de política: ${categoryDisplay}`
        );
        data.flag_source = "system";
        strapi.log.info(
          `Review flagged by Layer 1 - Categories: ${flaggedCategories.join(", ")}`
        );
        return;
      }

      // If flagged but not in critical categories, log and continue to Layer 2
      strapi.log.warn(
        `Review flagged by Moderation API but not in critical categories. Proceeding to Layer 2.`
      );

      if (hasImageSexualSignal) {
        strapi.log.info("[MODERATION] Image sexual score threshold triggered", {
          sexualScore,
          threshold: IMAGE_SEXUAL_SCORE_THRESHOLD,
        });
      }
    }
  } catch (error) {
    strapi.log.error("Layer 1 (Moderation API) Error:", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      textLength: textToModerate.length,
      imageCount: imageUrls.length,
    });
    // If Layer 1 fails even with text-only, set to pending for manual review instead of failing
    data.is_published = false;
    data.moderation_status = "Pending Manual Review";
    data.moderation_reason = "Serviço de moderação indisponível. Revisão manual necessária.";
    data.flag_source = "system";
    return;
  }

  if (!hasTextContent) {
    data.is_published = false;
    data.moderation_status = "Pending";
    data.moderation_reason = "Texto da avaliação está vazio.";
    data.flag_source = "system";
    data.originalLocale = "unknown";
    return;
  }

  // ============================================================================
  // LAYER 2: Quality & Context Check - GPT-4o-mini
  // Only reached if Layer 1 passes
  // ============================================================================
  try {
    const qualityCheck = await runQualityContextCheck(textToModerate);

    if (qualityCheck.is_valid) {
      // Review passes both layers
      data.is_published = true;
      data.moderation_status = "Aprovada";
      data.moderation_reason = sanitizeModerationReason(
        qualityCheck.reason || "Avaliação aprovada."
      );
      // Store detected language from GPT
      if (qualityCheck.detected_language && qualityCheck.detected_language !== "unknown") {
        data.originalLocale = qualityCheck.detected_language;
      }
    } else {
      // Review failed Layer 2 quality check
      // Set status based on category
      if (qualityCheck.category === "off_topic" || qualityCheck.category === "spam" || qualityCheck.category === "pii") {
        // For off-topic, spam, or PII: save as pending for manual review
        const reasonText = qualityCheck.category === "spam" 
          ? "Conteúdo contém spam ou links promocionais."
          : qualityCheck.category === "pii"
          ? "Conteúdo contém informações pessoais."
          : qualityCheck.category === "off_topic"
          ? "Conteúdo não relacionado com a avaliação do negócio."
          : qualityCheck.reason;
        
        data.is_published = false;
        data.moderation_status = "Pending";
        data.moderation_reason = sanitizeModerationReason(reasonText);
        data.flag_source = "system";
      } else {
        if (looksLikeMeaningfulColloquialReview(textToModerate)) {
          data.is_published = true;
          data.moderation_status = "Aprovada";
          data.moderation_reason = "Avaliação aprovada após verificação de contexto.";
          if (
            qualityCheck.detected_language &&
            qualityCheck.detected_language !== "unknown"
          ) {
            data.originalLocale = qualityCheck.detected_language;
          }
          strapi.log.info(
            "Review auto-approved by colloquial-quality safeguard",
            {
              detectedLanguage: qualityCheck.detected_language,
              preview: textToModerate.slice(0, 140),
            }
          );
          return;
        }

        const borderlineCheck = await runBorderlineQualityReviewCheck(
          textToModerate,
          qualityCheck.detected_language
        );

        if (borderlineCheck.should_approve) {
          data.is_published = true;
          data.moderation_status = "Aprovada";
          data.moderation_reason = sanitizeModerationReason(
            borderlineCheck.reason || "Avaliacao aprovada."
          );
        } else {
          // For quality issues: flag it
          data.is_published = false;
          data.moderation_status = "Sinalizada";
          data.moderation_reason = sanitizeModerationReason(
            qualityCheck.reason || "Conteúdo não atende aos padrões de qualidade."
          );
          data.flag_source = "system";
        }
      }
      strapi.log.info(
        `Review failed Layer 2 - Category: ${qualityCheck.category}, Reason: ${qualityCheck.reason}`
      );
      // Still store detected language even for failed reviews
      if (qualityCheck.detected_language && qualityCheck.detected_language !== "unknown") {
        data.originalLocale = qualityCheck.detected_language;
      }
    }
  } catch (error) {
    strapi.log.error("Layer 2 (Quality Check) Error:", error);
    // If Layer 2 fails, set to pending for manual review instead of failing
    data.is_published = false;
    data.moderation_status = "Pending Manual Review";
    data.moderation_reason = "Serviço de verificação de qualidade indisponível. Revisão manual necessária.";
    data.flag_source = "system";
  }
}

export async function rerunModerationForStoredReview(review: {
  reviewText?: string | null;
  audioTranscription?: string | null;
  experiencePhotos?: unknown;
  originalLocale?: string | null;
  awaitingEntityApproval?: boolean | null;
}) {
  const moderationData: Record<string, unknown> = {
    originalLocale: review.originalLocale || "unknown",
  };

  const textToModerate = [
    review.reviewText?.trim() || "",
    review.audioTranscription?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n");

  const imageUrls = await resolveReviewImageUrls(review.experiencePhotos);

  await runModerationWorkflow(textToModerate, moderationData, imageUrls);

  if (review.awaitingEntityApproval === true) {
    moderationData.is_published = false;
  }

  return moderationData;
}

// -----------------------------------------------------------------

export default {
  /**
   * Before creating a review, run pre-moderation and ensure the user hasn't already reviewed this business
   */
  async beforeCreate(event) {
    try {
      const { data } = event.params;

      // --- PRE-MODERATION LOGIC (runs before validation) ---

      // Transcribe audio review if one was attached
      let audioTranscript = '';
      if (data.audioReview) {
        const audioFileId = typeof data.audioReview === 'object'
          ? (data.audioReview as { id: number }).id
          : Number(data.audioReview);
        if (audioFileId) {
          strapi.log.info(`[MODERATION] Transcribing audio review (file ID: ${audioFileId})...`);
          audioTranscript = await transcribeAudioReview(audioFileId);
          if (audioTranscript) {
            data.audioTranscription = audioTranscript;
            strapi.log.info(`[MODERATION] Transcription stored (${audioTranscript.length} chars).`);
          } else {
            strapi.log.warn(`[MODERATION] Transcription returned empty for file ID: ${audioFileId}.`);
          }
        }
      }

      const imageRefs = extractPhotoRefs(data.experiencePhotos);
      const imageUrls = await resolveReviewImageUrls(data.experiencePhotos);

      if (imageRefs.length > 0 && imageUrls.length === 0) {
        strapi.log.warn("[MODERATION] Review has attached media but no resolvable image URLs before create.");
        data.is_published = false;
        data.moderation_status = "Pending Manual Review";
        data.moderation_reason = "Imagens anexadas não puderam ser verificadas automaticamente. Revisão manual necessária.";
        data.flag_source = "system";
      }

      // Combine review text + audio transcript for moderation so neither
      // channel can hide a policy violation present in the other.
      const reviewText = data.reviewText || '';
      const textToModerate = [reviewText.trim(), audioTranscript.trim()].filter(Boolean).join('\n');
      if (data.moderation_status !== "Pending Manual Review") {
        await runModerationWorkflow(textToModerate, data, imageUrls);
      }

      // If the review is awaiting entity (business/agency) approval,
      // ensure is_published stays false regardless of AI moderation result.
      // The moderation_status and moderation_reason are still preserved so
      // admins can see the moderation outcome. Publishing will happen when
      // the admin approves the entity via the dashboard.
      if (data.awaitingEntityApproval === true) {
        data.is_published = false;
      }
      // --- END PRE-MODERATION LOGIC ---

      // Check if user and business are provided
      if (!data.users_permissions_user || !data.business) {
        strapi.log.error(
          "Lifecycle hook validation failed: User and business are required",
          {
            hasUser: !!data.users_permissions_user,
            hasBusiness: !!data.business,
            dataKeys: Object.keys(data),
          }
        );
        throw new Error(
          "User and business are required for creating a review."
        );
      }

      // Check for existing review (agency-aware).
      // When an agency is specified, allow one review per business+agency combo.
      // When no agency, only match reviews that also have no agency.
      const duplicateWhere: Record<string, unknown> = {
        users_permissions_user: data.users_permissions_user,
        business: data.business,
      };
      if (data.agency) {
        duplicateWhere.agency = data.agency;
      } else {
        duplicateWhere.agency = { $null: true };
      }
      const existingReview = await strapi.db
        .query("api::review.review")
        .findOne({ where: duplicateWhere });

      if (existingReview) {
        throw new Error(
          data.agency
            ? "You have already reviewed this agency. Please update your existing review instead."
            : "You have already reviewed this business. Please update your existing review instead."
        );
      }

      // Validate rating
      if (data.rating === undefined || data.rating === null) {
        throw new Error("A classificação é obrigatória.");
      }

      if (data.rating < 1 || data.rating > 5) {
        throw new Error("A classificação deve estar entre 1 e 5.");
      }

      // Capture initial rating for edit transparency – never overwritten on update
      if (data.originalRating == null) {
        data.originalRating = data.rating;
      }
    } catch (error: any) {
      // Log the error for debugging
      strapi.log.error("Lifecycle hook beforeCreate error:", {
        message: error.message,
        stack: error.stack,
        eventData: event.params.data,
      });
      // Re-throw to let Strapi handle it
      throw error;
    }
  },

  /**
   * Before updating a review, validate the rating and run moderation if reviewText is changed
   */
  async beforeUpdate(event) {
    const { data } = event.params;
    let currentReview: any = null;

    // Validate rating if it's being updated
    if (data.rating !== undefined) {
      if (data.rating < 1 || data.rating > 5) {
        throw new Error("A classificação deve estar entre 1 e 5.");
      }
      // Capture the current rating as previousRating before it changes
      try {
        const whereClause = (event.params as Record<string, unknown>).where;
        if (whereClause) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          currentReview = await (strapi as any).db.query("api::review.review").findOne({
            where: whereClause,
          });
          if (currentReview?.rating !== undefined && currentReview.rating !== data.rating) {
            data.previousRating = currentReview.rating;
          }
        }
      } catch (err) {
        strapi.log.warn("beforeUpdate: Could not capture previousRating:", err);
      }
    }

    // Prevent changing the business or user after creation
    if (
      data.business !== undefined ||
      data.users_permissions_user !== undefined
    ) {
      throw new Error(
        "Cannot change the business or user for an existing review."
      );
    }

    // --- MODERATION LOGIC (runs when reviewText, audioReview, or experiencePhotos is updated) ---
    const textUpdated = data.reviewText !== undefined;
    const audioUpdated = data.audioReview !== undefined;
    const photosUpdated = data.experiencePhotos !== undefined;

    if (textUpdated || audioUpdated || photosUpdated) {
      if (!currentReview) {
        try {
          const whereClause = (event.params as Record<string, unknown>).where;
          if (whereClause) {
            currentReview = await (strapi as any).db.query("api::review.review").findOne({
              where: whereClause,
            });
          }
        } catch (err) {
          strapi.log.warn("beforeUpdate: Could not load current review for moderation context:", err);
        }
      }

      // Transcribe new audio when it is being replaced
      let audioTranscript = '';
      if (audioUpdated) {
        if (data.audioReview) {
          const audioFileId = typeof data.audioReview === 'object'
            ? (data.audioReview as { id: number }).id
            : Number(data.audioReview);
          if (audioFileId) {
            strapi.log.info(`[MODERATION] Transcribing updated audio (file ID: ${audioFileId})...`);
            audioTranscript = await transcribeAudioReview(audioFileId);
            if (audioTranscript) {
              data.audioTranscription = audioTranscript;
            }
          }
        } else {
          // Audio was removed — clear the stored transcription
          data.audioTranscription = null;
        }
      }

      const imageRefs = photosUpdated ? extractPhotoRefs(data.experiencePhotos) : [];
      const imageUrls = photosUpdated
        ? await resolveReviewImageUrls(data.experiencePhotos)
        : [];

      if (photosUpdated && imageRefs.length > 0 && imageUrls.length === 0) {
        data.is_published = false;
        data.moderation_status = "Pending Manual Review";
        data.moderation_reason = "Imagens anexadas não puderam ser verificadas automaticamente. Revisão manual necessária.";
        data.flag_source = "system";
        strapi.log.warn("[MODERATION] Review update has media but no resolvable image URLs.");
        return;
      }

      const reviewText = textUpdated
        ? (data.reviewText || '')
        : (currentReview?.reviewText || '');
      const audioText = audioUpdated
        ? audioTranscript.trim()
        : (currentReview?.audioTranscription || '');
      const textToModerate = [reviewText.trim(), audioText.trim()].filter(Boolean).join('\n');

      if (!textToModerate) {
        data.is_published = false;
        data.moderation_status = "Pending";
        data.moderation_reason = "Texto da avaliação está vazio.";
        strapi.log.info("Review update - content is empty, setting to pending");
      } else {
        await runModerationWorkflow(textToModerate, data, imageUrls);
        strapi.log.info("Review update - moderation completed", {
          moderation_status: data.moderation_status,
          is_published: data.is_published,
        });
      }
    }

    // If still awaiting entity approval, keep review unpublished
    if (data.awaitingEntityApproval === true) {
      data.is_published = false;
    }
    // --- END MODERATION LOGIC ---
  },

  /**
   * After creating a review, update the business AvaliScore and send email to business
   */
  async afterCreate(event) {
    const { result } = event;

    strapi.log.info(
      `New review created: ID ${result.id} by user ${result.users_permissions_user} for business ${result.business}`
    );

    // Update AvaliScore for the business
    if (result.business) {
      try {
        const businessService = strapi.service("api::business.business");
        await businessService.updateAvaliScore(result.business);
        strapi.log.info(
          `AvaliScore updated for business ${result.business} after review creation`
        );
      } catch (error: any) {
        strapi.log.error(
          `Error updating AvaliScore after review creation:`,
          error
        );
      }

      // Send email to business owner — only when review is NOT held for entity approval
      if (result.awaitingEntityApproval === true) {
        strapi.log.info(`[REVIEW LIFECYCLE] Skipping email — review ${result.id} held for entity approval`);
      } else {
        try {
          const businessId = typeof result.business === "object" ? result.business.id : result.business;
          const business = await strapi.db
            .query("api::business.business")
            .findOne({
              where: { id: businessId },
              populate: { owner: { fields: ["id", "email", "username", "firstName", "lastName", "emailLocale"] } },
            });

          if (business?.owner?.email) {
            const review = await strapi.db.query("api::review.review").findOne({
              where: { id: result.id },
              populate: { users_permissions_user: { fields: ["username", "firstName", "lastName"] } },
            });

            if (review) {
              const reviewService = strapi.service("api::review.review");
              const businessName = business.name || "O seu negócio";
              const reviewTitle = review.title || "Sem título";
              const reviewText = review.reviewText || "";
              const rating = review.rating ?? 0;
              const reviewer = review.users_permissions_user;
              const reviewerName =
                reviewer && (reviewer as any).firstName && (reviewer as any).lastName
                  ? `${(reviewer as any).firstName} ${(reviewer as any).lastName}`.trim()
                  : reviewer && (reviewer as any).username
                    ? (reviewer as any).username
                    : null;
              const reviewId = result.documentId ?? result.id;

              if (reviewService && typeof reviewService.sendNewReviewEmailToBusiness === "function") {
                await reviewService.sendNewReviewEmailToBusiness(
                  business.owner.email,
                  businessName,
                  reviewTitle,
                  reviewText,
                  rating,
                  reviewerName,
                  reviewId,
                  (business.owner as { emailLocale?: string }).emailLocale,
                );
              }
            }
          }
        } catch (emailError: any) {
          strapi.log.error(
            "Error sending new review email to business after review creation:",
            emailError
          );
          // Don't rethrow - email failure must not fail the lifecycle
        }
      }
    }

    // Sync reviewer level (non-blocking)
    const authorId = typeof result.users_permissions_user === "object"
      ? (result.users_permissions_user as any)?.id
      : result.users_permissions_user;
    if (authorId) {
      try {
        const levelId = await computeUserLevel(strapi, Number(authorId));
        await strapi.db.query("plugin::users-permissions.user").update({
          where: { id: Number(authorId) },
          data: { reviewer_level: levelId ?? null },
        });
        strapi.log.info(`[LEVEL SYNC] User ${authorId} → reviewer_level ${levelId}`);
      } catch (levelError: any) {
        strapi.log.error("[LEVEL SYNC] afterCreate level sync failed:", levelError);
      }
    }
  },

  /**
   * After updating a review, update the business AvaliScore
   */
  async afterUpdate(event) {
    const { result } = event;

    strapi.log.info(`Review updated: ID ${result.id}`);

    // Update AvaliScore for the business
    if (result.business) {
      try {
        const businessService = strapi.service("api::business.business");
        await businessService.updateAvaliScore(result.business);
        strapi.log.info(
          `AvaliScore updated for business ${result.business} after review update`
        );
      } catch (error: any) {
        strapi.log.error(
          `Error updating AvaliScore after review update:`,
          error
        );
      }
    }

    // Sync reviewer level (non-blocking)
    const authorId = typeof result.users_permissions_user === "object"
      ? (result.users_permissions_user as any)?.id
      : result.users_permissions_user;
    if (authorId) {
      try {
        const levelId = await computeUserLevel(strapi, Number(authorId));
        await strapi.db.query("plugin::users-permissions.user").update({
          where: { id: Number(authorId) },
          data: { reviewer_level: levelId ?? null },
        });
        strapi.log.info(`[LEVEL SYNC] User ${authorId} → reviewer_level ${levelId}`);
      } catch (levelError: any) {
        strapi.log.error("[LEVEL SYNC] afterUpdate level sync failed:", levelError);
      }
    }
  },

  /**
   * After deleting a review, update the business AvaliScore
   */
  async afterDelete(event) {
    const { result } = event;

    strapi.log.info(`Review deleted: ID ${result.id}`);

    // Update AvaliScore for the business
    if (result.business) {
      try {
        const businessService = strapi.service("api::business.business");
        await businessService.updateAvaliScore(result.business);
        strapi.log.info(
          `AvaliScore updated for business ${result.business} after review deletion`
        );
      } catch (error: any) {
        strapi.log.error(
          `Error updating AvaliScore after review deletion:`,
          error
        );
      }
    }

    // Sync reviewer level (non-blocking)
    const authorId = typeof result.users_permissions_user === "object"
      ? (result.users_permissions_user as any)?.id
      : result.users_permissions_user;
    if (authorId) {
      try {
        const levelId = await computeUserLevel(strapi, Number(authorId));
        await strapi.db.query("plugin::users-permissions.user").update({
          where: { id: Number(authorId) },
          data: { reviewer_level: levelId ?? null },
        });
        strapi.log.info(`[LEVEL SYNC] User ${authorId} → reviewer_level ${levelId}`);
      } catch (levelError: any) {
        strapi.log.error("[LEVEL SYNC] afterDelete level sync failed:", levelError);
      }
    }
  },
};
