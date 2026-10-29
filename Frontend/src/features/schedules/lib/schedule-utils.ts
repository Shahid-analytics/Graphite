import { CronExpressionParser } from 'cron-parser'
import { Database, GitBranch, Workflow, type LucideIcon } from 'lucide-react'
import { describeCron } from '@/lib/cron'
import { formatDuration } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import type { OverlapPolicy, Permission, RetryPolicy, Schedule, ScheduleTargetType } from '@/types'

export const TARGET_TYPES: ScheduleTargetType[] = ['pipeline', 'source_sync', 'transformation']

export const TARGET_META: Record<ScheduleTargetType, { label: string; noun: string; icon: LucideIcon; description: string }> = {
  pipeline: {
    label: 'Pipeline',
    noun: 'pipeline',
    icon: Workflow,
    description: 'End-to-end run: ingestion, Bronze load, dbt, quality checks and Metabase refresh.',
  },
  source_sync: {
    label: 'Source sync',
    noun: 'source',
    icon: Database,
    description: 'Ingestion only: extract from the source with dlt and load into Bronze.',
  },
  transformation: {
    label: 'Transformation',
    noun: 'transformation',
    icon: GitBranch,
    description: 'A single dbt model build into Silver or Gold.',
  },
}

/** Permission the backend requires to trigger the schedule's target immediately. */
export function runPermissionFor(type: ScheduleTargetType): Permission {
  if (type === 'pipeline') return 'pipelines:run'
  if (type === 'source_sync') return 'sources:sync'
  return 'transformations:run'
}

export function targetPath(workspaceId: string, schedule: Pick<Schedule, 'target_type' | 'target_id'>) {
  return resourcePath(workspaceId, schedule.target_type === 'source_sync' ? 'source' : schedule.target_type, schedule.target_id)
}

export const OVERLAP_POLICIES: { value: OverlapPolicy; label: string; description: string }[] = [
  {
    value: 'skip',
    label: 'Skip',
    description: 'If the limit is reached when a run is due, the new run is not started and is recorded as skipped. Safest default.',
  },
  {
    value: 'queue',
    label: 'Queue',
    description: 'The new run waits and starts as soon as a running one finishes. Use when every interval must be processed.',
  },
  {
    value: 'cancel_running',
    label: 'Cancel running',
    description: 'The oldest in-progress run is cancelled and the new one starts. Only for idempotent targets where the latest data matters most.',
  },
]

export function overlapLabel(policy: OverlapPolicy) {
  return OVERLAP_POLICIES.find((p) => p.value === policy)?.label ?? policy
}

/** Delay before each retry attempt, in seconds. */
export function retryDelays(retry: RetryPolicy): number[] {
  return Array.from({ length: retry.max_attempts }, (_, i) =>
    retry.backoff_strategy === 'exponential' ? retry.backoff_seconds * 2 ** i : retry.backoff_seconds,
  )
}

export function describeRetry(retry: RetryPolicy) {
  if (retry.max_attempts === 0) return 'No automatic retries'
  const plural = retry.max_attempts === 1 ? 'retry' : 'retries'
  return `Up to ${retry.max_attempts} ${plural}, ${retry.backoff_strategy} backoff from ${formatDuration(retry.backoff_seconds)}`
}

export function describeConcurrency(schedule: Pick<Schedule, 'concurrency'>) {
  const { max_concurrent_runs: max, overlap_policy: policy } = schedule.concurrency
  const runs = max === 1 ? '1 run at a time' : `Up to ${max} concurrent runs`
  const action = policy === 'skip' ? 'skip overlapping runs' : policy === 'queue' ? 'queue overlapping runs' : 'cancel the running one'
  return `${runs}, ${action}`
}

export function cadenceLabel(schedule: Pick<Schedule, 'cron'>) {
  return describeCron(schedule.cron)
}

/** The browser's timezone, used to label times shown in local time. */
export function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** "Wed 29 Oct, 06:00" in the given IANA timezone. */
export function formatInZone(value: Date | string, timezone: string, withWeekday = true) {
  const date = typeof value === 'string' ? new Date(value) : value
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: withWeekday ? 'short' : undefined,
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

/** "06:00" in the given IANA timezone. */
export function formatTimeInZone(value: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
  } catch {
    return value.toISOString().slice(11, 16)
  }
}

/** Short offset label such as "GMT+5:30" for a timezone at a given instant. */
export function zoneOffsetLabel(timezone: string, at: Date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? timezone
  } catch {
    return timezone
  }
}

/** Next `count` occurrences of a stored schedule. Empty when the cron cannot be parsed. */
export function nextOccurrences(cron: string, timezone: string, count: number): Date[] {
  try {
    const parsed = CronExpressionParser.parse(cron, { tz: timezone })
    return Array.from({ length: count }, () => parsed.next().toDate())
  } catch {
    return []
  }
}

export interface UpcomingRun {
  key: string
  at: Date
  schedule: Schedule
}

/** Every occurrence of the enabled schedules within the next `hours`, in time order. */
export function upcomingRuns(schedules: Schedule[], hours = 24, perScheduleCap = 96): UpcomingRun[] {
  const until = Date.now() + hours * 3_600_000
  const out: UpcomingRun[] = []
  for (const schedule of schedules) {
    if (!schedule.enabled) continue
    try {
      const parsed = CronExpressionParser.parse(schedule.cron, { tz: schedule.timezone })
      for (let i = 0; i < perScheduleCap; i++) {
        const at = parsed.next().toDate()
        if (at.getTime() > until) break
        out.push({ key: `${schedule.id}-${at.getTime()}`, at, schedule })
      }
    } catch {
      // Skip schedules whose cron the client cannot parse; the backend remains authoritative.
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}
