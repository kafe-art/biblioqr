import 'dotenv/config'
import { z } from 'zod'

// On Render, default the allowed origin to the service's own public URL.
if (!process.env.CORS_ORIGIN && process.env.RENDER_EXTERNAL_URL) process.env.CORS_ORIGIN = process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')

const positive =z.coerce.number().positive()
const integer = positive.int()
const schema = z.object({
  JWT_SECRET: z.string().min(32), QR_HMAC_SECRET: z.string().min(32),
  DATABASE_URL: z.string().regex(/^(file:.+|postgres(?:ql)?:\/\/.+)$/), PORT: integer.max(65535), CORS_ORIGIN: z.string().url().refine(value => new URL(value).origin === value),
  POLICY_LOAN_DAYS: integer, POLICY_RENEWAL_DAYS: integer,
  POLICY_MAX_RENEWALS: z.coerce.number().int().nonnegative(), POLICY_MAX_LOANS: integer,
  POLICY_HOLD_HOURS: positive, POLICY_FINE_PER_DAY: positive,
  POLICY_CURRENCY: z.string().min(1), POLICY_WARN_DAYS: integer,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Passwordless student access and email delivery.
  STUDENT_EMAIL_DOMAIN: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/).default('alumnos.unp.edu.pe'),
  ADMIN_EMAIL: z.union([z.literal(''), z.string().trim().toLowerCase().email()]).default(''),
  BREVO_API_KEY: z.string().trim().default(''),
  MAIL_FROM_EMAIL: z.union([z.literal(''), z.string().trim().email()]).default(''),
  MAIL_FROM_NAME: z.string().trim().min(1).default('BiblioQR'),
}).refine(value => value.JWT_SECRET !== value.QR_HMAC_SECRET, { path: ['QR_HMAC_SECRET'], message: 'Los secretos deben ser diferentes.' })
const result = schema.safeParse(process.env)
if (!result.success) throw new Error(`Configuración de entorno inválida: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`)
export const env = result.data
export const policy = {
  loanDays: env.POLICY_LOAN_DAYS, renewalDays: env.POLICY_RENEWAL_DAYS,
  maxRenewals: env.POLICY_MAX_RENEWALS, maxLoans: env.POLICY_MAX_LOANS,
  holdHours: env.POLICY_HOLD_HOURS, finePerDay: env.POLICY_FINE_PER_DAY,
  currency: env.POLICY_CURRENCY, warnDays: env.POLICY_WARN_DAYS,
}
