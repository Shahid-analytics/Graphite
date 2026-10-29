import { beforeEach, describe, expect, it } from 'vitest'
import { routes as authRoutes } from '../handlers/auth'
import { routes as notificationRoutes } from '../handlers/notifications'
import { routes as workspaceRoutes } from '../handlers/workspaces'
import { compileRoutes, matchRoute, MockHttpError, type MockContext } from '../router'
import { db, resetDb, sessionFor } from '../store'
import type { NotificationList, OnboardingState, Workspace } from '@/types'

const compiled = compileRoutes([...authRoutes, ...workspaceRoutes, ...notificationRoutes])

type Method = 'GET' | 'POST' | 'PATCH'

function call<T>(method: Method, path: string, options: { body?: unknown; query?: Record<string, string>; user?: string | null } = {}): T {
  const { route, params } = matchRoute(compiled, { method, path })
  const user = options.user === undefined ? 'usr_ananya' : options.user
  const ctx: MockContext = { params, query: options.query ?? {}, body: options.body, session: user ? sessionFor(user) : null }
  return route.handler(ctx) as T
}

function callError(method: Method, path: string, options: Parameters<typeof call>[2] = {}) {
  try {
    call(method, path, options)
  } catch (error) {
    if (error instanceof MockHttpError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

const newWorkspace = (extra: Record<string, unknown> = {}) => ({ name: 'Southwind Foods', region: 'ap-south-1 (Mumbai)', timezone: 'Asia/Kolkata', ...extra })

beforeEach(() => resetDb())

describe('onboarding updates', () => {
  const path = '/workspaces/ws_northwind/onboarding'

  it('requires a step or a dismissed flag', () => {
    const error = callError('PATCH', path, { body: {} })
    expect(error.status).toBe(422)
    expect(error.fieldErrors?.[0].field).toBe('step')
  })

  it('enforces the permission of each step', () => {
    db.memberships.push({ user_id: 'usr_priya', workspace_id: 'ws_northwind', role: 'editor', status: 'active', joined_at: null, last_active_at: null })
    expect(callError('PATCH', path, { body: { step: 'source' }, user: 'usr_priya' }).status).toBe(403)
    expect(callError('PATCH', path, { body: { step: 'destination' }, user: 'usr_priya' }).status).toBe(403)
    expect(callError('PATCH', path, { body: { dismissed: true }, user: 'usr_priya' }).status).toBe(403)
    expect(db.workspaces.find((w) => w.id === 'ws_northwind')?.onboarding.dismissed).toBe(false)
  })

  it('audits each change and the completion transition once', () => {
    const state = call<OnboardingState>('PATCH', path, { body: { step: 'source' } })
    expect(state.steps.source).toBe(true)
    const updated = db.auditEvents[0]
    expect(updated.action).toBe('workspace.onboarding_updated')
    expect(updated.changes).toEqual([{ field: 'steps.source', before: false, after: true }])

    for (const step of ['destination', 'ingestion', 'transformation', 'analytics']) call('PATCH', path, { body: { step } })
    const completedEvents = () => db.auditEvents.filter((e) => e.workspace_id === 'ws_northwind' && e.action === 'workspace.onboarding_completed')
    expect(completedEvents()).toHaveLength(1)

    // Re-marking a done step changes nothing and does not complete onboarding again.
    const before = db.auditEvents.length
    const again = call<OnboardingState>('PATCH', path, { body: { step: 'analytics' } })
    expect(again.completed_at).not.toBeNull()
    expect(db.auditEvents).toHaveLength(before)
    expect(completedEvents()).toHaveLength(1)

    call('PATCH', path, { body: { dismissed: true } })
    expect(db.auditEvents[0].changes).toEqual([{ field: 'dismissed', before: false, after: true }])
  })
})

describe('workspace creation', () => {
  it('creates a workspace with the requested region and timezone', () => {
    const ws = call<Workspace>('POST', '/workspaces', { body: newWorkspace({ timezone: 'Europe/London' }) })
    expect(ws.region).toBe('ap-south-1 (Mumbai)')
    expect(ws.timezone).toBe('Europe/London')
    expect(ws.current_user_role).toBe('owner')
  })

  it('rejects unknown regions, invalid timezones and long names with field errors', () => {
    const error = callError('POST', '/workspaces', { body: newWorkspace({ name: 'x'.repeat(81), region: 'mars-1', timezone: 'Mars/Olympus' }) })
    expect(error.status).toBe(422)
    expect(error.fieldErrors?.map((e) => e.field).sort()).toEqual(['name', 'region', 'timezone'])
    expect(callError('POST', '/workspaces', { body: newWorkspace({ timezone: '+05:30' }) }).fieldErrors?.[0].field).toBe('timezone')
    expect(callError('POST', '/workspaces', { body: newWorkspace({ region: undefined }) }).fieldErrors?.[0].field).toBe('region')
  })

  it('names the field on a duplicate workspace conflict', () => {
    const error = callError('POST', '/workspaces', { body: newWorkspace({ name: 'Acme Distributors' }) })
    expect(error.status).toBe(409)
    expect(error.code).toBe('workspace_exists')
    expect(error.fieldErrors?.[0].field).toBe('name')
  })
})

describe('logout', () => {
  it('succeeds without a session', () => {
    const route = matchRoute(compiled, { method: 'POST', path: '/auth/logout' }).route
    expect(route.public).toBe(true)
    expect(call('POST', '/auth/logout', { user: null })).toEqual({ ok: true })
    expect(call('POST', '/auth/logout', { user: null })).toEqual({ ok: true })
  })
})

describe('notifications', () => {
  const list = (query: Record<string, string>) => call<NotificationList>('GET', '/notifications', { query: { workspace_id: 'ws_acme', ...query } })

  it('reports unread_count for the type filter', () => {
    const all = list({})
    const stale = list({ type: 'stale_data' })
    const unreadStale = db.notifications.filter((n) => n.workspace_id === 'ws_acme' && n.type === 'stale_data' && !n.read_at).length
    expect(stale.unread_count).toBe(unreadStale)
    expect(all.unread_count).toBeGreaterThan(stale.unread_count)
    expect(callError('GET', '/notifications', { query: { workspace_id: 'ws_acme', type: 'nope' } }).status).toBe(422)
  })

  it('marks only the given type as read', () => {
    const before = list({}).unread_count
    const quality = list({ type: 'quality_failed' }).unread_count
    expect(quality).toBeGreaterThan(0)
    const result = call<{ updated: number }>('POST', '/notifications/mark-all-read', { body: { workspace_id: 'ws_acme', type: 'quality_failed' } })
    expect(result.updated).toBe(quality)
    expect(list({ type: 'quality_failed' }).unread_count).toBe(0)
    expect(list({}).unread_count).toBe(before - quality)
    expect(callError('POST', '/notifications/mark-all-read', { body: { workspace_id: 'ws_acme', type: 'nope' } }).status).toBe(422)
  })

  it('rejects a non-boolean read flag', () => {
    const error = callError('PATCH', '/notifications/ntf_01', { body: { read: 'yes' } })
    expect(error.status).toBe(422)
    expect(error.fieldErrors?.[0].field).toBe('read')
  })
})

describe('governance seed', () => {
  it('links every audited execution to a seeded run', () => {
    const runIds = new Set(db.runs.map((r) => r.id))
    const withExecution = db.auditEvents.filter((e) => e.execution_id)
    expect(withExecution.length).toBeGreaterThan(10)
    withExecution.forEach((e) => expect(runIds, e.id).toContain(e.execution_id))
  })

  it('only links proposals to approved mapping sets and records surrogate key sources', () => {
    db.proposals
      .filter((p) => p.mapping_suggestion_id)
      .forEach((p) => expect(db.mappingSets.find((s) => s.id === p.mapping_suggestion_id)?.status, p.id).toBe('approved'))
    expect(db.mappingSets.some((s) => s.status === 'in_review')).toBe(true)
    db.proposals
      .flatMap((p) => p.changes)
      .filter((c) => c.change_type === 'add_surrogate_key')
      .forEach((c) => {
        expect(c.columns.filter((col) => col.is_key), c.id).toHaveLength(1)
        expect(c.columns.filter((col) => !col.is_key).length, c.id).toBeGreaterThan(0)
      })
  })
})
