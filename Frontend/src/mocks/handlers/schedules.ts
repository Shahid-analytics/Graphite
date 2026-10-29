import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'
import type {
  ConcurrencyPolicy,
  IntervalPreset,
  OverlapPolicy,
  RetryPolicy,
  RunKind,
  RunStatus,
  Schedule,
  ScheduleConflict,
  ScheduleTargetType,
  StageKey,
  SyncFrequency,
  UpdateScheduleRequest,
  UpsertScheduleRequest,
  ValidateScheduleRequest,
  ValidateScheduleResponse,
} from '@/types'
import { isTerminal } from '@/types'
import type { RunRecord } from '../db'
import { compileError } from '../engine/dbt'
import { metabaseRefreshUnavailable, pipelineFailure } from '../engine/failures'
import { createSimRun, publicRun } from '../engine/runs'
import { body, httpError, matchesText, paginate, qBool, qString, type MockContext, type MockRoute } from '../router'
import { addRun, db, diffChanges, findOr404, recordAudit, requirePermission, requireWorkspace, scheduleView, userActor } from '../store'
import { iso, newId, nowIso } from '../util'

const TARGET_TYPES: ScheduleTargetType[] = ['pipeline', 'source_sync', 'transformation']
const PRESETS: IntervalPreset[] = ['every_15_minutes', 'hourly', 'every_6_hours', 'daily', 'weekly', 'monthly', 'custom']
const OVERLAP_POLICIES: OverlapPolicy[] = ['skip', 'queue', 'cancel_running']
const SYNC_FREQUENCIES: SyncFrequency[] = ['hourly', 'every_6_hours', 'daily', 'weekly']
/** Runs of different schedules that read the same source within this window are reported as a conflict. */
const SHARED_SOURCE_WINDOW_MS = 15 * 60_000
const EDITABLE_FIELDS: (keyof UpsertScheduleRequest)[] = [
  'name',
  'description',
  'target_type',
  'target_id',
  'preset',
  'cron',
  'timezone',
  'enabled',
  'retry',
  'concurrency',
]
const PREVIEW_COUNT = 5

type FieldError = { field: string; message: string }

// ---------------------------------------------------------------------------
// Cron and timezone helpers
// ---------------------------------------------------------------------------

function normaliseCron(cron: string) {
  return cron.trim().replace(/\s+/g, ' ')
}

function isValidTimezone(timezone: string) {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** Returns an error message, or null when the five-field expression parses in the timezone. */
function cronError(cron: string, timezone: string): string | null {
  const expr = normaliseCron(cron)
  if (!expr) return 'Enter a cron expression.'
  if (expr.split(' ').length !== 5) return 'Use five fields: minute hour day-of-month month day-of-week.'
  try {
    CronExpressionParser.parse(expr, { tz: timezone }).next()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid cron expression.'
  }
}

function nextRuns(cron: string, timezone: string, count: number, from = new Date()): Date[] {
  const parsed = CronExpressionParser.parse(normaliseCron(cron), { tz: timezone, currentDate: from })
  return Array.from({ length: count }, () => parsed.next().toDate())
}

/** Occurrences from now until `until`, capped to keep very frequent crons cheap. */
function runsUntil(cron: string, timezone: string, until: number, cap = 2000): number[] {
  const out: number[] = []
  try {
    const parsed = CronExpressionParser.parse(normaliseCron(cron), { tz: timezone, currentDate: new Date() })
    while (out.length < cap) {
      const next = parsed.next().getTime()
      if (next > until) break
      out.push(next)
    }
  } catch {
    // Stored schedules are validated on write; ignore anything unparsable.
  }
  return out
}

function describe(cron: string) {
  try {
    return cronstrue.toString(normaliseCron(cron), { use24HourTimeFormat: true, verbose: false })
  } catch {
    return null
  }
}

function formatInZone(ms: number, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(ms)
}

function formatMinutes(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

function transformationWorkspace(transformationId: string) {
  const t = db.transformations.find((x) => x.id === transformationId)
  if (!t) return null
  return db.dbtProjects.find((p) => p.id === t.project_id)?.workspace_id ?? null
}

interface ResolvedTarget {
  name: string
  /** Source ids the target reads from (used for shared-source conflict detection). */
  sourceIds: string[]
  /** Null when the target can run; otherwise the reason it cannot. */
  blockedReason: string | null
}

function resolveTarget(workspaceId: string, type: ScheduleTargetType, id: string): ResolvedTarget | null {
  if (type === 'pipeline') {
    const p = db.pipelines.find((x) => x.id === id && x.workspace_id === workspaceId)
    if (!p) return null
    return {
      name: p.name,
      sourceIds: p.source_ids,
      blockedReason: p.status === 'active' ? null : `Pipeline "${p.name}" is ${p.status}. Activate it before running it.`,
    }
  }
  if (type === 'source_sync') {
    const s = db.sources.find((x) => x.id === id && x.workspace_id === workspaceId)
    if (!s) return null
    return {
      name: s.name,
      sourceIds: [s.id],
      blockedReason: s.status === 'paused' || s.status === 'draft' ? `Source "${s.name}" is ${s.status}. Resume it before syncing.` : null,
    }
  }
  const t = db.transformations.find((x) => x.id === id)
  if (!t || transformationWorkspace(id) !== workspaceId) return null
  return { name: t.name, sourceIds: [], blockedReason: null }
}

function targetLabel(type: ScheduleTargetType) {
  return type === 'pipeline' ? 'Pipeline' : type === 'source_sync' ? 'Source' : 'Transformation'
}

/** Runs that belong to a target, newest first. */
function targetRuns(type: ScheduleTargetType, id: string): RunRecord[] {
  if (type === 'pipeline') return db.runs.filter((r) => r.kind === 'pipeline' && r.pipeline_id === id)
  if (type === 'source_sync') return db.runs.filter((r) => r.kind === 'ingestion' && r.source_id === id)
  return db.runs.filter((r) => r.kind === 'transformation' && r.transformation_id === id)
}

/** Median duration of the last ten finished runs of the target, in seconds. */
function typicalDurationSeconds(type: ScheduleTargetType, id: string): number | null {
  const durations = targetRuns(type, id)
    .filter((r) => (r.status === 'succeeded' || r.status === 'failed') && r.duration_seconds)
    .slice(0, 10)
    .map((r) => r.duration_seconds as number)
    .sort((a, b) => a - b)
  if (!durations.length) return null
  return durations[Math.floor(durations.length / 2)]
}

function view(schedule: Schedule): Schedule {
  const target = resolveTarget(schedule.workspace_id, schedule.target_type, schedule.target_id)
  return scheduleView({ ...schedule, target_name: target?.name ?? schedule.target_name })
}

// ---------------------------------------------------------------------------
// Keeping linked resources in sync
// ---------------------------------------------------------------------------

function toSyncFrequency(preset: IntervalPreset): SyncFrequency {
  return (SYNC_FREQUENCIES as string[]).includes(preset) ? (preset as SyncFrequency) : 'custom'
}

/** Mirrors the active sync schedule onto the source's schedule configuration. */
function syncSourceSchedule(sourceId: string) {
  const source = db.sources.find((s) => s.id === sourceId)
  if (!source) return
  const active = db.schedules
    .filter((s) => s.target_type === 'source_sync' && s.target_id === sourceId && s.enabled)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
  const next = active
    ? { frequency: toSyncFrequency(active.preset), cron: active.cron, timezone: active.timezone }
    : { frequency: 'manual' as const, cron: null, timezone: source.schedule.timezone }
  if (JSON.stringify(next) !== JSON.stringify(source.schedule)) {
    source.schedule = next
    source.updated_at = nowIso()
  }
}

/** Points the pipeline's schedule_id at an enabled schedule that targets it, if any. */
function syncPipelineLink(pipelineId: string) {
  const pipeline = db.pipelines.find((p) => p.id === pipelineId)
  if (!pipeline) return
  const candidates = db.schedules.filter((s) => s.target_type === 'pipeline' && s.target_id === pipelineId)
  const current = candidates.find((s) => s.id === pipeline.schedule_id)
  const chosen = (current?.enabled ? current : undefined) ?? candidates.find((s) => s.enabled) ?? current ?? candidates[0]
  pipeline.schedule_id = chosen?.id ?? null
}

function syncLinked(type: ScheduleTargetType, id: string) {
  if (type === 'source_sync') syncSourceSchedule(id)
  if (type === 'pipeline') syncPipelineLink(id)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function validateRetry(retry: RetryPolicy | undefined, errors: FieldError[]) {
  if (!retry || typeof retry !== 'object') {
    errors.push({ field: 'retry', message: 'Retry policy is required.' })
    return
  }
  if (!isInt(retry.max_attempts) || retry.max_attempts < 0 || retry.max_attempts > 10) {
    errors.push({ field: 'retry.max_attempts', message: 'Retry attempts must be a whole number from 0 to 10.' })
  }
  if (!isInt(retry.backoff_seconds) || retry.backoff_seconds < 30 || retry.backoff_seconds > 86_400) {
    errors.push({ field: 'retry.backoff_seconds', message: 'Backoff must be between 30 seconds and 86400 seconds (24 hours).' })
  }
  if (retry.backoff_strategy !== 'fixed' && retry.backoff_strategy !== 'exponential') {
    errors.push({ field: 'retry.backoff_strategy', message: 'Backoff strategy must be "fixed" or "exponential".' })
  }
}

/** Copies only the known policy fields so unexpected keys are never stored. */
function pickRetry(retry: RetryPolicy): RetryPolicy {
  return { max_attempts: retry.max_attempts, backoff_seconds: retry.backoff_seconds, backoff_strategy: retry.backoff_strategy }
}

function pickConcurrency(concurrency: ConcurrencyPolicy): ConcurrencyPolicy {
  return { max_concurrent_runs: concurrency.max_concurrent_runs, overlap_policy: concurrency.overlap_policy }
}

function validateConcurrency(concurrency: ConcurrencyPolicy | undefined, errors: FieldError[]) {
  if (!concurrency || typeof concurrency !== 'object') {
    errors.push({ field: 'concurrency', message: 'Concurrency policy is required.' })
    return
  }
  if (!isInt(concurrency.max_concurrent_runs) || concurrency.max_concurrent_runs < 1 || concurrency.max_concurrent_runs > 10) {
    errors.push({ field: 'concurrency.max_concurrent_runs', message: 'Concurrent runs must be a whole number from 1 to 10.' })
  }
  if (!OVERLAP_POLICIES.includes(concurrency.overlap_policy)) {
    errors.push({ field: 'concurrency.overlap_policy', message: 'Overlap policy must be skip, queue or cancel_running.' })
  }
}

/** Validates a complete (merged) schedule definition. Throws 422 with every field error. */
function validateDefinition(workspaceId: string, input: UpsertScheduleRequest): ResolvedTarget {
  const errors: FieldError[] = []
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 3) errors.push({ field: 'name', message: 'Name must be at least 3 characters.' })
  else if (name.length > 120) errors.push({ field: 'name', message: 'Name must be 120 characters or fewer.' })
  if (typeof input.description === 'string' && input.description.length > 500) {
    errors.push({ field: 'description', message: 'Description must be 500 characters or fewer.' })
  }

  let target: ResolvedTarget | null = null
  if (!TARGET_TYPES.includes(input.target_type)) {
    errors.push({ field: 'target_type', message: 'Target type must be pipeline, source_sync or transformation.' })
  } else if (!input.target_id) {
    errors.push({ field: 'target_id', message: `Select a ${targetLabel(input.target_type).toLowerCase()} to schedule.` })
  } else {
    target = resolveTarget(workspaceId, input.target_type, input.target_id)
    if (!target) errors.push({ field: 'target_id', message: `${targetLabel(input.target_type)} "${input.target_id}" does not exist in this workspace.` })
  }

  if (!PRESETS.includes(input.preset)) errors.push({ field: 'preset', message: 'Unknown frequency preset.' })

  const timezoneOk = typeof input.timezone === 'string' && isValidTimezone(input.timezone)
  if (!timezoneOk) errors.push({ field: 'timezone', message: `"${input.timezone ?? ''}" is not a valid IANA timezone, e.g. Asia/Kolkata.` })
  const cronMessage = typeof input.cron === 'string' ? cronError(input.cron, timezoneOk ? input.timezone : 'UTC') : 'Enter a cron expression.'
  if (cronMessage) errors.push({ field: 'cron', message: cronMessage })

  if (typeof input.enabled !== 'boolean') errors.push({ field: 'enabled', message: 'Enabled must be true or false.' })
  validateRetry(input.retry, errors)
  validateConcurrency(input.concurrency, errors)

  if (errors.length || !target) throw httpError.validation(errors)
  return target
}

function assertNoDuplicate(workspaceId: string, input: UpsertScheduleRequest, excludeId?: string) {
  if (!input.enabled) return
  const cron = normaliseCron(input.cron)
  const duplicate = db.schedules.find(
    (s) =>
      s.workspace_id === workspaceId &&
      s.id !== excludeId &&
      s.enabled &&
      s.target_type === input.target_type &&
      s.target_id === input.target_id &&
      normaliseCron(s.cron) === cron,
  )
  if (duplicate) {
    throw httpError.conflict(
      'duplicate_schedule',
      `"${duplicate.name}" already runs this target on the same cron (${cron}). Disable it or choose a different cadence.`,
      { schedule_id: duplicate.id, schedule_name: duplicate.name },
    )
  }
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

function detectConflicts(workspaceId: string, input: ValidateScheduleRequest, ours: Date[], target: ResolvedTarget): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []
  const others = db.schedules.filter((s) => s.workspace_id === workspaceId && s.enabled && s.id !== input.schedule_id)

  for (const other of others.filter((s) => s.target_type === input.target_type && s.target_id === input.target_id)) {
    conflicts.push({
      schedule_id: other.id,
      schedule_name: other.name,
      kind: 'same_target',
      message: `"${other.name}" already runs ${target.name} (${describe(other.cron) ?? other.cron}, ${other.timezone}). Both schedules will trigger it.`,
    })
  }

  if (target.sourceIds.length && ours.length) {
    const ourMs = ours.map((d) => d.getTime())
    const until = ourMs[ourMs.length - 1] + SHARED_SOURCE_WINDOW_MS
    for (const other of others) {
      if (other.target_type === input.target_type && other.target_id === input.target_id) continue
      const otherTarget = resolveTarget(workspaceId, other.target_type, other.target_id)
      const shared = otherTarget?.sourceIds.filter((id) => target.sourceIds.includes(id)) ?? []
      if (!shared.length) continue
      const theirs = runsUntil(other.cron, other.timezone, until)
      const clash = ourMs.find((mine) => theirs.some((t) => Math.abs(t - mine) <= SHARED_SOURCE_WINDOW_MS))
      if (clash === undefined) continue
      const sourceNames = shared.map((id) => db.sources.find((s) => s.id === id)?.name ?? id).join(', ')
      conflicts.push({
        schedule_id: other.id,
        schedule_name: other.name,
        kind: 'shared_source',
        message: `Runs within 15 minutes of "${other.name}", which also reads from ${sourceNames} (first overlap at ${formatInZone(clash, input.timezone)} ${input.timezone}). Concurrent extraction can hit source rate limits or lock tables.`,
      })
    }
  }

  const typical = typicalDurationSeconds(input.target_type, input.target_id)
  if (typical && ours.length > 1) {
    let minGap = Infinity
    for (let i = 1; i < ours.length; i++) minGap = Math.min(minGap, (ours[i].getTime() - ours[i - 1].getTime()) / 1000)
    if (minGap < typical) {
      conflicts.push({
        schedule_id: input.schedule_id ?? '',
        schedule_name: 'This schedule',
        kind: 'overlapping_window',
        message: `Runs can start every ${formatMinutes(minGap)}, but ${target.name} typically takes ${formatMinutes(typical)}. Consecutive runs will overlap and the overlap policy will apply.`,
      })
    }
  }
  return conflicts
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

/** Flattens retry and concurrency into dotted keys so audit diffs show individual fields. */
function auditShape(s: Partial<UpsertScheduleRequest>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(s)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [inner, innerValue] of Object.entries(value)) out[`${key}.${inner}`] = innerValue
    } else {
      out[key] = value
    }
  }
  return out
}

function definitionOf(s: Schedule): UpsertScheduleRequest {
  return {
    name: s.name,
    description: s.description,
    target_type: s.target_type,
    target_id: s.target_id,
    preset: s.preset,
    cron: s.cron,
    timezone: s.timezone,
    enabled: s.enabled,
    retry: s.retry,
    concurrency: s.concurrency,
  }
}

function loadSchedule(ctx: MockContext) {
  return findOr404(db.schedules, ctx.params.scheduleId, 'Schedule')
}

// ---------------------------------------------------------------------------
// Run now
// ---------------------------------------------------------------------------

function runPermission(type: ScheduleTargetType) {
  if (type === 'pipeline') return 'pipelines:run' as const
  if (type === 'source_sync') return 'sources:sync' as const
  return 'transformations:run' as const
}

function createTargetRun(schedule: Schedule, triggeredBy: { id: string; name: string }, targetName: string, queuedBehind: string | null): RunRecord {
  const base = {
    workspaceId: schedule.workspace_id,
    trigger: 'manual' as const,
    triggeredBy,
    targetName,
    queuedBehind,
  }
  if (schedule.target_type === 'pipeline') {
    const pipeline = db.pipelines.find((p) => p.id === schedule.target_id)!
    const sources = pipeline.source_ids.map((id) => db.sources.find((s) => s.id === id)).filter((s) => s !== undefined)
    const skipped = new Set<StageKey>()
    if (!pipeline.quality_checks_enabled) skipped.add('quality_checks')
    if (!pipeline.metabase_refresh_enabled) skipped.add('metabase_refresh')
    // The demo API can never reach Metabase, so a refresh is reported as skipped rather than simulated as successful.
    if (metabaseRefreshUnavailable(db, schedule.workspace_id, pipeline.stages)) skipped.add('metabase_refresh')
    // Same outcome as POST /pipelines/:id/run: a broken source fails at connection time,
    // otherwise Finance trips its duplicate-invoice test until the ERP data is fixed.
    const failure = pipelineFailure(db, pipeline, pipeline.stages.filter((s) => !skipped.has(s)))
    if (failure?.error.stage === 'quality_checks') skipped.add('metabase_refresh')
    return createSimRun({
      ...base,
      kind: 'pipeline',
      links: { pipeline_id: pipeline.id, source_id: failure?.sourceId ?? pipeline.source_ids[0] ?? null, schedule_id: schedule.id },
      stages: pipeline.stages,
      skipped: [...skipped].filter((s) => pipeline.stages.includes(s)),
      failAt: failure?.error ?? null,
      records: sources.reduce((sum, s) => sum + (s.last_sync_records || 1200), 0) || 1200,
      tables: sources.flatMap((s) => s.selected_tables.map((t) => ({ table: `${t.schema}.${t.name}`, mode: t.ingestion_mode }))),
    })
  }
  if (schedule.target_type === 'source_sync') {
    const source = db.sources.find((s) => s.id === schedule.target_id)!
    const failure = db.sourceFailures[source.id]
    return createSimRun({
      ...base,
      kind: 'ingestion',
      links: { source_id: source.id, schedule_id: schedule.id },
      failAt: failure ?? null,
      records: source.last_sync_records || 1500,
      tables: source.selected_tables.map((t) => ({ table: `${t.schema}.${t.name}`, mode: t.ingestion_mode })),
    })
  }
  const transformation = db.transformations.find((t) => t.id === schedule.target_id)!
  return createSimRun({
    ...base,
    kind: 'transformation',
    links: { transformation_id: transformation.id, schedule_id: schedule.id },
    failAt: compileError(db, transformation),
    records: db.models.find((m) => m.id === transformation.output_model_id)?.row_count ?? 0,
  })
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/schedules',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const q = qString(ctx, 'q')
      const enabled = qBool(ctx, 'enabled')
      const targetType = qString(ctx, 'target_type') as ScheduleTargetType | undefined
      return db.schedules
        .filter((s) => s.workspace_id === ctx.params.workspaceId)
        .filter((s) => enabled === undefined || s.enabled === enabled)
        .filter((s) => !targetType || s.target_type === targetType)
        .map(view)
        .filter((s) => matchesText(q, s.name, s.description, s.target_name, s.cron))
        .sort((a, b) => a.name.localeCompare(b.name))
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/schedules/validate',
    handler: (ctx): ValidateScheduleResponse => {
      const workspaceId = ctx.params.workspaceId
      requireWorkspace(ctx, workspaceId)
      const input = body<ValidateScheduleRequest>(ctx)
      const errors: string[] = []
      const timezone = typeof input.timezone === 'string' ? input.timezone : ''
      const timezoneOk = isValidTimezone(timezone)
      if (!timezoneOk) errors.push(`"${timezone}" is not a valid IANA timezone.`)
      const cronMessage = typeof input.cron === 'string' ? cronError(input.cron, timezoneOk ? timezone : 'UTC') : 'Enter a cron expression.'
      if (cronMessage) errors.push(cronMessage)

      let target: ResolvedTarget | null = null
      if (input.target_id) {
        if (!TARGET_TYPES.includes(input.target_type)) errors.push('Unknown target type.')
        else {
          target = resolveTarget(workspaceId, input.target_type, input.target_id)
          if (!target) errors.push(`${targetLabel(input.target_type)} "${input.target_id}" does not exist in this workspace.`)
        }
      }

      const cronOk = !cronMessage && timezoneOk
      const upcoming = cronOk ? nextRuns(input.cron, timezone, PREVIEW_COUNT) : []
      return {
        valid: errors.length === 0,
        description: cronOk ? describe(input.cron) : null,
        next_runs: upcoming.map((d) => iso(d.getTime())),
        conflicts: cronOk && target ? detectConflicts(workspaceId, input, upcoming, target) : [],
        errors,
      }
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/schedules',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user } = requirePermission(ctx, workspaceId, 'schedules:write')
      const raw = body<UpsertScheduleRequest>(ctx)
      const input: UpsertScheduleRequest = {
        ...raw,
        name: typeof raw.name === 'string' ? raw.name.trim() : raw.name,
        description: typeof raw.description === 'string' ? raw.description.trim() : '',
        cron: typeof raw.cron === 'string' ? normaliseCron(raw.cron) : raw.cron,
        enabled: raw.enabled ?? true,
      }
      const target = validateDefinition(workspaceId, input)
      assertNoDuplicate(workspaceId, input)
      const now = nowIso()
      const schedule: Schedule = {
        id: newId('sch'),
        workspace_id: workspaceId,
        name: input.name,
        description: input.description ?? '',
        target_type: input.target_type,
        target_id: input.target_id,
        target_name: target.name,
        preset: input.preset,
        cron: input.cron,
        timezone: input.timezone,
        enabled: input.enabled,
        retry: pickRetry(input.retry),
        concurrency: pickConcurrency(input.concurrency),
        next_run_at: null,
        last_run: null,
        created_by: { id: user.id, name: user.name },
        created_at: now,
        updated_at: now,
      }
      db.schedules.push(schedule)
      syncLinked(schedule.target_type, schedule.target_id)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'schedule.created',
        resource: { type: 'schedule', id: schedule.id, name: schedule.name },
        changes: diffChanges({}, auditShape(definitionOf(schedule))),
        metadata: { target_type: schedule.target_type, target_id: schedule.target_id },
      })
      return view(schedule)
    },
  },
  {
    method: 'GET',
    path: '/schedules/:scheduleId',
    handler: (ctx) => {
      const schedule = loadSchedule(ctx)
      requireWorkspace(ctx, schedule.workspace_id)
      return view(schedule)
    },
  },
  {
    method: 'PATCH',
    path: '/schedules/:scheduleId',
    handler: (ctx) => {
      const schedule = loadSchedule(ctx)
      const { user } = requirePermission(ctx, schedule.workspace_id, 'schedules:write')
      const patch = body<UpdateScheduleRequest>(ctx)
      const before = definitionOf(schedule)
      // Only editable fields are accepted; id, workspace_id, created_by and derived fields are ignored.
      const defined = Object.fromEntries(
        Object.entries(patch ?? {}).filter(([key, v]) => v !== undefined && (EDITABLE_FIELDS as string[]).includes(key)),
      ) as UpdateScheduleRequest
      const merged: UpsertScheduleRequest = {
        ...before,
        ...defined,
        name: typeof defined.name === 'string' ? defined.name.trim() : before.name,
        description: typeof defined.description === 'string' ? defined.description.trim() : before.description,
        cron: typeof defined.cron === 'string' ? normaliseCron(defined.cron) : before.cron,
        retry: defined.retry ? pickRetry({ ...before.retry, ...defined.retry }) : before.retry,
        concurrency: defined.concurrency ? pickConcurrency({ ...before.concurrency, ...defined.concurrency }) : before.concurrency,
      }
      const target = validateDefinition(schedule.workspace_id, merged)
      assertNoDuplicate(schedule.workspace_id, merged, schedule.id)

      const changes = diffChanges(auditShape(before), auditShape(merged))
      if (!changes.length) return view(schedule)

      const previousTarget = { type: schedule.target_type, id: schedule.target_id }
      Object.assign(schedule, {
        ...merged,
        description: merged.description ?? '',
        target_name: target.name,
        updated_at: nowIso(),
      })
      syncLinked(previousTarget.type, previousTarget.id)
      syncLinked(schedule.target_type, schedule.target_id)

      const onlyToggle = changes.length === 1 && changes[0].field === 'enabled'
      recordAudit({
        workspaceId: schedule.workspace_id,
        actor: userActor(user),
        action: onlyToggle ? (schedule.enabled ? 'schedule.enabled' : 'schedule.disabled') : 'schedule.updated',
        resource: { type: 'schedule', id: schedule.id, name: schedule.name },
        changes,
      })
      return view(schedule)
    },
  },
  {
    method: 'DELETE',
    path: '/schedules/:scheduleId',
    handler: (ctx) => {
      const schedule = loadSchedule(ctx)
      const { user } = requirePermission(ctx, schedule.workspace_id, 'schedules:write')
      db.schedules = db.schedules.filter((s) => s.id !== schedule.id)
      syncLinked(schedule.target_type, schedule.target_id)
      recordAudit({
        workspaceId: schedule.workspace_id,
        actor: userActor(user),
        action: 'schedule.deleted',
        resource: { type: 'schedule', id: schedule.id, name: schedule.name },
        metadata: { target_type: schedule.target_type, target_id: schedule.target_id, cron: schedule.cron, timezone: schedule.timezone },
      })
      return null
    },
  },
  {
    method: 'GET',
    path: '/schedules/:scheduleId/runs',
    handler: (ctx) => {
      const schedule = loadSchedule(ctx)
      requireWorkspace(ctx, schedule.workspace_id)
      const kind = qString(ctx, 'kind') as RunKind | undefined
      const status = qString(ctx, 'status') as RunStatus | undefined
      const items = db.runs
        .filter((r) => r.schedule_id === schedule.id)
        .filter((r) => !kind || r.kind === kind)
        .filter((r) => !status || r.status === status)
        .sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))
        .map(publicRun)
      return paginate(items, ctx, 20)
    },
  },
  {
    method: 'POST',
    path: '/schedules/:scheduleId/run',
    handler: (ctx) => {
      const schedule = loadSchedule(ctx)
      const { user } = requirePermission(ctx, schedule.workspace_id, runPermission(schedule.target_type))
      const target = resolveTarget(schedule.workspace_id, schedule.target_type, schedule.target_id)
      if (!target) {
        throw httpError.conflict('schedule_target_missing', `The ${targetLabel(schedule.target_type).toLowerCase()} this schedule targets no longer exists. Edit the schedule to choose a new target.`)
      }
      if (target.blockedReason) throw httpError.conflict('target_not_runnable', target.blockedReason)

      const active = targetRuns(schedule.target_type, schedule.target_id).filter((r) => !isTerminal(r.status))
      let cancelled: RunRecord[] = []
      let queuedBehind: RunRecord | null = null
      if (active.length >= schedule.concurrency.max_concurrent_runs) {
        if (schedule.concurrency.overlap_policy === 'skip') {
          throw httpError.conflict(
            'concurrency_limit_reached',
            `${target.name} already has ${active.length} run${active.length === 1 ? '' : 's'} in progress (limit ${schedule.concurrency.max_concurrent_runs}). The overlap policy is "skip", so no new run was started.`,
            { active_run_ids: active.map((r) => r.id) },
          )
        }
        if (schedule.concurrency.overlap_policy === 'cancel_running') {
          // Cancel just enough of the oldest in-progress runs to make room for the new one.
          const now = Date.now()
          const excess = active.length - schedule.concurrency.max_concurrent_runs + 1
          cancelled = active
            .filter((r) => r.sim && !r.sim.settled && r.sim.cancelled_at_ms === null)
            .sort((a, b) => Date.parse(a.queued_at) - Date.parse(b.queued_at))
            .slice(0, excess)
          cancelled.forEach((r) => {
            r.sim!.cancelled_at_ms = now
          })
        }
        if (schedule.concurrency.overlap_policy === 'queue') {
          // Wait behind the most recent in-progress run, so queued runs start one after
          // another and never exceed the concurrency limit.
          queuedBehind = active.reduce((latest, r) => (Date.parse(r.queued_at) > Date.parse(latest.queued_at) ? r : latest))
        }
      }

      const run = addRun(createTargetRun(schedule, { id: user.id, name: user.name }, target.name, queuedBehind?.id ?? null))
      recordAudit({
        workspaceId: schedule.workspace_id,
        actor: userActor(user),
        action: 'schedule.run_now',
        resource: { type: 'schedule', id: schedule.id, name: schedule.name },
        executionId: run.id,
        metadata: {
          target_type: schedule.target_type,
          target_id: schedule.target_id,
          run_kind: run.kind,
          simulated: true,
          ...(cancelled.length ? { cancelled_run_ids: cancelled.map((r) => r.id), overlap_policy: 'cancel_running' } : {}),
          ...(queuedBehind ? { queued_behind_run_id: queuedBehind.id, overlap_policy: 'queue' } : {}),
        },
      })
      return publicRun(run)
    },
  },
]
