import { Cloud, Database, FileSpreadsheet, FileText, Landmark, ShoppingCart, type LucideIcon } from 'lucide-react'
import { describeCron } from '@/lib/cron'
import type { ConnectorCategory, ConnectorDefinition, HealthStatus, SourceStatus, SyncFrequency, SyncScheduleConfig } from '@/types'

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  crm: 'CRM',
  database: 'Database',
  spreadsheet: 'Spreadsheet',
  ecommerce: 'E-commerce',
  finance: 'Finance',
  file: 'File',
}

export const CATEGORY_ICONS: Record<ConnectorCategory, LucideIcon> = {
  crm: Cloud,
  database: Database,
  spreadsheet: FileSpreadsheet,
  ecommerce: ShoppingCart,
  finance: Landmark,
  file: FileText,
}

export const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Error' },
  { value: 'draft', label: 'Draft' },
]

export const HEALTH_OPTIONS: { value: HealthStatus; label: string }[] = [
  { value: 'healthy', label: 'Healthy' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unhealthy', label: 'Unhealthy' },
  { value: 'paused', label: 'Paused' },
  { value: 'unknown', label: 'Unknown' },
]

export const FREQUENCY_OPTIONS: { value: SyncFrequency; label: string; description: string; cron: string | null }[] = [
  { value: 'manual', label: 'Manual only', description: 'Sync only when someone clicks Sync now or a pipeline runs.', cron: null },
  { value: 'hourly', label: 'Hourly', description: 'At the start of every hour.', cron: '0 * * * *' },
  { value: 'every_6_hours', label: 'Every 6 hours', description: 'At 00:00, 06:00, 12:00 and 18:00.', cron: '0 */6 * * *' },
  { value: 'daily', label: 'Daily', description: 'Every day at 02:00.', cron: '0 2 * * *' },
  { value: 'weekly', label: 'Weekly', description: 'Every Monday at 02:00.', cron: '0 2 * * 1' },
  { value: 'custom', label: 'Custom (cron)', description: 'Your own five-field cron expression.', cron: null },
]

export function frequencyCron(frequency: SyncFrequency) {
  return FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.cron ?? null
}

/** Human description of a source sync schedule, e.g. "Every hour (Asia/Kolkata)". */
export function describeSchedule(schedule: SyncScheduleConfig, withTimezone = true) {
  if (schedule.frequency === 'manual' || !schedule.cron) return 'Manual only'
  const text = describeCron(schedule.cron)
  return withTimezone ? `${text} (${schedule.timezone})` : text
}

export function connectorName(connectors: ConnectorDefinition[] | undefined, type: string) {
  return connectors?.find((c) => c.type === type)?.name ?? type
}

/** Suggests a Bronze schema name from a source name, e.g. "ERP Database" -> "bronze_erp_database". */
export function suggestSchema(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)
  return slug ? `bronze_${slug}` : ''
}

export const SCHEMA_PATTERN = /^[a-z][a-z0-9_]{1,62}$/

export const BRONZE_HELP =
  'Bronze is the raw landing layer in your PostgreSQL warehouse. dlt copies source tables here as-is; dbt then cleans them into Silver and Gold.'
export const INCREMENTAL_HELP =
  'Incremental sync only fetches rows whose cursor field (for example updated_at or SystemModstamp) changed since the last successful sync. It is faster and lighter on the source.'
export const FULL_LOAD_HELP =
  'A full load re-reads every row of the table on each sync and replaces the Bronze copy. Use it for small tables or tables without a reliable change timestamp.'
export const CURSOR_HELP =
  'The cursor field is a column that increases whenever a row changes. Graphite stores the highest value seen and resumes from it on the next sync.'
export const PRIMARY_KEY_HELP = 'Primary key columns are used to merge changed rows into Bronze without creating duplicates.'
