import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { DataTable, type Column } from '@/components/tables/data-table'
import { wsPath } from '@/hooks/use-workspace'
import type { Report } from '@/types'
import { areaLabel, visualizationMeta } from '../lib/labels'
import { OriginBadge, ReportStatusBadge, VisualizationLabel } from './badges'
import { DatasetLink } from './dataset-link'
import { FavoriteToggle } from './favorite-toggle'

export function ReportsTable({
  workspaceId,
  reports,
  pendingFavoriteId,
  onFavorite,
  empty,
}: {
  workspaceId: string
  reports: Report[]
  pendingFavoriteId: string | null
  onFavorite: (report: Report, next: boolean) => void
  empty: ReactNode
}) {
  const navigate = useNavigate()
  const columns: Column<Report>[] = [
    {
      id: 'favorite',
      header: <span className="sr-only">Favorite</span>,
      headerClassName: 'w-10',
      className: 'w-10 pr-0',
      cell: (r) => <FavoriteToggle name={r.name} isFavorite={r.is_favorite} pending={pendingFavoriteId === r.id} onToggle={(next) => onFavorite(r, next)} />,
    },
    {
      id: 'name',
      header: 'Name',
      sortValue: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <div className="min-w-0 max-w-[22rem]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{r.name}</span>
            <OriginBadge origin={r.origin} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{r.description || 'No description'}</p>
        </div>
      ),
    },
    { id: 'area', header: 'Area', sortValue: (r) => r.business_area, cell: (r) => areaLabel(r.business_area), hideOnMobile: true },
    {
      id: 'visualization',
      header: 'Visualization',
      sortValue: (r) => visualizationMeta(r.visualization).label,
      cell: (r) => <VisualizationLabel value={r.visualization} />,
      hideOnMobile: true,
    },
    {
      id: 'dataset',
      header: 'Dataset',
      sortValue: (r) => r.dataset.model_name,
      cell: (r) => <DatasetLink workspaceId={workspaceId} dataset={r.dataset} />,
      hideOnMobile: true,
    },
    { id: 'status', header: 'Status', sortValue: (r) => r.status, cell: (r) => <ReportStatusBadge status={r.status} /> },
    { id: 'owner', header: 'Owner', sortValue: (r) => r.owner, cell: (r) => <span className="whitespace-nowrap">{r.owner}</span>, hideOnMobile: true },
    {
      id: 'updated',
      header: 'Updated',
      sortValue: (r) => r.updated_at,
      cell: (r) => <TimeAgo value={r.updated_at} className="text-muted-foreground" />,
      hideOnMobile: true,
    },
  ]

  return (
    <DataTable
      caption="Reports"
      columns={columns}
      rows={reports}
      getRowId={(r) => r.id}
      onRowClick={(r) => navigate(wsPath(workspaceId, 'analytics', 'reports', r.id))}
      pageSize={15}
      empty={empty}
    />
  )
}
