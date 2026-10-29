import type { HttpMethod, TransportRequest } from '@/services/api-client'
import type { Session } from '@/types'

/** Error thrown by mock handlers; converted to the standard API error envelope. */
export class MockHttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly fieldErrors?: { field: string; message: string }[]

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: Record<string, unknown>; fieldErrors?: { field: string; message: string }[] } = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.details = extra.details
    this.fieldErrors = extra.fieldErrors
  }
}

export const httpError = {
  badRequest: (message: string, fieldErrors?: { field: string; message: string }[]) =>
    new MockHttpError(400, 'bad_request', message, { fieldErrors }),
  validation: (fieldErrors: { field: string; message: string }[], message = 'Some fields are invalid.') =>
    new MockHttpError(422, 'validation_error', message, { fieldErrors }),
  unauthorized: (message = 'Your session has expired. Please sign in again.') =>
    new MockHttpError(401, 'unauthenticated', message),
  forbidden: (message = 'Your role does not allow this action.') => new MockHttpError(403, 'forbidden', message),
  notFound: (resource: string, id?: string) =>
    new MockHttpError(404, 'not_found', `${resource}${id ? ` "${id}"` : ''} was not found.`),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new MockHttpError(409, code, message, { details }),
}

export interface MockContext {
  params: Record<string, string>
  query: Record<string, string | string[]>
  body: unknown
  session: Session | null
}

export type MockHandler = (ctx: MockContext) => unknown | Promise<unknown>

export interface MockRoute {
  method: HttpMethod
  /** Express-style path with :params, relative to /api/v1, e.g. "/sources/:sourceId". */
  path: string
  handler: MockHandler
  /** Routes that do not require a signed-in session. */
  public?: boolean
}

interface CompiledRoute extends MockRoute {
  regex: RegExp
  keys: string[]
}

export function compileRoutes(routes: MockRoute[]): CompiledRoute[] {
  return routes.map((route) => {
    const keys: string[] = []
    const pattern = route.path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1))
          return '([^/]+)'
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('/')
    return { ...route, keys, regex: new RegExp(`^${pattern}/?$`) }
  })
}

export function matchRoute(routes: CompiledRoute[], req: Pick<TransportRequest, 'method' | 'path'>) {
  let pathMatched = false
  for (const route of routes) {
    const match = route.regex.exec(req.path)
    if (!match) continue
    pathMatched = true
    if (route.method !== req.method) continue
    const params: Record<string, string> = {}
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1])
    })
    return { route, params }
  }
  if (pathMatched) throw new MockHttpError(405, 'method_not_allowed', `${req.method} is not supported for ${req.path}.`)
  throw new MockHttpError(404, 'not_found', `No mock handler for ${req.method} ${req.path}.`)
}

/** Query helpers. */
export function qString(ctx: MockContext, key: string): string | undefined {
  const value = ctx.query[key]
  return Array.isArray(value) ? value[0] : value
}

export function qNumber(ctx: MockContext, key: string, fallback: number) {
  const value = Number(qString(ctx, key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function qBool(ctx: MockContext, key: string): boolean | undefined {
  const value = qString(ctx, key)
  if (value === undefined) return undefined
  return value === 'true' || value === '1'
}

export function paginate<T>(items: T[], ctx: MockContext, defaultPageSize = 20) {
  const page = qNumber(ctx, 'page', 1)
  const pageSize = Math.min(qNumber(ctx, 'page_size', defaultPageSize), 500)
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, page_size: pageSize, total: items.length }
}

/** Sorts by "field" or "-field" (descending). */
export function sortBy<T>(items: T[], sort: string | undefined, fallback?: string) {
  const spec = sort || fallback
  if (!spec) return items
  const desc = spec.startsWith('-')
  const field = desc ? spec.slice(1) : spec
  return [...items].sort((a, b) => {
    const av = (a as Record<string, unknown>)[field]
    const bv = (b as Record<string, unknown>)[field]
    if (av === bv) return 0
    if (av === null || av === undefined) return 1
    if (bv === null || bv === undefined) return -1
    const result = av > bv ? 1 : -1
    return desc ? -result : result
  })
}

export function matchesText(q: string | undefined, ...fields: (string | null | undefined)[]) {
  if (!q) return true
  const needle = q.toLowerCase()
  return fields.some((field) => field?.toLowerCase().includes(needle))
}

export function body<T>(ctx: MockContext): T {
  return (ctx.body ?? {}) as T
}
