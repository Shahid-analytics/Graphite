import { CRON_PRESETS } from '@/lib/cron'
import type { SyncFrequency } from '@/types'

function presetCron(value: 'hourly' | 'every_6_hours' | 'daily' | 'weekly') {
  return CRON_PRESETS.find((p) => p.value === value)?.cron ?? null
}

/** Sync frequency options for a new source, mapped onto SyncScheduleConfig. */
export const SYNC_FREQUENCIES: { value: SyncFrequency; label: string; cron: string | null }[] = [
  { value: 'hourly', label: 'Hourly', cron: presetCron('hourly') },
  { value: 'every_6_hours', label: 'Every 6 hours', cron: presetCron('every_6_hours') },
  { value: 'daily', label: 'Daily at 02:00', cron: presetCron('daily') },
  { value: 'weekly', label: 'Weekly on Monday at 02:00', cron: presetCron('weekly') },
  { value: 'manual', label: 'Manual only', cron: null },
  { value: 'custom', label: 'Custom cron expression', cron: null },
]

export function cronForFrequency(frequency: SyncFrequency, customCron: string) {
  if (frequency === 'custom') return customCron.trim().replace(/\s+/g, ' ')
  return SYNC_FREQUENCIES.find((f) => f.value === frequency)?.cron ?? null
}

/** Postgres identifier rules for the Bronze schema name. */
export const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/
