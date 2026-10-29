import { Fingerprint, Hash, KeyRound, Link2, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { DataTable, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ColumnProfile } from '@/types'
import { useModelColumns } from '../../queries'

/** Columns with more nulls than this are counted as null issues. */
const NULL_ISSUE_THRESHOLD = 0.05

const KEYS: { key: 'is_primary_key' | 'is_business_key' | 'is_surrogate_key'; label: string; icon: LucideIcon; help: string }[] = [
  { key: 'is_primary_key', label: 'PK', icon: KeyRound, help: 'Primary key: uniquely identifies each row in this table.' },
  { key: 'is_business_key', label: 'BK', icon: Fingerprint, help: 'Business key: the natural identifier used by the source system, such as an invoice number.' },
  { key: 'is_surrogate_key', label: 'SK', icon: Hash, help: 'Surrogate key: a warehouse-generated identifier used to join facts to dimensions independently of source ids.' },
]

function KeyIndicators({ column }: { column: ColumnProfile }) {
  const active = KEYS.filter((k) => column[k.key])
  if (!active.length) return <span className="text-xs text-subtle-foreground">—</span>
  return (
    <span className="inline-flex gap-1">
      {active.map(({ key, label, icon: Icon, help }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <span tabIndex={0} role="img" className="inline-flex h-5 items-center gap-0.5 rounded-sm border border-border bg-surface px-1 text-[11px] font-medium text-foreground" aria-label={help}>
              <Icon className="size-3" aria-hidden />
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}

function NullBar({ fraction }: { fraction: number | null }) {
  if (fraction === null) return <span className="text-xs text-subtle-foreground">Not profiled</span>
  const pct = Math.round(fraction * 1000) / 10
  const issue = fraction > NULL_ISSUE_THRESHOLD
  return (
    <span className="inline-flex items-center gap-2">
      <span className="sr-only">{`${pct}% null${issue ? ', above the 5% threshold' : ''}`}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className={cn('block h-full rounded-full', issue ? 'bg-warning' : 'bg-muted-foreground')} style={{ width: `${Math.min(100, Math.max(fraction > 0 ? 3 : 0, pct))}%` }} />
      </span>
      <span aria-hidden className={cn('text-xs tabular', issue ? 'font-medium text-warning' : 'text-muted-foreground')}>{pct}%</span>
    </span>
  )
}

function buildColumns(workspaceId: string): Column<ColumnProfile>[] {
  return [
    {
      id: 'name',
      header: 'Column',
      sortValue: (c) => c.name,
      cell: (c) => <span className="font-mono text-[13px] font-medium">{c.name}</span>,
    },
    { id: 'type', header: 'Type', sortValue: (c) => c.data_type, cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.data_type}</span> },
    {
      id: 'nullable',
      header: 'Nullable',
      sortValue: (c) => c.nullable,
      cell: (c) => <span className={cn('text-xs', c.nullable ? 'text-muted-foreground' : 'text-foreground')}>{c.nullable ? 'Yes' : 'No'}</span>,
      hideOnMobile: true,
    },
    { id: 'keys', header: 'Keys', cell: (c) => <KeyIndicators column={c} /> },
    {
      id: 'references',
      header: 'References',
      sortValue: (c) => c.references?.model_name ?? null,
      cell: (c) =>
        c.references ? (
          <Link
            to={wsPath(workspaceId, 'models', c.references.model_id)}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-mono text-xs text-foreground underline-offset-2 hover:underline"
          >
            <Link2 className="size-3 text-muted-foreground" aria-hidden />
            {c.references.model_name}.{c.references.column}
          </Link>
        ) : (
          <span className="text-xs text-subtle-foreground">—</span>
        ),
      hideOnMobile: true,
    },
    { id: 'nulls', header: 'Nulls', sortValue: (c) => c.null_fraction, cell: (c) => <NullBar fraction={c.null_fraction} />, hideOnMobile: true },
    {
      id: 'distinct',
      header: 'Distinct',
      sortValue: (c) => c.distinct_count,
      className: 'text-right tabular text-sm',
      headerClassName: 'text-right',
      cell: (c) => formatNumber(c.distinct_count),
      hideOnMobile: true,
    },
    {
      id: 'duplicates',
      header: 'Duplicates',
      sortValue: (c) => c.duplicate_count,
      className: 'text-right tabular text-sm',
      headerClassName: 'text-right',
      cell: (c) =>
        c.duplicate_count === null ? (
          <span className="text-subtle-foreground">—</span>
        ) : (
          <span className={cn(c.duplicate_count > 0 && 'font-medium text-danger')}>{formatNumber(c.duplicate_count)}</span>
        ),
      hideOnMobile: true,
    },
    {
      id: 'description',
      header: 'Description',
      cell: (c) => <span className="block max-w-xs text-xs whitespace-normal text-muted-foreground">{c.description || '—'}</span>,
      hideOnMobile: true,
    },
  ]
}

export function ColumnsTab({ modelId, workspaceId }: { modelId: string; workspaceId: string }) {
  const query = useModelColumns(modelId)
  const [search, setSearch] = useState('')
  const columns = useMemo(() => buildColumns(workspaceId), [workspaceId])
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const data = query.data ?? []
    return needle ? data.filter((c) => c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || c.data_type.toLowerCase().includes(needle)) : data
  }, [query.data, search])

  if (query.isPending) return <TableSkeleton rows={8} columns={6} />
  if (query.isError) return <ErrorState error={query.error} title="Could not load columns" onRetry={() => query.refetch()} />
  if (!query.data.length) {
    return <EmptyState compact title="No columns profiled" description="Column metadata appears after the next successful load or dbt run profiles this table." />
  }

  return (
    <div>
      <TableToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search columns" />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:ml-auto">
          {query.data.length} columns. Null share, distinct and duplicate counts come from the latest profile.
          <HelpTip label="About column profiles">
            Profiles are computed by the backend after each load. Columns with more than 5% nulls are highlighted and counted as null issues.
          </HelpTip>
        </p>
      </TableToolbar>
      <DataTable columns={columns} rows={rows} getRowId={(c) => c.name} pageSize={50} caption="Columns" className="overflow-x-auto" />
    </div>
  )
}
