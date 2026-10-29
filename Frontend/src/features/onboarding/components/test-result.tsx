import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { SimulatedBadge } from '@/components/status/simulated'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ConnectionCheck, ConnectionTestResponse, TestConnectionResult } from '@/types'

const CHECK_META: Record<ConnectionCheck['status'], { icon: typeof CheckCircle2; className: string; label: string }> = {
  passed: { icon: CheckCircle2, className: 'text-success', label: 'Passed' },
  warning: { icon: AlertTriangle, className: 'text-warning', label: 'Warning' },
  failed: { icon: XCircle, className: 'text-danger', label: 'Failed' },
}

/** Result of a source connection test, one row per backend check. */
export function ConnectionChecks({ result }: { result: TestConnectionResult }) {
  return (
    <div className={cn('rounded-lg border', result.success ? 'border-success/25' : 'border-danger/25')}>
      <div className={cn('flex flex-wrap items-center gap-2 rounded-t-lg border-b px-4 py-3', result.success ? 'border-success/20 bg-success-soft' : 'border-danger/20 bg-danger-soft')}>
        {result.success ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
        <p className="text-sm font-medium">{result.success ? 'Connection succeeded' : 'Connection failed'}</p>
        {result.latency_ms !== null ? <span className="text-xs text-muted-foreground tabular">{result.latency_ms} ms</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tested {formatDateTime(result.tested_at)}</span>
          <SimulatedBadge />
        </span>
      </div>
      {result.error ? (
        <p className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
          {result.error.message} <span className="font-mono text-xs text-subtle-foreground">({result.error.code})</span>
        </p>
      ) : null}
      <ul className="divide-y divide-border" aria-label="Connection checks">
        {result.checks.map((check) => {
          const meta = CHECK_META[check.status]
          const Icon = meta.icon
          return (
            <li key={check.name} className="flex items-start gap-3 px-4 py-2.5">
              <Icon className={cn('mt-0.5 size-4 shrink-0', meta.className)} aria-label={meta.label} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{check.name}</span>
                <span className="block text-xs text-muted-foreground">{check.message}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Result of a destination or dbt connection test. */
export function SimpleTestResult({ result, subject }: { result: ConnectionTestResponse; subject: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-start',
        result.success ? 'border-success/25 bg-success-soft' : 'border-danger/25 bg-danger-soft',
      )}
    >
      {result.success ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{result.success ? `${subject} connection succeeded` : `${subject} connection failed`}</p>
        <p className="mt-0.5 text-muted-foreground">{result.message}</p>
        <p className="mt-1 text-xs text-subtle-foreground">Tested {formatDateTime(result.tested_at)}</p>
      </div>
      <SimulatedBadge />
    </div>
  )
}
