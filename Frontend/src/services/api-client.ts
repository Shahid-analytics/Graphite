import { config } from '@/lib/config'
import { ApiError } from './api-error'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type QueryValue = string | number | boolean | null | undefined | string[]

export interface RequestOptions {
  query?: Record<string, QueryValue> | object
  body?: unknown
  signal?: AbortSignal
  timeoutMs?: number
  /** "blob" for file downloads such as audit exports. */
  responseType?: 'json' | 'blob'
}

export interface TransportRequest {
  method: HttpMethod
  path: string
  query: Record<string, string | string[]>
  body: unknown
  signal?: AbortSignal
  responseType: 'json' | 'blob'
}

let accessToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

/**
 * Optional bearer token, held in memory only (never localStorage). Deployments
 * using an HttpOnly session cookie can leave this unset.
 */
export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Called once for any 401 response so the app can return to the sign-in screen. */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

function normaliseQuery(query: RequestOptions['query']) {
  const out: Record<string, string | string[]> = {}
  if (!query) return out
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue
    out[key] = Array.isArray(value) ? value : String(value)
  }
  return out
}

function buildUrl(path: string, query: Record<string, string | string[]>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.append(key, value)
  }
  const qs = params.toString()
  return `${config.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`
}

async function liveTransport<T>(req: TransportRequest, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
  const onAbort = () => controller.abort(req.signal?.reason)
  req.signal?.addEventListener('abort', onAbort)

  const headers: Record<string, string> = {
    Accept: req.responseType === 'blob' ? '*/*' : 'application/json',
    'X-Request-Id': crypto.randomUUID(),
  }
  if (req.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(req.path, req.query), {
      method: req.method,
      headers,
      credentials: 'include',
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    })
  } catch (cause) {
    if (req.signal?.aborted) throw cause
    const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError'
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'network_error',
      timedOut
        ? `The server did not respond within ${Math.round(timeoutMs / 1000)} seconds.`
        : `Could not reach the API at ${config.apiBaseUrl}. Check that the backend is running.`,
    )
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onAbort)
  }

  if (response.status === 401) unauthorizedHandler?.()

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw ApiError.fromBody(response.status, body, `Request failed with status ${response.status}.`)
  }

  if (req.responseType === 'blob') return (await response.blob()) as T
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const req: TransportRequest = {
    method,
    path,
    query: normaliseQuery(options.query),
    body: options.body,
    signal: options.signal,
    responseType: options.responseType ?? 'json',
  }

  // Mock mode is decided at build time; the mock bundle is loaded lazily and is
  // never used as a fallback for live-mode failures.
  if (config.apiMode === 'mock') {
    const { mockTransport } = await import('@/mocks/mock-api')
    try {
      return await mockTransport<T>(req)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) unauthorizedHandler?.()
      throw error
    }
  }
  return liveTransport<T>(req, options.timeoutMs ?? config.apiTimeoutMs)
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T = void>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
}
