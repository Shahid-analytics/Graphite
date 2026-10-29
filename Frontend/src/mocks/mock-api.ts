import { config } from '@/lib/config'
import { ApiError } from '@/services/api-error'
import type { TransportRequest } from '@/services/api-client'
import { routes as analyticsRoutes } from './handlers/analytics'
import { routes as auditRoutes } from './handlers/audit'
import { routes as authRoutes } from './handlers/auth'
import { routes as healthRoutes } from './handlers/health'
import { routes as mappingRoutes } from './handlers/mapping'
import { routes as modelRoutes } from './handlers/models'
import { routes as notificationRoutes } from './handlers/notifications'
import { routes as overviewRoutes } from './handlers/overview'
import { routes as pipelineRoutes } from './handlers/pipelines'
import { routes as proposalRoutes } from './handlers/proposals'
import { routes as runRoutes } from './handlers/runs'
import { routes as scheduleRoutes } from './handlers/schedules'
import { routes as searchRoutes } from './handlers/search'
import { routes as settingsRoutes } from './handlers/settings'
import { routes as sourceRoutes } from './handlers/sources'
import { routes as transformationRoutes } from './handlers/transformations'
import { routes as workspaceRoutes } from './handlers/workspaces'
import { compileRoutes, matchRoute, MockHttpError } from './router'
import { currentSession, settleRuns } from './store'
import { clone } from './util'

const ROUTES = compileRoutes([
  ...healthRoutes,
  ...authRoutes,
  ...workspaceRoutes,
  ...overviewRoutes,
  ...sourceRoutes,
  ...pipelineRoutes,
  ...runRoutes,
  ...transformationRoutes,
  ...mappingRoutes,
  ...proposalRoutes,
  ...modelRoutes,
  ...scheduleRoutes,
  ...analyticsRoutes,
  ...auditRoutes,
  ...notificationRoutes,
  ...settingsRoutes,
  ...searchRoutes,
])

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    })
  })
}

/**
 * In-browser implementation of the REST API used in mock mode. Requests are
 * matched against the same paths the FastAPI backend will expose; responses are
 * deep-cloned so callers can never mutate the mock database directly.
 */
export async function mockTransport<T>(req: TransportRequest): Promise<T> {
  const jitter = Math.round(config.mockLatencyMs * (0.6 + Math.random() * 0.8))
  await delay(jitter, req.signal)

  try {
    settleRuns()
    const { route, params } = matchRoute(ROUTES, req)
    const session = currentSession()
    if (!route.public && !session) throw new MockHttpError(401, 'unauthenticated', 'Your session has expired. Please sign in again.')
    const result = await route.handler({ params, query: req.query, body: req.body === undefined ? undefined : clone(req.body), session })
    return (result instanceof Blob ? result : clone(result)) as T
  } catch (error) {
    if (error instanceof MockHttpError) {
      throw new ApiError(error.status, error.code, error.message, {
        details: error.details,
        fieldErrors: error.fieldErrors,
        requestId: `mock-${Math.random().toString(36).slice(2, 10)}`,
      })
    }
    if (error instanceof ApiError) throw error
    console.error('[mock-api] Unhandled error in mock handler', error)
    throw new ApiError(500, 'internal_error', 'The mock API raised an unexpected error.')
  }
}
