import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const payloadSchema = z.object({ rid: z.string().min(1), cid: z.string().min(1), uid: z.string().min(1), exp: z.number().int().positive(), nonce: z.string().min(16) }).strict()
export type QrPayload = z.infer<typeof payloadSchema>
export function signQr(payload: QrPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payloadSchema.parse(payload))).toString('base64url')
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`
}
export function verifyQr(token: string, secret: string): QrPayload {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) throw new Error('Firma QR inválida.')
  const expected = createHmac('sha256', secret).update(parts[0]).digest()
  const signature = Buffer.from(parts[1], 'base64url')
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('Firma QR inválida.')
  return payloadSchema.parse(JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')))
}
