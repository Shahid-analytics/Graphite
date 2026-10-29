import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPreferences, NotificationType, Run, TablePreview } from '@/types'
import { createHistoricalRun } from '../engine/runs'
import { routes as modelRoutes } from '../handlers/models'
import { routes as runRoutes } from '../handlers/runs'
import { routes as scheduleRoutes } from '../handlers/schedules'
import { MockHttpError, type MockRoute } from '../router'
import { db, demoSession, pushNotification, resetDb, sessionFor, settleRuns } from '../store'

const WS = 'ws_acme'
const NOTIFICATION_TYPES: NotificationType[] = ['pipeline_failed', 'sync_completed', 'repeated_retries', 'quality_failed', 'schema_changed', 'stale_data']

function call<T>(routes: MockRoute[], method: string, path: string, params: Record<string, string>, query: Record<string, string> = {}): T {
  const route = routes.find((r) => r.method === method && r.path === path)
  if (!route) throw new Error(`No route ${method} ${path}`)
  return route.handler({ params, query, body: undefined, session: sessionFor('usr_rahul') }) as T
}

const retry = (runId: string) => call<Run>(runRoutes, 'POST', '/runs/:runId/retry', { runId })

function expectConflict(fn: () => unknown, code: string) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(MockHttpError)
    expect((error as MockHttpError).code).toBe(code)
    return
  }
  throw new Error(`Expected a ${code} conflict`)
}

/** Advances the clock and settles simulated runs, as the mock transport does on every request. */
function advance(ms: number) {
  vi.advanceTimersByTime(ms)
  settleRuns()
}

const record = (id: string) => db.runs.find((r) => r.id === id)!

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
  resetDb()
  // Let the Inventory run that is in flight at load finish so pipeline retries are allowed.
  advance(300_000)
})

afterEach(() => {
  demoSession.userId = null
  vi.useRealTimers()
})

describe('POST /runs/:runId/retry', () => {
  it('fails a Finance retry the same way while the duplicate invoices remain', () => {
    const original = record('run_fin_000')
    const created = retry(original.id)
    expect(created.attempt).toBe(original.attempt + 1)
    advance(300_000)
    const run = record(created.id)
    expect(run.status).toBe('failed')
    expect(run.error).toEqual(original.error)
    expect(run.stages.find((s) => s.key === 'metabase_refresh')?.status).toBe('skipped')
    // Ingestion succeeded, so the ERP source is not reported as a failed sync.
    expect(db.sources.find((s) => s.id === 'src_erp')?.last_sync_status).toBe('succeeded')
  })

  it('skips the Metabase refresh while Metabase is not connected', () => {
    const created = retry('run_sales_009')
    advance(300_000)
    const run = record(created.id)
    expect(run.status).toBe('succeeded')
    expect(run.stages.find((s) => s.key === 'metabase_refresh')).toMatchObject({ status: 'skipped', started_at: null })
  })

  it('keeps stages the original skipped by plan', () => {
    db.runs.unshift(
      createHistoricalRun({
        id: 'run_sales_subset',
        workspaceId: WS,
        kind: 'pipeline',
        trigger: 'manual',
        triggeredBy: { id: 'usr_rahul', name: 'Rahul Mehta' },
        targetName: 'Sales Analytics',
        links: { pipeline_id: 'pl_sales', source_id: 'src_sf_prod' },
        startedMs: Date.now() - 60_000,
        skipped: ['source_connect', 'ingestion', 'bronze_load'],
        status: 'failed',
        failAt: { stage: 'dbt_transform', code: 'dbt_timeout', message: 'Timed out.', details: null, retryable: true },
      }),
    )
    const created = retry('run_sales_subset')
    advance(300_000)
    const run = record(created.id)
    expect(run.status).toBe('succeeded')
    const status = Object.fromEntries(run.stages.map((s) => [s.key, s.status]))
    expect(status).toMatchObject({ source_connect: 'skipped', ingestion: 'skipped', bronze_load: 'skipped', dbt_transform: 'succeeded', metabase_refresh: 'skipped' })
  })

  it('refuses non-retryable failures, paused pipelines and pipelines with an active run', () => {
    expectConflict(() => retry('run_fin_005'), 'run_not_retryable')
    retry('run_fin_000')
    expectConflict(() => retry('run_fin_000'), 'run_in_progress')
    advance(300_000)
    db.pipelines.find((p) => p.id === 'pl_finance')!.status = 'paused'
    expectConflict(() => retry('run_fin_000'), 'pipeline_not_runnable')
  })

  it('promotes a source with unknown health once a retried sync succeeds', () => {
    const source = db.sources.find((s) => s.id === 'src_sf_prod')!
    source.health = 'unknown'
    source.health_message = 'Credentials updated. Run a sync to verify the connection.'
    retry('run_sales_009')
    advance(300_000)
    expect(source.health).toBe('healthy')
    expect(source.health_message).toBeNull()
  })
})

describe('GET /workspaces/:workspaceId/runs', () => {
  it('accepts a comma-separated kind list and sorts newest first', () => {
    const page = call<{ items: Run[]; total: number }>(runRoutes, 'GET', '/workspaces/:workspaceId/runs', { workspaceId: WS }, { kind: 'transformation,dbt_test', page_size: '500' })
    expect(page.total).toBeGreaterThan(0)
    expect(page.items.every((r) => r.kind === 'transformation' || r.kind === 'dbt_test')).toBe(true)
    expect(new Set(page.items.map((r) => r.kind)).size).toBe(2)
    const times = page.items.map((r) => Date.parse(r.queued_at))
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('rejects unknown kinds', () => {
    expect(() => call(runRoutes, 'GET', '/workspaces/:workspaceId/runs', { workspaceId: WS }, { kind: 'pipeline,nope' })).toThrow(/Some fields are invalid/)
  })
})

describe('POST /schedules/:scheduleId/run', () => {
  it('queues behind the active run when the overlap policy is "queue"', () => {
    const schedule = db.schedules.find((s) => s.id === 'sch_sales')!
    schedule.concurrency = { max_concurrent_runs: 1, overlap_policy: 'queue' }
    const runNow = () => call<Run>(scheduleRoutes, 'POST', '/schedules/:scheduleId/run', { scheduleId: schedule.id })
    const first = runNow()
    const second = runNow()
    advance(10_000)
    expect(record(first.id).status).toBe('running')
    expect(record(second.id).status).toBe('queued')
    advance(120_000)
    expect(record(first.id).status).toBe('succeeded')
    advance(120_000)
    const run = record(second.id)
    expect(run.status).toBe('succeeded')
    expect(Date.parse(run.started_at!)).toBeGreaterThan(Date.parse(record(first.id).finished_at!))
    expect(run.stages.find((s) => s.key === 'metabase_refresh')?.status).toBe('skipped')
  })
})

describe('pushNotification', () => {
  it('honours the signed-in user in-app preferences', () => {
    demoSession.userId = 'usr_rahul'
    const events = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { in_app: t !== 'sync_completed', email: false }])) as NotificationPreferences['events']
    db.notificationPrefs[`usr_rahul:${WS}`] = { email_address: 'rahul@example.com', digest: 'off', events }
    const before = db.notifications.length
    const input = { workspace_id: WS, severity: 'info' as const, title: 'Test', message: 'Test', resource: null }
    pushNotification({ ...input, type: 'sync_completed' })
    expect(db.notifications).toHaveLength(before)
    pushNotification({ ...input, type: 'pipeline_failed' })
    expect(db.notifications).toHaveLength(before + 1)
  })
})

describe('model preview', () => {
  it('filters sample rows by numeric cells as well as text', () => {
    const preview = (query: Record<string, string>) => call<TablePreview>(modelRoutes, 'GET', '/models/:modelId/preview', { modelId: 'mdl_g_fct_invoices' }, query)
    const top = preview({ sort: 'invoice_id', order: 'desc' }).rows[0]
    const filtered = preview({ q: String(top.invoice_id) })
    expect(filtered.rows.length).toBeGreaterThan(0)
    expect(filtered.rows.some((row) => row.invoice_id === top.invoice_id)).toBe(true)
  })
})
