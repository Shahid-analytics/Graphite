import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RunStage, StageKey } from '@/types'
import { STAGE_META, STAGE_ORDER } from './labels'
import { STAGE_STATUS_META, StageStatusIcon, type StageDisplayStatus } from './stage-status'

type FlowStage = Pick<RunStage, 'key' | 'status'> & Partial<Pick<RunStage, 'duration_seconds'>>

interface FlowItem {
  key: StageKey
  status: StageDisplayStatus
  duration: number | null
}

/**
 * Source -> Ingestion -> Bronze -> dbt -> Silver/Gold -> Quality -> Metabase flow.
 * Pass `stages` for a run, or `planned` to preview a pipeline's configured stages.
 * Stages that are not part of the run or pipeline render as "Not included" unless
 * `hideExcluded` is set (useful for ingestion-only or dbt-only runs). The horizontal
 * layout scrolls sideways on narrow screens; use `orientation="vertical"` in sidebars.
 */
export function StageFlow({
  stages,
  planned,
  hideExcluded = false,
  size = 'default',
  orientation = 'horizontal',
  className,
  label = 'Execution stages',
}: {
  stages?: FlowStage[]
  planned?: StageKey[]
  hideExcluded?: boolean
  size?: 'default' | 'sm'
  orientation?: 'horizontal' | 'vertical'
  className?: string
  label?: string
}) {
  const items: FlowItem[] = []
  for (const key of STAGE_ORDER) {
    const stage = stages?.find((s) => s.key === key)
    if (stage) items.push({ key, status: stage.status, duration: stage.duration_seconds ?? null })
    else if (!stages && planned?.includes(key)) items.push({ key, status: 'planned', duration: null })
    else if (!hideExcluded) items.push({ key, status: 'excluded', duration: null })
  }
  const small = size === 'sm'

  if (orientation === 'vertical') {
    return (
      <ol aria-label={label} className={cn('flex flex-col items-stretch gap-0.5', className)}>
        {items.map((item, index) => (
          <li key={item.key} className="flex flex-col items-center gap-0.5">
            <StageBox item={item} small={small} vertical />
            {index < items.length - 1 ? <ChevronDown className="size-3 text-subtle-foreground" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    )
  }

  return (
    // contain-inline-size keeps the strip's min-content width from stretching grid/flex ancestors, and
    // relative makes this the containing block for the boxes' absolutely positioned sr-only labels, so both scroll here.
    <div className={cn('scrollbar-thin relative -mx-1 overflow-x-auto px-1 pb-1 [contain:inline-size]', className)}>
      <ol aria-label={label} className="flex w-full min-w-max items-stretch gap-1">
        {items.map((item, index) => (
          <li key={item.key} className="flex min-w-0 flex-1 items-center gap-1">
            <StageBox item={item} small={small} />
            {index < items.length - 1 ? <ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

function StageBox({ item, small, vertical = false }: { item: FlowItem; small: boolean; vertical?: boolean }) {
  const meta = STAGE_META[item.key]
  const status = STAGE_STATUS_META[item.status]
  const StageIcon = meta.icon
  const showDuration = !small && item.duration !== null && (item.status === 'succeeded' || item.status === 'failed')
  return (
    <div
      className={cn(
        'flex w-full rounded-md border',
        vertical ? 'items-center justify-between gap-2 px-2.5 py-1.5' : 'min-w-[6.75rem] flex-col gap-1',
        !vertical && (small ? 'px-2 py-1.5' : 'px-2.5 py-2'),
        status.boxClass,
      )}
      title={meta.description}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
        <StageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{vertical ? meta.name : meta.short}</span>
      </span>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <StageStatusIcon status={item.status} className="size-3" />
        <span className="truncate">
          <span className="sr-only">{meta.name}: </span>
          {status.label}
        </span>
        {showDuration ? <span className="ml-auto pl-1 tabular text-subtle-foreground">{formatDuration(item.duration)}</span> : null}
      </span>
    </div>
  )
}
