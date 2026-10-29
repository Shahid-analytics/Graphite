import { Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HelpTip } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { SearchInput } from '@/components/tables/data-table'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCompact } from '@/lib/format'
import { cn, pluralize } from '@/lib/utils'
import type { IngestionMode, SourceTable } from '@/types'

export interface TableChoice {
  selected: boolean
  mode: IngestionMode
  cursor: string | null
}

export const tableKey = (table: Pick<SourceTable, 'schema' | 'name'>) => `${table.schema}.${table.name}`

/** Sensible default: every table selected, incremental where a cursor exists. */
export function defaultChoice(table: SourceTable): TableChoice {
  const incremental = table.supports_incremental && table.cursor_candidates.length > 0
  return { selected: true, mode: incremental ? 'incremental' : 'full', cursor: incremental ? table.cursor_candidates[0] : null }
}

function TableRow({
  table,
  choice,
  onChange,
  disabled,
}: {
  table: SourceTable
  choice: TableChoice
  onChange: (choice: TableChoice) => void
  disabled?: boolean
}) {
  const key = tableKey(table)
  const checkboxId = `tbl-${key}`
  const canIncremental = table.supports_incremental && table.cursor_candidates.length > 0
  return (
    <li className={cn('flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center', !choice.selected && 'bg-surface/60')}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={choice.selected}
          onCheckedChange={(checked) => onChange({ ...choice, selected: checked === true })}
          disabled={disabled}
          className="mt-0.5"
        />
        <label htmlFor={checkboxId} className="min-w-0 cursor-pointer">
          <span className="block truncate font-mono text-sm">{table.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {[
              table.label && table.label !== table.name ? table.label : null,
              table.row_count_estimate !== null ? `~${formatCompact(table.row_count_estimate)} rows` : 'Row count unknown',
              pluralize(table.columns_count, 'column'),
              table.primary_key.length ? `key ${table.primary_key.join(', ')}` : 'no primary key',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 pl-7 md:w-[340px] md:shrink-0 md:pl-0">
        <Select
          value={choice.mode}
          onValueChange={(mode) =>
            onChange({ ...choice, mode: mode as IngestionMode, cursor: mode === 'incremental' ? (choice.cursor ?? table.cursor_candidates[0] ?? null) : null })
          }
          disabled={disabled || !choice.selected}
        >
          <SelectTrigger size="sm" aria-label={`Ingestion mode for ${table.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">Full refresh</SelectItem>
            <SelectItem value="incremental" disabled={!canIncremental}>
              Incremental{canIncremental ? '' : ' (not supported)'}
            </SelectItem>
          </SelectContent>
        </Select>
        {choice.mode === 'incremental' ? (
          <Select value={choice.cursor ?? ''} onValueChange={(cursor) => onChange({ ...choice, cursor })} disabled={disabled || !choice.selected}>
            <SelectTrigger size="sm" aria-label={`Cursor column for ${table.name}`} className="font-mono text-xs">
              <SelectValue placeholder="Cursor column" />
            </SelectTrigger>
            <SelectContent>
              {table.cursor_candidates.map((column) => (
                <SelectItem key={column} value={column} className="font-mono text-xs">
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex h-8 items-center text-xs text-subtle-foreground">Reloads all rows</span>
        )}
      </div>
    </li>
  )
}

/** Table checklist grouped by schema, with search, bulk selection and per-table load mode. */
export function TableSelection({
  tables,
  choices,
  onChange,
  disabled,
  error,
}: {
  tables: SourceTable[]
  choices: Record<string, TableChoice>
  onChange: (updates: Record<string, TableChoice>) => void
  disabled?: boolean
  error?: string | null
}) {
  const [search, setSearch] = useState('')
  const choiceFor = (table: SourceTable) => choices[tableKey(table)] ?? defaultChoice(table)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tables
    return tables.filter((t) => `${t.schema}.${t.name} ${t.label ?? ''}`.toLowerCase().includes(term))
  }, [tables, search])

  const groups = useMemo(() => {
    const map = new Map<string, SourceTable[]>()
    for (const table of filtered) map.set(table.schema, [...(map.get(table.schema) ?? []), table])
    return [...map.entries()]
  }, [filtered])

  const selectedCount = tables.filter((t) => choiceFor(t).selected).length
  const filteredSelected = filtered.filter((t) => choiceFor(t).selected).length

  const setSelected = (subset: SourceTable[], selected: boolean) =>
    onChange(Object.fromEntries(subset.map((t) => [tableKey(t), { ...choiceFor(t), selected }])))

  const allState = filteredSelected === 0 ? false : filteredSelected === filtered.length ? true : 'indeterminate'

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tables" />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground tabular" aria-live="polite">
            {selectedCount} of {pluralize(tables.length, 'table')} selected
          </span>
          <span className="flex items-center gap-2">
            <Checkbox
              id="tbl-select-all"
              checked={allState}
              onCheckedChange={() => setSelected(filtered, allState !== true)}
              disabled={disabled || !filtered.length}
            />
            <label htmlFor="tbl-select-all" className="cursor-pointer whitespace-nowrap">
              {search ? 'Select all matches' : 'Select all'}
            </label>
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {!filtered.length ? (
        <EmptyState compact icon={Table2} title="No tables match your search" description="Try a different table or schema name." />
      ) : (
        <div className={cn('overflow-hidden rounded-lg border', error ? 'border-danger' : 'border-border')}>
          <div className="hidden items-center gap-3 border-b border-border bg-surface px-4 py-2 text-xs font-medium text-muted-foreground md:flex">
            <span className="flex-1">Table</span>
            <span className="flex w-[340px] items-center gap-1">
              Load mode and cursor
              <HelpTip label="About load modes">
                Full refresh reloads the whole table on every sync. Incremental loads only rows whose cursor column (usually an
                updated-at timestamp) is newer than the last sync, which is faster and cheaper for large tables.
              </HelpTip>
            </span>
          </div>
          {groups.map(([schema, schemaTables]) => {
            const selectedInSchema = schemaTables.filter((t) => choiceFor(t).selected).length
            const state = selectedInSchema === 0 ? false : selectedInSchema === schemaTables.length ? true : 'indeterminate'
            const id = `schema-${schema}`
            return (
              <section key={schema} aria-labelledby={`${id}-label`} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-3 border-b border-border bg-surface/60 px-4 py-2">
                  <Checkbox id={id} checked={state} onCheckedChange={() => setSelected(schemaTables, state !== true)} disabled={disabled} />
                  <label id={`${id}-label`} htmlFor={id} className="flex flex-1 cursor-pointer items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold">{schema}</span>
                    <span className="text-muted-foreground tabular">
                      {selectedInSchema}/{schemaTables.length}
                    </span>
                  </label>
                </div>
                <ul className="divide-y divide-border">
                  {schemaTables.map((table) => (
                    <TableRow
                      key={tableKey(table)}
                      table={table}
                      choice={choiceFor(table)}
                      onChange={(choice) => onChange({ [tableKey(table)]: choice })}
                      disabled={disabled}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
