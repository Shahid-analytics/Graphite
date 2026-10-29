import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface Column<T> {
  id: string
  header: ReactNode
  /** Interactive help (such as a HelpTip) shown beside the header, outside the sort button. */
  headerHelp?: ReactNode
  cell: (row: T) => ReactNode
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number | boolean | null | undefined
  className?: string
  headerClassName?: string
  /** Hide below the md breakpoint to keep tables readable on phones. */
  hideOnMobile?: boolean
}

type SortState = { id: string; desc: boolean } | null

/**
 * Client-side table with sorting and pagination. For server-paginated data pass
 * `pagination` and leave `pageSize` unset.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  pageSize = 15,
  initialSort = null,
  empty,
  pagination,
  className,
  rowClassName,
  caption,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  pageSize?: number
  initialSort?: SortState
  empty?: ReactNode
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }
  className?: string
  rowClassName?: (row: T) => string | undefined
  caption?: string
}) {
  const [sort, setSort] = useState<SortState>(initialSort)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.id === sort.id)
    if (!column?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a)
      const bv = column.sortValue!(b)
      if (av === bv) return 0
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const result = av > bv ? 1 : -1
      return sort.desc ? -result : result
    })
  }, [rows, sort, columns])

  const serverPaged = Boolean(pagination)
  const totalPages = serverPaged ? Math.max(1, Math.ceil(pagination!.total / pagination!.pageSize)) : Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = serverPaged ? pagination!.page : Math.min(page, totalPages)
  const visible = serverPaged ? sorted : sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const total = serverPaged ? pagination!.total : sorted.length
  const effectiveSize = serverPaged ? pagination!.pageSize : pageSize

  const goTo = (next: number) => (serverPaged ? pagination!.onPageChange(next) : setPage(next))

  const toggleSort = (id: string) => {
    setSort((prev) => (prev?.id !== id ? { id, desc: false } : prev.desc ? null : { id, desc: true }))
    setPage(1)
  }

  if (!rows.length && empty) return <>{empty}</>

  return (
    <div className={cn('rounded-lg border border-border bg-background', className)}>
      <Table containerClassName="rounded-t-lg">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const active = sort?.id === column.id
              return (
                <TableHead
                  key={column.id}
                  className={cn(column.headerClassName, column.hideOnMobile && 'hidden md:table-cell')}
                  aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase hover:text-foreground"
                      >
                        {column.header}
                        {active ? (
                          sort!.desc ? <ArrowDown className="size-3" aria-hidden /> : <ArrowUp className="size-3" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                    {column.headerHelp}
                  </span>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length ? (
            visible.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row)
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn(column.className, column.hideOnMobile && 'hidden md:table-cell')}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                No results match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {total > effectiveSize ? (
        <Pagination page={currentPage} totalPages={totalPages} total={total} pageSize={effectiveSize} onPageChange={goTo} />
      ) : null}
    </div>
  )
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-1 tabular">
          Page {page} of {totalPages}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/** Toolbar row for search and filters above tables. */
export function TableToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>{children}</div>
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8" />
    </div>
  )
}

/** Select used as a table filter. The value "all" means no filter. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  label: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-full sm:w-44', className)} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{`All ${label.toLowerCase()}`}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
