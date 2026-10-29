import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PreviewColumn } from '@/types'
import { cellText, isIdentifier, isNumericType } from '../lib/cells'

export interface SortState {
  column: string
  order: 'asc' | 'desc'
}

function Cell({ value, column }: { value: unknown; column: PreviewColumn }) {
  const text = cellText(value)
  if (text === null) return <span className="font-mono text-[12px] text-subtle-foreground italic">null</span>
  const numeric = typeof value === 'number' || isNumericType(column.data_type)
  const mono = numeric || typeof value === 'boolean' || isIdentifier(column.name) || /^(date|timestamp)/i.test(column.data_type)
  return (
    <span title={text.length > 40 ? text : undefined} className={cn('block max-w-[22rem] truncate', mono && 'font-mono text-[12.5px]', numeric && 'tabular')}>
      {text}
    </span>
  )
}

/** Wide, scrollable grid of sample rows with a sticky header and server-side sort. */
export function PreviewGrid({
  columns,
  rows,
  sort,
  onSort,
  rowOffset,
  busy,
  label,
}: {
  columns: PreviewColumn[]
  rows: Record<string, unknown>[]
  sort: SortState | null
  onSort: (column: string) => void
  rowOffset: number
  busy: boolean
  label: string
}) {
  return (
    <div
      role="region"
      aria-label={label}
      aria-busy={busy || undefined}
      tabIndex={0}
      className={cn(
        'scrollbar-thin relative max-h-[min(70vh,44rem)] overflow-auto rounded-lg border border-border bg-background focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none',
        busy && 'opacity-70 transition-opacity',
      )}
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 left-0 z-20 h-9 w-12 border-r border-b border-border bg-surface px-3 text-right text-xs font-medium text-subtle-foreground">
              <span className="sr-only">Row number</span>#
            </th>
            {columns.map((c) => {
              const active = sort?.column === c.name
              const numeric = isNumericType(c.data_type)
              return (
                <th
                  key={c.name}
                  scope="col"
                  aria-sort={active ? (sort!.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('sticky top-0 z-10 h-9 border-b border-border bg-surface px-3 text-left align-middle font-medium whitespace-nowrap', numeric && 'text-right')}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.name)}
                    className={cn('-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none', numeric && 'flex-row-reverse')}
                    title={`Sort by ${c.name}`}
                  >
                    <span className="font-mono text-[12.5px] text-foreground">{c.name}</span>
                    <span className="text-[11px] font-normal text-subtle-foreground">{c.data_type}</span>
                    {active ? (
                      sort!.order === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowOffset + i} className="group">
              <td className="sticky left-0 z-[1] border-r border-b border-border bg-background px-3 py-2 text-right font-mono text-[11.5px] text-subtle-foreground tabular group-hover:bg-surface">
                {rowOffset + i + 1}
              </td>
              {columns.map((c) => (
                <td key={c.name} className={cn('border-b border-border px-3 py-2 whitespace-nowrap group-hover:bg-surface', isNumericType(c.data_type) && 'text-right')}>
                  <Cell value={row[c.name]} column={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
