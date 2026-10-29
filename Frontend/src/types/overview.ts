import type { AuditEvent } from './audit'
import type { ID, ISODateTime } from './common'
import type { DataLayer, FreshnessStatus } from './models'
import type { QualitySummary } from './quality'
import type { RunSummary } from './runs'
import type { ScheduleTargetType } from './schedules'

export interface FreshnessItem {
  model_id: ID
  name: string
  layer: DataLayer
  last_refreshed_at: ISODateTime | null
  sla_minutes: number | null
  status: FreshnessStatus
}

export interface UpcomingSchedule {
  id: ID
  name: string
  target_type: ScheduleTargetType
  target_name: string
  next_run_at: ISODateTime
}

export interface RecentAnalyticsItem {
  id: ID
  kind: 'dashboard' | 'report'
  name: string
  business_area: string
  accessed_at: ISODateTime
}

export interface Overview {
  generated_at: ISODateTime
  sources: { total: number; healthy: number; degraded: number; unhealthy: number; paused: number }
  runs_24h: { total: number; succeeded: number; failed: number; running: number }
  last_successful_sync_at: ISODateTime | null
  freshness: { fresh: number; stale: number; unknown: number; items: FreshnessItem[] }
  models: { total: number; bronze: number; silver: number; gold: number; analytical_tables: number }
  recent_runs: RunSummary[]
  failed_runs: RunSummary[]
  upcoming_schedules: UpcomingSchedule[]
  recent_transformation_runs: RunSummary[]
  recent_analytics: RecentAnalyticsItem[]
  latest_audit_events: AuditEvent[]
  run_trend: { date: string; succeeded: number; failed: number }[]
  quality: QualitySummary
}
