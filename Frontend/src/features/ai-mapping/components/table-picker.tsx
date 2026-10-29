import { Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { SearchInput } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Source, SourceTable } from '@/types'
import { useSourceTables } from '../queries'

export const tableKey = (t: Pick<SourceTable, 'schema' | 'name'>) => `${t.schema}.${t.name}`

/** Multi-select list of a source's discoverable tables, capped at `max`. */
export function TablePicker({
  source,
  value,
  onChange,
  max,
  invalid,
  labelledBy,
  describedBy,
}: {
  source: Source
  value: string[]
  onChange: (value: string[]) => void
  max: number
  invalid?: boolean
  labelledBy?: string
  describedBy?: string
}) {
  const query = useSourceTables(source.id)
  const [q, setQ] = useState('')
  const ingested = useMemo(() => new Set(source.selected_tables.map(tableKey)), [source])
  const tables = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = query.data ?? []
    return all
      .filter((t) => !needle || tableKey(t).toLowerCase().includes(needle) || t.label?.toLowerCase().includes(needle))
      .sort((a, b) => Number(ingested.has(tableKey(b))) - Number(ingested.has(tableKey(a))))
  }, [query.data, q, ingested])

  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-lg border border-border p-3" aria-busy="true" aria-label="Loading tables">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    )
  }
  if (query.isError) return <ErrorState error={query.error} title="Could not load tables for this source" onRetry={() => query.refetch()} compact />
  if (!query.data.length) {
    return <EmptyState icon={Table2} title="No tables discovered" description="This source has no discoverable tables. Check the connection on the source page." compact />
  }

  const full = value.length >= max
  const toggle = (key: string, checked: boolean) => onChange(checked ? [...value, key] : value.filter((v) => v !== key))
  // Prefilled selections (e.g. from "Request new suggestions") that this source no longer lists.
  const known = new Set(query.data.map(tableKey))
  const missing = value.filter((v) => !known.has(v))

  return (
    <div className={cn('rounded-lg border border-border', invalid && 'border-danger')}>
      {missing.length ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">
            {missing.length === 1 ? 'A selected table is' : `${missing.length} selected tables are`} no longer available for this source:{' '}
            <span className="font-mono break-all text-foreground">{missing.join(', ')}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(value.filter((v) => known.has(v)))}>
            Remove
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Filter tables" className="sm:w-56" />
        <p className={cn('text-xs text-muted-foreground sm:ml-auto', full && 'text-foreground')} aria-live="polite">
          {value.length} of {max} selected{full ? ' (maximum reached)' : ''}
        </p>
        {value.length ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear
          </Button>
        ) : null}
      </div>
      <ul className="scrollbar-thin max-h-80 divide-y divide-border overflow-y-auto" role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'Source tables'} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
        {tables.map((t) => {
          const key = tableKey(t)
          const checked = value.includes(key)
          const id = `table-${key.replace(/[^A-Za-z0-9]/g, '-')}`
          const disabled = !checked && full
          return (
            <li key={key} className={cn('flex items-center gap-3 px-3 py-2', checked && 'bg-surface')}>
              <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(state) => toggle(key, state === true)} />
              <label htmlFor={id} className={cn('flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5', disabled && 'cursor-not-allowed opacity-60')}>
                <span className="font-mono text-[13px]">{key}</span>
                {t.label ? <span className="text-xs text-muted-foreground">{t.label}</span> : null}
                <span className="text-xs text-subtle-foreground tabular">
                  {formatCompact(t.row_count_estimate)} rows, {t.columns_count} columns
                </span>
              </label>
              {ingested.has(key) ? (
                <Badge variant="outline" title="Loaded into Bronze by this source; suggestions use its profiled columns.">
                  In Bronze
                </Badge>
              ) : (
                <Badge variant="default" title="Not ingested yet; suggestions are based on discovered metadata only.">
                  Not ingested
                </Badge>
              )}
            </li>
          )
        })}
        {!tables.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No tables match the filter.</li> : null}
      </ul>
    </div>
  )
}
