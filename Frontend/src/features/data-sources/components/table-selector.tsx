import { KeyRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HelpTip } from '@/components/data/display'
import { SearchInput } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatCompact, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { IngestionMode, SelectedTable, SourceTable } from '@/types'
import { CURSOR_HELP, FULL_LOAD_HELP, INCREMENTAL_HELP, PRIMARY_KEY_HELP } from '../lib/labels'

const keyOf = (t: { schema: string; name: string }) => `${t.schema}.${t.name}`

/** Default selection for a newly ticked table: incremental on the first cursor when possible. */
export function defaultSelection(table: SourceTable, incrementalSupported: boolean): SelectedTable {
  const incremental = incrementalSupported && table.supports_incremental && table.cursor_candidates.length > 0
  return {
    schema: table.schema,
    name: table.name,
    ingestion_mode: incremental ? 'incremental' : 'full',
    cursor_field: incremental ? table.cursor_candidates[0] : null,
    primary_key: table.primary_key,
  }
}

/** Discovered tables grouped by schema, with per-table ingestion mode and cursor. */
export function TableSelector({
  tables,
  value,
  onChange,
  incrementalSupported,
  error,
  disabled,
}: {
  tables: SourceTable[]
  value: SelectedTable[]
  onChange: (value: SelectedTable[]) => void
  incrementalSupported: boolean
  error?: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Map(value.map((t) => [keyOf(t), t])), [value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? tables.filter((t) => keyOf(t).toLowerCase().includes(q) || t.label?.toLowerCase().includes(q)) : tables
  }, [tables, query])
  const groups = useMemo(() => {
    const map = new Map<string, SourceTable[]>()
    filtered.forEach((t) => map.set(t.schema, [...(map.get(t.schema) ?? []), t]))
    return [...map.entries()]
  }, [filtered])

  const estimatedRows = value.reduce((sum, t) => sum + (tables.find((x) => keyOf(x) === keyOf(t))?.row_count_estimate ?? 0), 0)

  const setMany = (items: SourceTable[], checked: boolean) => {
    const keys = new Set(items.map(keyOf))
    if (checked) {
      const additions = items.filter((t) => !selected.has(keyOf(t))).map((t) => defaultSelection(t, incrementalSupported))
      onChange([...value, ...additions])
    } else {
      onChange(value.filter((t) => !keys.has(keyOf(t))))
    }
  }

  const update = (key: string, patch: Partial<SelectedTable>) => onChange(value.map((t) => (keyOf(t) === key ? { ...t, ...patch } : t)))

  const stateFor = (items: SourceTable[]) => {
    const count = items.filter((t) => selected.has(keyOf(t))).length
    return count === 0 ? false : count === items.length ? true : ('indeterminate' as const)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tables" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground tabular">{value.length}</span> of {tables.length} selected
            {value.length ? <span className="tabular"> · ~{formatCompact(estimatedRows)} rows</span> : null}
          </span>
          <label className="flex items-center gap-2">
            <Checkbox checked={stateFor(filtered)} onCheckedChange={(c) => setMany(filtered, c === true)} disabled={disabled || !filtered.length} />
            {query ? 'Select all matching' : 'Select all'}
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          Incremental <HelpTip label="What is incremental sync?">{INCREMENTAL_HELP}</HelpTip>
        </span>
        <span className="inline-flex items-center gap-1">
          Full load <HelpTip label="What is a full load?">{FULL_LOAD_HELP}</HelpTip>
        </span>
        <span className="inline-flex items-center gap-1">
          Cursor <HelpTip label="What is a cursor field?">{CURSOR_HELP}</HelpTip>
        </span>
        <span className="inline-flex items-center gap-1">
          Primary key <HelpTip label="What is the primary key used for?">{PRIMARY_KEY_HELP}</HelpTip>
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className={cn('divide-y divide-border rounded-lg border', error ? 'border-danger/40' : 'border-border')}>
        {groups.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">No tables match "{query}".</p> : null}
        {groups.map(([schema, items]) => (
          <section key={schema} aria-label={`Schema ${schema}`}>
            <div className="flex items-center justify-between gap-2 bg-surface px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={stateFor(items)} onCheckedChange={(c) => setMany(items, c === true)} disabled={disabled} aria-label={`Select all tables in ${schema}`} />
                <span className="font-mono text-[13px]">{schema}</span>
              </label>
              <span className="text-xs text-muted-foreground">
                {items.filter((t) => selected.has(keyOf(t))).length} / {items.length}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((table) => {
                const key = keyOf(table)
                const current = selected.get(key)
                const canIncremental = incrementalSupported && table.supports_incremental && table.cursor_candidates.length > 0
                const checkboxId = `tbl-${key.replace(/[^a-zA-Z0-9]/g, '-')}`
                return (
                  <li key={key} className={cn('flex flex-col gap-2 px-3 py-2.5 md:flex-row md:items-center', current && 'bg-background')}>
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <Checkbox
                        id={checkboxId}
                        className="mt-0.5"
                        checked={Boolean(current)}
                        disabled={disabled}
                        onCheckedChange={(c) => (c === true ? onChange([...value, defaultSelection(table, incrementalSupported)]) : onChange(value.filter((t) => keyOf(t) !== key)))}
                      />
                      <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
                        <span className="block truncate font-mono text-[13px] font-medium">{table.name}</span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {table.label ? <span>{table.label}</span> : null}
                          <span className="tabular">{table.row_count_estimate !== null ? `~${formatNumber(table.row_count_estimate)} rows` : 'Row count unknown'}</span>
                          <span className="tabular">{table.columns_count} columns</span>
                          <span className="inline-flex items-center gap-1">
                            <KeyRound className="size-3" aria-hidden />
                            <span className="sr-only">Primary key:</span>
                            <span className="font-mono">{table.primary_key.join(', ') || 'none'}</span>
                          </span>
                        </span>
                      </label>
                    </div>
                    {current ? (
                      <div className="flex flex-wrap items-center gap-2 pl-6.5 md:pl-0">
                        <ModeSelect
                          value={current.ingestion_mode}
                          canIncremental={canIncremental}
                          disabled={disabled}
                          tableName={key}
                          onChange={(mode) => update(key, mode === 'incremental' ? { ingestion_mode: mode, cursor_field: current.cursor_field ?? table.cursor_candidates[0] ?? null } : { ingestion_mode: mode, cursor_field: null })}
                        />
                        {current.ingestion_mode === 'incremental' ? (
                          <Select value={current.cursor_field ?? ''} onValueChange={(cursor) => update(key, { cursor_field: cursor })} disabled={disabled}>
                            <SelectTrigger size="sm" className="w-44" aria-label={`Cursor field for ${key}`}>
                              <SelectValue placeholder="Cursor field" />
                            </SelectTrigger>
                            <SelectContent>
                              {table.cursor_candidates.map((c) => (
                                <SelectItem key={c} value={c}>
                                  <span className="font-mono text-[13px]">{c}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    ) : !canIncremental ? (
                      <Badge variant="outline" className="ml-6.5 md:ml-0">
                        Full load only
                      </Badge>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function ModeSelect({
  value,
  canIncremental,
  onChange,
  disabled,
  tableName,
}: {
  value: IngestionMode
  canIncremental: boolean
  onChange: (mode: IngestionMode) => void
  disabled?: boolean
  tableName: string
}) {
  const select = (
    <Select value={value} onValueChange={(v) => onChange(v as IngestionMode)} disabled={disabled || !canIncremental}>
      <SelectTrigger size="sm" className="w-36" aria-label={`Ingestion mode for ${tableName}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="incremental">Incremental</SelectItem>
        <SelectItem value="full">Full load</SelectItem>
      </SelectContent>
    </Select>
  )
  if (canIncremental) return select
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/20">
          {select}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">This table has no reliable change column, so it is always fully reloaded.</TooltipContent>
    </Tooltip>
  )
}
