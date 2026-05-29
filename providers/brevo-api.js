/**
 * Custom Brevo HTTP API email provider for Strapi v5.
 *
 * Uses Brevo's REST API (https://api.brevo.com/v3/smtp/email) instead of SMTP relay.
 * This is more reliable and provides better error reporting than SMTP.
 *
 * Requires Node 20+ (built-in fetch).
 */

"use strict";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html) {
  if (!html || typeof html !== "string") {
    return "";
  }

  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim()
  );
}

/**
 * Parse a "Display Name <email@example.com>" string into { name, email }.
 * Also handles plain "email@example.com".
 */
function parseEmailAddress(raw) {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: raw.trim() };
}

/**
 * Normalize a `to` value into an array of { email, name? } objects.
 * Handles: string, array of strings, array of objects.
 */
function normalizeRecipients(to) {
  if (!to) return [];
  if (typeof to === "string") {
    // Could be comma-separated
    return to.split(",").map((e) => {
      const parsed = parseEmailAddress(e.trim());
      return parsed || { email: e.trim() };
    });
  }
  if (Array.isArray(to)) {
    return to.map((item) => {
      if (typeof item === "string") {
        const parsed = parseEmailAddress(item.trim());
        return parsed || { email: item.trim() };
      }
      return item; // Already { email, name? }
    });
  }
  return [to];
}

module.exports = {
  provider: "brevo-api",
  name: "Brevo HTTP API",

  init(providerOptions, settings) {
    const apiKey = providerOptions.apiKey;

    if (!apiKey) {
      console.error(
        "❌ [BREVO-API] No API key provided! Set BREVO_API_KEY in your .env"
      );
    } else {
      console.log(
        `✅ [BREVO-API] Provider initialized (key: ${apiKey.slice(0, 12)}...)`
      );
    }

    return {
      async send(options) {
        if (!apiKey) {
          throw new Error(
            "Brevo API key is not configured. Set BREVO_API_KEY in your .env file."
          );
        }

        // Determine sender — use per-call override if provided, otherwise
        // read admin-configured defaults from the core store, falling back to hardcoded values.
        let sender;
        if (options.from) {
          sender = parseEmailAddress(options.from) || {
            name: "CliAvalia",
            email: "notificacoes@cliavalia.com",
          };
        } else {
          let storedName = null;
          let storedEmail = null;
          try {
            const strapiRef = global.strapi;
            if (strapiRef && strapiRef.store) {
              const store = strapiRef.store({ type: "core", name: "site-settings" });
              [storedName, storedEmail] = await Promise.all([
                store.get({ key: "emailSenderName" }),
                store.get({ key: "emailSenderEmail" }),
              ]);
            }
          } catch (_) { /* ignore — use defaults */ }

          const fallback = parseEmailAddress(settings.defaultFrom);
          sender = {
            name: storedName || fallback?.name || "CliAvalia",
            email: storedEmail || fallback?.email || "notificacoes@cliavalia.com",
          };
        }

        // Determine replyTo
        const replyTo = options.replyTo || settings.defaultReplyTo;
        const replyToObj = replyTo ? parseEmailAddress(replyTo) : undefined;

        const textContent = (typeof options.text === "string" && options.text.trim())
          ? options.text.trim()
          : htmlToText(options.html);

        // Build the request body
        const body = {
          sender,
          to: normalizeRecipients(options.to),
          subject: options.subject,
          htmlContent: options.html || options.text || "",
          textContent,
        };

        if (options.cc) {
          body.cc = normalizeRecipients(options.cc);
        }
        if (options.bcc) {
          body.bcc = normalizeRecipients(options.bcc);
        }
        if (replyToObj) {
          body.replyTo = replyToObj;
        }

        // Handle attachments (nodemailer format → Brevo format)
        if (options.attachments && options.attachments.length > 0) {
          body.attachment = options.attachments.map((att) => {
            const result = { name: att.filename || att.name || "attachment" };
            if (att.content) {
              // Buffer or string
              result.content = Buffer.isBuffer(att.content)
                ? att.content.toString("base64")
                : Buffer.from(att.content).toString("base64");
            } else if (att.path) {
              result.url = att.path;
            }
            return result;
          });
        }

        const logPrefix = `[BREVO-API] → ${body.to.map((r) => r.email).join(", ")}`;
        console.log(`${logPrefix} | Subject: "${body.subject}"`);

        try {
          const response = await fetch(BREVO_API_URL, {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(body),
          });

          const responseText = await response.text();
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = { raw: responseText };
          }

          if (!response.ok) {
            const errorMsg = `Brevo API error ${response.status}: ${
              responseData.message || responseData.raw || response.statusText
            }`;
            console.error(
              `❌ ${logPrefix} | FAILED: ${errorMsg}`,
              responseData
            );
            const error = new Error(errorMsg);
            error.statusCode = response.status;
            error.response = responseData;
            throw error;
          }

          console.log(
            `✅ ${logPrefix} | Sent! MessageId: ${
              responseData.messageId || "(none)"
            }`
          );

          // Return in a format similar to nodemailer for compatibility
          return {
            messageId: responseData.messageId,
            response: `250 OK: ${responseData.messageId || "accepted"}`,
            accepted: body.to.map((r) => r.email),
            rejected: [],
          };
        } catch (error) {
          if (error.statusCode) {
            // Already our formatted error
            throw error;
          }
          // Network/fetch error
          console.error(`❌ ${logPrefix} | Network error:`, error.message);
          throw new Error(`Brevo API network error: ${error.message}`);
        }
      },
    };
  },
};
