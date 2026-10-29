import { Check, ChevronsUpDown, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { LayerBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DataModel } from '@/types'

const LAYER_ORDER = ['gold', 'silver', 'bronze']
const LAYER_LABEL: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' }

/** Searchable table picker grouped by layer and schema. */
export function ModelPicker({
  models,
  selectedId,
  onSelect,
}: {
  models: DataModel[]
  selectedId: string | null
  onSelect: (model: DataModel) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = models.find((m) => m.id === selectedId) ?? null
  const groups = useMemo(() => {
    const map = new Map<string, { layer: string; schema: string; items: DataModel[] }>()
    const sorted = [...models].sort(
      (a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name),
    )
    for (const m of sorted) {
      const key = `${m.layer}:${m.schema}`
      if (!map.has(key)) map.set(key, { layer: m.layer, schema: m.schema, items: [] })
      map.get(key)!.items.push(m)
    }
    return [...map.values()]
  }, [models])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={selected ? `Table: ${selected.schema}.${selected.name}. Change table` : 'Select a table to preview'}
          className="w-full justify-between font-normal sm:w-[26rem]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Table2 className="text-muted-foreground" aria-hidden />
            {selected ? (
              <span className="truncate font-mono text-[13px]">
                {selected.schema}.{selected.name}
              </span>
            ) : (
              <span className="text-subtle-foreground">Select a table</span>
            )}
          </span>
          <ChevronsUpDown className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search by table, schema or tag" />
          <CommandList className="max-h-[22rem]">
            <CommandEmpty>No tables match.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={`${group.layer}:${group.schema}`} heading={`${LAYER_LABEL[group.layer] ?? group.layer} · ${group.schema}`}>
                {group.items.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={`${m.schema}.${m.name}`}
                    keywords={[m.layer, m.role, ...m.tags]}
                    onSelect={() => {
                      onSelect(m)
                      setOpen(false)
                    }}
                  >
                    <Check className={cn('size-3.5', m.id === selectedId ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{m.name}</span>
                    <span className="hidden text-xs text-subtle-foreground sm:inline">{m.role}</span>
                    <span className="w-14 text-right text-xs text-muted-foreground tabular">{formatCompact(m.row_count)}</span>
                    <LayerBadge layer={m.layer} className="hidden sm:inline-flex" />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
