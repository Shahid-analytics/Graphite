import type { DataModel, FreshnessItem, Overview, RecentAnalyticsItem, RunKind, UpcomingSchedule } from '@/types'
import type { RunRecord } from '../db'
import { computeQualitySummary } from '../engine/quality'
import { toSummary } from '../engine/runs'
import type { MockRoute } from '../router'
import { db, requireWorkspace, scheduleView } from '../store'
import { nowIso } from '../util'

const DAY_MS = 86_400_000
const TREND_DAYS = 14
const OPERATIONAL_KINDS: RunKind[] = ['pipeline', 'ingestion']
const TRANSFORMATION_KINDS: RunKind[] = ['transformation', 'dbt_test']

const byQueuedDesc = (a: RunRecord, b: RunRecord) => Date.parse(b.queued_at) - Date.parse(a.queued_at)

function maxIso(values: (string | null)[]) {
  return values.reduce<string | null>((max, value) => (value && (!max || Date.parse(value) > Date.parse(max)) ? value : max), null)
}

/** Calendar day key (YYYY-MM-DD) in the workspace timezone. */
function dayKey(ms: number, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

function runTrend(runs: RunRecord[], timezone: string, now: number): Overview['run_trend'] {
  const days: string[] = []
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS, timezone)
    if (!days.includes(key)) days.push(key)
  }
  const buckets = new Map(days.map((date) => [date, { date, succeeded: 0, failed: 0 }]))
  for (const run of runs) {
    if (!OPERATIONAL_KINDS.includes(run.kind)) continue
    if (run.status !== 'succeeded' && run.status !== 'failed') continue
    const bucket = buckets.get(dayKey(Date.parse(run.queued_at), timezone))
    if (bucket) bucket[run.status] += 1
  }
  return days.map((date) => buckets.get(date)!)
}

function freshnessItem(model: DataModel): FreshnessItem {
  return {
    model_id: model.id,
    name: model.name,
    layer: model.layer,
    last_refreshed_at: model.last_refreshed_at,
    sla_minutes: model.freshness_sla_minutes,
    status: model.freshness_status,
  }
}

/** Stale first, then the models closest to breaching their SLA (oldest refresh first). */
function freshnessOrder(a: DataModel, b: DataModel) {
  const rank = (m: DataModel) => (m.freshness_status === 'stale' ? 0 : m.freshness_status === 'unknown' ? 2 : 1)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  const age = (m: DataModel) => (m.last_refreshed_at ? Date.parse(m.last_refreshed_at) : 0)
  return age(a) - age(b)
}

export function buildOverview(workspaceId: string, timezone: string): Overview {
  const now = Date.now()
  const sources = db.sources.filter((s) => s.workspace_id === workspaceId)
  const runs = db.runs.filter((r) => r.workspace_id === workspaceId).sort(byQueuedDesc)
  const models = db.models.filter((m) => m.workspace_id === workspaceId)

  const runs24h = runs.filter((r) => now - Date.parse(r.queued_at) <= DAY_MS)
  const weekAgo = now - 7 * DAY_MS
  // A failure that has already been retried is represented by its latest attempt only.
  const retried = new Set(runs.map((r) => r.retry_of).filter((id): id is string => id !== null))

  const upcoming: UpcomingSchedule[] = db.schedules
    .filter((s) => s.workspace_id === workspaceId && s.enabled)
    .map(scheduleView)
    .filter((s) => s.next_run_at)
    .sort((a, b) => Date.parse(a.next_run_at!) - Date.parse(b.next_run_at!))
    .slice(0, 6)
    .map((s) => ({ id: s.id, name: s.name, target_type: s.target_type, target_name: s.target_name, next_run_at: s.next_run_at! }))

  const analytics: RecentAnalyticsItem[] = [
    ...db.dashboards
      .filter((d) => d.workspace_id === workspaceId && d.last_viewed_at)
      .map((d) => ({ id: d.id, kind: 'dashboard' as const, name: d.name, business_area: d.business_area, accessed_at: d.last_viewed_at! })),
    ...db.reports
      .filter((r) => r.workspace_id === workspaceId && r.last_viewed_at)
      .map((r) => ({ id: r.id, kind: 'report' as const, name: r.name, business_area: r.business_area, accessed_at: r.last_viewed_at! })),
  ]
    .sort((a, b) => Date.parse(b.accessed_at) - Date.parse(a.accessed_at))
    .slice(0, 6)

  const countFreshness = (status: DataModel['freshness_status']) => models.filter((m) => m.freshness_status === status).length
  const countLayer = (layer: DataModel['layer']) => models.filter((m) => m.layer === layer).length

  return {
    generated_at: nowIso(),
    sources: {
      total: sources.length,
      healthy: sources.filter((s) => s.health === 'healthy').length,
      degraded: sources.filter((s) => s.health === 'degraded').length,
      unhealthy: sources.filter((s) => s.health === 'unhealthy').length,
      paused: sources.filter((s) => s.health === 'paused').length,
    },
    runs_24h: {
      total: runs24h.length,
      succeeded: runs24h.filter((r) => r.status === 'succeeded').length,
      failed: runs24h.filter((r) => r.status === 'failed').length,
      running: runs24h.filter((r) => r.status === 'running' || r.status === 'queued').length,
    },
    last_successful_sync_at: maxIso(sources.map((s) => s.last_successful_sync_at)),
    freshness: {
      fresh: countFreshness('fresh'),
      stale: countFreshness('stale'),
      unknown: countFreshness('unknown'),
      items: models
        .filter((m) => (m.layer === 'gold' || m.layer === 'bronze') && m.freshness_sla_minutes !== null)
        .sort(freshnessOrder)
        .slice(0, 8)
        .map(freshnessItem),
    },
    models: {
      total: models.length,
      bronze: countLayer('bronze'),
      silver: countLayer('silver'),
      gold: countLayer('gold'),
      analytical_tables: models.filter((m) => m.layer !== 'bronze' && m.materialization !== 'view').length,
    },
    recent_runs: runs.filter((r) => OPERATIONAL_KINDS.includes(r.kind)).slice(0, 8).map(toSummary),
    failed_runs: runs
      .filter((r) => r.status === 'failed' && Date.parse(r.queued_at) >= weekAgo && !retried.has(r.id))
      .slice(0, 5)
      .map(toSummary),
    upcoming_schedules: upcoming,
    recent_transformation_runs: runs.filter((r) => TRANSFORMATION_KINDS.includes(r.kind)).slice(0, 6).map(toSummary),
    recent_analytics: analytics,
    latest_audit_events: db.auditEvents
      .filter((e) => e.workspace_id === workspaceId)
      .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
      .slice(0, 8),
    run_trend: runTrend(runs, timezone, now),
    quality: computeQualitySummary(db, workspaceId),
  }
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/overview',
    handler: (ctx) => {
      const { workspace } = requireWorkspace(ctx, ctx.params.workspaceId)
      return buildOverview(workspace.id, workspace.timezone)
    },
  },
]
