import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { SimulatedBadge } from '@/components/status/simulated'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DashboardPreview } from '@/types'

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

function Delta({ value }: { value: number | null }) {
  if (value === null) return null
  const pct = Math.abs(value * 100).toFixed(1)
  const direction = value > 0.0005 ? 'up' : value < -0.0005 ? 'down' : 'flat'
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus
  // Neutral ink: whether a rise is good depends on the metric (e.g. overdue amounts).
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular" aria-label={`${direction === 'flat' ? 'unchanged' : `${direction} ${pct}%`} versus the previous period`}>
      <Icon className="size-3" aria-hidden />
      {direction === 'flat' ? '0.0%' : `${direction === 'up' ? '+' : '-'}${pct}%`}
    </span>
  )
}

/**
 * Single-series column chart for catalog thumbnails. One neutral hue; the
 * largest value is emphasised and labelled, the rest are read via tooltip or
 * the screen-reader table.
 */
export function MiniColumnChart({ series, label, height = 64 }: { series: DashboardPreview['series']; label: string; height?: number }) {
  if (!series.length) return null
  const max = Math.max(...series.map((s) => s.value), 0)
  const peak = series.findIndex((s) => s.value === max)
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 truncate text-[11px] text-muted-foreground">{label}</figcaption>
      <div className="flex items-end gap-1 border-b border-border pt-3.5" style={{ height }} aria-hidden>
        {series.map((point, i) => {
          const pct = max > 0 ? Math.max(2, (point.value / max) * 100) : 2
          return (
            <Tooltip key={point.label}>
              <TooltipTrigger asChild>
                <div className="relative flex h-full flex-1 items-end justify-center">
                  {i === peak ? (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-foreground tabular" style={{ bottom: `calc(${pct}% + 3px)` }}>
                      {numberFormat.format(point.value)}
                    </span>
                  ) : null}
                  <div
                    className={cn('w-full max-w-6 rounded-t-[4px]', i === peak ? 'bg-foreground' : 'bg-foreground/25')}
                    style={{ height: `${pct}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{point.label}</span>: {numberFormat.format(point.value)}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {series.map((point) => (
          <span key={point.label} className="flex-1 truncate text-center text-[10px] text-subtle-foreground" title={point.label}>
            {point.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {series.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{numberFormat.format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** KPI values and a small series computed by the backend for catalog previews. */
export function DashboardPreviewPanel({ preview, compact = false, className }: { preview: DashboardPreview; compact?: boolean; className?: string }) {
  const kpis = compact ? preview.kpis.slice(0, 2) : preview.kpis
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Summary values</p>
        <SimulatedBadge reason="Summary values come from the demo dataset in the mock API, not from a live Gold model." />
      </div>
      <dl className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-1')}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-0">
            <dt className="truncate text-[11px] text-muted-foreground">{kpi.label}</dt>
            <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className={cn('font-semibold tracking-tight', compact ? 'text-sm' : 'text-lg')}>{kpi.value}</span>
              <Delta value={kpi.delta} />
            </dd>
          </div>
        ))}
      </dl>
      {preview.series.length ? <MiniColumnChart series={preview.series} label={preview.series_label} height={compact ? 48 : 96} /> : null}
    </div>
  )
}
