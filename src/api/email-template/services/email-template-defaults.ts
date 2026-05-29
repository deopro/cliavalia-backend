/**
 * Default email templates used as seed data and fallback when DB record is unavailable.
 * Templates use {{placeholder}} syntax for dynamic values.
 */

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
}

export interface TemplateDefault {
  key: string;
  locale: 'pt' | 'en';
  description: string;
  subject: string;
  htmlBody: string;
  availableVariables: TemplateVariable[];
}

// ─── Shared HTML helpers ──────────────────────────────────────────────────────

const FOOTER_SOCIAL = `<div style="margin:12px 0;"><a href="https://www.facebook.com/cliavalia"><img src="https://cdn-icons-png.flaticon.com/512/5968/5968764.png" style="width:20px;margin:0 6px;" alt="Facebook"></a><a href="https://instagram.com/cliavalia"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" style="width:20px;margin:0 6px;" alt="Instagram"></a><a href="https://tiktok.com/@cliavalia"><img src="https://cdn-icons-png.flaticon.com/512/3046/3046120.png" style="width:20px;margin:0 6px;" alt="TikTok"></a><a href="https://www.linkedin.com/company/cliavalia"><img src="https://cdn-icons-png.flaticon.com/512/3536/3536505.png" style="width:20px;margin:0 6px;" alt="LinkedIn"></a></div>`;

const LOGO_EMPRESAS = `https://res.cloudinary.com/di5i8vtwp/image/upload/v1773530727/cliavalia-empresas_e0ahx8.png`;
const LOGO_MAIN = `https://res.cloudinary.com/dyisx0d3l/image/upload/v1757859687/CliAvalia/cliavalia-logo_white_woav8i.png`;

function emailWrapper(headerBg: string, logoSrc: string, content: string, footerContent: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;text-align:center;">
<table role="presentation" style="width:600px;max-width:100%;margin:0 auto;background:#F7FFFF;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,0.08);border-collapse:collapse;">
<tr><td style="padding:28px 20px 24px;text-align:center;background:${headerBg};border-radius:12px 12px 0 0;">
<img src="${logoSrc}" style="max-width:180px;" alt="CliAvalia">
</td></tr>
<tr><td style="padding:40px 40px 30px;line-height:1.7;font-size:15px;">
${content}
</td></tr>
<tr><td style="padding:30px 40px;text-align:center;background:#f1f5f9;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
${footerContent}
</td></tr>
</table></td></tr></table>
</body></html>`;
}

function empresasWrapper(content: string): string {
  const footer = `<p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Precisa de ajuda? <a href="mailto:comercial@cliavalia.com" style="color:#0168A6;text-decoration:none;">comercial@cliavalia.com</a></p>${FOOTER_SOCIAL}<p style="margin:0;color:#9ca3af;font-size:12px;">© {{year}} CliAvalia Empresas. Todos os direitos reservados.</p>`;
  return emailWrapper('linear-gradient(135deg,#0A244D,#0168A6)', LOGO_EMPRESAS, content, footer);
}

function adminWrapper(title: string, content: string): string {
  const header = `<table role="presentation" style="width:600px;max-width:100%;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-collapse:collapse;"><tr><td style="padding:28px 20px 24px;text-align:center;background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:12px 12px 0 0;"><img src="${LOGO_MAIN}" width="140" style="display:block;margin:0 auto 14px;" alt="CliAvalia"><h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${title}</h1></td></tr><tr><td style="padding:32px 40px;">`;
  const footer = `</td></tr><tr><td style="padding:20px 40px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;"><p style="margin:0;color:#9ca3af;font-size:12px;">© {{year}} CliAvalia. Todos os direitos reservados.</p></td></tr></table>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;text-align:center;">${header}${content}${footer}</td></tr></table></body></html>`;
}

// ─── PT Templates ─────────────────────────────────────────────────────────────

const PT: TemplateDefault[] = [
  // 1 — business-registration
  {
    key: 'business-registration',
    locale: 'pt',
    description: 'Notificação de registo pendente enviada ao proprietário do negócio após submissão',
    subject: 'Registo de Empresa Submetido - CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Registo Recebido</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Olá {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">Obrigado por registar o seu negócio <strong>{{businessName}}</strong> na <strong>CliAvalia Empresas</strong>. O seu pedido foi submetido com sucesso e encontra-se agora <strong>pendente de análise</strong> pela nossa equipa.</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;margin:0 0 24px;border-radius:6px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;font-weight:600;">Estado: Pendente de aprovação</p>
<p style="margin:8px 0 0;color:#4a4a4a;font-size:14px;">A nossa equipa verificará as informações submetidas. Este processo é normalmente concluído em <strong>1–3 dias úteis</strong>.</p>
</div>
<h3 style="margin:0 0 12px;color:#1a1a1a;font-size:16px;font-weight:600;">Próximos passos</h3>
<p style="margin:0 0 6px;color:#4a4a4a;font-size:14px;">1. A nossa equipa analisa o seu registo e documentos.</p>
<p style="margin:0 0 6px;color:#4a4a4a;font-size:14px;">2. Após a aprovação receberá um email de confirmação.</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:14px;">3. Aceda ao portal empresarial para gerir o perfil da sua empresa.</p>
<p style="margin:0;color:#6b7280;font-size:14px;">Se não solicitou este registo, pode simplesmente ignorar este email.</p>`),
    availableVariables: [
      { name: 'firstName', description: 'Primeiro nome do utilizador', example: 'João' },
      { name: 'businessName', description: 'Nome do negócio registado', example: 'Tech Solutions Lda.' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 2 — business-email-confirmation
  {
    key: 'business-email-confirmation',
    locale: 'pt',
    description: 'Link de confirmação de email enviado após aprovação do negócio ou por pedido de reenvio',
    subject: 'Confirme o seu Email – CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Confirme o seu Email</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Olá {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">Obrigado por se registar na <strong>CliAvalia Empresas</strong>. Para concluir o registo e activar a sua conta, confirme o seu endereço de email clicando no botão abaixo.</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{confirmationUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirmar Email</a>
</div>
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Se o botão não funcionar, copie e cole o seguinte link no navegador:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{confirmationUrl}}</p>
<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;border-radius:6px;">
<p style="margin:0;color:#1a1a1a;font-size:14px;">Após a confirmação, a sua conta será activada e poderá aceder ao <strong>Portal Empresarial</strong>.</p>
</div>`),
    availableVariables: [
      { name: 'firstName', description: 'Primeiro nome do utilizador', example: 'Maria' },
      { name: 'confirmationUrl', description: 'URL de confirmação de email', example: 'https://app.cliavalia.com/auth/confirm?token=abc123' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 3 — business-forgot-password
  {
    key: 'business-forgot-password',
    locale: 'pt',
    description: 'Link de redefinição de palavra-passe para utilizadores do portal empresarial',
    subject: 'Recuperar Palavra-passe – CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Recuperar Palavra-passe</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Olá {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">Recebemos um pedido para redefinir a palavra-passe da sua conta no <strong>Portal Empresarial CliAvalia</strong>. Clique no botão abaixo para definir uma nova palavra-passe.</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{resetUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Redefinir Palavra-passe</a>
</div>
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Se o botão não funcionar, copie e cole o seguinte link:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{resetUrl}}</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;">
<p style="margin:0;color:#1a1a1a;font-size:14px;font-weight:600;">Este link é válido por 24 horas.</p>
<p style="margin:8px 0 0;color:#4a4a4a;font-size:14px;">Se não solicitou esta alteração, pode ignorar este email. A sua palavra-passe não será alterada.</p>
</div>`),
    availableVariables: [
      { name: 'firstName', description: 'Primeiro nome do utilizador', example: 'Carlos' },
      { name: 'resetUrl', description: 'URL de redefinição de palavra-passe', example: 'https://empresas.cliavalia.com/business/reset?token=xyz' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 4 — admin-new-business-submission
  {
    key: 'admin-new-business-submission',
    locale: 'pt',
    description: 'Alerta interno enviado ao admin quando um novo negócio é submetido para aprovação',
    subject: '[CliAvalia] Novo Registo de Empresa Pendente: {{businessName}}',
    htmlBody: adminWrapper('Novo Negócio Submetido', `
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">Novo Negócio Pendente de Aprovação</h2>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;width:40%;font-size:13px;color:#4a4a4a;">Nome</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{businessName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Sector</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{sectorName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Categoria</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{categoryName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Submetido por</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{submitterName}}</td></tr>
{{possibleDuplicateRow}}
</table>
<table role="presentation" style="margin:0 auto;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:8px;"><a href="{{adminUrl}}" style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Ver no Painel Admin</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'sectorName', description: 'Sector do negócio', example: 'Tecnologia' },
      { name: 'categoryName', description: 'Categoria do negócio', example: 'Software' },
      { name: 'submitterName', description: 'Nome/email de quem submeteu', example: 'joao@example.com' },
      { name: 'possibleDuplicateRow', description: 'Linha HTML de aviso de duplicado (vazia se não aplicável)', example: '<tr><td colspan="2" style="background:#fef3c7;padding:8px 12px;border:1px solid #e5e7eb;">⚠️ Possível duplicado</td></tr>' },
      { name: 'adminUrl', description: 'URL do painel admin para rever o negócio', example: 'https://app.cliavalia.com/shaolin/pending-businesses/pending' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 5 — business-approved
  {
    key: 'business-approved',
    locale: 'pt',
    description: 'Confirmação de aprovação enviada ao proprietário do negócio',
    subject: 'O registo da empresa foi aprovado - CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:22px;font-weight:600;">Empresa aprovada! 🎉</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;">Olá {{ownerName}},</p>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">O registo da empresa <strong>{{businessName}}</strong> foi aprovado e está agora disponível na plataforma CliAvalia.</p>
{{publishedReviewNote}}
<p style="margin:0 0 24px;color:#4a4a4a;font-size:15px;line-height:1.7;">Já pode iniciar sessão no portal empresarial para gerir o perfil da sua empresa e responder a avaliações.</p>
<table role="presentation" style="margin:0 auto 16px;"><tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;"><a href="{{loginUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">Aceder ao Portal Empresarial</a></td></tr></table>
<table role="presentation" style="margin:0 auto;"><tr><td><a href="{{businessUrl}}" style="display:inline-block;padding:10px 24px;color:#0168A6;text-decoration:none;font-size:14px;font-weight:500;">Ver página da empresa →</a></td></tr></table>`),
    availableVariables: [
      { name: 'ownerName', description: 'Nome do proprietário', example: 'Ana Silva' },
      { name: 'businessName', description: 'Nome do negócio aprovado', example: 'Tech Solutions Lda.' },
      { name: 'loginUrl', description: 'URL de login no portal empresarial', example: 'https://empresas.cliavalia.com/business/login' },
      { name: 'businessUrl', description: 'URL da página pública do negócio', example: 'https://app.cliavalia.com/companies/tech-solutions' },
      { name: 'publishedReviewNote', description: 'Nota HTML sobre avaliações publicadas (vazia se não aplicável)', example: '<p style="margin:12px 0 0;color:#4a4a4a;font-size:14px;">A sua avaliação também foi publicada.</p>' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 6 — business-rejected
  {
    key: 'business-rejected',
    locale: 'pt',
    description: 'Notificação de rejeição enviada ao proprietário do negócio',
    subject: 'Actualização de registo - CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Empresa Não Aprovada</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Infelizmente, o registo da empresa <strong>{{businessName}}</strong> não foi aprovado após a análise da nossa equipa.</p>
<div style="background:#fef2f2;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#7f1d1d;font-weight:600;">Motivo da decisão</p>
<div style="margin-top:8px;color:#4a4a4a;font-size:14px;">{{reasonHtml}}</div>
</div>
<p style="margin:18px 0 0;color:#6b7280;font-size:14px;">Se tiver dúvidas ou desejar submeter novamente com informações actualizadas, contacte a nossa equipa.</p>
<p style="margin:10px 0 0;color:#6b7280;font-size:14px;">Email: <a href="mailto:{{adminEmail}}" style="color:#0168A6;text-decoration:none;">{{adminEmail}}</a></p>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio rejeitado', example: 'Tech Solutions Lda.' },
      { name: 'reasonHtml', description: 'Motivo da rejeição em HTML (pode estar vazio)', example: '<p>Documentação insuficiente.</p>' },
      { name: 'adminEmail', description: 'Email de contacto do admin', example: 'comercial@cliavalia.com' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 7 — admin-new-business-claim
  {
    key: 'admin-new-business-claim',
    locale: 'pt',
    description: 'Alerta interno enviado ao admin quando um novo pedido de reivindicação é submetido',
    subject: 'Novo pedido de reivindicação: {{businessName}}',
    htmlBody: adminWrapper('Novo Pedido de Reivindicação', `
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:18px;">Foi submetido um novo pedido de reivindicação</h2>
<div style="background:#f9fafb;border-left:4px solid #2563eb;padding:20px;margin:24px 0;border-radius:4px;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;width:150px;">Nome da empresa:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{businessName}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Email de contacto:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{contactEmail}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Tipo de documento:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{documentTypeLabel}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Submetido em:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{submissionDate}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">ID do pedido:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{claimId}}</td></tr>
</table>
</div>
<table role="presentation" style="margin:0 auto 16px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:8px;"><a href="{{adminDashboardUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">Analisar pedido</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio reivindicado', example: 'Tech Solutions Lda.' },
      { name: 'contactEmail', description: 'Email de contacto do requerente', example: 'owner@techsolutions.com' },
      { name: 'documentTypeLabel', description: 'Tipo de documento submetido', example: 'Licença de estabelecimento' },
      { name: 'submissionDate', description: 'Data de submissão formatada', example: '13 de Abril de 2025, 14:30' },
      { name: 'claimId', description: 'ID do pedido', example: 'abc123xyz' },
      { name: 'adminDashboardUrl', description: 'URL do painel admin para rever a reivindicação', example: 'https://app.cliavalia.com/shaolin/business-claims/pending' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 8 — business-claim-approved
  {
    key: 'business-claim-approved',
    locale: 'pt',
    description: 'Email de boas-vindas com link de configuração de palavra-passe após aprovação de reivindicação',
    subject: 'Bem-vindo à CliAvalia - Configure a sua palavra-passe',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Bem-vindo à CliAvalia!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;line-height:1.6;">A sua reivindicação de negócio para <strong>{{businessName}}</strong> foi aprovada com sucesso!</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;line-height:1.6;">Para aceder à sua conta e começar a gerir o seu negócio, configure a sua palavra-passe clicando no botão abaixo:</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{passwordSetupUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Configurar Palavra-passe</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Ou copie e cole este link no navegador:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{passwordSetupUrl}}</p>
<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;border-radius:6px;">
<p style="margin:0;color:#4a4a4a;font-size:14px;"><strong>Importante:</strong> Este link expirará após ser utilizado ou após 24 horas.</p>
</div>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio reivindicado', example: 'Tech Solutions Lda.' },
      { name: 'passwordSetupUrl', description: 'URL de configuração de palavra-passe', example: 'https://empresas.cliavalia.com/business/register?code=abc123' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 9 — business-claim-rejected
  {
    key: 'business-claim-rejected',
    locale: 'pt',
    description: 'Notificação de rejeição de reivindicação enviada ao requerente',
    subject: 'CliAvalia - Actualização sobre a sua Reivindicação de Negócio',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Actualização sobre a sua reivindicação</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">Lamentamos informar que a sua reivindicação de negócio para <strong>{{businessName}}</strong> não foi aprovada neste momento.</p>
{{rejectionReasonSection}}
<p style="margin:20px 0 30px;color:#4a4a4a;font-size:16px;line-height:1.6;">Se acredita que houve um erro ou deseja submeter uma nova reivindicação, por favor contacte-nos.</p>
<table role="presentation" style="margin:0 auto;"><tr><td style="background:#6b7280;border-radius:8px;"><a href="{{contactUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">Contactar Suporte</a></td></tr></table>
<p style="margin:30px 0 0;color:#6b7280;font-size:14px;">Agradecemos o seu interesse na CliAvalia.</p>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio reivindicado', example: 'Tech Solutions Lda.' },
      { name: 'rejectionReasonSection', description: 'Bloco HTML com o motivo da rejeição (vazio se não fornecido)', example: '<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;"><p style="margin:0;color:#7f1d1d;font-size:14px;">Documentação insuficiente.</p></div>' },
      { name: 'contactUrl', description: 'URL da página de contacto', example: 'https://app.cliavalia.com/contact' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 10 — subscription-trial-activated
  {
    key: 'subscription-trial-activated',
    locale: 'pt',
    description: 'Notificação de activação do trial Pro enviada ao proprietário do negócio',
    subject: 'Trial Pro ativado — {{trialDays}} dias de acesso completo | CliAvalia',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">🎉 O seu Trial Pro foi ativado!</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Olá <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">A empresa <strong>{{businessName}}</strong> foi aprovada e o seu período de trial <strong>Pro</strong> de {{trialDays}} dias está agora ativo.</p>
<div style="background:#f0f9ff;border-left:4px solid #0168A6;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#0168A6;font-weight:600;">Acesso Pro inclui:</p>
<ul style="margin:8px 0 0;padding-left:20px;color:#4a4a4a;font-size:14px;">
<li>Respostas ilimitadas a avaliações</li>
<li>Estatísticas avançadas</li>
<li>Perfil empresarial em destaque</li>
</ul>
</div>
<p style="margin:14px 0;color:#6b7280;font-size:14px;">O seu trial expira em <strong>{{expiryString}}</strong>.</p>
<table role="presentation" style="margin:24px 0;"><tr>
<td><a href="{{dashboardUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Ir para o Painel</a></td>
<td style="padding-left:12px;"><a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#f3f4f6;color:#374151;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Ver Planos</a></td>
</tr></table>`),
    availableVariables: [
      { name: 'ownerName', description: 'Nome do proprietário', example: 'Ana Silva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'trialDays', description: 'Duração do trial em dias', example: '60' },
      { name: 'expiryString', description: 'Data de expiração formatada', example: '12 de Junho de 2025' },
      { name: 'dashboardUrl', description: 'URL do painel empresarial', example: 'https://empresas.cliavalia.com/business/dashboard' },
      { name: 'plansUrl', description: 'URL da página de planos', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 11 — subscription-trial-ending-soon
  {
    key: 'subscription-trial-ending-soon',
    locale: 'pt',
    description: 'Aviso de expiração iminente do trial Pro (enviado ≤3 dias antes)',
    subject: 'O seu trial Pro expira em {{expiryString}} — renove já',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">⏰ O seu trial termina em breve</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Olá <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">O seu trial Pro da empresa <strong>{{businessName}}</strong> expira no dia <strong>{{expiryString}}</strong>.</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#92400e;">Após a expiração, a conta passará para o plano gratuito e perderá o acesso a respostas a avaliações e estatísticas avançadas.</p>
</div>
<p style="margin:14px 0;color:#4a4a4a;font-size:15px;">Actualize para o plano Pro e continue a tirar partido de todas as funcionalidades.</p>
<a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Actualizar para Pro</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Nome do proprietário', example: 'Ana Silva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'expiryString', description: 'Data de expiração formatada', example: '15 de Abril de 2025' },
      { name: 'plansUrl', description: 'URL da página de planos', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 12 — subscription-trial-expired
  {
    key: 'subscription-trial-expired',
    locale: 'pt',
    description: 'Notificação de expiração do trial Pro enviada ao proprietário do negócio',
    subject: 'Teste Grátis Pro expirado - actualize o plano para continuar - CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Teste Grátis Pro Expirado</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Olá <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">O teste grátis Pro da empresa <strong>{{businessName}}</strong> expirou. A conta está agora no plano gratuito.</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#7f1d1d;">As respostas a avaliações e estatísticas avançadas estão desativadas no plano gratuito.</p>
</div>
<p style="margin:14px 0;color:#4a4a4a;font-size:15px;">Actualize para o plano Pro para recuperar o acesso completo.</p>
<a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Actualizar para Pro</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Nome do proprietário', example: 'Ana Silva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'plansUrl', description: 'URL da página de planos', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 13 — subscription-pro-activated
  {
    key: 'subscription-pro-activated',
    locale: 'pt',
    description: 'Confirmação de activação/renovação do plano Pro',
    subject: 'Plano Pro ativado — bem-vindo ao CliAvalia Pro!',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">✅ Plano Pro Ativado</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Olá <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">O plano Pro da empresa <strong>{{businessName}}</strong> foi ativado com sucesso. O seu acesso inclui:</p>
<div style="background:#f0f9ff;border-left:4px solid #0168A6;padding:16px;border-radius:6px;margin:20px 0;">
<ul style="margin:0;padding-left:20px;color:#4a4a4a;font-size:14px;">
<li>Respostas ilimitadas a avaliações</li>
<li>Estatísticas avançadas</li>
<li>Perfil empresarial em destaque</li>
</ul>
</div>
<p style="margin:14px 0;color:#6b7280;font-size:14px;">Acesso válido até <strong>{{endString}}</strong>.</p>
<a href="{{dashboardUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Ir para o Painel</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Nome do proprietário', example: 'Ana Silva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'endString', description: 'Data de fim do plano Pro formatada', example: '13 de Abril de 2026' },
      { name: 'dashboardUrl', description: 'URL do painel empresarial', example: 'https://empresas.cliavalia.com/business/dashboard' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 14 — review-new-review
  {
    key: 'review-new-review',
    locale: 'pt',
    description: 'Notificação enviada ao negócio quando recebe uma nova avaliação',
    subject: 'Nova avaliação recebida para {{businessName}} - CliAvalia Empresas',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 18px;color:#1a1a1a;font-size:22px;font-weight:600;">Recebeu uma nova avaliação!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">A sua empresa <strong>{{businessName}}</strong> recebeu uma nova avaliação{{byLine}}.</p>
<p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:600;">"{{reviewTitle}}" — {{starsLabel}}</p>
<div style="background:#f9fafb;border-left:4px solid #0168A6;padding:18px 20px;margin:22px 0;border-radius:8px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">{{reviewExcerpt}}</p>
</div>
<table role="presentation" style="margin:30px auto 0;">
<tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;">
<a href="{{dashboardUrl}}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Ver na área de empresa</a>
</td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'reviewTitle', description: 'Título da avaliação', example: 'Excelente serviço!' },
      { name: 'starsLabel', description: 'Classificação em texto', example: '5 estrelas' },
      { name: 'byLine', description: 'Texto " por NomeAvaliador" ou vazio', example: ' por João Silva' },
      { name: 'reviewExcerpt', description: 'Excerto da avaliação (até 200 caracteres)', example: 'Muito bom atendimento e serviço rápido...' },
      { name: 'dashboardUrl', description: 'URL da caixa de entrada de avaliações', example: 'https://empresas.cliavalia.com/business/dashboard/reviews/inbox' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 15 — review-updated
  {
    key: 'review-updated',
    locale: 'pt',
    description: 'Notificação enviada ao negócio quando uma avaliação existente é actualizada',
    subject: 'Avaliação actualizada para {{businessName}} - CliAvalia',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 18px;color:#1a1a1a;font-size:22px;font-weight:600;">Uma avaliação foi actualizada</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">Um utilizador actualizou a sua avaliação sobre <strong>{{businessName}}</strong>{{byLine}}.</p>
<p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:600;">"{{reviewTitle}}" — {{starsLabel}}</p>
<div style="background:#f9fafb;border-left:4px solid #0168A6;padding:18px 20px;margin:22px 0;border-radius:8px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">{{reviewExcerpt}}</p>
</div>
<table role="presentation" style="margin:30px auto 0;">
<tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;">
<a href="{{dashboardUrl}}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">Ver na área de empresa</a>
</td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'reviewTitle', description: 'Título da avaliação', example: 'Serviço actualizado' },
      { name: 'starsLabel', description: 'Classificação em texto', example: '4 estrelas' },
      { name: 'byLine', description: 'Texto " por NomeAvaliador" ou vazio', example: ' por João Silva' },
      { name: 'reviewExcerpt', description: 'Excerto da avaliação actualizada', example: 'Actualizei a minha avaliação porque...' },
      { name: 'dashboardUrl', description: 'URL da caixa de entrada de avaliações', example: 'https://empresas.cliavalia.com/business/dashboard/reviews/inbox' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 16 — review-business-reply
  {
    key: 'review-business-reply',
    locale: 'pt',
    description: 'Notificação enviada ao avaliador quando o negócio responde à sua avaliação',
    subject: '{{businessName}} respondeu à sua avaliação - CliAvalia',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Recebeu uma resposta à sua avaliação!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Olá {{reviewerName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;"><strong>{{businessName}}</strong> respondeu à sua avaliação "<strong>{{reviewTitle}}</strong>".</p>
<div style="background:#f9fafb;border-left:4px solid #2563eb;padding:20px;margin:24px 0;border-radius:8px;">
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Resposta da empresa:</p>
<p style="margin:0;color:#1a1a1a;font-size:16px;line-height:1.6;">{{businessReply}}</p>
</div>
<table role="presentation" style="margin:30px auto 0 auto;">
<tr><td style="background:#2563eb;border-radius:8px;">
<a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">Ver resposta completa</a>
</td></tr></table>`),
    availableVariables: [
      { name: 'reviewerName', description: 'Nome do avaliador', example: 'João Silva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'reviewTitle', description: 'Título da avaliação', example: 'Excelente serviço!' },
      { name: 'businessReply', description: 'Texto da resposta do negócio', example: 'Obrigado pelo seu feedback!' },
      { name: 'reviewUrl', description: 'URL completo da avaliação', example: 'https://app.cliavalia.com/reviews/123' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 17 — review-appeal-approved
  {
    key: 'review-appeal-approved',
    locale: 'pt',
    description: 'Notificação de aprovação de recurso enviada ao avaliador',
    subject: 'O seu recurso foi aprovado - CliAvalia',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:28px;font-weight:600;">O seu recurso foi aprovado!</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">Temos o prazer de informar que o seu recurso para a avaliação "<strong>{{reviewTitle}}</strong>" sobre <strong>{{businessName}}</strong> foi aprovado.</p>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">A sua avaliação foi publicada e está agora visível na plataforma.</p>
<table role="presentation" style="margin:0 auto 20px;">
<tr><td style="background:#2563eb;border-radius:8px;">
<a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">Ver as minhas avaliações</a>
</td></tr></table>
<p style="margin:20px 0 0;color:#6b7280;font-size:14px;">Obrigado por fazer parte da comunidade CliAvalia!</p>`),
    availableVariables: [
      { name: 'reviewTitle', description: 'Título da avaliação em recurso', example: 'Experiência positiva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'reviewUrl', description: 'URL das avaliações do utilizador', example: 'https://app.cliavalia.com/user/my-reviews' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 18 — review-appeal-rejected
  {
    key: 'review-appeal-rejected',
    locale: 'pt',
    description: 'Notificação de rejeição de recurso enviada ao avaliador',
    subject: 'Actualização sobre o seu recurso - CliAvalia',
    htmlBody: empresasWrapper(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:28px;font-weight:600;">Actualização sobre o seu recurso</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">Lamentamos informar que o seu recurso para a avaliação "<strong>{{reviewTitle}}</strong>" sobre <strong>{{businessName}}</strong> não foi aprovado.</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;text-align:left;">
<p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Razão da rejeição:</p>
<p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">{{reason}}</p>
</div>
<p style="margin:0 0 30px;color:#4a4a4a;font-size:16px;line-height:1.6;">Se tiver questões, por favor contacte-nos.</p>
<table role="presentation" style="margin:0 auto;">
<tr><td style="background:#6b7280;border-radius:8px;">
<a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">Ver as minhas avaliações</a>
</td></tr></table>
<p style="margin:30px 0 0;color:#6b7280;font-size:14px;">Obrigado por fazer parte da comunidade CliAvalia.</p>`),
    availableVariables: [
      { name: 'reviewTitle', description: 'Título da avaliação em recurso', example: 'Experiência positiva' },
      { name: 'businessName', description: 'Nome do negócio', example: 'Tech Solutions Lda.' },
      { name: 'reason', description: 'Motivo da rejeição do recurso', example: 'A avaliação viola as nossas políticas de utilização.' },
      { name: 'reviewUrl', description: 'URL das avaliações do utilizador', example: 'https://app.cliavalia.com/user/my-reviews' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 19 — admin-new-reviewer-verification
  {
    key: 'admin-new-reviewer-verification',
    locale: 'pt',
    description: 'Alerta interno enviado ao admin quando um avaliador submete um pedido de verificação',
    subject: 'Novo pedido de verificação: {{userEmail}}',
    htmlBody: adminWrapper('Novo pedido de verificação', `
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">Pedido de verificação recebido</h2>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">Um avaliador submeteu um novo pedido de verificação de perfil <strong>(selfie + documento de identidade)</strong>.</p>
<div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:8px;margin-bottom:28px;padding:20px;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;width:150px;">Email do avaliador</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{userEmail}}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">Submetido em</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{submissionDate}}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">ID da verificação</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{verificationId}}</td></tr>
</table>
</div>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;">
<a href="{{adminDashboardUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Rever pedido</a>
</td></tr></table>`),
    availableVariables: [
      { name: 'userEmail', description: 'Email do avaliador', example: 'avaliador@example.com' },
      { name: 'submissionDate', description: 'Data de submissão formatada', example: '13 de Abril de 2025, 14:30' },
      { name: 'verificationId', description: 'ID do pedido de verificação', example: 'abc123xyz' },
      { name: 'adminDashboardUrl', description: 'URL do painel admin para rever verificações', example: 'https://app.cliavalia.com/shaolin/profile-verifications/pending' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 20 — reviewer-verification-approved
  {
    key: 'reviewer-verification-approved',
    locale: 'pt',
    description: 'Notificação de verificação aprovada enviada ao avaliador',
    subject: 'CliAvalia - Verificação de perfil aprovada',
    htmlBody: adminWrapper('Verificação de perfil', `
<div style="display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;margin-bottom:18px;">✔ Aprovado</div>
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">A sua verificação foi aprovada 🎉</h2>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">Obrigado por ter submetido a sua verificação. O seu pedido de verificação da conta de avaliador foi <strong>aprovado com sucesso</strong>.</p>
<p style="margin:0;color:#475569;font-size:16px;line-height:1.6;">Pode continuar a utilizar o <strong>CliAvalia</strong> normalmente.</p>`),
    availableVariables: [
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },

  // 21 — reviewer-verification-rejected
  {
    key: 'reviewer-verification-rejected',
    locale: 'pt',
    description: 'Notificação de verificação rejeitada enviada ao avaliador',
    subject: 'CliAvalia - Actualização da verificação de perfil',
    htmlBody: adminWrapper('Actualização da verificação', `
<div style="display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;margin-bottom:18px;">⚠ Não aprovado</div>
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">O seu pedido não foi aprovado</h2>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">Não foi possível aprovar a sua verificação neste momento. Pode submeter um novo pedido com documentos actualizados a partir da sua conta.</p>
{{reasonBlock}}
<div style="background:#f8fafc;border-left:4px solid #f59e0b;border-radius:8px;margin-top:24px;padding:18px;">
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">Se tiver dúvidas, contacte-nos em <a href="mailto:suporte@cliavalia.com" style="color:#2563eb;text-decoration:none;font-weight:500;">suporte@cliavalia.com</a>.</p>
</div>`),
    availableVariables: [
      { name: 'reasonBlock', description: 'Bloco HTML com o motivo da rejeição (vazio se não fornecido)', example: '<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:4px;"><p style="margin:0;color:#7f1d1d;font-size:14px;">Documento ilegível.</p></div>' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2025' },
    ],
  },
  {
    key: 'account-deletion-scheduled',
    locale: 'pt',
    description: 'Confirmação enviada quando uma conta é agendada para eliminação com período de graça',
    subject: 'A sua conta foi agendada para eliminação',
    htmlBody: adminWrapper('Eliminação da Conta', `
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">A sua conta está agendada para eliminação</h2>
<p style="margin:0 0 18px;color:#475569;font-size:16px;line-height:1.6;">Recebemos o pedido para eliminar a sua conta CliAvalia. O seu perfil foi desativado e as suas avaliações deixaram de estar associadas à sua identidade.</p>
<div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:8px;margin:0 0 24px;padding:18px;">
<p style="margin:0 0 8px;color:#9a3412;font-size:14px;font-weight:600;">Data de eliminação permanente</p>
<p style="margin:0;color:#7c2d12;font-size:15px;line-height:1.6;">{{scheduledDeletionDate}}</p>
</div>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">Pode cancelar este pedido iniciando sessão novamente dentro de {{graceDays}} dias.</p>
<table role="presentation" style="margin:0 auto 20px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{loginUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Iniciar sessão para cancelar</a></td></tr></table>
<p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">Se precisar de ajuda, contacte-nos em <a href="mailto:{{supportEmail}}" style="color:#2563eb;text-decoration:none;font-weight:500;">{{supportEmail}}</a>.</p>`),
    availableVariables: [
      { name: 'scheduledDeletionDate', description: 'Data prevista para eliminação permanente', example: '7 de junho de 2026, 03:00 UTC' },
      { name: 'graceDays', description: 'Número de dias do período de graça', example: '30' },
      { name: 'loginUrl', description: 'URL da página de login para cancelar a eliminação', example: 'https://app.cliavalia.com/login' },
      { name: 'supportEmail', description: 'Email de suporte', example: 'suporte@cliavalia.com' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2026' },
    ],
  },

  // Consumer (main app) — email confirmation
  {
    key: 'consumer-email-confirmation',
    locale: 'pt',
    description: 'Link de confirmação de email para utilizadores da app (não empresariais)',
    subject: 'Confirme o seu email – CliAvalia',
    htmlBody: adminWrapper('Confirme o seu email', `
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">Olá <strong>{{firstName}}</strong>,</p>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">Obrigado por se registar na <strong>CliAvalia</strong>. Para activar a sua conta, confirme o endereço de email clicando no botão abaixo.</p>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{confirmationUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Confirmar email</a></td></tr></table>
<p style="margin:0 0 8px;color:#64748b;font-size:14px;">Se o botão não funcionar, copie e cole este link no navegador:</p>
<p style="margin:0;color:#2563eb;font-size:13px;word-break:break-all;">{{confirmationUrl}}</p>
<p style="margin:24px 0 0;color:#64748b;font-size:14px;line-height:1.6;">Se não criou uma conta CliAvalia, pode ignorar este email.</p>`),
    availableVariables: [
      { name: 'firstName', description: 'Primeiro nome do utilizador', example: 'João' },
      { name: 'confirmationUrl', description: 'URL de confirmação (API Strapi)', example: 'https://api.example.com/api/auth/email-confirmation?confirmation=abc' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2026' },
    ],
  },
  {
    key: 'consumer-forgot-password',
    locale: 'pt',
    description: 'Link de redefinição de palavra-passe para utilizadores da app (não empresariais)',
    subject: 'Recuperar palavra-passe – CliAvalia',
    htmlBody: adminWrapper('Recuperar palavra-passe', `
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">Olá <strong>{{firstName}}</strong>,</p>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">Recebemos um pedido para redefinir a palavra-passe da sua conta CliAvalia. Clique no botão abaixo para escolher uma nova palavra-passe.</p>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{resetUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Redefinir palavra-passe</a></td></tr></table>
<p style="margin:0 0 8px;color:#64748b;font-size:14px;">Se o botão não funcionar, copie e cole este link:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{resetUrl}}</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:8px;">
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;"><strong>Nota:</strong> Este link deixa de ser válido após a utilização ou quando expirar. Se não solicitou esta alteração, pode ignorar este email.</p>
</div>`),
    availableVariables: [
      { name: 'firstName', description: 'Primeiro nome do utilizador', example: 'Maria' },
      { name: 'resetUrl', description: 'URL da página de redefinição com código', example: 'https://app.cliavalia.com/auth/reset-password?code=...' },
      { name: 'year', description: 'Ano actual (auto-injectado)', example: '2026' },
    ],
  },
];

// ─── EN Templates ─────────────────────────────────────────────────────────────

function empresasWrapperEn(content: string): string {
  const footer = `<p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Need help? <a href="mailto:comercial@cliavalia.com" style="color:#0168A6;text-decoration:none;">comercial@cliavalia.com</a></p>${FOOTER_SOCIAL}<p style="margin:0;color:#9ca3af;font-size:12px;">© {{year}} CliAvalia Empresas. All rights reserved.</p>`;
  return emailWrapper('linear-gradient(135deg,#0A244D,#0168A6)', LOGO_EMPRESAS, content, footer);
}

function adminWrapperEn(title: string, content: string): string {
  const header = `<table role="presentation" style="width:600px;max-width:100%;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-collapse:collapse;"><tr><td style="padding:28px 20px 24px;text-align:center;background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:12px 12px 0 0;"><img src="${LOGO_MAIN}" width="140" style="display:block;margin:0 auto 14px;" alt="CliAvalia"><h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${title}</h1></td></tr><tr><td style="padding:32px 40px;">`;
  const footer = `</td></tr><tr><td style="padding:20px 40px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;"><p style="margin:0;color:#9ca3af;font-size:12px;">© {{year}} CliAvalia. All rights reserved.</p></td></tr></table>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f5f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td style="padding:40px 20px;text-align:center;">${header}${content}${footer}</td></tr></table></body></html>`;
}

const EN: TemplateDefault[] = [
  {
    key: 'business-registration', locale: 'en',
    description: 'Pending registration notification sent to business owner after submission',
    subject: 'Business Registration Submitted - CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Registration Received</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Hello {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">Thank you for registering your business <strong>{{businessName}}</strong> on <strong>CliAvalia Empresas</strong>. Your application has been successfully submitted and is now <strong>pending review</strong> by our team.</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;margin:0 0 24px;border-radius:6px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;font-weight:600;">Status: Pending approval</p>
<p style="margin:8px 0 0;color:#4a4a4a;font-size:14px;">Our team will review the submitted information. This process is typically completed within <strong>1–3 business days</strong>.</p>
</div>
<p style="margin:0;color:#6b7280;font-size:14px;">If you did not request this registration, you can simply ignore this email.</p>`),
    availableVariables: [
      { name: 'firstName', description: 'User first name', example: 'John' },
      { name: 'businessName', description: 'Registered business name', example: 'Tech Solutions Ltd.' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-email-confirmation', locale: 'en',
    description: 'Email confirmation link sent after business approval or resend request',
    subject: 'Confirm your Email – CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Confirm your Email</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Hello {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">Thank you for registering with <strong>CliAvalia Empresas</strong>. To complete your registration and activate your account, please confirm your email address by clicking the button below.</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{confirmationUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Confirm Email</a>
</div>
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">If the button doesn't work, copy and paste the following link into your browser:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{confirmationUrl}}</p>`),
    availableVariables: [
      { name: 'firstName', description: 'User first name', example: 'Mary' },
      { name: 'confirmationUrl', description: 'Email confirmation URL', example: 'https://app.cliavalia.com/auth/confirm?token=abc123' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-forgot-password', locale: 'en',
    description: 'Password reset link for business portal users',
    subject: 'Reset your Password – CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Reset your Password</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Hello {{firstName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;">We received a request to reset the password for your <strong>CliAvalia Business Portal</strong> account. Click the button below to set a new password.</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{resetUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Reset Password</a>
</div>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{resetUrl}}</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;">
<p style="margin:0;color:#1a1a1a;font-size:14px;font-weight:600;">This link is valid for 24 hours.</p>
<p style="margin:8px 0 0;color:#4a4a4a;font-size:14px;">If you did not request this change, you can ignore this email. Your password will not be changed.</p>
</div>`),
    availableVariables: [
      { name: 'firstName', description: 'User first name', example: 'Charles' },
      { name: 'resetUrl', description: 'Password reset URL', example: 'https://empresas.cliavalia.com/business/reset?token=xyz' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'admin-new-business-submission', locale: 'en',
    description: 'Internal alert sent to admin when a new business is submitted for approval',
    subject: '[CliAvalia] New Pending Business Registration: {{businessName}}',
    htmlBody: adminWrapperEn('New Business Submitted', `
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:18px;">New Business Pending Approval</h2>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;width:40%;font-size:13px;color:#4a4a4a;">Name</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{businessName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Sector</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{sectorName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Category</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{categoryName}}</td></tr>
<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;font-size:13px;color:#4a4a4a;">Submitted by</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">{{submitterName}}</td></tr>
{{possibleDuplicateRow}}
</table>
<table role="presentation" style="margin:0 auto;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:8px;"><a href="{{adminUrl}}" style="display:inline-block;padding:12px 28px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View in Admin Panel</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'sectorName', description: 'Business sector', example: 'Technology' },
      { name: 'categoryName', description: 'Business category', example: 'Software' },
      { name: 'submitterName', description: 'Submitter name/email', example: 'john@example.com' },
      { name: 'possibleDuplicateRow', description: 'HTML duplicate warning row (empty if not applicable)', example: '' },
      { name: 'adminUrl', description: 'Admin panel URL', example: 'https://app.cliavalia.com/shaolin/pending-businesses/pending' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-approved', locale: 'en',
    description: 'Approval confirmation sent to business owner',
    subject: 'Business registration approved - CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:22px;font-weight:600;">Business approved! 🎉</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;">Hello {{ownerName}},</p>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">The registration of <strong>{{businessName}}</strong> has been approved and is now available on the CliAvalia platform.</p>
{{publishedReviewNote}}
<p style="margin:0 0 24px;color:#4a4a4a;font-size:15px;line-height:1.7;">You can now log in to the business portal to manage your business profile and respond to reviews.</p>
<table role="presentation" style="margin:0 auto 16px;"><tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;"><a href="{{loginUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">Access Business Portal</a></td></tr></table>
<table role="presentation" style="margin:0 auto;"><tr><td><a href="{{businessUrl}}" style="display:inline-block;padding:10px 24px;color:#0168A6;text-decoration:none;font-size:14px;font-weight:500;">View business page →</a></td></tr></table>`),
    availableVariables: [
      { name: 'ownerName', description: 'Owner name', example: 'Anne Smith' },
      { name: 'businessName', description: 'Approved business name', example: 'Tech Solutions Ltd.' },
      { name: 'loginUrl', description: 'Business portal login URL', example: 'https://empresas.cliavalia.com/business/login' },
      { name: 'businessUrl', description: 'Public business page URL', example: 'https://app.cliavalia.com/companies/tech-solutions' },
      { name: 'publishedReviewNote', description: 'HTML note about published reviews (empty if not applicable)', example: '' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-rejected', locale: 'en',
    description: 'Rejection notification sent to business owner',
    subject: 'Registration update - CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Business Not Approved</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Unfortunately, the registration of <strong>{{businessName}}</strong> was not approved by our team.</p>
<div style="background:#fef2f2;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#7f1d1d;font-weight:600;">Rejection reason</p>
<div style="margin-top:8px;color:#4a4a4a;font-size:14px;">{{reasonHtml}}</div>
</div>
<p style="margin:18px 0 0;color:#6b7280;font-size:14px;">If you have questions or wish to resubmit with updated information, please contact our team at: <a href="mailto:{{adminEmail}}" style="color:#0168A6;text-decoration:none;">{{adminEmail}}</a></p>`),
    availableVariables: [
      { name: 'businessName', description: 'Rejected business name', example: 'Tech Solutions Ltd.' },
      { name: 'reasonHtml', description: 'Rejection reason in HTML', example: '<p>Insufficient documentation.</p>' },
      { name: 'adminEmail', description: 'Admin contact email', example: 'comercial@cliavalia.com' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'admin-new-business-claim', locale: 'en',
    description: 'Internal alert sent to admin when a new business claim request is submitted',
    subject: 'New claim request: {{businessName}}',
    htmlBody: adminWrapperEn('New Business Claim Request', `
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:18px;">A new claim request has been submitted</h2>
<div style="background:#f9fafb;border-left:4px solid #2563eb;padding:20px;margin:24px 0;border-radius:4px;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;width:150px;">Business name:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{businessName}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Contact email:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{contactEmail}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Document type:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{documentTypeLabel}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Submitted on:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{submissionDate}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;font-weight:600;">Request ID:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">{{claimId}}</td></tr>
</table>
</div>
<table role="presentation" style="margin:0 auto 16px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:8px;"><a href="{{adminDashboardUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">Review request</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Claimed business name', example: 'Tech Solutions Ltd.' },
      { name: 'contactEmail', description: 'Claimant contact email', example: 'owner@techsolutions.com' },
      { name: 'documentTypeLabel', description: 'Submitted document type', example: 'Business license' },
      { name: 'submissionDate', description: 'Formatted submission date', example: 'April 13, 2025, 2:30 PM' },
      { name: 'claimId', description: 'Request ID', example: 'abc123xyz' },
      { name: 'adminDashboardUrl', description: 'Admin panel URL to review claims', example: 'https://app.cliavalia.com/shaolin/business-claims/pending' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-claim-approved', locale: 'en',
    description: 'Welcome email with password setup link after claim approval',
    subject: 'Welcome to CliAvalia - Set up your password',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Welcome to CliAvalia!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;line-height:1.6;">Your business claim for <strong>{{businessName}}</strong> has been successfully approved!</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;line-height:1.6;">To access your account and start managing your business, please set up your password by clicking the button below:</p>
<div style="text-align:center;margin:32px 0;">
<a href="{{passwordSetupUrl}}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">Set up Password</a>
</div>
<p style="margin:0 0 16px;color:#6b7280;font-size:14px;">Or copy and paste this link into your browser:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{passwordSetupUrl}}</p>
<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;border-radius:6px;">
<p style="margin:0;color:#4a4a4a;font-size:14px;"><strong>Important:</strong> This link expires after use or after 24 hours.</p>
</div>`),
    availableVariables: [
      { name: 'businessName', description: 'Claimed business name', example: 'Tech Solutions Ltd.' },
      { name: 'passwordSetupUrl', description: 'Password setup URL', example: 'https://empresas.cliavalia.com/business/register?code=abc123' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'business-claim-rejected', locale: 'en',
    description: 'Claim rejection notification sent to the claimant',
    subject: 'CliAvalia - Update on your Business Claim',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">Update on your claim</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">We regret to inform you that your business claim for <strong>{{businessName}}</strong> was not approved at this time.</p>
{{rejectionReasonSection}}
<p style="margin:20px 0 30px;color:#4a4a4a;font-size:16px;line-height:1.6;">If you believe there was an error or wish to submit a new claim, please contact us.</p>
<table role="presentation" style="margin:0 auto;"><tr><td style="background:#6b7280;border-radius:8px;"><a href="{{contactUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">Contact Support</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Claimed business name', example: 'Tech Solutions Ltd.' },
      { name: 'rejectionReasonSection', description: 'HTML block with rejection reason (empty if not provided)', example: '' },
      { name: 'contactUrl', description: 'Contact page URL', example: 'https://app.cliavalia.com/contact' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'subscription-trial-activated', locale: 'en',
    description: 'Pro trial activation notification sent to business owner',
    subject: 'Pro Trial activated — {{trialDays}} days of full access | CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">🎉 Your Pro Trial is now active!</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Hello <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;"><strong>{{businessName}}</strong> has been approved and your {{trialDays}}-day <strong>Pro</strong> trial is now active.</p>
<div style="background:#f0f9ff;border-left:4px solid #0168A6;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#0168A6;font-weight:600;">Pro access includes:</p>
<ul style="margin:8px 0 0;padding-left:20px;color:#4a4a4a;font-size:14px;"><li>Unlimited review responses</li><li>Advanced analytics</li><li>Featured business profile</li></ul>
</div>
<p style="margin:14px 0;color:#6b7280;font-size:14px;">Your trial expires on <strong>{{expiryString}}</strong>.</p>
<table role="presentation" style="margin:24px 0;"><tr>
<td><a href="{{dashboardUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Go to Dashboard</a></td>
<td style="padding-left:12px;"><a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#f3f4f6;color:#374151;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">View Plans</a></td>
</tr></table>`),
    availableVariables: [
      { name: 'ownerName', description: 'Owner name', example: 'Anne Smith' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'trialDays', description: 'Trial duration in days', example: '60' },
      { name: 'expiryString', description: 'Formatted expiry date', example: 'June 12, 2025' },
      { name: 'dashboardUrl', description: 'Business dashboard URL', example: 'https://empresas.cliavalia.com/business/dashboard' },
      { name: 'plansUrl', description: 'Plans page URL', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'subscription-trial-ending-soon', locale: 'en',
    description: 'Pro trial expiry warning (sent ≤3 days before expiry)',
    subject: 'Your Pro trial expires on {{expiryString}} — renew now',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">⏰ Your trial is ending soon</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Hello <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Your Pro trial for <strong>{{businessName}}</strong> expires on <strong>{{expiryString}}</strong>.</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#92400e;">After expiry, your account will move to the free plan and you will lose access to review responses and advanced analytics.</p>
</div>
<p style="margin:14px 0;color:#4a4a4a;font-size:15px;">Upgrade to the Pro plan to keep all your features.</p>
<a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Upgrade to Pro</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Owner name', example: 'Anne Smith' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'expiryString', description: 'Formatted expiry date', example: 'April 15, 2025' },
      { name: 'plansUrl', description: 'Plans page URL', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'subscription-trial-expired', locale: 'en',
    description: 'Pro trial expiry notification sent to business owner',
    subject: 'Pro Trial expired - upgrade your plan to continue - CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">Free Pro Trial Expired</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Hello <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">The free Pro trial for <strong>{{businessName}}</strong> has expired. Your account is now on the free plan.</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:6px;margin:20px 0;">
<p style="margin:0;font-size:14px;color:#7f1d1d;">Review responses and advanced analytics are disabled on the free plan.</p>
</div>
<p style="margin:14px 0;color:#4a4a4a;font-size:15px;">Upgrade to the Pro plan to regain full access.</p>
<a href="{{plansUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Upgrade to Pro</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Owner name', example: 'Anne Smith' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'plansUrl', description: 'Plans page URL', example: 'https://empresas.cliavalia.com/business/plans' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'subscription-pro-activated', locale: 'en',
    description: 'Pro plan activation/renewal confirmation',
    subject: 'Pro plan activated — welcome to CliAvalia Pro!',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;">✅ Pro Plan Activated</h2>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">Hello <strong>{{ownerName}}</strong>,</p>
<p style="margin:0 0 14px;color:#4a4a4a;font-size:15px;">The Pro plan for <strong>{{businessName}}</strong> has been successfully activated. Your access includes:</p>
<div style="background:#f0f9ff;border-left:4px solid #0168A6;padding:16px;border-radius:6px;margin:20px 0;">
<ul style="margin:0;padding-left:20px;color:#4a4a4a;font-size:14px;"><li>Unlimited review responses</li><li>Advanced analytics</li><li>Featured business profile</li></ul>
</div>
<p style="margin:14px 0;color:#6b7280;font-size:14px;">Access valid until <strong>{{endString}}</strong>.</p>
<a href="{{dashboardUrl}}" style="display:inline-block;padding:12px 28px;background:#0168A6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">Go to Dashboard</a>`),
    availableVariables: [
      { name: 'ownerName', description: 'Owner name', example: 'Anne Smith' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'endString', description: 'Formatted Pro plan end date', example: 'April 13, 2026' },
      { name: 'dashboardUrl', description: 'Business dashboard URL', example: 'https://empresas.cliavalia.com/business/dashboard' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'review-new-review', locale: 'en',
    description: 'Notification sent to the business when a new review is received',
    subject: 'New review received for {{businessName}} - CliAvalia Empresas',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 18px;color:#1a1a1a;font-size:22px;font-weight:600;">You received a new review!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">Your business <strong>{{businessName}}</strong> received a new review{{byLine}}.</p>
<p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:600;">"{{reviewTitle}}" — {{starsLabel}}</p>
<div style="background:#f9fafb;border-left:4px solid #0168A6;padding:18px 20px;margin:22px 0;border-radius:8px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">{{reviewExcerpt}}</p>
</div>
<table role="presentation" style="margin:30px auto 0;"><tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;"><a href="{{dashboardUrl}}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View in business area</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'reviewTitle', description: 'Review title', example: 'Excellent service!' },
      { name: 'starsLabel', description: 'Rating in text', example: '5 stars' },
      { name: 'byLine', description: 'Text " by ReviewerName" or empty', example: ' by John Smith' },
      { name: 'reviewExcerpt', description: 'Review excerpt (up to 200 chars)', example: 'Great customer service and fast delivery...' },
      { name: 'dashboardUrl', description: 'Reviews inbox URL', example: 'https://empresas.cliavalia.com/business/dashboard/reviews/inbox' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'review-updated', locale: 'en',
    description: 'Notification sent to the business when an existing review is updated',
    subject: 'Review updated for {{businessName}} - CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 18px;color:#1a1a1a;font-size:22px;font-weight:600;">A review was updated</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:15px;line-height:1.7;">A user updated their review of <strong>{{businessName}}</strong>{{byLine}}.</p>
<p style="margin:0 0 10px;color:#6b7280;font-size:13px;font-weight:600;">"{{reviewTitle}}" — {{starsLabel}}</p>
<div style="background:#f9fafb;border-left:4px solid #0168A6;padding:18px 20px;margin:22px 0;border-radius:8px;">
<p style="margin:0;color:#1a1a1a;font-size:15px;line-height:1.6;">{{reviewExcerpt}}</p>
</div>
<table role="presentation" style="margin:30px auto 0;"><tr><td style="background:linear-gradient(135deg,#0A244D,#0168A6);border-radius:8px;"><a href="{{dashboardUrl}}" style="display:inline-block;padding:14px 30px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;border-radius:8px;">View in business area</a></td></tr></table>`),
    availableVariables: [
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'reviewTitle', description: 'Review title', example: 'Updated experience' },
      { name: 'starsLabel', description: 'Rating in text', example: '4 stars' },
      { name: 'byLine', description: 'Text " by ReviewerName" or empty', example: '' },
      { name: 'reviewExcerpt', description: 'Updated review excerpt', example: 'I updated my review because...' },
      { name: 'dashboardUrl', description: 'Reviews inbox URL', example: 'https://empresas.cliavalia.com/business/dashboard/reviews/inbox' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'review-business-reply', locale: 'en',
    description: 'Notification sent to the reviewer when the business replies',
    subject: '{{businessName}} replied to your review - CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:24px;font-weight:600;">You received a reply to your review!</h2>
<p style="margin:0 0 16px;color:#4a4a4a;font-size:16px;">Hello {{reviewerName}},</p>
<p style="margin:0 0 24px;color:#4a4a4a;font-size:16px;"><strong>{{businessName}}</strong> replied to your review "<strong>{{reviewTitle}}</strong>".</p>
<div style="background:#f9fafb;border-left:4px solid #2563eb;padding:20px;margin:24px 0;border-radius:8px;">
<p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Business reply:</p>
<p style="margin:0;color:#1a1a1a;font-size:16px;line-height:1.6;">{{businessReply}}</p>
</div>
<table role="presentation" style="margin:30px auto 0 auto;"><tr><td style="background:#2563eb;border-radius:8px;"><a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">View full reply</a></td></tr></table>`),
    availableVariables: [
      { name: 'reviewerName', description: 'Reviewer name', example: 'John Smith' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'reviewTitle', description: 'Review title', example: 'Excellent service!' },
      { name: 'businessReply', description: 'Business reply text', example: 'Thank you for your feedback!' },
      { name: 'reviewUrl', description: 'Full review URL', example: 'https://app.cliavalia.com/reviews/123' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'review-appeal-approved', locale: 'en',
    description: 'Appeal approval notification sent to the reviewer',
    subject: 'Your appeal has been approved - CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:28px;font-weight:600;">Your appeal has been approved!</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">We are pleased to inform you that your appeal for the review "<strong>{{reviewTitle}}</strong>" about <strong>{{businessName}}</strong> has been approved.</p>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">Your review has been published and is now visible on the platform.</p>
<table role="presentation" style="margin:0 auto 20px;"><tr><td style="background:#2563eb;border-radius:8px;"><a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">View my reviews</a></td></tr></table>
<p style="margin:20px 0 0;color:#6b7280;font-size:14px;">Thank you for being part of the CliAvalia community!</p>`),
    availableVariables: [
      { name: 'reviewTitle', description: 'Appealed review title', example: 'Positive experience' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'reviewUrl', description: 'User reviews URL', example: 'https://app.cliavalia.com/user/my-reviews' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'review-appeal-rejected', locale: 'en',
    description: 'Appeal rejection notification sent to the reviewer',
    subject: 'Update on your appeal - CliAvalia',
    htmlBody: empresasWrapperEn(`
<h2 style="margin:0 0 20px;color:#1a1a1a;font-size:28px;font-weight:600;">Update on your appeal</h2>
<p style="margin:0 0 20px;color:#4a4a4a;font-size:16px;line-height:1.6;">We regret to inform you that your appeal for the review "<strong>{{reviewTitle}}</strong>" about <strong>{{businessName}}</strong> was not approved.</p>
<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;text-align:left;">
<p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Rejection reason:</p>
<p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">{{reason}}</p>
</div>
<p style="margin:0 0 30px;color:#4a4a4a;font-size:16px;line-height:1.6;">If you have questions, please contact us.</p>
<table role="presentation" style="margin:0 auto;"><tr><td style="background:#6b7280;border-radius:8px;"><a href="{{reviewUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;border-radius:8px;">View my reviews</a></td></tr></table>`),
    availableVariables: [
      { name: 'reviewTitle', description: 'Appealed review title', example: 'Positive experience' },
      { name: 'businessName', description: 'Business name', example: 'Tech Solutions Ltd.' },
      { name: 'reason', description: 'Appeal rejection reason', example: 'The review violates our usage policies.' },
      { name: 'reviewUrl', description: 'User reviews URL', example: 'https://app.cliavalia.com/user/my-reviews' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'admin-new-reviewer-verification', locale: 'en',
    description: 'Internal alert sent to admin when a reviewer submits a verification request',
    subject: 'New verification request: {{userEmail}}',
    htmlBody: adminWrapperEn('New Verification Request', `
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">Verification request received</h2>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">A reviewer has submitted a new profile verification request <strong>(selfie + ID document)</strong>.</p>
<div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:8px;margin-bottom:28px;padding:20px;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;width:150px;">Reviewer email</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{userEmail}}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">Submitted on</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{submissionDate}}</td></tr>
<tr><td style="padding:6px 0;color:#64748b;font-size:13px;font-weight:600;">Verification ID</td><td style="padding:6px 0;color:#020617;font-size:14px;">{{verificationId}}</td></tr>
</table>
</div>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{adminDashboardUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Review request</a></td></tr></table>`),
    availableVariables: [
      { name: 'userEmail', description: 'Reviewer email', example: 'reviewer@example.com' },
      { name: 'submissionDate', description: 'Formatted submission date', example: 'April 13, 2025, 2:30 PM' },
      { name: 'verificationId', description: 'Verification request ID', example: 'abc123xyz' },
      { name: 'adminDashboardUrl', description: 'Admin panel URL for verifications', example: 'https://app.cliavalia.com/shaolin/profile-verifications/pending' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'reviewer-verification-approved', locale: 'en',
    description: 'Verification approval notification sent to reviewer',
    subject: 'CliAvalia - Profile verification approved',
    htmlBody: adminWrapperEn('Profile Verification', `
<div style="display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;margin-bottom:18px;">✔ Approved</div>
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">Your verification has been approved 🎉</h2>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">Thank you for submitting your verification. Your reviewer account verification request has been <strong>successfully approved</strong>.</p>
<p style="margin:0;color:#475569;font-size:16px;line-height:1.6;">You can continue using <strong>CliAvalia</strong> normally.</p>`),
    availableVariables: [
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'reviewer-verification-rejected', locale: 'en',
    description: 'Verification rejection notification sent to reviewer',
    subject: 'CliAvalia - Profile verification update',
    htmlBody: adminWrapperEn('Verification Update', `
<div style="display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;margin-bottom:18px;">⚠ Not approved</div>
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">Your request was not approved</h2>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">We were unable to approve your verification at this time. You may submit a new request with updated documents from your account.</p>
{{reasonBlock}}
<div style="background:#f8fafc;border-left:4px solid #f59e0b;border-radius:8px;margin-top:24px;padding:18px;">
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">If you have any questions, contact us at <a href="mailto:suporte@cliavalia.com" style="color:#2563eb;text-decoration:none;font-weight:500;">suporte@cliavalia.com</a>.</p>
</div>`),
    availableVariables: [
      { name: 'reasonBlock', description: 'HTML block with rejection reason (empty if not provided)', example: '<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;margin:20px 0;border-radius:4px;"><p style="margin:0;color:#7f1d1d;font-size:14px;">Illegible document.</p></div>' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2025' },
    ],
  },
  {
    key: 'account-deletion-scheduled',
    locale: 'en',
    description: 'Confirmation sent when an account is scheduled for deletion with a grace period',
    subject: 'Your account is scheduled for deletion',
    htmlBody: adminWrapperEn('Account Deletion', `
<h2 style="margin:0 0 12px;color:#020617;font-size:24px;font-weight:700;">Your account is scheduled for deletion</h2>
<p style="margin:0 0 18px;color:#475569;font-size:16px;line-height:1.6;">We received your request to delete your CliAvalia account. Your profile has been deactivated and your reviews are no longer linked to your identity.</p>
<div style="background:#fff7ed;border-left:4px solid #f97316;border-radius:8px;margin:0 0 24px;padding:18px;">
<p style="margin:0 0 8px;color:#9a3412;font-size:14px;font-weight:600;">Permanent deletion date</p>
<p style="margin:0;color:#7c2d12;font-size:15px;line-height:1.6;">{{scheduledDeletionDate}}</p>
</div>
<p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">You can cancel this request by signing in again within {{graceDays}} days.</p>
<table role="presentation" style="margin:0 auto 20px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{loginUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Sign in to cancel</a></td></tr></table>
<p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">If you need help, contact us at <a href="mailto:{{supportEmail}}" style="color:#2563eb;text-decoration:none;font-weight:500;">{{supportEmail}}</a>.</p>`),
    availableVariables: [
      { name: 'scheduledDeletionDate', description: 'Expected permanent deletion date', example: 'June 7, 2026, 03:00 UTC' },
      { name: 'graceDays', description: 'Grace period length in days', example: '30' },
      { name: 'loginUrl', description: 'Login page URL used to cancel the deletion request', example: 'https://app.cliavalia.com/login' },
      { name: 'supportEmail', description: 'Support email address', example: 'suporte@cliavalia.com' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2026' },
    ],
  },
  {
    key: 'consumer-email-confirmation',
    locale: 'en',
    description: 'Email confirmation link for main app (non-business) users',
    subject: 'Confirm your email – CliAvalia',
    htmlBody: adminWrapperEn('Confirm your email', `
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">Thank you for signing up with <strong>CliAvalia</strong>. To activate your account, please confirm your email address by clicking the button below.</p>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{confirmationUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Confirm email</a></td></tr></table>
<p style="margin:0 0 8px;color:#64748b;font-size:14px;">If the button does not work, copy and paste this link into your browser:</p>
<p style="margin:0;color:#2563eb;font-size:13px;word-break:break-all;">{{confirmationUrl}}</p>
<p style="margin:24px 0 0;color:#64748b;font-size:14px;line-height:1.6;">If you did not create a CliAvalia account, you can ignore this email.</p>`),
    availableVariables: [
      { name: 'firstName', description: 'User first name', example: 'John' },
      { name: 'confirmationUrl', description: 'Confirmation URL (Strapi API)', example: 'https://api.example.com/api/auth/email-confirmation?confirmation=abc' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2026' },
    ],
  },
  {
    key: 'consumer-forgot-password',
    locale: 'en',
    description: 'Password reset link for main app (non-business) users',
    subject: 'Reset your password – CliAvalia',
    htmlBody: adminWrapperEn('Reset your password', `
<p style="margin:0 0 16px;color:#475569;font-size:16px;line-height:1.6;">Hello <strong>{{firstName}}</strong>,</p>
<p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">We received a request to reset the password for your CliAvalia account. Click the button below to choose a new password.</p>
<table role="presentation" style="margin:0 auto 24px;"><tr><td style="background:linear-gradient(135deg,#2563eb,#1e40af);border-radius:10px;"><a href="{{resetUrl}}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Reset password</a></td></tr></table>
<p style="margin:0 0 8px;color:#64748b;font-size:14px;">If the button does not work, copy and paste this link:</p>
<p style="margin:0 0 24px;color:#2563eb;font-size:13px;word-break:break-all;">{{resetUrl}}</p>
<div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:16px;border-radius:8px;">
<p style="margin:0;color:#475569;font-size:14px;line-height:1.6;"><strong>Note:</strong> This link stops working after it is used or when it expires. If you did not request this, you can ignore this email.</p>
</div>`),
    availableVariables: [
      { name: 'firstName', description: 'User first name', example: 'Jane' },
      { name: 'resetUrl', description: 'Reset page URL with code query', example: 'https://app.cliavalia.com/auth/reset-password?code=...' },
      { name: 'year', description: 'Current year (auto-injected)', example: '2026' },
    ],
  },
];

// ─── Export combined ──────────────────────────────────────────────────────────

export const DEFAULT_TEMPLATES: TemplateDefault[] = [...PT, ...EN];
