export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
  let response: Response
  try {
    response = await fetch(`${base}/api${path}`, {
      method: options.method ?? 'GET', credentials: 'include',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch { throw new ApiError(0, 'No se pudo conectar con el servidor.') }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, data?.error ?? 'No se pudo completar la operación.')
  if (data === null) throw new ApiError(502, 'Respuesta inválida del servidor.')
  return data as T
}
