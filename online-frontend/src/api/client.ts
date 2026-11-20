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

/**
 * The response itself, for callers that handle a status apiFetch would treat as an error (the table poll's 304).
 * Network failures and time-outs still throw ApiError(0); any other non-2xx except `allow` throws the server's error.
 */
export async function apiResponse(path: string, init?: RequestInit, allow: number[] = []): Promise<Response> {
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
  if (!response.ok && !allow.includes(response.status)) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null
    throw new ApiError(response.status, body?.error ?? response.statusText, body?.code, { ...body })
  }
  return response
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiResponse(path, init)
  return (await response.json()) as T
}

/** Longer than a normal request: a phone photo on a weak connection takes a while to go up. */
const UPLOAD_TIMEOUT_MS = 60_000

export interface UploadOptions {
  /** 0..1 as the bytes go out. */
  onProgress?: (fraction: number) => void
  /** Abort to cancel; the promise then rejects with a DOMException named AbortError. */
  signal?: AbortSignal
}

/**
 * POST a form with upload progress and cancel (fetch has neither). Same errors as apiFetch: a network failure or a
 * time-out is ApiError(0); any other non-2xx is the server's { error, code } as an ApiError.
 */
export function uploadForm<T>(path: string, body: FormData, { onProgress, signal }: UploadOptions = {}, headers: Record<string, string> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', apiUrl(path))
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.setRequestHeader('Accept', 'application/json')
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(parsed as T)
      const failure = parsed as { error?: string; code?: string } | null
      reject(new ApiError(xhr.status, failure?.error ?? xhr.statusText, failure?.code, { ...failure }))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Network error'))
    xhr.ontimeout = () => reject(new ApiError(0, 'Network error'))
    signal?.addEventListener('abort', () => {
      xhr.abort()
      reject(new DOMException('Aborted', 'AbortError'))
    })
    xhr.send(body)
  })
}

/** Plain-language message for whatever went wrong; always ends in something the person can do. */
export function friendlyErrorKey(error: unknown): TranslationKey {
  if (!(error instanceof ApiError)) return 'err.generic'
  if (error.status === 0) return 'err.network'
  if (error.status === 429) return 'err.busy'
  if (error.status === 404) return 'err.notFound'
  return 'err.generic'
}
