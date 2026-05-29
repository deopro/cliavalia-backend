/**
 * Contact controller
 * Handles POST /api/contact - contact form submission (multipart or JSON)
 */

export default {
  async submit(ctx: any) {
    try {
      const body = ctx.request.body || {};
      const files = ctx.request.files;

      const email =
        typeof body.email === "string" ? body.email.trim() : "";
      const userType =
        typeof body.userType === "string" ? body.userType.trim() : "";
      const helpTopic =
        typeof body.helpTopic === "string" ? body.helpTopic.trim() : "";
      const details =
        typeof body.details === "string" ? body.details.trim() : "";
      const acceptPrivacy = body.acceptPrivacy === true || body.acceptPrivacy === "true";

      if (!email) {
        return ctx.badRequest("O email é obrigatório.");
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return ctx.badRequest("Formato de email inválido.");
      }

      if (!userType) {
        return ctx.badRequest(
          "Selecione se é um avaliador ou uma empresa."
        );
      }

      if (userType !== "reviewer" && userType !== "business") {
        return ctx.badRequest("Tipo de utilizador inválido.");
      }

      if ((userType === "reviewer" || userType === "business") && !helpTopic) {
        return ctx.badRequest("Selecione o assunto com que precisa de ajuda.");
      }

      if (!details) {
        return ctx.badRequest(
          "Partilhe alguns detalhes para podermos ajudar."
        );
      }

      if (!acceptPrivacy) {
        return ctx.badRequest(
          "Tem de aceitar a Política de Privacidade para enviar este formulário."
        );
      }

      strapi.log.info(
        `[Contact] Form submitted: email=${email}, userType=${userType}, helpTopic=${helpTopic || '(none)'}, detailsLen=${details.length}, files=${files ? Object.keys(files).length : 0}`
      );

      const contactService = strapi.service("api::contact.contact");
      await contactService.sendSupportEmail({
        email,
        userType,
        helpTopic: helpTopic || undefined,
        details,
        files,
      });

      return ctx.send(
        {
          message:
            "Obrigado por entrar em contacto connosco. Iremos responder em breve.",
        },
        200
      );
    } catch (error: any) {
      strapi.log.error("Contact form submit error:", error);
      return ctx.internalServerError(
        error.message ||
          "Não foi possível enviar o formulário. Tente novamente."
      );
    }
  },
};
