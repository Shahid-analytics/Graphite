import { FileChartColumn, LayoutDashboard } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { wsPath } from '@/hooks/use-workspace'
import type { Dashboard, Report } from '@/types'
import { areaLabel } from '../lib/labels'
import { FavoriteToggle } from './favorite-toggle'

export type CatalogItem = { kind: 'dashboard'; item: Dashboard } | { kind: 'report'; item: Report }

/** Favorites first, then the most recently viewed items. */
export function favoritesAndRecent(dashboards: Dashboard[], reports: Report[], limit = 10): CatalogItem[] {
  const all: CatalogItem[] = [
    ...dashboards.map((item) => ({ kind: 'dashboard' as const, item })),
    ...reports.map((item) => ({ kind: 'report' as const, item })),
  ]
  const favorites = all.filter((c) => c.item.is_favorite).sort((a, b) => a.item.name.localeCompare(b.item.name))
  const recent = all
    .filter((c) => !c.item.is_favorite && c.item.last_viewed_at)
    .sort((a, b) => (b.item.last_viewed_at ?? '').localeCompare(a.item.last_viewed_at ?? ''))
  return [...favorites, ...recent].slice(0, limit)
}

export function RecentList({
  workspaceId,
  items,
  pendingFavoriteId,
  onFavorite,
}: {
  workspaceId: string
  items: CatalogItem[]
  pendingFavoriteId: string | null
  onFavorite: (entry: CatalogItem, next: boolean) => void
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {items.map((entry) => {
        const { item, kind } = entry
        const Icon = kind === 'dashboard' ? LayoutDashboard : FileChartColumn
        const href = wsPath(workspaceId, 'analytics', kind === 'dashboard' ? 'dashboards' : 'reports', item.id)
        return (
          <li key={`${kind}-${item.id}`} className="flex items-center gap-3 px-3 py-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <Link to={href} className="block truncate rounded-sm text-sm font-medium hover:underline">
                {item.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {kind === 'dashboard' ? 'Dashboard' : 'Report'} · {areaLabel(item.business_area)}
              </p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {item.last_viewed_at ? (
                <>
                  Viewed <TimeAgo value={item.last_viewed_at} />
                </>
              ) : (
                'Not viewed yet'
              )}
            </span>
            <FavoriteToggle name={item.name} isFavorite={item.is_favorite} pending={pendingFavoriteId === item.id} onToggle={(next) => onFavorite(entry, next)} />
          </li>
        )
      })}
    </ul>
  )
}
