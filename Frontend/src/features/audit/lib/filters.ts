import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { AuditQuery, AuditStatus } from '@/types'

export const QUICK_RANGES = [
  { value: '24h', label: '24h', description: 'Last 24 hours', hours: 24 },
  { value: '7d', label: '7d', description: 'Last 7 days', hours: 24 * 7 },
  { value: '30d', label: '30d', description: 'Last 30 days', hours: 24 * 30 },
] as const

export type QuickRange = (typeof QUICK_RANGES)[number]['value']

export const AUDIT_STATUSES: { value: AuditStatus; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'denied', label: 'Denied' },
]

/** Filters as they appear in the URL. Empty string means "not set". */
export interface AuditFilters {
  q: string
  actor: string
  type: string
  action: string
  status: string
  range: QuickRange | ''
  from: string
  to: string
}

const KEYS: (keyof AuditFilters)[] = ['q', 'actor', 'type', 'action', 'status', 'range', 'from', 'to']

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function readRange(value: string | null): QuickRange | '' {
  return QUICK_RANGES.some((r) => r.value === value) ? (value as QuickRange) : ''
}

/** Converts a local yyyy-mm-dd date to an ISO timestamp at the start or end of that day. */
function dayBoundary(date: string, end: boolean) {
  if (!DATE_RE.test(date)) return undefined
  const value = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`)
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
}

/** Builds the API query for the filters. Quick ranges are resolved against `now` at request time. */
export function toAuditQuery(filters: AuditFilters, now = Date.now()): Omit<AuditQuery, 'page' | 'page_size'> {
  const range = QUICK_RANGES.find((r) => r.value === filters.range)
  return {
    q: filters.q.trim() || undefined,
    actor_id: filters.actor || undefined,
    resource_type: filters.type || undefined,
    action: filters.action || undefined,
    status: (filters.status || undefined) as AuditStatus | undefined,
    from: range ? new Date(now - range.hours * 3_600_000).toISOString() : filters.from ? dayBoundary(filters.from, false) : undefined,
    to: range ? undefined : filters.to ? dayBoundary(filters.to, true) : undefined,
  }
}

/** Message for a custom date range the API would reject (From after To), or null. */
export function dateRangeError(filters: AuditFilters) {
  if (filters.range || !filters.from || !filters.to) return null
  // yyyy-mm-dd strings compare correctly as text.
  return filters.from > filters.to ? 'The From date must be on or before the To date.' : null
}

export function countActiveFilters(filters: AuditFilters) {
  const { from, to, range, ...rest } = filters
  return Object.values(rest).filter(Boolean).length + (range || from || to ? 1 : 0)
}

/** Audit filters and page, persisted in the URL search params so views can be shared. */
export function useAuditFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo<AuditFilters>(
    () => ({
      q: params.get('q') ?? '',
      actor: params.get('actor') ?? '',
      type: params.get('type') ?? '',
      action: params.get('action') ?? '',
      status: params.get('status') ?? '',
      range: readRange(params.get('range')),
      from: DATE_RE.test(params.get('from') ?? '') ? params.get('from')! : '',
      to: DATE_RE.test(params.get('to') ?? '') ? params.get('to')! : '',
    }),
    [params],
  )
  const page = Math.max(1, Number(params.get('page')) || 1)

  const setFilters = useCallback(
    (patch: Partial<AuditFilters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPage = useCallback(
    (nextPage: number) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (nextPage > 1) next.set('page', String(nextPage))
        else next.delete('page')
        return next
      })
    },
    [setParams],
  )

  const clear = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        KEYS.forEach((key) => next.delete(key))
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  return { filters, page, setFilters, setPage, clear, activeCount: countActiveFilters(filters) }
}
