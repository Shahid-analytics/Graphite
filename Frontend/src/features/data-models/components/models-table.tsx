import { GitCompareArrows, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { FreshnessBadge, LayerBadge } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import { formatCompact, formatDateTime, formatNumber } from '@/lib/format'
import type { DataModel } from '@/types'
import { LAYERS, ROLE_LABEL, unacknowledged } from '../lib/labels'
import { QualityIndicator } from './quality-indicator'

const COLUMNS: Column<DataModel>[] = [
  {
    id: 'name',
    header: 'Name',
    sortValue: (m) => `${m.schema}.${m.name}`,
    cell: (m) => {
      const changes = unacknowledged(m).length
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="max-w-52 truncate font-mono text-[13px] sm:max-w-none">
              <span className="text-muted-foreground">{m.schema}.</span>
              <span className="font-medium text-foreground">{m.name}</span>
            </span>
            {changes ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex text-warning" tabIndex={0} role="img" aria-label={`${changes} unacknowledged schema change${changes === 1 ? '' : 's'}`}>
                    <GitCompareArrows className="size-3.5" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{`${changes} unacknowledged schema change${changes === 1 ? '' : 's'}`}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {m.description ? <p className="mt-0.5 hidden max-w-xs truncate text-xs text-muted-foreground sm:block">{m.description}</p> : null}
        </div>
      )
    },
  },
  { id: 'layer', header: 'Layer', sortValue: (m) => LAYERS.indexOf(m.layer), cell: (m) => <LayerBadge layer={m.layer} /> },
  { id: 'role', header: 'Role', sortValue: (m) => m.role, cell: (m) => <span className="text-sm">{ROLE_LABEL[m.role]}</span>, className: 'hidden 2xl:table-cell', headerClassName: 'hidden 2xl:table-cell' },
  {
    id: 'rows',
    header: 'Rows',
    sortValue: (m) => m.row_count,
    className: 'text-right tabular',
    headerClassName: 'text-right',
    cell: (m) => <span title={formatNumber(m.row_count)}>{formatCompact(m.row_count)}</span>,
    hideOnMobile: true,
  },
  {
    id: 'freshness',
    header: 'Freshness',
    sortValue: (m) => ({ stale: 0, unknown: 1, fresh: 2 })[m.freshness_status],
    cell: (m) => (
      <div className="flex flex-col items-start gap-0.5">
        <FreshnessBadge status={m.freshness_status} />
        <TimeAgo value={m.last_refreshed_at} className="text-xs text-muted-foreground" />
      </div>
    ),
  },
  {
    id: 'quality',
    header: 'Quality',
    sortValue: (m) => -(m.quality.failed * 1000 + m.quality.warned),
    cell: (m) => <QualityIndicator quality={m.quality} />,
    hideOnMobile: true,
  },
  {
    id: 'pk',
    header: 'Primary key',
    className: 'hidden 2xl:table-cell',
    headerClassName: 'hidden 2xl:table-cell',
    cell: (m) =>
      m.primary_key.length ? (
        <span className="font-mono text-xs text-muted-foreground">{m.primary_key.join(', ')}</span>
      ) : (
        <span className="text-xs text-subtle-foreground">None</span>
      ),
  },
  {
    id: 'refreshed',
    header: 'Last refreshed',
    className: 'hidden 2xl:table-cell',
    headerClassName: 'hidden 2xl:table-cell',
    sortValue: (m) => m.last_refreshed_at,
    cell: (m) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDateTime(m.last_refreshed_at)}</span>,
  },
]

export function ModelsTable({ models, workspaceId, onClearFilters }: { models: DataModel[]; workspaceId: string; onClearFilters: () => void }) {
  const navigate = useNavigate()
  return (
    <DataTable
      columns={COLUMNS}
      rows={models}
      getRowId={(m) => m.id}
      onRowClick={(m) => navigate(wsPath(workspaceId, 'models', m.id))}
      pageSize={20}
      caption="Data models"
      className="overflow-x-auto"
      empty={
        <EmptyState
          compact
          icon={SearchX}
          title="No models match these filters"
          description="Try a different search term, layer or schema."
          action={
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      }
    />
  )
}
