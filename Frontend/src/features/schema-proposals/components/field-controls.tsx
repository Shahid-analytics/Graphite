import { KeyRound, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DATA_TYPE_OPTIONS, LENGTH_TYPES } from '../lib/labels'
import type { ModelOption } from '../lib/form'
import { useModelColumns } from '../queries'
import { useBuilder } from './builder-context'

const CUSTOM_PREFIX = 'custom:'

function parseType(value: string) {
  const sized = /^(varchar|char)\((\d+)\)$/.exec(value)
  if (sized) return { family: sized[1], length: sized[2] }
  if (!value) return { family: '', length: '' }
  if (DATA_TYPE_OPTIONS.some((o) => o.value === value)) return { family: value, length: '' }
  return { family: `${CUSTOM_PREFIX}${value}`, length: '' }
}

/** Data type picker: a type family plus a length for varchar(n) and char(n). */
export function DataTypeSelect({
  id,
  value,
  onChange,
  invalid,
  label = 'Data type',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  label?: string
}) {
  const { family, length } = parseType(value)
  const sized = (LENGTH_TYPES as readonly string[]).includes(family)
  const setFamily = (next: string) => {
    if (next.startsWith(CUSTOM_PREFIX)) return onChange(next.slice(CUSTOM_PREFIX.length))
    const option = DATA_TYPE_OPTIONS.find((o) => o.value === next)
    onChange(option && 'length' in option ? `${next}(${length || option.length})` : next)
  }
  return (
    <div className="flex min-w-0 gap-1.5">
      <Select value={family} onValueChange={setFamily}>
        <SelectTrigger id={id} size="sm" aria-label={label} aria-invalid={invalid || undefined} className="min-w-0 flex-1 font-mono text-[13px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          {DATA_TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono text-[13px]">
              {o.label}
            </SelectItem>
          ))}
          {family.startsWith(CUSTOM_PREFIX) ? (
            <SelectItem value={family} className="font-mono text-[13px]">
              {family.slice(CUSTOM_PREFIX.length)}
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
      {sized ? (
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={family === 'char' ? 255 : 10000}
          value={length}
          onChange={(e) => onChange(`${family}(${e.target.value.replace(/\D/g, '') || 1})`)}
          aria-label={`${label} length`}
          className="h-8 w-[4.5rem] shrink-0 font-mono text-[13px]"
        />
      ) : null}
    </div>
  )
}

/** Model picker grouped into tables created by this proposal, Gold models and Silver models. */
export function ModelSelect({
  id,
  value,
  onChange,
  invalid,
  placeholder = 'Choose a model',
  filter,
  label,
}: {
  id?: string
  value: string
  onChange: (option: ModelOption) => void
  invalid?: boolean
  placeholder?: string
  filter?: (option: ModelOption) => boolean
  label?: string
}) {
  const { options, catalogLoading } = useBuilder()
  const visible = filter ? options.filter(filter) : options
  const groups = [
    { label: 'Created in this proposal', items: visible.filter((o) => !o.modelId) },
    { label: 'Gold', items: visible.filter((o) => o.modelId && o.layer === 'gold') },
    { label: 'Silver', items: visible.filter((o) => o.modelId && o.layer === 'silver') },
  ].filter((g) => g.items.length)
  const known = options.some((o) => o.value === value)
  return (
    <Select value={value} onValueChange={(next) => {
      const option = options.find((o) => o.value === next)
      if (option) onChange(option)
    }}>
      <SelectTrigger id={id} aria-label={label} aria-invalid={invalid || undefined} className="font-mono text-[13px]">
        <SelectValue placeholder={catalogLoading ? 'Loading models...' : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {value && !known ? (
          <SelectItem value={value} disabled>
            {value.split(':')[1] ?? value} (not found)
          </SelectItem>
        ) : null}
        {groups.map((group, i) => (
          <SelectGroup key={group.label}>
            {i > 0 ? <SelectSeparator /> : null}
            <SelectLabel>{group.label}</SelectLabel>
            {group.items.map((o) => (
              <SelectItem key={o.value} value={o.value} className="font-mono text-[13px]">
                {o.schema}.{o.name}
                {o.role === 'fact' || o.role === 'dimension' ? <span className="font-sans text-xs text-subtle-foreground">{o.role}</span> : null}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {!groups.length && !catalogLoading ? <p className="px-2 py-3 text-sm text-muted-foreground">No matching models.</p> : null}
      </SelectContent>
    </Select>
  )
}

export interface OptionColumn {
  name: string
  data_type: string
  is_key: boolean
}

/** Columns of a model option: inline for proposed tables, fetched for catalog models. */
export function useOptionColumns(option: ModelOption | null) {
  const query = useModelColumns(option?.modelId)
  if (!option) return { columns: [] as OptionColumn[], loading: false, error: null as unknown, retry: () => {} }
  if (option.columns) return { columns: option.columns, loading: false, error: null as unknown, retry: () => {} }
  return {
    columns: (query.data ?? []).map((c) => ({ name: c.name, data_type: c.data_type, is_key: c.is_primary_key || c.is_surrogate_key })),
    loading: query.isLoading,
    error: query.error as unknown,
    retry: () => void query.refetch(),
  }
}

export function ColumnSelect({
  id,
  option,
  value,
  onChange,
  invalid,
  label,
  placeholder = 'Choose a column',
}: {
  id?: string
  option: ModelOption | null
  value: string
  onChange: (column: OptionColumn) => void
  invalid?: boolean
  label?: string
  placeholder?: string
}) {
  const { columns, loading, error, retry } = useOptionColumns(option)
  if (error) return <ColumnsError onRetry={retry} />
  const known = columns.some((c) => c.name === value)
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const column = columns.find((c) => c.name === next)
        if (column) onChange(column)
      }}
      disabled={!option || loading}
    >
      <SelectTrigger id={id} aria-label={label} aria-invalid={invalid || undefined} className="font-mono text-[13px]">
        <SelectValue placeholder={!option ? 'Choose a model first' : loading ? 'Loading columns...' : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {value && !known && !loading ? (
          <SelectItem value={value} disabled>
            {value} (not found)
          </SelectItem>
        ) : null}
        {columns.map((c) => (
          <SelectItem key={c.name} value={c.name} className="font-mono text-[13px]">
            {c.is_key ? <KeyRound className="size-3" aria-label="Key column" /> : null}
            {c.name}
            <span className="text-xs text-subtle-foreground">{c.data_type}</span>
          </SelectItem>
        ))}
        {!columns.length && option ? <p className="px-2 py-3 text-sm text-muted-foreground">This model has no columns yet.</p> : null}
      </SelectContent>
    </Select>
  )
}

/** Multi-select of a model's columns as a checkbox list (surrogate key sources). */
export function ColumnChecklist({
  id,
  option,
  value,
  onChange,
  invalid,
  exclude,
}: {
  id?: string
  option: ModelOption | null
  value: string[]
  onChange: (value: string[]) => void
  invalid?: boolean
  exclude?: string
}) {
  const { columns, loading, error, retry } = useOptionColumns(option)
  if (!option) return <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Choose the target model first.</p>
  if (error) return <ColumnsError onRetry={retry} />
  if (loading) {
    return (
      <div className="space-y-2 rounded-md border border-border p-3" aria-busy="true">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
    )
  }
  const choices = columns.filter((c) => c.name !== exclude)
  const missing = value.filter((v) => !columns.some((c) => c.name === v))
  return (
    <div
      id={id}
      role="group"
      aria-invalid={invalid || undefined}
      className={cn('scrollbar-thin max-h-52 overflow-y-auto rounded-md border border-input p-1', invalid && 'border-danger')}
    >
      {choices.map((c) => {
        const checked = value.includes(c.name)
        const inputId = `${id}-${c.name}`
        return (
          <label key={c.name} htmlFor={inputId} className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 hover:bg-surface">
            <Checkbox
              id={inputId}
              checked={checked}
              onCheckedChange={(next) => onChange(next ? [...value, c.name] : value.filter((v) => v !== c.name))}
            />
            <span className="font-mono text-[13px]">{c.name}</span>
            <span className="text-xs text-subtle-foreground">{c.data_type}</span>
            {c.is_key ? <Badge variant="outline" className="ml-auto">key</Badge> : null}
          </label>
        )
      })}
      {missing.map((name) => (
        <p key={name} className="px-2 py-1.5 font-mono text-[13px] text-danger">
          {name} (not found on this model)
        </p>
      ))}
      {!choices.length ? <p className="px-2 py-3 text-sm text-muted-foreground">This model has no other columns.</p> : null}
    </div>
  )
}

function ColumnsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 text-xs">
      <span>Could not load columns.</span>
      <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onRetry}>
        <RotateCw className="size-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  )
}
