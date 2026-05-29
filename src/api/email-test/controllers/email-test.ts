/**
 * Email diagnostic controller
 * Provides detailed diagnostics for email configuration and sending.
 */

export default {
  /**
   * GET /api/email-test/status
   * Check if the email plugin is loaded and the provider is available.
   */
  async status(ctx: any) {
    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // 1. Check email plugin availability (new Strapi v5 API)
    try {
      const emailPlugin = strapi.plugin("email");
      diagnostics.checks.pluginLoaded = !!emailPlugin;
      diagnostics.checks.providerAvailable = !!emailPlugin?.provider;
      diagnostics.checks.providerHasSend =
        typeof emailPlugin?.provider?.send === "function";
    } catch (err: any) {
      diagnostics.checks.pluginLoaded = false;
      diagnostics.checks.pluginError = err.message;
    }

    // 2. Check legacy API (strapi.plugins.email)
    try {
      const legacyPlugin = strapi.plugins?.email;
      diagnostics.checks.legacyPluginAvailable = !!legacyPlugin;
      diagnostics.checks.legacyServiceAvailable =
        !!legacyPlugin?.services?.email;
      diagnostics.checks.legacySendAvailable =
        typeof legacyPlugin?.services?.email?.send === "function";
    } catch (err: any) {
      diagnostics.checks.legacyPluginAvailable = false;
      diagnostics.checks.legacyError = err.message;
    }

    // 3. Check email config
    try {
      const emailConfig = strapi.config.get("plugin::email") as any;
      diagnostics.checks.configLoaded = !!emailConfig;
      diagnostics.checks.configProvider = emailConfig?.provider || "(not set)";
      diagnostics.checks.configHost =
        emailConfig?.providerOptions?.host || "(not set)";
      diagnostics.checks.configPort =
        emailConfig?.providerOptions?.port || "(not set)";
      diagnostics.checks.configUser = emailConfig?.providerOptions?.auth?.user
        ? emailConfig.providerOptions.auth.user.slice(0, 6) + "***"
        : "(not set)";
      diagnostics.checks.configPassSet =
        !!emailConfig?.providerOptions?.auth?.pass;
      diagnostics.checks.configDefaultFrom =
        emailConfig?.settings?.defaultFrom || "(not set)";
      diagnostics.checks.configDefaultReplyTo =
        emailConfig?.settings?.defaultReplyTo || "(not set)";
    } catch (err: any) {
      diagnostics.checks.configError = err.message;
    }

    // 4. Check environment variables
    diagnostics.checks.envBrevoApiKeySet = !!process.env.BREVO_API_KEY;
    diagnostics.checks.envBrevoApiKeyPrefix = process.env.BREVO_API_KEY
      ? process.env.BREVO_API_KEY.slice(0, 12) + "..."
      : "(not set)";
    diagnostics.checks.envDefaultSender =
      process.env.DEFAULT_SENDER_EMAIL || "(not set)";

    // 5. DNS resolution test
    try {
      const dns = require("dns");
      const { promisify } = require("util");
      const resolve = promisify(dns.resolve);
      const addresses = await resolve(
        process.env.SMTP_HOST || "smtp-relay.brevo.com"
      );
      diagnostics.checks.dnsResolution = {
        success: true,
        addresses,
      };
    } catch (err: any) {
      diagnostics.checks.dnsResolution = {
        success: false,
        error: err.message,
      };
    }

    // Overall status
    diagnostics.healthy =
      diagnostics.checks.pluginLoaded &&
      diagnostics.checks.providerAvailable &&
      diagnostics.checks.providerHasSend &&
      diagnostics.checks.configLoaded &&
      diagnostics.checks.dnsResolution?.success;

    ctx.body = diagnostics;
  },

  /**
   * POST /api/email-test/send
   * Send a test email. Requires { to: "recipient@email.com", secret: "your_admin_jwt_secret" }
   * The secret must match ADMIN_JWT_SECRET to prevent abuse.
   */
  async send(ctx: any) {
    const { to, secret } = ctx.request.body || {};

    // Simple auth check - must provide admin secret
    const adminSecret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret !== adminSecret) {
      return ctx.unauthorized(
        "Provide the correct ADMIN_JWT_SECRET as 'secret' in the request body."
      );
    }

    if (!to || typeof to !== "string" || !to.includes("@")) {
      return ctx.badRequest("Provide a valid 'to' email address in the body.");
    }

    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      recipient: to,
      steps: [],
    };

    // Step 1: Check provider
    const emailPlugin = strapi.plugin("email");
    if (!emailPlugin?.provider?.send) {
      results.steps.push({
        step: "provider-check",
        success: false,
        error: "Email provider not available. Check plugin config.",
      });
      ctx.body = results;
      return;
    }
    results.steps.push({ step: "provider-check", success: true });

    // Step 2: Try sending via strapi.plugin('email').provider.send() (direct)
    try {
      const defaultFrom =
        (strapi.config.get("plugin::email") as any)?.settings?.defaultFrom ||
        `CliAvalia <${process.env.DEFAULT_SENDER_EMAIL || "notificacoes@cliavalia.com"}>`;
      const info = await emailPlugin.provider.send({
        from: defaultFrom,
        to,
        subject: "[CliAvalia] Email Test - Direct Provider",
        text: `This is a direct provider test email sent at ${new Date().toISOString()}`,
        html: `<h2>CliAvalia Email Test</h2><p>Direct provider test sent at <strong>${new Date().toISOString()}</strong></p><p>If you receive this, the SMTP connection from the server to Brevo is working.</p>`,
      });
      results.steps.push({
        step: "direct-provider-send",
        success: true,
        info: info
          ? {
              messageId: info.messageId,
              response: info.response,
              accepted: info.accepted,
              rejected: info.rejected,
            }
          : "sent (no info returned)",
      });
    } catch (err: any) {
      results.steps.push({
        step: "direct-provider-send",
        success: false,
        error: err.message,
        code: err.code,
        responseCode: err.responseCode,
        response: err.response,
        stack: err.stack?.split("\n").slice(0, 5),
      });
    }

    // Step 3: Try sending via strapi.plugins.email.services.email.send() (legacy API used in codebase)
    try {
      const info = await strapi.plugins.email.services.email.send({
        to,
        subject: "[CliAvalia] Email Test - Service API",
        text: `This is a service API test email sent at ${new Date().toISOString()}`,
        html: `<h2>CliAvalia Email Test</h2><p>Service API test sent at <strong>${new Date().toISOString()}</strong></p><p>If you receive this, the <code>strapi.plugins.email.services.email.send()</code> API is working.</p>`,
      });
      results.steps.push({
        step: "service-api-send",
        success: true,
        info: info
          ? {
              messageId: info.messageId,
              response: info.response,
              accepted: info.accepted,
              rejected: info.rejected,
            }
          : "sent (no info returned)",
      });
    } catch (err: any) {
      results.steps.push({
        step: "service-api-send",
        success: false,
        error: err.message,
        code: err.code,
        responseCode: err.responseCode,
        response: err.response,
        stack: err.stack?.split("\n").slice(0, 5),
      });
    }

    results.allSucceeded = results.steps.every(
      (s: any) => s.success
    );

    if (results.allSucceeded) {
      results.note =
        "Both send methods succeeded. If you still don't receive the email, check: " +
        "(1) Brevo sender verification for notificacoes@cliavalia.com or cliavalia.com domain, " +
        "(2) Brevo daily sending limits, " +
        "(3) Recipient spam/junk folder.";
    }

    ctx.body = results;
  },

  /**
   * GET /api/email-test/send-get?to=xxx&secret=xxx
   * Same as POST send but via GET for easy browser/fetch testing.
   */
  async sendGet(ctx: any) {
    const { to, secret } = ctx.query || {};

    // Simple auth check
    const adminSecret = process.env.ADMIN_JWT_SECRET;
    if (!secret || secret !== adminSecret) {
      return ctx.unauthorized("Provide correct secret as query param.");
    }

    if (!to || typeof to !== "string" || !to.includes("@")) {
      return ctx.badRequest("Provide a valid 'to' email as query param.");
    }

    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      recipient: to,
      steps: [],
    };

    const emailPlugin = strapi.plugin("email");
    if (!emailPlugin?.provider?.send) {
      results.steps.push({ step: "provider-check", success: false, error: "No provider" });
      ctx.body = results;
      return;
    }
    results.steps.push({ step: "provider-check", success: true });

    try {
      const defaultFrom =
        (strapi.config.get("plugin::email") as any)?.settings?.defaultFrom ||
        `CliAvalia <${process.env.DEFAULT_SENDER_EMAIL || "notificacoes@cliavalia.com"}>`;
      const info = await emailPlugin.provider.send({
        from: defaultFrom,
        to,
        subject: "[CliAvalia] Email Test via Brevo API",
        text: `Test email sent at ${new Date().toISOString()}`,
        html: `<h2>CliAvalia Email Test</h2><p>Sent at <strong>${new Date().toISOString()}</strong> via Brevo HTTP API.</p>`,
      });
      results.steps.push({
        step: "direct-send",
        success: true,
        info: info || "sent",
      });
    } catch (err: any) {
      results.steps.push({
        step: "direct-send",
        success: false,
        error: err.message,
        statusCode: err.statusCode,
        response: err.response,
      });
    }

    results.allSucceeded = results.steps.every((s: any) => s.success);
    ctx.body = results;
  },
};
