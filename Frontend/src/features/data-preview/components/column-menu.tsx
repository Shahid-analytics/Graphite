import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PreviewColumn } from '@/types'

/** Show or hide preview columns. At least one column always stays visible. */
export function ColumnMenu({
  columns,
  hidden,
  onChange,
}: {
  columns: PreviewColumn[]
  hidden: Set<string>
  onChange: (hidden: Set<string>) => void
}) {
  const visibleCount = columns.length - hidden.size
  const toggle = (name: string, visible: boolean) => {
    const next = new Set(hidden)
    if (visible) next.delete(name)
    else next.add(name)
    onChange(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!columns.length}>
          <Columns3 aria-hidden />
          Columns
          {hidden.size ? <span className="text-xs text-muted-foreground tabular">{`${visibleCount}/${columns.length}`}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        {columns.map((c) => {
          const visible = !hidden.has(c.name)
          return (
            <DropdownMenuCheckboxItem
              key={c.name}
              checked={visible}
              disabled={visible && visibleCount === 1}
              onCheckedChange={(next) => toggle(c.name, next === true)}
              onSelect={(e) => e.preventDefault()}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{c.name}</span>
              <span className="text-xs text-subtle-foreground">{c.data_type}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!hidden.size} onSelect={() => onChange(new Set())}>
          Show all columns
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
