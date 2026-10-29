import { DataTable, type Column } from '@/components/tables/data-table'
import { RunStatusBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/format'
import type { TableSyncResult } from '@/types'

const columns: Column<TableSyncResult>[] = [
  { id: 'table', header: 'Table', cell: (t) => <span className="font-mono text-[13px]">{t.table}</span>, sortValue: (t) => t.table },
  {
    id: 'mode',
    header: 'Mode',
    cell: (t) => <Badge variant="outline">{t.mode === 'full' ? 'Full' : 'Incremental'}</Badge>,
    sortValue: (t) => t.mode,
    hideOnMobile: true,
  },
  { id: 'status', header: 'Status', cell: (t) => <RunStatusBadge status={t.status} />, sortValue: (t) => t.status },
  {
    id: 'records',
    header: 'Records',
    cell: (t) => <span className="tabular">{formatNumber(t.records)}</span>,
    sortValue: (t) => t.records,
    className: 'text-right',
    headerClassName: 'text-right',
  },
  {
    id: 'error',
    header: 'Error',
    cell: (t) => (t.error ? <span className="text-danger">{t.error}</span> : <span className="text-subtle-foreground">—</span>),
    hideOnMobile: true,
  },
]

/** Per-table ingestion results of a sync or pipeline run. */
export function TableResults({ tables }: { tables: TableSyncResult[] }) {
  return <DataTable columns={columns} rows={tables} getRowId={(t) => t.table} pageSize={20} caption="Ingestion results per table" />
}
