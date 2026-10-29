import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

function toDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

/** "28 Oct 2026, 14:05" */
export function formatDateTime(value: string | Date | null | undefined) {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy, HH:mm') : '—'
}

/** "28 Oct 2026, 14:05:09" */
export function formatDateTimeSeconds(value: string | Date | null | undefined) {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy, HH:mm:ss') : '—'
}

export function formatDate(value: string | Date | null | undefined) {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy') : '—'
}

export function formatTime(value: string | Date | null | undefined) {
  const date = toDate(value)
  return date ? format(date, 'HH:mm:ss') : '—'
}

/** "5 minutes ago" / "in 2 hours" */
export function formatRelative(value: string | Date | null | undefined) {
  const date = toDate(value)
  if (!date) return '—'
  const distance = formatDistanceToNowStrict(date)
  return date.getTime() > Date.now() ? `in ${distance}` : `${distance} ago`
}

/** Formats a duration in seconds as "1h 04m", "3m 12s" or "48s". */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en')

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : plain.format(value)
}

export function formatCompact(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : compact.format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(digits)}%`
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
