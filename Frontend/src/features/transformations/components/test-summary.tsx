import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TestSummary } from '@/types'

/** Compact passed / failed / warned counts; colour only when a count needs attention. */
export function TestSummaryCell({ tests, className }: { tests: TestSummary; className?: string }) {
  if (!tests.total) return <span className="text-xs text-subtle-foreground">No tests</span>
  const label = `${tests.passed} passed, ${tests.failed} failed, ${tests.warned} warned of ${tests.total} tests`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={label} className={cn('inline-flex items-center gap-2 text-xs tabular', className)}>
          <span className="text-muted-foreground">{tests.passed} pass</span>
          <span className={cn(tests.failed ? 'font-medium text-danger' : 'text-subtle-foreground')}>{tests.failed} fail</span>
          <span className={cn(tests.warned ? 'font-medium text-warning' : 'text-subtle-foreground')}>{tests.warned} warn</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
