import { describe, expect, it } from 'vitest'
import { countActiveFilters, dateRangeError, toAuditQuery, type AuditFilters } from './filters'

const empty: AuditFilters = { q: '', actor: '', type: '', action: '', status: '', range: '', from: '', to: '' }

describe('audit filters', () => {
  it('omits unset filters', () => {
    expect(toAuditQuery(empty)).toEqual({
      q: undefined,
      actor_id: undefined,
      resource_type: undefined,
      action: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    })
    expect(countActiveFilters(empty)).toBe(0)
  })

  it('resolves quick ranges against the request time and ignores dates', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    const query = toAuditQuery({ ...empty, range: '24h', from: '2026-01-01', to: '2026-01-02' }, now)
    expect(query.from).toBe('2026-10-27T12:00:00.000Z')
    expect(query.to).toBeUndefined()
  })

  it('expands dates to whole local days', () => {
    const query = toAuditQuery({ ...empty, from: '2026-10-01', to: '2026-10-02' })
    expect(Date.parse(query.to!) - Date.parse(query.from!)).toBe(2 * 86_400_000 - 1)
  })

  it('counts a date range as one filter', () => {
    expect(countActiveFilters({ ...empty, q: 'x', status: 'failure', from: '2026-10-01', to: '2026-10-02' })).toBe(3)
  })

  it('flags a reversed custom date range but not a quick range', () => {
    expect(dateRangeError({ ...empty, from: '2026-10-05', to: '2026-10-01' })).not.toBeNull()
    expect(dateRangeError({ ...empty, from: '2026-10-01', to: '2026-10-01' })).toBeNull()
    expect(dateRangeError({ ...empty, range: '7d', from: '2026-10-05', to: '2026-10-01' })).toBeNull()
  })
})
