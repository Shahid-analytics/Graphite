import { Activity, Boxes, Clock, Database, ShieldCheck, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { StatTile, TimeAgo } from '@/components/data/display'
import { wsPath } from '@/hooks/use-workspace'
import { formatNumber, formatPercent } from '@/lib/format'
import type { Overview } from '@/types'

function Dot() {
  return (
    <span aria-hidden className="text-subtle-foreground">
      {' · '}
    </span>
  )
}

/** Wraps a tile in a link so the whole tile navigates to the related area. */
function TileLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link to={to} aria-label={label} className="block h-full rounded-lg [&>div]:h-full [&>div]:transition-colors hover:[&>div]:border-border-strong">
      {children}
    </Link>
  )
}

export function OverviewStats({ data, workspaceId }: { data: Overview; workspaceId: string }) {
  const { sources, runs_24h: runs, freshness, models, quality } = data
  const executedChecks = quality.passed + quality.failed + quality.warning
  const withSla = freshness.fresh + freshness.stale

  const sourceTone = sources.unhealthy > 0 ? 'danger' : sources.degraded > 0 ? 'warning' : undefined
  const sourceHint = sources.total ? (
    <>
      {sources.healthy} healthy
      {sources.degraded ? (
        <>
          <Dot />
          <span className="text-warning">{sources.degraded} degraded</span>
        </>
      ) : null}
      {sources.unhealthy ? (
        <>
          <Dot />
          <span className="text-danger">{sources.unhealthy} unhealthy</span>
        </>
      ) : null}
      {sources.paused ? (
        <>
          <Dot />
          {sources.paused} paused
        </>
      ) : null}
    </>
  ) : (
    'No sources connected yet'
  )

  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6" role="list" aria-label="Key metrics">
      <div role="listitem">
        <TileLink to={wsPath(workspaceId, 'sources')} label={`Source connections: ${sources.total}. Open data sources`}>
          <StatTile label="Source connections" icon={<Database className="size-3.5" />} value={formatNumber(sources.total)} tone={sourceTone} hint={sourceHint} />
        </TileLink>
      </div>
      <div role="listitem">
        <TileLink to={wsPath(workspaceId, 'pipelines')} label={`Runs in the last 24 hours: ${runs.total}, ${runs.failed} failed. Open pipelines`}>
          <StatTile
            label="Runs in last 24h"
            icon={<Activity className="size-3.5" />}
            value={formatNumber(runs.total)}
            hint={
              runs.total ? (
                <>
                  <span className={runs.failed ? 'font-medium text-danger' : undefined}>{runs.failed} failed</span>
                  <Dot />
                  {runs.succeeded} succeeded
                  {runs.running ? (
                    <>
                      <Dot />
                      <span className="text-running">{runs.running} active</span>
                    </>
                  ) : null}
                </>
              ) : (
                'No runs in the last 24 hours'
              )
            }
          />
        </TileLink>
      </div>
      <div role="listitem">
        <StatTile
          label="Last successful sync"
          icon={<Clock className="size-3.5" />}
          value={data.last_successful_sync_at ? <TimeAgo value={data.last_successful_sync_at} className="text-xl" /> : <span className="text-subtle-foreground">Never</span>}
          hint={data.last_successful_sync_at ? 'Most recent across all sources' : 'Set by the first successful ingestion'}
          className="h-full"
        />
      </div>
      <div role="listitem">
        <TileLink to={wsPath(workspaceId, 'models')} label={`Data freshness: ${freshness.fresh} fresh, ${freshness.stale} stale. Open data models`}>
          <StatTile
            label="Data freshness"
            icon={<Timer className="size-3.5" />}
            value={
              withSla ? (
                <>
                  {freshness.fresh}
                  <span className="text-base font-normal text-muted-foreground"> / {withSla} fresh</span>
                </>
              ) : (
                <span className="text-subtle-foreground">—</span>
              )
            }
            tone={freshness.stale ? 'warning' : undefined}
            hint={
              withSla ? (
                <>
                  <span className={freshness.stale ? 'font-medium text-warning' : undefined}>{freshness.stale} stale</span>
                  {freshness.unknown ? (
                    <>
                      <Dot />
                      {freshness.unknown} without SLA
                    </>
                  ) : null}
                </>
              ) : (
                'No models with a freshness SLA'
              )
            }
          />
        </TileLink>
      </div>
      <div role="listitem">
        <TileLink to={wsPath(workspaceId, 'models')} label={`Models: ${models.total}. Open data models`}>
          <StatTile
            label="Models"
            icon={<Boxes className="size-3.5" />}
            value={formatNumber(models.total)}
            hint={
              models.total ? (
                <>
                  {models.bronze} bronze
                  <Dot />
                  {models.silver} silver
                  <Dot />
                  {models.gold} gold
                </>
              ) : (
                'Created by ingestion and dbt'
              )
            }
          />
        </TileLink>
      </div>
      <div role="listitem">
        <StatTile
          label="Data quality pass rate"
          icon={<ShieldCheck className="size-3.5" />}
          value={executedChecks ? formatPercent(quality.pass_rate) : <span className="text-subtle-foreground">—</span>}
          tone={quality.failed ? 'danger' : quality.warning ? 'warning' : undefined}
          hint={
            executedChecks ? (
              <>
                <span className={quality.failed ? 'font-medium text-danger' : undefined}>{quality.failed} failed</span>
                <Dot />
                {quality.warning} warnings
              </>
            ) : (
              'No checks have run yet'
            )
          }
          className="h-full"
        />
      </div>
    </div>
  )
}
