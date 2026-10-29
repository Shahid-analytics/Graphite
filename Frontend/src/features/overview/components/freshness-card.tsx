import { Timer } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { FreshnessBadge, LayerBadge } from '@/components/status/status-badge'
import { wsPath } from '@/hooks/use-workspace'
import type { Overview } from '@/types'
import { formatSla } from './labels'
import { CardLink, CtaLink, MetaDot, OverviewCard, PanelList, PanelRow, RowLink } from './overview-card'

export function FreshnessCard({ freshness, workspaceId, className }: { freshness: Overview['freshness']; workspaceId: string; className?: string }) {
  const { items, stale } = freshness
  return (
    <OverviewCard
      title="Data freshness"
      help="A model is stale when its last successful refresh is older than its freshness SLA. Only Bronze and Gold models with an SLA are listed."
      description={
        items.length
          ? stale
            ? `${stale} ${stale === 1 ? 'model is' : 'models are'} stale across all layers. Stale Bronze and Gold models are listed first.`
            : 'All models with an SLA are within it.'
          : undefined
      }
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'models')}>Data models</CardLink>}
    >
      {items.length ? (
        <PanelList label="Model freshness">
          {items.map((item) => (
            <PanelRow
              key={item.model_id}
              title={
                <RowLink to={wsPath(workspaceId, 'models', item.model_id)} className="block truncate font-mono text-[13px]">
                  {item.name}
                </RowLink>
              }
              meta={
                <>
                  <LayerBadge layer={item.layer} className="h-4 px-1 text-[10px]" />
                  <span>
                    Refreshed <TimeAgo value={item.last_refreshed_at} />
                  </span>
                  <MetaDot />
                  {formatSla(item.sla_minutes)}
                </>
              }
              trailing={<FreshnessBadge status={item.status} />}
            />
          ))}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={Timer}
          title="No freshness SLAs to track"
          description="Freshness is tracked once ingestion creates Bronze tables and dbt builds Gold models with an SLA."
          action={<CtaLink to={wsPath(workspaceId, 'models')}>Browse data models</CtaLink>}
        />
      )}
    </OverviewCard>
  )
}
