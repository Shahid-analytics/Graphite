import { CronExpressionParser } from 'cron-parser'
import type {
  ActorRef,
  AuditChange,
  AuditEvent,
  Notification,
  Permission,
  Pipeline,
  Role,
  Schedule,
  Session,
  Source,
  StageKey,
  User,
  Workspace,
} from '@/types'
import type { MockDb, RunRecord } from './db'
import { holdQueuedRun, materializeRun, toSummary } from './engine/runs'
import { ROLE_PERMISSIONS } from './permissions'
import { httpError, type MockContext } from './router'
import { createDb } from './seed'
import { formatDurationShort } from './text'
import { iso, newId, nowIso } from './util'

/** The in-memory demo database. Reset on page reload or via the demo controls. */
export let db: MockDb = createDb()

export function resetDb() {
  db = createDb()
}

// ---------------------------------------------------------------------------
// Demo session. Only a user id and an optional demo role override are kept in
// sessionStorage; no credentials or tokens are stored in the browser.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'graphite.demo.session'

interface DemoSession {
  userId: string | null
  roleOverride: Role | null
}

function loadSession(): DemoSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw) as DemoSession
  } catch {
    // sessionStorage unavailable; fall through to a signed-out session.
  }
  return { userId: null, roleOverride: null }
}

export const demoSession: DemoSession = loadSession()

export function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(demoSession))
  } catch {
    // Ignore storage failures in demo mode.
  }
}

export function sessionFor(userId: string): Session {
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw httpError.unauthorized()
  return {
    user,
    memberships: db.memberships
      .filter((m) => m.user_id === userId && m.status === 'active')
      .map((m) => ({
        workspace_id: m.workspace_id,
        workspace_name: db.workspaces.find((w) => w.id === m.workspace_id)?.name ?? m.workspace_id,
        role: demoSession.roleOverride ?? m.role,
      })),
    expires_at: iso(Date.now() + 8 * 3_600_000),
  }
}

export function currentSession(): Session | null {
  if (!demoSession.userId) return null
  try {
    return sessionFor(demoSession.userId)
  } catch {
    return null
  }
}

export function requireUser(ctx: MockContext): User {
  if (!ctx.session) throw httpError.unauthorized()
  return ctx.session.user
}

export function roleIn(userId: string, workspaceId: string): Role | null {
  const membership = db.memberships.find((m) => m.user_id === userId && m.workspace_id === workspaceId && m.status === 'active')
  if (!membership) return null
  return demoSession.roleOverride ?? membership.role
}

export function requireWorkspace(ctx: MockContext, workspaceId: string) {
  const user = requireUser(ctx)
  const workspace = db.workspaces.find((w) => w.id === workspaceId)
  if (!workspace) throw httpError.notFound('Workspace', workspaceId)
  const role = roleIn(user.id, workspaceId)
  if (!role) throw httpError.forbidden('You are not a member of this workspace.')
  return { user, workspace, role, permissions: ROLE_PERMISSIONS[role] }
}

/** Throws 403 unless the signed-in user holds `permission` in the workspace. */
export function requirePermission(ctx: MockContext, workspaceId: string, permission: Permission) {
  const access = requireWorkspace(ctx, workspaceId)
  if (!access.permissions.includes(permission)) {
    recordAudit({
      workspaceId,
      actor: { type: 'user', id: access.user.id, name: access.user.name, email: access.user.email },
      action: 'access.denied',
      resource: { type: 'permission', id: permission, name: permission },
      status: 'denied',
    })
    throw httpError.forbidden(`Your role (${access.role}) does not include the "${permission}" permission.`)
  }
  return access
}

export function workspaceView(workspaceId: string, userId: string): Workspace {
  const ws = db.workspaces.find((w) => w.id === workspaceId)
  if (!ws) throw httpError.notFound('Workspace', workspaceId)
  const role = roleIn(userId, workspaceId) ?? 'viewer'
  return { ...ws, current_user_role: role, permissions: ROLE_PERMISSIONS[role] }
}

export function userActor(user: User): ActorRef {
  return { type: 'user', id: user.id, name: user.name, email: user.email }
}

export function findOr404<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((i) => i.id === id)
  if (!item) throw httpError.notFound(label, id)
  return item
}

// ---------------------------------------------------------------------------
// Audit and notifications
// ---------------------------------------------------------------------------

export function recordAudit(input: {
  workspaceId: string
  actor: ActorRef
  action: string
  resource: { type: string; id: string; name: string }
  status?: AuditEvent['status']
  executionId?: string | null
  changes?: AuditChange[]
  metadata?: Record<string, unknown>
}) {
  const ws = db.workspaces.find((w) => w.id === input.workspaceId)
  db.auditEvents.unshift({
    id: newId('aud'),
    workspace_id: input.workspaceId,
    workspace_name: ws?.name ?? input.workspaceId,
    occurred_at: nowIso(),
    actor: input.actor,
    action: input.action,
    resource: input.resource,
    status: input.status ?? 'success',
    execution_id: input.executionId ?? null,
    ip_address: input.actor.type === 'user' ? '127.0.0.1' : null,
    changes: input.changes ?? [],
    metadata: input.metadata ?? {},
  })
}

/** Builds an audit change list for the keys that differ. Secret keys are redacted. */
export function diffChanges(before: Record<string, unknown>, after: Record<string, unknown>, secretKeys: string[] = []): AuditChange[] {
  return Object.keys(after)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) =>
      secretKeys.includes(key)
        ? { field: key, before: '[secret]', after: after[key] === null ? '[secret cleared]' : '[secret updated]' }
        : { field: key, before: before[key] ?? null, after: after[key] ?? null },
    )
}

/**
 * In-app delivery preference of the signed-in demo user for a notification type
 * (workspace-specific preferences first, then the user's defaults). Notifications are
 * delivered unless the user turned the in-app channel off for that type.
 */
function inAppEnabled(workspaceId: string, type: Notification['type']) {
  const userId = demoSession.userId
  if (!userId) return true
  const prefs = db.notificationPrefs[`${userId}:${workspaceId}`] ?? db.notificationPrefs[userId]
  return prefs?.events[type]?.in_app ?? true
}

/** Adds a simulated in-app notification, honouring the signed-in user's notification preferences. */
export function pushNotification(input: Omit<Notification, 'id' | 'created_at' | 'read_at'>) {
  if (!inAppEnabled(input.workspace_id, input.type)) return
  db.notifications.unshift({ ...input, id: newId('ntf'), created_at: nowIso(), read_at: null })
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function addRun(run: RunRecord) {
  db.runs.unshift(run)
  return run
}

const SCHEDULER_ACTOR: ActorRef = { type: 'scheduler', id: 'svc_scheduler', name: 'Scheduler' }

/** Advances every simulated run; applies side effects once per run on completion. */
export function settleRuns() {
  const now = Date.now()
  // Oldest first, so a run queued behind another sees its blocker's state from this pass.
  for (let i = db.runs.length - 1; i >= 0; i--) {
    const run = db.runs[i]
    if (!run.sim || run.sim.settled) continue
    if (run.sim.queued_behind) holdQueuedRun(run, db.runs.find((r) => r.id === run.sim?.queued_behind), now)
    if (materializeRun(run, now)) onRunSettled(run)
  }
}

/** Sources a settled ingestion or pipeline run read from (every source of a pipeline). */
function sourcesOf(run: RunRecord) {
  if (run.kind === 'ingestion') return db.sources.filter((s) => s.id === run.source_id)
  if (run.kind !== 'pipeline') return []
  const pipeline = db.pipelines.find((p) => p.id === run.pipeline_id)
  const ids = pipeline?.source_ids ?? (run.source_id ? [run.source_id] : [])
  return db.sources.filter((s) => ids.includes(s.id))
}

/** Stages that read from the sources; a failure after them is not a sync failure. */
const SYNC_STAGES: StageKey[] = ['source_connect', 'ingestion', 'bronze_load']

function updateSourcesAfterRun(run: RunRecord) {
  const syncStages = run.stages.filter((s) => SYNC_STAGES.includes(s.key) && s.status !== 'skipped')
  // A pipeline run limited to later stages (for example dbt only) did not sync its sources.
  if (!syncStages.length) return
  const failed = run.status === 'failed'
  // The sync succeeded even when a later stage failed (for example Finance stopped by its quality checks).
  const synced = syncStages.every((s) => s.status === 'succeeded')
  const sources = sourcesOf(run)
  const records = synced ? Math.round((run.sim?.total_records || run.records_processed || 0) / Math.max(1, sources.length)) : 0
  for (const source of sources) {
    // A connection failure of another source of the same pipeline says nothing about this one.
    if (failed && run.error?.stage === 'source_connect' && run.source_id !== source.id) continue
    source.last_sync_at = run.finished_at
    source.last_sync_status = synced ? 'succeeded' : run.status
    source.last_sync_duration_seconds = run.duration_seconds
    source.last_sync_records = records
    if (synced) {
      source.last_successful_sync_at = run.finished_at
      source.total_records += records
      if (source.status === 'error') source.status = 'active'
      // A successful sync verifies the connection (new sources and replaced credentials start as "unknown").
      if ((source.health === 'unhealthy' || source.health === 'unknown') && source.status === 'active' && !db.sourceFailures[source.id]) {
        source.health = 'healthy'
        source.health_message = null
      }
      // Bronze tables for this source are now fresh.
      db.models
        .filter((m) => m.source_id === source.id)
        .forEach((m) => {
          m.last_refreshed_at = run.finished_at
          m.freshness_status = 'fresh'
        })
    } else if (failed && run.error?.stage === 'source_connect') {
      source.status = 'error'
      source.health = 'unhealthy'
      source.health_message = run.error.message
    }
  }
}

function onRunSettled(run: RunRecord) {
  const ok = run.status === 'succeeded'
  const failed = run.status === 'failed'

  if (run.status !== 'cancelled') updateSourcesAfterRun(run)

  if (run.transformation_id && (run.kind === 'transformation' || run.kind === 'dbt_test')) {
    const t = db.transformations.find((x) => x.id === run.transformation_id)
    if (t) {
      if (run.kind === 'transformation') {
        t.last_run_status = run.status
        t.last_run_at = run.finished_at
        t.last_run_duration_seconds = run.duration_seconds
        if (ok && t.output_model_id) {
          const model = db.models.find((m) => m.id === t.output_model_id)
          if (model) {
            model.last_refreshed_at = run.finished_at
            model.freshness_status = 'fresh'
          }
        }
      } else {
        db.qualityChecks
          .filter((c) => c.model_id === t.output_model_id)
          .forEach((c) => {
            c.last_run_at = run.finished_at
            c.run_id = run.id
          })
      }
    }
  }

  if (run.kind === 'schema_apply' && run.schema_proposal_id) {
    const proposal = db.proposals.find((p) => p.id === run.schema_proposal_id)
    if (proposal) proposal.status = ok ? 'applied' : 'approved'
  }

  const resource =
    run.pipeline_id
      ? { type: 'run' as const, id: run.id, name: run.target_name }
      : run.source_id
        ? { type: 'source' as const, id: run.source_id, name: run.target_name }
        : run.transformation_id
          ? { type: 'transformation' as const, id: run.transformation_id, name: run.target_name }
          : { type: 'run' as const, id: run.id, name: run.target_name }

  if (failed) {
    const repeated = run.attempt >= 3
    pushNotification({
      workspace_id: run.workspace_id,
      type: repeated ? 'repeated_retries' : run.error?.stage === 'quality_checks' ? 'quality_failed' : 'pipeline_failed',
      severity: 'critical',
      title: repeated ? `${run.target_name} failed after ${run.attempt} attempts` : `${run.target_name} failed`,
      message: `${run.error?.message ?? 'The run failed.'} (simulated run ${run.id})`,
      resource: { type: 'run', id: run.id, name: run.target_name },
    })
  } else if (ok && (run.kind === 'ingestion' || run.kind === 'pipeline')) {
    pushNotification({
      workspace_id: run.workspace_id,
      type: 'sync_completed',
      severity: 'success',
      title: `${run.target_name} completed`,
      message: `${run.records_processed ?? 0} records processed in ${formatDurationShort(run.duration_seconds ?? 0)} (simulated run).`,
      resource,
    })
  }

  recordAudit({
    workspaceId: run.workspace_id,
    actor: run.trigger === 'schedule' ? SCHEDULER_ACTOR : { type: 'service', id: 'svc_orchestrator', name: 'Orchestrator' },
    action: `${run.kind}.run_${run.status}`,
    resource: { type: resource.type, id: resource.id, name: run.target_name },
    status: ok ? 'success' : run.status === 'cancelled' ? 'success' : 'failure',
    executionId: run.id,
    metadata: { duration_seconds: run.duration_seconds, simulated: true },
  })
}

export function latestRun(predicate: (run: RunRecord) => boolean) {
  return db.runs.find(predicate) ?? null
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function nextCronRun(cron: string | null, timezone: string, from = new Date()): string | null {
  if (!cron) return null
  try {
    return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toISOString()
  } catch {
    return null
  }
}

export function scheduleView(schedule: Schedule): Schedule {
  const last = latestRun((r) => r.schedule_id === schedule.id)
  return {
    ...schedule,
    next_run_at: schedule.enabled ? nextCronRun(schedule.cron, schedule.timezone) : null,
    last_run: last ? toSummary(last) : null,
  }
}

export function sourceView(source: Source): Source {
  return {
    ...source,
    next_sync_at: source.status === 'active' && source.schedule.frequency !== 'manual' ? nextCronRun(source.schedule.cron, source.schedule.timezone) : null,
  }
}

export function pipelineView(pipeline: Pipeline): Pipeline {
  const runs = db.runs.filter((r) => r.pipeline_id === pipeline.id)
  const weekAgo = Date.now() - 7 * 86_400_000
  const recent = runs.filter((r) => Date.parse(r.queued_at) >= weekAgo && ['succeeded', 'failed'].includes(r.status))
  const finished = runs.filter((r) => r.status === 'succeeded' && r.duration_seconds)
  const schedule = pipeline.schedule_id ? db.schedules.find((s) => s.id === pipeline.schedule_id) : null
  return {
    ...pipeline,
    last_run: runs[0] ? toSummary(runs[0]) : null,
    success_rate_7d: recent.length ? recent.filter((r) => r.status === 'succeeded').length / recent.length : null,
    avg_duration_seconds: finished.length ? Math.round(finished.slice(0, 20).reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0) / Math.min(20, finished.length)) : null,
    next_run_at: schedule && schedule.enabled && pipeline.status === 'active' ? nextCronRun(schedule.cron, schedule.timezone) : null,
  }
}
