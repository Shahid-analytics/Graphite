import { format, parseISO } from 'date-fns'
import { BarChart3, Table2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Overview } from '@/types'

type TrendPoint = Overview['run_trend'][number]

/*
 * Grayscale base with colour reserved for the status that needs attention.
 * Succeeded uses a neutral grey (>= 3:1 against the card surface); failed uses the
 * danger token. Identity never relies on colour alone: legend, tooltip and table view.
 */
const SERIES = {
  succeeded: { label: 'Succeeded', color: '#8e8e95' },
  failed: { label: 'Failed', color: 'var(--danger)' },
} as const

const SEGMENT_GAP = 2
const RADIUS = 4

function dayLabel(date: string, pattern = 'MMM d') {
  return format(parseISO(date), pattern)
}

/** Rect with only the top corners rounded (data end), square at the baseline. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`
}

interface SegmentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: TrendPoint
}

function makeSegment(series: keyof typeof SERIES) {
  return function Segment({ x = 0, y = 0, width = 0, height = 0, payload }: SegmentProps) {
    if (!payload || height <= 0 || width <= 0) return <g />
    const isTop = series === 'failed' || payload.failed === 0
    // The failed segment sits on top; leave a surface-coloured gap between the two fills.
    const gap = series === 'failed' && payload.succeeded > 0 ? Math.min(SEGMENT_GAP, height - 1) : 0
    const h = Math.max(1, height - gap)
    const d = isTop ? topRoundedPath(x, y, width, h, RADIUS) : `M${x},${y} h${width} v${h} h${-width} Z`
    return <path d={d} style={{ fill: SERIES[series].color }} />
  }
}

const SucceededSegment = makeSegment('succeeded')
const FailedSegment = makeSegment('failed')

function TrendTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const point = payload?.[0]?.payload as TrendPoint | undefined
  if (!active || !point) return null
  const total = point.succeeded + point.failed
  return (
    <div className="min-w-36 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{dayLabel(point.date, 'EEE, MMM d')}</p>
      <dl className="space-y-1">
        {(['failed', 'succeeded'] as const).map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: SERIES[key].color }} />
            <dt className="text-muted-foreground">{SERIES[key].label}</dt>
            <dd className="ml-auto font-semibold tabular">{formatNumber(point[key])}</dd>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-border pt-1">
          <dt className="pl-5 text-muted-foreground">Total</dt>
          <dd className="ml-auto tabular">{formatNumber(total)}</dd>
        </div>
      </dl>
    </div>
  )
}

function Legend({ succeeded, failed }: { succeeded: number; failed: number }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {(
        [
          ['succeeded', succeeded],
          ['failed', failed],
        ] as const
      ).map(([key, value]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: SERIES[key].color }} />
          {SERIES[key].label}
          <span className="font-medium text-foreground tabular">{formatNumber(value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Plain-language summary of the trend for screen readers and the chart's accessible name. */
export function describeTrend(trend: TrendPoint[]) {
  const succeeded = trend.reduce((sum, d) => sum + d.succeeded, 0)
  const failed = trend.reduce((sum, d) => sum + d.failed, 0)
  const total = succeeded + failed
  if (!total) return `No completed pipeline or source sync runs in the last ${trend.length} days.`
  const worst = trend.reduce((max, d) => (d.failed > max.failed ? d : max), trend[0])
  const parts = [
    `${total} completed pipeline and source sync runs over the last ${trend.length} days: ${succeeded} succeeded and ${failed} failed (${formatPercent(succeeded / total)} success rate).`,
  ]
  if (worst.failed > 0) parts.push(`Most failures on ${dayLabel(worst.date, 'EEEE, MMMM d')} with ${worst.failed}.`)
  return parts.join(' ')
}

/** 14-day stacked columns of completed pipeline and sync runs, with a table view. */
export function RunActivityChart({ trend }: { trend: TrendPoint[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const totals = useMemo(
    () => ({ succeeded: trend.reduce((s, d) => s + d.succeeded, 0), failed: trend.reduce((s, d) => s + d.failed, 0) }),
    [trend],
  )
  const summary = describeTrend(trend)
  const summaryId = useId()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend {...totals} />
        <ToggleGroup
          type="single"
          size="sm"
          value={view}
          onValueChange={(next) => next && setView(next as 'chart' | 'table')}
          aria-label="Run activity view"
        >
          <ToggleGroupItem value="chart" aria-label="Show as chart">
            <BarChart3 className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Chart</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Show as table">
            <Table2 className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Table</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p id={summaryId} className="sr-only">
        {summary}
      </p>

      {view === 'chart' ? (
        <figure className="h-60 w-full" aria-label="Completed runs per day, last 14 days" aria-describedby={summaryId}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => dayLabel(d)}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-strong)' }}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                interval="preserveStartEnd"
                minTickGap={16}
                tickMargin={6}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--surface-2)' }} isAnimationActive={false} />
              <Bar
                dataKey="succeeded"
                name={SERIES.succeeded.label}
                stackId="runs"
                maxBarSize={24}
                shape={SucceededSegment}
                activeBar={false}
                isAnimationActive={false}
              />
              <Bar
                dataKey="failed"
                name={SERIES.failed.label}
                stackId="runs"
                maxBarSize={24}
                shape={FailedSegment}
                activeBar={false}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </figure>
      ) : (
        <div className="scrollbar-thin max-h-60 overflow-auto rounded-md border border-border">
          <Table>
            <caption className="sr-only">Completed pipeline and source sync runs per day</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Succeeded</TableHead>
                <TableHead className="text-right">Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...trend].reverse().map((d) => (
                <TableRow key={d.date}>
                  <TableCell>{dayLabel(d.date, 'EEE, MMM d')}</TableCell>
                  <TableCell className="text-right tabular">{formatNumber(d.succeeded)}</TableCell>
                  <TableCell className={cn('text-right tabular', d.failed > 0 && 'font-medium text-danger')}>{formatNumber(d.failed)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
