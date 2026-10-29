import { Database, LayoutGrid } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import type { Dashboard } from '@/types'
import { areaLabel } from '../lib/labels'
import { DashboardStatusBadge } from './badges'
import { DashboardPreviewPanel } from './dashboard-preview'
import { FavoriteToggle } from './favorite-toggle'

/** Compact catalog card. The title link covers the card; inner controls sit above it. */
export function DashboardCard({
  workspaceId,
  dashboard,
  favoritePending,
  onFavorite,
}: {
  workspaceId: string
  dashboard: Dashboard
  favoritePending: boolean
  onFavorite: (next: boolean) => void
}) {
  const datasets = dashboard.datasets.map((d) => d.model_name)
  return (
    <article className="relative flex min-w-0 flex-col rounded-lg border border-border bg-background p-4 shadow-xs transition-colors focus-within:border-border-strong hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            <Link
              to={wsPath(workspaceId, 'analytics', 'dashboards', dashboard.id)}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2 focus-visible:ring-ring/20"
            >
              {dashboard.name}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{areaLabel(dashboard.business_area)}</span>
            <span aria-hidden>·</span>
            <DashboardStatusBadge status={dashboard.status} />
          </div>
        </div>
        <FavoriteToggle className="relative z-10 -mt-1 -mr-1" name={dashboard.name} isFavorite={dashboard.is_favorite} pending={favoritePending} onToggle={onFavorite} />
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{dashboard.description}</p>

      {dashboard.preview ? <DashboardPreviewPanel compact preview={dashboard.preview} className="relative z-10 mt-3 rounded-md border border-border bg-surface p-3" /> : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <LayoutGrid className="size-3" aria-hidden />
          {dashboard.cards_count} card{dashboard.cards_count === 1 ? '' : 's'}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="relative z-10 inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20">
              <Database className="size-3" aria-hidden />
              {datasets.length} dataset{datasets.length === 1 ? '' : 's'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="font-mono">{datasets.join(', ')}</TooltipContent>
        </Tooltip>
        <span className="truncate">{dashboard.owner}</span>
        <span className="relative z-10 ml-auto">
          Updated <TimeAgo value={dashboard.updated_at} />
        </span>
      </div>
    </article>
  )
}
