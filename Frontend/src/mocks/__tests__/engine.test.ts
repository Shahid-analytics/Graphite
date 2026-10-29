import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRunLogs, createHistoricalRun, createSimRun, holdQueuedRun, materializeRun, toSummary } from '../engine/runs'
import { compileRoutes, matchRoute } from '../router'

const base = {
  workspaceId: 'ws_test',
  kind: 'pipeline' as const,
  trigger: 'manual' as const,
  triggeredBy: { id: 'u', name: 'User' },
  targetName: 'Test pipeline',
  links: { pipeline_id: 'pl_1' },
  records: 1000,
}

afterEach(() => vi.useRealTimers())

describe('run simulator', () => {
  it('moves from queued to running to succeeded over time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    const run = createSimRun(base)
    expect(materializeRun(run)).toBe(false)
    expect(run.status).toBe('queued')

    vi.advanceTimersByTime(3000)
    materializeRun(run)
    expect(run.status).toBe('running')
    expect(run.stages[0].status).toBe('running')

    vi.advanceTimersByTime(120_000)
    expect(materializeRun(run)).toBe(true)
    expect(run.status).toBe('succeeded')
    expect(run.stages.every((s) => s.status === 'succeeded')).toBe(true)
    expect(run.records_processed).toBe(1000)
    // Settled runs report the transition only once.
    expect(materializeRun(run)).toBe(false)
  })

  it('fails at the configured stage and skips the rest', () => {
    vi.useFakeTimers()
    const run = createSimRun({
      ...base,
      failAt: { stage: 'quality_checks', code: 'quality_checks_failed', message: 'Tests failed', details: null, retryable: true },
    })
    vi.advanceTimersByTime(300_000)
    materializeRun(run)
    expect(run.status).toBe('failed')
    expect(run.error?.code).toBe('quality_checks_failed')
    expect(run.stages.find((s) => s.key === 'quality_checks')?.status).toBe('failed')
    expect(run.stages.find((s) => s.key === 'metabase_refresh')?.status).toBe('skipped')
    expect(buildRunLogs(run).some((l) => l.level === 'error')).toBe(true)
  })

  it('cancels a running run', () => {
    vi.useFakeTimers()
    const run = createSimRun(base)
    vi.advanceTimersByTime(4000)
    materializeRun(run)
    run.sim!.cancelled_at_ms = Date.now()
    vi.advanceTimersByTime(60_000)
    materializeRun(run)
    expect(run.status).toBe('cancelled')
    expect(run.stages.some((s) => s.status === 'cancelled')).toBe(true)
  })
})

describe('run simulator edge cases', () => {
  it('keeps log line numbers append-only while a run with skipped stages is active', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    const run = createSimRun({ ...base, skipped: ['bronze_load', 'metabase_refresh'] })
    let previous = buildRunLogs(run)
    for (let i = 0; i < 80; i++) {
      vi.advanceTimersByTime(1000)
      materializeRun(run)
      const next = buildRunLogs(run)
      // Every earlier line keeps its number and message; new lines are only appended.
      expect(next.slice(0, previous.length).map((l) => [l.seq, l.message])).toEqual(previous.map((l) => [l.seq, l.message]))
      previous = next
    }
    expect(run.status).toBe('succeeded')
    const metabase = run.stages.find((s) => s.key === 'metabase_refresh')
    expect(metabase?.status).toBe('skipped')
    expect(metabase?.skip_reason).toMatch(/Metabase is not connected/)
    expect(previous.some((l) => l.stage === 'bronze_load' && l.message.includes('skipped'))).toBe(true)
  })

  it('records nothing for a run cancelled while still queued', () => {
    vi.useFakeTimers()
    const run = createSimRun({ ...base, skipped: ['metabase_refresh'], tables: [{ table: 'public.orders', mode: 'incremental' }] })
    run.sim!.cancelled_at_ms = Date.now()
    expect(materializeRun(run)).toBe(true)
    expect(run.status).toBe('cancelled')
    expect(run.started_at).toBeNull()
    expect(run.records_processed).toBe(0)
    expect(run.tables[0]).toMatchObject({ status: 'cancelled', records: 0 })
    expect(run.stages.find((s) => s.key === 'metabase_refresh')?.status).toBe('skipped')
    expect(run.stages.filter((s) => s.key !== 'metabase_refresh').every((s) => s.status === 'cancelled')).toBe(true)
  })

  it('holds a run queued behind another until the blocker is terminal', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'))
    const blocker = createSimRun(base)
    const queued = createSimRun({ ...base, queuedBehind: blocker.id })
    const tick = (ms: number) => {
      vi.advanceTimersByTime(ms)
      materializeRun(blocker)
      holdQueuedRun(queued, blocker)
      materializeRun(queued)
    }
    tick(10_000)
    expect(blocker.status).toBe('running')
    expect(queued.status).toBe('queued')
    tick(120_000)
    expect(blocker.status).toBe('succeeded')
    expect(Date.parse(queued.started_at!)).toBeGreaterThan(Date.parse(blocker.finished_at!))
    tick(120_000)
    expect(queued.status).toBe('succeeded')
    expect(buildRunLogs(queued)[1].message).toContain(`Waiting for run ${blocker.id}`)
  })

  const tables = [
    { table: 'public.orders', mode: 'incremental' as const },
    { table: 'public.customers', mode: 'full' as const },
    { table: 'public.invoices', mode: 'incremental' as const },
  ]
  const sumOf = (run: { tables: { records: number }[] }) => run.tables.reduce((sum, t) => sum + t.records, 0)

  it('reports table records that add up to the run total', () => {
    vi.useFakeTimers()
    const run = createSimRun({ ...base, kind: 'ingestion', tables })
    vi.advanceTimersByTime(300_000)
    materializeRun(run)
    expect(run.status).toBe('succeeded')
    expect(sumOf(run)).toBe(1000)
    expect(run.records_processed).toBe(1000)
  })

  it('keeps loaded tables succeeded when a later stage fails', () => {
    vi.useFakeTimers()
    const run = createSimRun({ ...base, tables, failAt: { stage: 'quality_checks', code: 'quality_checks_failed', message: 'Tests failed', details: null, retryable: true } })
    vi.advanceTimersByTime(300_000)
    materializeRun(run)
    expect(run.status).toBe('failed')
    expect(run.tables.every((t) => t.status === 'succeeded')).toBe(true)
    expect(run.records_processed).toBe(sumOf(run))
  })

  it('fails some tables and keeps totals consistent when ingestion fails', () => {
    vi.useFakeTimers()
    const run = createSimRun({ ...base, kind: 'ingestion', tables, failAt: { stage: 'ingestion', code: 'ingestion_failed', message: 'Broken', details: null, retryable: true } })
    vi.advanceTimersByTime(300_000)
    materializeRun(run)
    expect(run.status).toBe('failed')
    expect(run.tables.some((t) => t.status === 'failed')).toBe(true)
    expect(run.records_processed).toBe(sumOf(run))
  })

  it('builds seeded history whose table results match the failure stage and run total', () => {
    const common = { workspaceId: 'ws_test', trigger: 'schedule' as const, triggeredBy: { id: 'u', name: 'User' }, targetName: 'T', links: {}, startedMs: Date.now() - 3_600_000, records: 900, tables }
    const ok = createHistoricalRun({ ...common, id: 'run_h1', kind: 'pipeline', status: 'succeeded' })
    expect(sumOf(ok)).toBe(900)
    expect(ok.records_processed).toBe(900)
    const quality = createHistoricalRun({ ...common, id: 'run_h2', kind: 'pipeline', status: 'failed', failAt: { stage: 'quality_checks', code: 'q', message: 'm', details: null, retryable: true } })
    expect(quality.tables.every((t) => t.status === 'succeeded')).toBe(true)
    expect(quality.records_processed).toBe(sumOf(quality))
    const ingest = createHistoricalRun({ ...common, id: 'run_h3', kind: 'ingestion', status: 'failed', failAt: { stage: 'ingestion', code: 'i', message: 'm', details: null, retryable: true } })
    expect(ingest.tables[0].status).toBe('failed')
    expect(ingest.records_processed).toBe(sumOf(ingest))
  })

  it('reports whether a failure is retryable in run summaries', () => {
    vi.useFakeTimers()
    const run = createSimRun({ ...base, failAt: { stage: 'dbt_transform', code: 'dbt_model_error', message: 'Broken', details: null, retryable: false } })
    expect(toSummary(run).retryable).toBeNull()
    vi.advanceTimersByTime(300_000)
    materializeRun(run)
    expect(toSummary(run).retryable).toBe(false)
  })
})

describe('mock router', () => {
  const routes = compileRoutes([
    { method: 'GET', path: '/sources/:sourceId', handler: () => null },
    { method: 'GET', path: '/sources/:sourceId/tables/:table/preview', handler: () => null },
  ])

  it('extracts and decodes path params', () => {
    const { params } = matchRoute(routes, { method: 'GET', path: '/sources/src_1/tables/public.orders%20x/preview' })
    expect(params).toEqual({ sourceId: 'src_1', table: 'public.orders x' })
  })

  it('distinguishes 404 from 405', () => {
    expect(() => matchRoute(routes, { method: 'GET', path: '/nope' })).toThrow(/No mock handler/)
    expect(() => matchRoute(routes, { method: 'DELETE', path: '/sources/src_1' })).toThrow(/not supported/)
  })
})
