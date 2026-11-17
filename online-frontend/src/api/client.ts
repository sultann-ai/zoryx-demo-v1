import type { TranslationKey } from '../i18n'

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  /** HTTP status; 0 means the request never reached the server. */
  status: number
  /** Backend error code (e.g. ORDERING_CLOSED), when it sends one. */
  code?: string
  /** The whole parsed error body (e.g. minOrderAmount on BELOW_MINIMUM). */
  details: Record<string, unknown>
  constructor(status: number, message: string, code?: string, details: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** The API returns image URLs relative to its own origin. */
export const apiUrl = (path: string): string => (/^https?:/i.test(path) ? path : `${BASE}${path}`)

/** A request that gets no answer for this long counts as a network failure (slow data must not mean an endless spinner). */
const TIMEOUT_MS = 12_000

function timeoutSignal(): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(TIMEOUT_MS)
  const controller = new AbortController() // older phones
  setTimeout(() => controller.abort(), TIMEOUT_MS)
  return controller.signal
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      signal: timeoutSignal(),
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'Network error')
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null
    throw new ApiError(response.status, body?.error ?? response.statusText, body?.code, { ...body })
  }
  return (await response.json()) as T
}

/** Plain-language message for whatever went wrong; always ends in something the person can do. */
export function friendlyErrorKey(error: unknown): TranslationKey {
  if (!(error instanceof ApiError)) return 'err.generic'
  if (error.status === 0) return 'err.network'
  if (error.status === 429) return 'err.busy'
  if (error.status === 404) return 'err.notFound'
  return 'err.generic'
}
