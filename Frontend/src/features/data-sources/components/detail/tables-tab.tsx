import { Pencil, Table2 } from 'lucide-react'
import { useState } from 'react'
import { HelpTip } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePermission } from '@/hooks/use-workspace'
import { formatNumber } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import type { ConnectorDefinition, SelectedTable, Source, SourceTable } from '@/types'
import { CURSOR_HELP, INCREMENTAL_HELP, PRIMARY_KEY_HELP } from '../../lib/labels'
import { useSourceTables, useUpdateSource } from '../../queries'
import { GatedButton, permissionReason } from '../primitives'
import { TableSelector } from '../table-selector'

function EditTablesDialog({
  source,
  connector,
  tables,
  open,
  onOpenChange,
}: {
  source: Source
  connector?: ConnectorDefinition
  tables: SourceTable[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<SelectedTable[]>(source.selected_tables)
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateSource()

  const save = () => {
    if (!value.length) return setError('Select at least one table to replicate.')
    const missing = value.find((t) => t.ingestion_mode === 'incremental' && !t.cursor_field)
    if (missing) return setError(`Choose a cursor field for ${missing.schema}.${missing.name}.`)
    setError(null)
    update.mutate(
      { sourceId: source.id, payload: { selected_tables: value } },
      {
        onSuccess: (updated) => {
          toastSuccess('Table selection saved', `${updated.selected_tables.length} tables will be synced from the next run.`)
          onOpenChange(false)
        },
        onError: (e) => {
          if (isApiError(e) && e.fieldErrors.length) setError(e.fieldErrors.map((f) => f.message).join(' '))
          toastError(e, 'Could not save the table selection')
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit table selection</DialogTitle>
          <DialogDescription>
            Newly added tables are fully loaded on their next sync. Removed tables stop syncing; their Bronze copies are kept.
          </DialogDescription>
        </DialogHeader>
        <TableSelector tables={tables} value={value} onChange={setValue} incrementalSupported={connector?.supports_incremental ?? false} error={error ?? undefined} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Save selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TablesTab({ source, connector }: { source: Source; connector?: ConnectorDefinition }) {
  const canWrite = usePermission('sources:write')
  const discovered = useSourceTables(source.id)
  const [editing, setEditing] = useState(false)

  const estimate = (t: SelectedTable) => discovered.data?.find((d) => d.schema === t.schema && d.name === t.name)?.row_count_estimate ?? null

  const columns: Column<SelectedTable>[] = [
    {
      id: 'table',
      header: 'Table',
      sortValue: (t) => `${t.schema}.${t.name}`,
      cell: (t) => (
        <span className="font-mono text-[13px]">
          <span className="text-muted-foreground">{t.schema}.</span>
          {t.name}
        </span>
      ),
    },
    {
      id: 'mode',
      header: 'Mode',
      headerHelp: <HelpTip label="About ingestion modes">{INCREMENTAL_HELP}</HelpTip>,
      sortValue: (t) => t.ingestion_mode,
      cell: (t) => <Badge variant={t.ingestion_mode === 'incremental' ? 'default' : 'outline'}>{t.ingestion_mode === 'incremental' ? 'Incremental' : 'Full load'}</Badge>,
    },
    {
      id: 'cursor',
      header: (
        <span className="inline-flex items-center gap-1">
          Cursor <HelpTip label="What is a cursor field?">{CURSOR_HELP}</HelpTip>
        </span>
      ),
      cell: (t) => (t.cursor_field ? <span className="font-mono text-[13px]">{t.cursor_field}</span> : <span className="text-subtle-foreground">—</span>),
    },
    {
      id: 'pk',
      header: (
        <span className="inline-flex items-center gap-1">
          Primary key <HelpTip label="What is the primary key used for?">{PRIMARY_KEY_HELP}</HelpTip>
        </span>
      ),
      hideOnMobile: true,
      cell: (t) => <span className="font-mono text-[13px]">{t.primary_key.join(', ') || '—'}</span>,
    },
    {
      id: 'rows',
      header: 'Est. rows',
      hideOnMobile: true,
      className: 'text-right tabular',
      headerClassName: 'text-right',
      sortValue: (t) => estimate(t) ?? -1,
      cell: (t) => formatNumber(estimate(t)),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {source.selected_tables.length} of {discovered.data?.length ?? '…'} discovered tables are replicated into <span className="font-mono">{source.destination_schema}</span>.
        </p>
        <GatedButton variant="outline" size="sm" reason={!canWrite ? permissionReason('sources:write') : discovered.data ? null : discovered.error ? 'Discovered tables could not be loaded. Use Try again below.' : 'Loading discovered tables…'} onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit selection
        </GatedButton>
      </div>
      {discovered.error ? (
        <Notice tone="warning" title="Could not load discovered tables">
          {errorMessage(discovered.error)} Row estimates are unavailable.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void discovered.refetch()}>
            Try again
          </button>
        </Notice>
      ) : null}
      <DataTable
        columns={columns}
        rows={source.selected_tables}
        getRowId={(t) => `${t.schema}.${t.name}`}
        caption="Selected tables"
        empty={<EmptyState compact icon={Table2} title="No tables selected" description="Choose at least one table so syncs have something to load." />}
      />
      {discovered.data && editing ? (
        <EditTablesDialog source={source} connector={connector} tables={discovered.data} open={editing} onOpenChange={setEditing} />
      ) : null}
    </div>
  )
}
