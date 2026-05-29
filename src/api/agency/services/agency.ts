/**
 * agency service
 */

import { factories } from '@strapi/strapi';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'comercial@cliavalia.com';
const FRONTEND_URL = process.env.FRONTEND_URL || '';

const brandColor = '#2563eb';
const brandColorDark = '#1e40af';
const textColor = '#1a1a1a';
const textColorSecondary = '#4a4a4a';
const textColorMuted = '#6b7280';
const backgroundColor = '#f5f5f5';
const borderColor = '#e5e7eb';

function emailWrapper(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:${backgroundColor};">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:40px 20px;text-align:center;background-color:${backgroundColor};">
        <table role="presentation" style="width:600px;max-width:100%;margin:0 auto;border-collapse:collapse;background-color:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:40px 40px 20px 40px;text-align:center;background:linear-gradient(135deg,${brandColor} 0%,${brandColorDark} 100%);border-radius:12px 12px 0 0;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">CliAvalia</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 30px 40px;">${content}</td>
          </tr>
          <tr>
            <td style="padding:24px 40px;text-align:center;background-color:#f9fafb;border-top:1px solid ${borderColor};border-radius:0 0 12px 12px;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} CliAvalia. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default factories.createCoreService('api::agency.agency', ({ strapi }) => ({
  /**
   * Notify admin when a new agency is submitted for approval
   */
  async sendNewAgencySubmissionEmail(agency: any, submitter: any) {
    const adminDashboardUrl = `${FRONTEND_URL}/admin/pending-locations/pending`;
    const submitterName = submitter?.username || submitter?.email || 'Utilizador desconhecido';
    const businessName = agency?.business?.name || 'N/A';
    const municipalityName = agency?.municipality?.name || 'N/A';

    const content = `
      <h2 style="margin:0 0 16px 0;color:${textColor};font-size:20px;font-weight:600;">Nova Localização Submetida</h2>
      <p style="margin:0 0 16px 0;color:${textColorSecondary};font-size:15px;line-height:1.6;">
        Uma nova localização foi submetida e aguarda aprovação:
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;width:40%;color:${textColorSecondary};font-size:14px;">Localização</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${agency.name}</td></tr>
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;color:${textColorSecondary};font-size:14px;">Empresa</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${businessName}</td></tr>
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;color:${textColorSecondary};font-size:14px;">Município</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${municipalityName}</td></tr>
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;color:${textColorSecondary};font-size:14px;">Submetido por</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${submitterName}</td></tr>
        ${agency.possibleDuplicate ? `<tr><td style="padding:8px 12px;background:#fef3c7;border:1px solid ${borderColor};font-weight:600;color:#92400e;font-size:14px;">⚠️ Aviso</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:#92400e;font-size:14px;background:#fef3c7;">Possível duplicado (utilizador confirmou mesmo assim)</td></tr>` : ''}
      </table>
      <table role="presentation" style="margin:0 auto 16px auto;">
        <tr>
          <td style="background:linear-gradient(135deg,${brandColor} 0%,${brandColorDark} 100%);border-radius:8px;">
            <a href="${adminDashboardUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
              Ver no Painel de Administração
            </a>
          </td>
        </tr>
      </table>
    `;

    await strapi.plugins.email.services.email.send({
      to: ADMIN_EMAIL,
      subject: `[CliAvalia] Nova Localização Pendente: ${agency.name}`,
      html: emailWrapper(`Nova Localização Pendente: ${agency.name}`, content),
      text: `Nova localização pendente: ${agency.name}\nEmpresa: ${businessName}\nMunicípio: ${municipalityName}\nSubmetido por: ${submitterName}\n\nVer em: ${adminDashboardUrl}`,
    });

    strapi.log.info(`[AGENCY] Admin notification sent for location: ${agency.name}`);
  },

  /**
   * Notify the submitter when their agency is approved
   */
  async sendAgencyApprovedEmail(agency: any, submitter: any) {
    if (!submitter?.email) return;

    const businessName = agency?.business?.name || 'N/A';
    const municipalityName = agency?.municipality?.name || 'N/A';

    const content = `
      <h2 style="margin:0 0 16px 0;color:${textColor};font-size:20px;font-weight:600;">Localização Aprovada! 🎉</h2>
      <p style="margin:0 0 16px 0;color:${textColorSecondary};font-size:15px;line-height:1.6;">
        A localização que submeteu foi aprovada e está agora disponível na plataforma.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;width:40%;color:${textColorSecondary};font-size:14px;">Localização</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${agency.name}</td></tr>
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;color:${textColorSecondary};font-size:14px;">Empresa</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${businessName}</td></tr>
        <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid ${borderColor};font-weight:600;color:${textColorSecondary};font-size:14px;">Município</td><td style="padding:8px 12px;border:1px solid ${borderColor};color:${textColor};font-size:14px;">${municipalityName}</td></tr>
      </table>
      <p style="margin:0;color:${textColorMuted};font-size:14px;line-height:1.6;">
        A sua avaliação associada também foi publicada. Obrigado pela sua contribuição!
      </p>
    `;

    await strapi.plugins.email.services.email.send({
      to: submitter.email,
      subject: `A sua avaliação foi aprovada - CliAvalia`,
      html: emailWrapper(`Localização Aprovada: ${agency.name}`, content),
      text: `A localização "${agency.name}" (${businessName} - ${municipalityName}) foi aprovada e está agora disponível na CliAvalia. A sua avaliação também foi publicada.`,
    });
  },

  /**
   * Notify the submitter when their agency is rejected
   */
  async sendAgencyRejectedEmail(agency: any, submitter: any, rejectionReason?: string) {
    if (!submitter?.email) return;

    const businessName = agency?.business?.name || 'N/A';
    const reasonSection = rejectionReason
      ? `<div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:16px 0;border-radius:4px;"><p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;"><strong>Motivo:</strong> ${rejectionReason}</p></div>`
      : '';

    const content = `
      <h2 style="margin:0 0 16px 0;color:${textColor};font-size:20px;font-weight:600;">Localização Não Aprovada</h2>
      <p style="margin:0 0 16px 0;color:${textColorSecondary};font-size:15px;line-height:1.6;">
        Infelizmente, a localização <strong>${agency.name}</strong> (${businessName}) que submeteu não foi aprovada.
      </p>
      ${reasonSection}
      <p style="margin:16px 0 0 0;color:${textColorMuted};font-size:14px;line-height:1.6;">
        Se tiver dúvidas, por favor contacte-nos em <a href="mailto:${ADMIN_EMAIL}" style="color:${brandColor};">${ADMIN_EMAIL}</a>.
      </p>
    `;

    await strapi.plugins.email.services.email.send({
      to: submitter.email,
      subject: `Atualização sobre a sua localização - CliAvalia`,
      html: emailWrapper(`Localização Não Aprovada: ${agency.name}`, content),
      text: `A localização "${agency.name}" (${businessName}) não foi aprovada.${rejectionReason ? `\nMotivo: ${rejectionReason}` : ''}\n\nSe tiver dúvidas, contacte-nos em ${ADMIN_EMAIL}.`,
    });
  },
}));
