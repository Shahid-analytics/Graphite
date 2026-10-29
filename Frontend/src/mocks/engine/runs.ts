import type { LogLine, LogLevel, Run, RunError, RunKind, RunStage, RunStatus, RunSummary, RunTrigger, StageKey } from '@/types'
import { isTerminal } from '@/types'
import type { RunRecord, SimState } from '../db'
import { iso, newId, prng } from '../util'

export const STAGE_NAMES: Record<StageKey, string> = {
  source_connect: 'Source connection',
  ingestion: 'Ingestion (dlt)',
  bronze_load: 'Bronze load',
  dbt_transform: 'dbt transformation',
  silver_gold_publish: 'Silver / Gold publish',
  quality_checks: 'Data quality checks',
  metabase_refresh: 'Metabase refresh',
}

export const ALL_STAGES: StageKey[] = [
  'source_connect',
  'ingestion',
  'bronze_load',
  'dbt_transform',
  'silver_gold_publish',
  'quality_checks',
  'metabase_refresh',
]

export const STAGES_BY_KIND: Record<RunKind, StageKey[]> = {
  ingestion: ['source_connect', 'ingestion', 'bronze_load'],
  pipeline: ALL_STAGES,
  transformation: ['dbt_transform', 'silver_gold_publish'],
  dbt_test: ['quality_checks'],
  schema_apply: ['dbt_transform', 'silver_gold_publish', 'quality_checks'],
}

/** Simulated stage durations in the demo (seconds). Kept short so progress is visible. */
const SIM_SECONDS: Record<StageKey, [number, number]> = {
  source_connect: [2, 3],
  ingestion: [5, 9],
  bronze_load: [3, 5],
  dbt_transform: [5, 8],
  silver_gold_publish: [2, 3],
  quality_checks: [3, 5],
  metabase_refresh: [2, 3],
}

/** Realistic historical stage durations (seconds). */
const HIST_SECONDS: Record<StageKey, [number, number]> = {
  source_connect: [2, 6],
  ingestion: [60, 320],
  bronze_load: [20, 90],
  dbt_transform: [90, 260],
  silver_gold_publish: [8, 30],
  quality_checks: [20, 75],
  metabase_refresh: [5, 15],
}

function between(rand: () => number, [min, max]: [number, number]) {
  return min + rand() * (max - min)
}

/** Splits a record total across tables by weight so the parts always add up to the total. */
export function splitRecords(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const parts = weights.map((w) => Math.floor((total * w) / sum))
  if (parts.length) parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0)
  return parts
}

/** Stages after these leave the per-table ingestion results intact when they fail. */
const TABLE_STAGES: StageKey[] = ['source_connect', 'ingestion', 'bronze_load']

/**
 * Reason reported for a stage planned out of a run. The demo API can never reach
 * Metabase, so a skipped refresh always says so rather than implying it ran.
 */
export function plannedSkipReason(key: StageKey) {
  return key === 'metabase_refresh' ? 'Metabase is not connected, so no dashboards were refreshed.' : 'Not selected for this run.'
}

function failedSkipReason(failed: StageKey) {
  return `Not run because ${STAGE_NAMES[failed]} failed.`
}

function skip(stage: RunStage, reason: string) {
  stage.status = 'skipped'
  stage.skip_reason = reason
}

export interface RunLinks {
  pipeline_id?: string | null
  source_id?: string | null
  transformation_id?: string | null
  schedule_id?: string | null
  schema_proposal_id?: string | null
}

export interface SimRunInput {
  workspaceId: string
  kind: RunKind
  trigger: RunTrigger
  triggeredBy: { id: string; name: string }
  targetName: string
  links: RunLinks
  stages?: StageKey[]
  skipped?: StageKey[]
  failAt?: RunError | null
  records?: number
  /** Optional per-table records weight the split of `records` across tables. */
  tables?: { table: string; mode: 'full' | 'incremental'; records?: number }[]
  retryOf?: string | null
  attempt?: number
  /** Run id this one waits for (schedule overlap policy "queue"); it stays queued until that run is terminal. */
  queuedBehind?: string | null
}

/** Creates a run whose progress is simulated from wall-clock time. */
export function createSimRun(input: SimRunInput): RunRecord {
  const stages = input.stages ?? STAGES_BY_KIND[input.kind]
  const id = newId('run')
  const rand = prng(id)
  const now = Date.now()
  const queuedMs = 1500
  const failIndex = input.failAt?.stage ? stages.indexOf(input.failAt.stage) : -1
  const sim: SimState = {
    start_ms: now + queuedMs,
    queued_ms: queuedMs,
    durations_ms: stages.map((s) => Math.round(between(rand, SIM_SECONDS[s]) * 1000)),
    fail_index: failIndex,
    fail_error: input.failAt ?? null,
    skipped: input.skipped ?? [],
    cancelled_at_ms: null,
    settled: false,
    total_records: input.records ?? 0,
    table_records: splitRecords(input.records ?? 0, (input.tables ?? []).map((t, i) => t.records ?? 0.6 + ((i * 37) % 10) / 12)),
    queued_behind: input.queuedBehind ?? null,
  }
  const run: RunRecord = {
    id,
    workspace_id: input.workspaceId,
    kind: input.kind,
    status: 'queued',
    trigger: input.trigger,
    triggered_by: input.triggeredBy,
    target_name: input.targetName,
    pipeline_id: input.links.pipeline_id ?? null,
    source_id: input.links.source_id ?? null,
    transformation_id: input.links.transformation_id ?? null,
    schedule_id: input.links.schedule_id ?? null,
    schema_proposal_id: input.links.schema_proposal_id ?? null,
    queued_at: iso(now),
    started_at: null,
    finished_at: null,
    duration_seconds: null,
    attempt: input.attempt ?? 1,
    retry_of: input.retryOf ?? null,
    records_processed: null,
    stages: stages.map((key) => ({ key, name: STAGE_NAMES[key], status: 'queued', started_at: null, finished_at: null, duration_seconds: null, error: null, skip_reason: null, metrics: {} })),
    tables: (input.tables ?? []).map((t) => ({ table: t.table, status: 'queued', mode: t.mode, records: 0, error: null })),
    error: null,
    sim,
  }
  return run
}

/**
 * Keeps a run that is queued behind another (overlap policy "queue") in the queue until
 * the blocking run is terminal; it then leaves the queue `queued_ms` after the blocker
 * finished. Idempotent, so it can run on every settle pass.
 */
export function holdQueuedRun(run: RunRecord, blocker: Run | undefined, nowMs = Date.now()) {
  const sim = run.sim
  if (!sim?.queued_behind || sim.settled || !blocker) return
  if (!isTerminal(blocker.status)) {
    sim.start_ms = Math.max(sim.start_ms, nowMs + sim.queued_ms)
    return
  }
  const released = blocker.finished_at ? Date.parse(blocker.finished_at) : nowMs
  sim.start_ms = Math.max(Date.parse(run.queued_at), released) + sim.queued_ms
}

/**
 * Recomputes a simulated run's state from the current time. Returns true when the
 * run transitioned to a terminal state during this call.
 */
export function materializeRun(run: RunRecord, nowMs = Date.now()): boolean {
  const sim = run.sim
  if (!sim || sim.settled) return false

  const cutoff = sim.cancelled_at_ms ?? nowMs
  let cursor = sim.start_ms
  let terminal: RunStatus | null = null
  let processed = 0
  // Fraction of the ingestion stage completed: tables are extracted there, not across the whole run.
  let loaded: number | null = null
  const totalWeight = sim.durations_ms.length

  if (cutoff < sim.start_ms) {
    // Cancelled before leaving the queue: nothing ran, planned skips stay skipped.
    if (sim.cancelled_at_ms !== null) terminal = 'cancelled'
    run.stages.forEach((s) => {
      if (terminal && sim.skipped.includes(s.key)) skip(s, plannedSkipReason(s.key))
      else s.status = terminal ? 'cancelled' : 'queued'
    })
  } else {
    run.started_at = iso(sim.start_ms)
    for (const [index, stage] of run.stages.entries()) {
      const duration = sim.durations_ms[index]
      if (terminal) {
        if (terminal === 'failed') skip(stage, failedSkipReason(run.stages[sim.fail_index].key))
        else if (sim.skipped.includes(stage.key)) skip(stage, plannedSkipReason(stage.key))
        else stage.status = 'cancelled'
        continue
      }
      if (sim.skipped.includes(stage.key)) {
        skip(stage, plannedSkipReason(stage.key))
        continue
      }
      if (cutoff < cursor) {
        stage.status = 'queued'
        continue
      }
      stage.started_at = iso(cursor)
      const end = cursor + duration
      const fraction = Math.min(1, (cutoff - cursor) / duration)
      if (stage.key === 'ingestion') loaded = index === sim.fail_index && cutoff >= end ? 0.5 : fraction
      if (cutoff >= end) {
        if (index === sim.fail_index) {
          stage.status = 'failed'
          stage.error = sim.fail_error
          terminal = 'failed'
        } else {
          stage.status = 'succeeded'
          processed += 1
        }
        stage.finished_at = iso(end)
        stage.duration_seconds = Math.round(duration / 1000)
        cursor = end
      } else if (sim.cancelled_at_ms !== null) {
        stage.status = 'cancelled'
        stage.finished_at = iso(cutoff)
        stage.duration_seconds = Math.round((cutoff - cursor) / 1000)
        terminal = 'cancelled'
        cursor = cutoff
      } else {
        stage.status = 'running'
        processed += fraction
        cursor = end
      }
    }
    if (!terminal && sim.cancelled_at_ms !== null) terminal = 'cancelled'
    if (!terminal && run.stages.every((s) => s.status === 'succeeded' || s.status === 'skipped')) terminal = 'succeeded'
  }

  const progress = totalWeight ? Math.min(1, processed / totalWeight) : 1
  run.records_processed = sim.total_records ? Math.round(sim.total_records * progress) : null
  // A run cancelled before it left the queue processed nothing.
  if (terminal === 'cancelled' && !run.started_at) run.records_processed = 0
  const tableProgress = terminal === 'failed' && sim.fail_error?.stage === 'bronze_load' ? 0.5 : (loaded ?? progress)
  const parts = sim.table_records ?? splitRecords(sim.total_records, run.tables.map((_, i) => 0.6 + ((i * 37) % 10) / 12))
  run.tables.forEach((t, i) => {
    const share = (i + 1) / run.tables.length
    if (terminal === 'failed' && sim.fail_error?.stage === 'source_connect') {
      t.status = 'skipped'
    } else if (tableProgress >= share || terminal === 'succeeded') {
      t.status = 'succeeded'
      t.records = parts[i]
    } else if (terminal) {
      t.status = terminal === 'failed' ? 'failed' : 'cancelled'
      t.records = 0
    } else if (tableProgress > 0) {
      t.status = tableProgress >= share - 1 / run.tables.length ? 'running' : 'queued'
    }
  })

  if (terminal) {
    run.status = terminal
    const end = terminal === 'cancelled' ? cutoff : cursor
    run.finished_at = iso(end)
    run.duration_seconds = run.started_at ? Math.round((end - sim.start_ms) / 1000) : 0
    run.error = terminal === 'failed' ? sim.fail_error : null
    if (terminal === 'succeeded' && sim.total_records) run.records_processed = sim.total_records
    // The run total is what its tables loaded, so the summary and the table results agree.
    else if (run.tables.length && run.started_at) run.records_processed = run.tables.reduce((sum, t) => sum + t.records, 0)
    sim.settled = true
    return true
  }

  run.status = cutoff < sim.start_ms ? 'queued' : 'running'
  run.duration_seconds = run.started_at ? Math.round((cutoff - sim.start_ms) / 1000) : null
  return false
}

export interface HistoricalRunInput {
  id: string
  workspaceId: string
  kind: RunKind
  trigger: RunTrigger
  triggeredBy: { id: string; name: string }
  targetName: string
  links: RunLinks
  startedMs: number
  stages?: StageKey[]
  skipped?: StageKey[]
  status: Exclude<RunStatus, 'queued' | 'running'>
  failAt?: RunError | null
  records?: number
  tables?: { table: string; mode: 'full' | 'incremental' }[]
  attempt?: number
  retryOf?: string | null
}

/** Builds a completed run with realistic durations for seeded history. */
export function createHistoricalRun(input: HistoricalRunInput): RunRecord {
  const stageKeys = input.stages ?? STAGES_BY_KIND[input.kind]
  const rand = prng(input.id)
  let cursor = input.startedMs
  let ended = false
  const failIndex = input.failAt?.stage ? stageKeys.indexOf(input.failAt.stage) : -1
  const stages: RunStage[] = stageKeys.map((key, index) => {
    const notRun = { key, name: STAGE_NAMES[key], started_at: null, finished_at: null, duration_seconds: null, error: null, metrics: {} }
    if (ended) {
      return input.status === 'cancelled'
        ? { ...notRun, status: 'cancelled', skip_reason: null }
        : { ...notRun, status: 'skipped', skip_reason: failedSkipReason(stageKeys[failIndex]) }
    }
    if ((input.skipped ?? []).includes(key)) return { ...notRun, status: 'skipped', skip_reason: plannedSkipReason(key) }
    const duration = between(rand, HIST_SECONDS[key]) * (input.kind === 'transformation' ? 0.25 : 1)
    const start = cursor
    cursor += duration * 1000
    let status: RunStatus = 'succeeded'
    let error: RunError | null = null
    if (index === failIndex) {
      status = 'failed'
      error = input.failAt ?? null
      ended = true
    } else if (input.status === 'cancelled' && index === Math.floor(stageKeys.length / 2)) {
      status = 'cancelled'
      ended = true
    }
    const metrics: Record<string, number> = {}
    if (key === 'ingestion' && input.records) metrics.rows_extracted = input.records
    if (key === 'bronze_load' && input.records) metrics.rows_loaded = input.records
    if (key === 'dbt_transform') metrics.models_built = 6 + Math.floor(rand() * 18)
    if (key === 'quality_checks') metrics.tests_run = 20 + Math.floor(rand() * 40)
    return { key, name: STAGE_NAMES[key], status, started_at: iso(start), finished_at: iso(cursor), duration_seconds: Math.round(duration), error, skip_reason: null, metrics }
  })
  const duration = Math.round((cursor - input.startedMs) / 1000)
  const tables = historicalTables(input, rand)
  return {
    id: input.id,
    workspace_id: input.workspaceId,
    kind: input.kind,
    status: input.status,
    trigger: input.trigger,
    triggered_by: input.triggeredBy,
    target_name: input.targetName,
    pipeline_id: input.links.pipeline_id ?? null,
    source_id: input.links.source_id ?? null,
    transformation_id: input.links.transformation_id ?? null,
    schedule_id: input.links.schedule_id ?? null,
    schema_proposal_id: input.links.schema_proposal_id ?? null,
    queued_at: iso(input.startedMs - 2000),
    started_at: iso(input.startedMs),
    finished_at: iso(cursor),
    duration_seconds: duration,
    attempt: input.attempt ?? 1,
    retry_of: input.retryOf ?? null,
    records_processed: tables.length ? tables.reduce((sum, t) => sum + t.records, 0) : input.status === 'succeeded' ? (input.records ?? null) : input.records ? Math.round(input.records * 0.4) : null,
    stages,
    tables,
    error: input.status === 'failed' ? (input.failAt ?? null) : null,
    sim: null,
  }
}

/**
 * Table results of a seeded run. A failure after the tables were loaded (dbt, quality
 * checks) leaves them succeeded; records always add up to the run total.
 */
function historicalTables(input: HistoricalRunInput, rand: () => number): RunRecord['tables'] {
  const list = input.tables ?? []
  const failStage = input.status === 'failed' ? (input.failAt?.stage ?? null) : null
  const tableFailure = failStage !== null && TABLE_STAGES.includes(failStage)
  const status = (i: number): RunStatus => {
    if (failStage === 'source_connect') return 'skipped'
    if (input.status === 'cancelled' && i === 0) return 'cancelled'
    if (tableFailure && i === 0) return 'failed'
    return 'succeeded'
  }
  const parts = splitRecords(input.records ?? 0, list.map(() => 0.5 + rand()))
  return list.map((t, i) => {
    const s = status(i)
    return { table: t.table, mode: t.mode, status: s, records: s === 'succeeded' ? parts[i] : 0, error: null }
  })
}

export function toSummary(run: Run): RunSummary {
  return {
    id: run.id,
    kind: run.kind,
    status: run.status,
    trigger: run.trigger,
    target_name: run.target_name,
    pipeline_id: run.pipeline_id,
    source_id: run.source_id,
    transformation_id: run.transformation_id,
    queued_at: run.queued_at,
    started_at: run.started_at,
    finished_at: run.finished_at,
    duration_seconds: run.duration_seconds,
    attempt: run.attempt,
    error_message: run.error?.message ?? null,
    retryable: run.error?.retryable ?? null,
  }
}

/** Strips simulation internals before a run leaves the mock API. */
export function publicRun(run: RunRecord): Run {
  const { sim: _sim, ...rest } = run
  return rest
}

const STAGE_LOG_TEMPLATES: Record<StageKey, string[]> = {
  source_connect: ['Resolving connection configuration', 'Opening connection (TLS)', 'Authenticated; permissions verified for selected objects'],
  ingestion: ['dlt pipeline initialised (destination: postgres)', 'Extracting changed records since last cursor', 'Extracted batch 1', 'Extracted batch 2', 'Normalising nested fields'],
  bronze_load: ['Writing load package to staging tables', 'Merging into Bronze tables', 'Updating load state and cursors'],
  dbt_transform: ['dbt deps completed', 'Compiling project: models and tests found', 'Running models in dependency order', 'Built staging and intermediate models', 'Built Silver and Gold models'],
  silver_gold_publish: ['Swapping relations into target schemas', 'Granting read access to analytics role'],
  quality_checks: ['Running dbt tests', 'Evaluating source freshness', 'Recording test results'],
  metabase_refresh: ['Requesting Metabase metadata sync', 'Refreshing dashboard caches'],
}

/**
 * Builds deterministic log lines from a run's current stage states. While a run is
 * active, lines are only ever appended (nothing is emitted for a stage the run has not
 * reached yet), so `seq` numbers stay stable for incremental readers using `after`.
 */
export function buildRunLogs(run: Run & { sim?: SimState | null }): LogLine[] {
  const lines: LogLine[] = []
  let seq = 1
  const push = (ts: string, level: LogLevel, stage: StageKey | null, message: string) => {
    lines.push({ seq: seq++, ts, level, stage, message })
  }
  push(run.queued_at, 'info', null, `Run ${run.id} queued (${run.kind}, trigger: ${run.trigger}, attempt ${run.attempt})`)
  if (run.sim?.queued_behind) push(run.queued_at, 'info', null, `Waiting for run ${run.sim.queued_behind} to finish (schedule overlap policy: queue)`)
  if (run.started_at) push(run.started_at, 'info', null, `Worker picked up run for "${run.target_name}"`)
  const now = Date.now()
  const active = !isTerminal(run.status)
  // End of the last finished stage; null while a started stage is still running.
  let reachedAt: string | null = run.started_at
  for (const stage of run.stages) {
    if (!stage.started_at) {
      // Stop at the first stage the active run has not reached; later lines are appended once it has.
      if (active && (!reachedAt || stage.status !== 'skipped')) break
      if (stage.status === 'skipped') {
        const reason = stage.skip_reason ? `: ${stage.skip_reason}` : ''
        push(reachedAt ?? run.finished_at ?? run.queued_at, 'debug', stage.key, `${stage.name} skipped${reason}`)
      }
      continue
    }
    const start = Date.parse(stage.started_at)
    const end = stage.finished_at ? Date.parse(stage.finished_at) : now
    const template = STAGE_LOG_TEMPLATES[stage.key]
    push(stage.started_at, 'info', stage.key, `${stage.name} started`)
    const span = Math.max(1, end - start)
    const total = stage.finished_at ? template.length : Math.max(1, Math.floor(template.length * Math.min(1, (now - start) / span)))
    template.slice(0, total).forEach((message, i) => {
      const ts = iso(start + (span * (i + 1)) / (template.length + 1))
      const metric = stage.metrics.rows_extracted && stage.key === 'ingestion' && i === 1 ? ` (${stage.metrics.rows_extracted} rows)` : ''
      push(ts, 'info', stage.key, `${message}${metric}`)
    })
    if (stage.status === 'failed' && stage.error) {
      push(stage.finished_at ?? iso(end), 'error', stage.key, `${stage.error.code}: ${stage.error.message}`)
      if (stage.error.details) push(stage.finished_at ?? iso(end), 'error', stage.key, stage.error.details)
    } else if (stage.status === 'cancelled') {
      push(stage.finished_at ?? iso(end), 'warning', stage.key, `${stage.name} cancelled by user request`)
    } else if (stage.status === 'succeeded') {
      push(stage.finished_at ?? iso(end), 'info', stage.key, `${stage.name} completed in ${stage.duration_seconds ?? 0}s`)
    }
    reachedAt = stage.finished_at
  }
  if (run.finished_at) {
    const level: LogLevel = run.status === 'failed' ? 'error' : run.status === 'cancelled' ? 'warning' : 'info'
    push(run.finished_at, level, null, `Run finished with status ${run.status.toUpperCase()} after ${run.duration_seconds ?? 0}s`)
  }
  return lines
}
