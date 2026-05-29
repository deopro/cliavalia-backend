/**
 * Contact service
 * Sends contact form emails to the appropriate team inbox.
 */

import fs from "fs";

const RECIPIENT_MAP: Record<string, string> = {
  business: "comercial@cliavalia.com",
  reviewer: "suporte@cliavalia.com",
};
const DEFAULT_RECIPIENT = "suporte@cliavalia.com";

interface ContactPayload {
  email: string;
  userType: string;
  helpTopic?: string;
  details: string;
  files?: Record<string, any> | any[];
}

export default ({ strapi }: { strapi: any }) => ({
  async sendSupportEmail(payload: ContactPayload) {
    const { email, userType, helpTopic, details, files } = payload;

    const recipientEmail = RECIPIENT_MAP[userType] || DEFAULT_RECIPIENT;

    const userTypeLabel =
      userType === "reviewer"
        ? "Avaliador (escrevo avaliações na CliAvalia)"
        : "Empresa (gerencio ou represento uma empresa na CliAvalia)";

    const subject = `[CliAvalia Suporte] Contacto de ${email} (${userTypeLabel})`;

    const textBody = [
      `Submissão do formulário de contacto`,
      ``,
      `Email: ${email}`,
      `Tipo de utilizador: ${userTypeLabel}`,
      ...(helpTopic ? [`Assunto de ajuda: ${helpTopic}`] : []),
      ``,
      `Detalhes:`,
      details,
    ].join("\n");

    const htmlBody = [
      `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
      `<p><strong>Tipo de utilizador:</strong> ${escapeHtml(
        userTypeLabel
      )}</p>`,
      ...(helpTopic
        ? [
            `<p><strong>Assunto de ajuda:</strong> ${escapeHtml(
              helpTopic
            )}</p>`,
          ]
        : []),
      `<p><strong>Detalhes:</strong></p>`,
      `<pre style="white-space: pre-wrap; background: #f5f5f5; padding: 1rem; border-radius: 8px;">${escapeHtml(details)}</pre>`,
    ].join("\n");

    const attachments = buildAttachments(strapi, files);

    const emailPayload = {
      to: recipientEmail,
      replyTo: email,
      subject,
      text: textBody,
      html: htmlBody,
      ...(attachments.length > 0 ? { attachments } : {}),
    };

    strapi.log.info(
      `[Contact] Sending email to ${recipientEmail} (userType=${userType}) from ${email}`
    );

    try {
      // Use Strapi v5 recommended email service API
      const emailService = strapi.service('plugin::email.email');
      if (emailService?.send) {
        await emailService.send(emailPayload);
      } else {
        // Fallback: call provider directly
        strapi.log.warn('[Contact] Email service not found, using provider directly');
        const provider = strapi.plugin('email')?.provider;
        if (!provider?.send) {
          throw new Error('Email provider not available — check plugin::email configuration');
        }
        await provider.send(emailPayload);
      }

      strapi.log.info(`[Contact] Email sent successfully to ${recipientEmail} from ${email}`);
    } catch (emailError: any) {
      strapi.log.error(
        `[Contact] Failed to send email to ${recipientEmail}:`,
        emailError?.message || emailError
      );
      throw emailError;
    }
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Normalize Strapi/formidable files (single file or array) and build nodemailer attachments.
 * Formidable file: { path or filepath, originalFilename, mimetype }
 */
function buildAttachments(
  strapi: any,
  files: Record<string, any> | any[] | undefined
): { filename: string; content: Buffer }[] {
  if (!files) return [];

  const list: any[] = [];
  if (Array.isArray(files)) {
    list.push(...files);
  } else if (typeof files === "object") {
    const attachments = files.attachments ?? files.files ?? files;
    if (Array.isArray(attachments)) {
      list.push(...attachments);
    } else if (attachments && typeof attachments === "object") {
      list.push(attachments);
    }
  }

  const result: { filename: string; content: Buffer }[] = [];
  for (const file of list) {
    if (!file) continue;
    const filePath = file.filepath ?? file.path;
    const filename =
      file.originalFilename ?? file.name ?? `attachment-${result.length + 1}`;
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath);
      result.push({ filename, content });
    } catch (err) {
      strapi.log.warn(`Could not read attachment ${filename}:`, err);
    }
  }
  return result;
}
