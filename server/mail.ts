import { env } from './env'
import { HttpError } from './http'

export type CodePurpose = 'login' | 'password'

const COPY: Record<CodePurpose, { subject: string; title: string; lead: string }> = {
  login: { subject: 'Tu código de acceso a BiblioQR', title: 'Tu código de acceso', lead: 'Usa este código para ingresar a BiblioQR, la biblioteca de la Universidad Nacional de Piura.' },
  password: { subject: 'Código para crear tu contraseña de BiblioQR', title: 'Crea tu contraseña', lead: 'Usa este código para crear o restablecer la contraseña de tu cuenta de personal en BiblioQR.' },
}

/** Transactional email: inline styles only, table layout for broad client support. */
export function codeEmailHtml(code: string, purpose: CodePurpose, minutes: number) {
  const { title, lead } = COPY[purpose]
  const digits = code.split('').map(d => `<td style="width:44px;height:56px;background:#ffffff;border:1px solid #c7d2fe;border-radius:10px;font:700 28px/56px 'SFMono-Regular',Consolas,'Courier New',monospace;color:#1e3a8a;text-align:center;">${d}</td>`).join('<td style="width:8px"></td>')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;">Tu código de BiblioQR es ${code}. Caduca en ${minutes} minutos.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="background:linear-gradient(135deg,#1e3a8a,#4f46e5);background-color:#1e3a8a;padding:28px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:40px;height:40px;background:rgba(255,255,255,.16);border-radius:12px;text-align:center;font:700 20px/40px Arial,sans-serif;color:#6ee7b7;">▦</td>
        <td style="padding-left:12px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.2px;">BiblioQR</td>
      </tr></table>
      <p style="margin:10px 0 0;font-size:13px;color:#c7d2fe;">Biblioteca Central · Universidad Nacional de Piura</p>
    </td></tr>
    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">${title}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#475569;">${lead}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;border:1px solid #e0e7ff;border-radius:16px;">
        <tr><td align="center" style="padding:24px 12px 8px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#4f46e5;">Código de verificación</td></tr>
        <tr><td align="center" style="padding:4px 12px 24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table></td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:14px;color:#0f172a;">⏱ Este código caduca en <strong>${minutes} minutos</strong> y solo puede usarse una vez.</p>
      <p style="margin:12px 0 0;padding:12px 14px;background:#fef2f2;border-radius:10px;font-size:13px;line-height:1.5;color:#991b1b;">🔒 No compartas este código con nadie. El personal de la biblioteca nunca te lo pedirá.</p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#64748b;">Si no solicitaste este código, puedes ignorar este correo: tu cuenta sigue segura.</p>
    </td></tr>
    <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">Correo automático de BiblioQR. No respondas a este mensaje.</td></tr>
  </table>
</td></tr></table>
</body></html>`
}

export async function sendCodeEmail(to: string, code: string, purpose: CodePurpose, minutes: number) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM_EMAIL) {
    if (env.NODE_ENV === 'production') throw new HttpError(503, 'El envío de correos no está configurado. Contacta a la biblioteca.')
    console.log(`[BiblioQR · correo simulado] ${COPY[purpose].subject} → ${to}: ${code}`)
    return
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: env.MAIL_FROM_EMAIL, name: env.MAIL_FROM_NAME },
      to: [{ email: to }],
      subject: COPY[purpose].subject,
      htmlContent: codeEmailHtml(code, purpose, minutes),
      textContent: `${COPY[purpose].title}: ${code}. Caduca en ${minutes} minutos. No compartas este código.`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) {
    console.error('Brevo rechazó el envío:', response?.status, await response?.text().catch(() => ''))
    throw new HttpError(502, 'No pudimos enviar el correo. Intenta nuevamente en unos minutos.')
  }
}
