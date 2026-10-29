import type { OnboardingStepKey, RunKind, RunTrigger, ScheduleTargetType } from '@/types'

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  ingestion: 'Source sync',
  pipeline: 'Pipeline',
  transformation: 'dbt run',
  dbt_test: 'dbt test',
  schema_apply: 'Schema apply',
}

export const RUN_TRIGGER_LABELS: Record<RunTrigger, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  retry: 'Retry',
  onboarding: 'Onboarding',
  api: 'API',
}

export const SCHEDULE_TARGET_LABELS: Record<ScheduleTargetType, string> = {
  pipeline: 'Pipeline',
  source_sync: 'Source sync',
  transformation: 'Transformation',
}

export const ONBOARDING_STEPS: { key: OnboardingStepKey; title: string; description: string }[] = [
  { key: 'source', title: 'Connect a data source', description: 'Salesforce, PostgreSQL or another system of record.' },
  { key: 'destination', title: 'Configure the warehouse', description: 'The PostgreSQL destination for Bronze, Silver and Gold.' },
  { key: 'ingestion', title: 'Run the first ingestion', description: 'Load raw tables into the Bronze layer.' },
  { key: 'transformation', title: 'Build analytical models', description: 'Run dbt to produce Silver and Gold models.' },
  { key: 'analytics', title: 'Connect analytics', description: 'Link Metabase and publish the first dashboard.' },
]

export function businessAreaLabel(area: string) {
  return area.charAt(0).toUpperCase() + area.slice(1)
}

/** Compact SLA label such as "6h SLA"; SLA values are in minutes. */
export function formatSla(minutes: number | null) {
  if (minutes === null) return 'No SLA'
  if (minutes % 1440 === 0) return `${minutes / 1440}d SLA`
  if (minutes % 60 === 0) return `${minutes / 60}h SLA`
  return `${minutes}m SLA`
}

const ACTION_OVERRIDES: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'access.denied': 'Access denied',
}

/** "pipeline.run_triggered" -> "Pipeline run triggered". */
export function humanizeAction(action: string) {
  const override = ACTION_OVERRIDES[action]
  if (override) return override
  const text = action.replace(/[._]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
