import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useState } from 'react'
import { FilterSelect, SearchInput } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { AuditFacets } from '@/types'
import { AUDIT_STATUSES, QUICK_RANGES, type AuditFilters, type QuickRange } from '../lib/filters'
import { actorMeta, groupActions, resourceTypeLabel } from '../lib/labels'

/** Search box that keeps a local draft and commits to the URL after typing pauses. */
function DebouncedSearch({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setDraft(value)
  }

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onCommit(draft), 300)
    return () => clearTimeout(timer)
  }, [draft, value, onCommit])

  return <SearchInput value={draft} onChange={setDraft} placeholder="Search action, resource, actor or run id" className="sm:w-72" />
}

function ActionSelect({ value, actions, disabled, onChange }: { value: string; actions: string[]; disabled: boolean; onChange: (value: string) => void }) {
  const groups = groupActions(actions)
  return (
    <Select value={value || 'all'} onValueChange={(next) => onChange(next === 'all' ? '' : next)} disabled={disabled}>
      <SelectTrigger className="w-full sm:w-52" aria-label="Action">
        <SelectValue placeholder="Action" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="all">All actions</SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.prefix}>
            <SelectSeparator />
            <SelectLabel className="font-mono text-[11px]">{group.prefix}</SelectLabel>
            {group.prefix.endsWith('.') && group.items.length > 1 ? (
              <SelectItem value={group.prefix}>
                <span className="font-mono text-xs">{group.prefix}*</span>
                <span className="text-xs text-muted-foreground">all</span>
              </SelectItem>
            ) : null}
            {group.items.map((action) => (
              <SelectItem key={action} value={action}>
                <span className="font-mono text-xs">{action}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AuditFilterBar({
  filters,
  facets,
  facetsLoading,
  facetsError,
  onRetryFacets,
  rangeError,
  activeCount,
  onChange,
  onClear,
}: {
  filters: AuditFilters
  facets: AuditFacets | undefined
  facetsLoading: boolean
  facetsError: boolean
  onRetryFacets: () => void
  rangeError: string | null
  activeCount: number
  onChange: (patch: Partial<AuditFilters>) => void
  onClear: () => void
}) {
  const fromId = useId()
  const toId = useId()
  const rangeErrorId = useId()
  const commitSearch = useCallback((q: string) => onChange({ q }), [onChange])

  // Keep a selected value listed even if facets have not loaded or no longer include it.
  const actorOptions = (facets?.actors ?? []).map((actor) => ({ value: actor.id, label: `${actor.name} (${actorMeta(actor.type).label.toLowerCase()})` }))
  if (filters.actor && !actorOptions.some((o) => o.value === filters.actor)) actorOptions.push({ value: filters.actor, label: filters.actor })
  const typeOptions = (facets?.resource_types ?? []).map((type) => ({ value: type, label: resourceTypeLabel(type) }))
  if (filters.type && !typeOptions.some((o) => o.value === filters.type)) typeOptions.push({ value: filters.type, label: resourceTypeLabel(filters.type) })
  const actions = facets?.actions ?? []
  const actionList = filters.action && !actions.includes(filters.action) && !filters.action.endsWith('.') ? [...actions, filters.action] : actions

  return (
    <div className="mb-4 space-y-2 rounded-lg border border-border bg-surface p-3" role="search" aria-label="Filter audit events">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <DebouncedSearch value={filters.q} onCommit={commitSearch} />
        <FilterSelect
          label="Actors"
          value={filters.actor || 'all'}
          onChange={(value) => onChange({ actor: value === 'all' ? '' : value })}
          options={actorOptions}
        />
        <FilterSelect
          label="Resource types"
          value={filters.type || 'all'}
          onChange={(value) => onChange({ type: value === 'all' ? '' : value })}
          options={typeOptions}
        />
        <ActionSelect value={filters.action} actions={actionList} disabled={facetsLoading} onChange={(action) => onChange({ action })} />
        <FilterSelect
          label="Statuses"
          value={filters.status || 'all'}
          onChange={(value) => onChange({ status: value === 'all' ? '' : value })}
          options={AUDIT_STATUSES}
          className="sm:w-36"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ToggleGroup
          type="single"
          size="sm"
          value={filters.range}
          onValueChange={(value) => onChange({ range: value as QuickRange | '', from: '', to: '' })}
          aria-label="Quick time range"
        >
          {QUICK_RANGES.map((range) => (
            <ToggleGroupItem key={range.value} value={range.value} aria-label={range.description} title={range.description}>
              {range.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:items-center">
          <div className="flex items-center gap-2">
            <label htmlFor={fromId} className="w-9 shrink-0 text-xs text-muted-foreground sm:w-auto">
              From
            </label>
            <Input
              id={fromId}
              type="date"
              value={filters.from}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? rangeErrorId : undefined}
              max={filters.to || undefined}
              onChange={(e) => onChange({ from: e.target.value, range: '' })}
              className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={toId} className="w-9 shrink-0 text-xs text-muted-foreground sm:w-auto">
              To
            </label>
            <Input
              id={toId}
              type="date"
              value={filters.to}
              aria-invalid={rangeError ? true : undefined}
              aria-describedby={rangeError ? rangeErrorId : undefined}
              min={filters.from || undefined}
              onChange={(e) => onChange({ to: e.target.value, range: '' })}
              className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none"
            />
          </div>
        </div>
        {rangeError ? (
          <p id={rangeErrorId} role="alert" className="text-xs text-danger">
            {rangeError}
          </p>
        ) : null}
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {activeCount ? `${activeCount} filter${activeCount === 1 ? '' : 's'} active` : 'No filters'}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!activeCount}>
            <X aria-hidden />
            Clear filters
          </Button>
        </div>
      </div>
      {facetsError ? (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" role="status">
          The actor, resource type and action lists could not be loaded.
          <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onRetryFacets}>
            Retry
          </Button>
        </p>
      ) : null}
    </div>
  )
}
