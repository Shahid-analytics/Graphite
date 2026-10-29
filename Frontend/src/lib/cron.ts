import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'
import type { IntervalPreset } from '@/types'

/** Five-field cron presets offered in schedule and sync forms. */
export const CRON_PRESETS: { value: Exclude<IntervalPreset, 'custom'>; label: string; cron: string }[] = [
  { value: 'every_15_minutes', label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { value: 'hourly', label: 'Hourly', cron: '0 * * * *' },
  { value: 'every_6_hours', label: 'Every 6 hours', cron: '0 */6 * * *' },
  { value: 'daily', label: 'Daily at 02:00', cron: '0 2 * * *' },
  { value: 'weekly', label: 'Weekly on Monday at 02:00', cron: '0 2 * * 1' },
  { value: 'monthly', label: 'Monthly on the 1st at 02:00', cron: '0 2 1 * *' },
]

export const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'UTC',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Dhaka',
  'Asia/Kathmandu',
  'Asia/Colombo',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
]

export interface CronValidation {
  valid: boolean
  error: string | null
  description: string | null
  nextRuns: Date[]
  /** Minimum gap between the next runs, in minutes. */
  minIntervalMinutes: number | null
}

/**
 * Client-side validation for immediate feedback. The backend re-validates and is
 * authoritative for execution, conflicts and dependency enforcement.
 */
export function validateCron(expression: string, timezone = 'UTC', count = 5): CronValidation {
  const expr = expression.trim().replace(/\s+/g, ' ')
  if (!expr) return { valid: false, error: 'Enter a cron expression.', description: null, nextRuns: [], minIntervalMinutes: null }
  if (expr.split(' ').length !== 5) {
    return { valid: false, error: 'Use five fields: minute hour day-of-month month day-of-week.', description: null, nextRuns: [], minIntervalMinutes: null }
  }
  try {
    const parsed = CronExpressionParser.parse(expr, { tz: timezone })
    const nextRuns = Array.from({ length: count }, () => parsed.next().toDate())
    let minGap: number | null = null
    for (let i = 1; i < nextRuns.length; i++) {
      const gap = (nextRuns[i].getTime() - nextRuns[i - 1].getTime()) / 60_000
      minGap = minGap === null ? gap : Math.min(minGap, gap)
    }
    return { valid: true, error: null, description: describeCron(expr), nextRuns, minIntervalMinutes: minGap }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? friendlyCronError(error.message) : 'Invalid cron expression.', description: null, nextRuns: [], minIntervalMinutes: null }
  }
}

const FIELD_RANGES: Record<string, string> = { '0-59': 'Minute', '0-23': 'Hour', '1-31': 'Day of month', '1-12': 'Month', '0-7': 'Day of week' }

/** Rewrites cron-parser range errors ("Constraint error, got value 99 expected range 0-59") in plain words. */
function friendlyCronError(message: string) {
  const match = /got value (\S+) expected range (\d+)-(\d+)/.exec(message)
  const field = match ? FIELD_RANGES[`${match[2]}-${match[3]}`] : undefined
  if (!match || !field) return message
  return `${field} must be between ${match[2]} and ${match[3]} (got ${match[1]}).`
}

export function describeCron(expression: string): string {
  try {
    return cronstrue.toString(expression, { use24HourTimeFormat: true, verbose: false })
  } catch {
    return expression
  }
}

export function presetForCron(cron: string): IntervalPreset {
  return CRON_PRESETS.find((p) => p.cron === cron.trim())?.value ?? 'custom'
}
