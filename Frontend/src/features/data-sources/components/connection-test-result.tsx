import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { SimulatedBadge } from '@/components/status/simulated'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ConnectionCheck, TestConnectionResult } from '@/types'

const CHECK_META: Record<ConnectionCheck['status'], { icon: typeof CheckCircle2; className: string; label: string }> = {
  passed: { icon: CheckCircle2, className: 'text-success', label: 'Passed' },
  failed: { icon: XCircle, className: 'text-danger', label: 'Failed' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Warning' },
}

/** Per-check results of a connection test. */
export function ConnectionTestResult({ result, className }: { result: TestConnectionResult; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border', className)} role="status" aria-live="polite">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2.5',
          result.success ? 'border-success/20 bg-success-soft' : 'border-danger/20 bg-danger-soft',
        )}
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          {result.success ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
          {result.success ? 'Connection successful' : 'Connection failed'}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {result.latency_ms !== null ? <span className="tabular">{result.latency_ms} ms</span> : null}
          <span>{formatDateTime(result.tested_at)}</span>
          <SimulatedBadge reason="The mock API simulates connection checks. No network connection to the source was made." />
        </div>
      </div>
      {result.error ? (
        <p className="border-b border-border px-3 py-2 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{result.error.code}</span>
          <span className="ml-2">{result.error.message}</span>
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {result.checks.map((check) => {
          const meta = CHECK_META[check.status]
          const Icon = meta.icon
          return (
            <li key={check.name} className="flex items-start gap-2.5 px-3 py-2">
              <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-label={meta.label} />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{check.name}</p>
                <p className="text-muted-foreground">{check.message}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
