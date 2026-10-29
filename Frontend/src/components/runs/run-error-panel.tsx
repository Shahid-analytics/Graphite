import { ArrowRight, Lightbulb, XCircle } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Run } from '@/types'
import { STAGE_META, suggestedNextStep } from './labels'

/** Failure summary for a run: stage, error code, message, details and a suggested next step. */
export function RunErrorPanel({ run, workspaceId, className }: { run: Run; workspaceId: string; className?: string }) {
  const error = run.error
  if (!error) return null
  const next = suggestedNextStep(workspaceId, run, error)
  return (
    <section aria-labelledby="run-error-title" className={cn('overflow-hidden rounded-lg border border-danger/30 bg-background', className)}>
      <div className="flex items-start gap-3 border-b border-danger/20 bg-danger-soft px-4 py-3">
        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="run-error-title" className="text-sm font-semibold">
            Failed{error.stage ? ` at ${STAGE_META[error.stage].name}` : ''}
          </h2>
          <p className="mt-0.5 text-sm text-foreground">{error.message}</p>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-xs text-muted-foreground">Error code</dt>
        <dd className="font-mono text-[13px]">{error.code}</dd>
        <dt className="text-xs text-muted-foreground">Stage</dt>
        <dd>{error.stage ? STAGE_META[error.stage].name : 'Not stage specific'}</dd>
        <dt className="text-xs text-muted-foreground">Retryable</dt>
        <dd>{error.retryable ? 'Yes. Retrying may succeed once the cause is resolved.' : 'No. The same input will fail again; fix the cause and start a new run.'}</dd>
        {error.details ? (
          <>
            <dt className="text-xs text-muted-foreground">Details</dt>
            <dd className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {error.details}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-col gap-3 border-t border-border bg-surface px-4 py-3 sm:flex-row sm:items-center">
        <Lightbulb className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
        <p className="flex-1 text-sm">
          <span className="font-medium">Suggested next step: </span>
          <span className="text-muted-foreground">{next.text}</span>
        </p>
        {next.action ? (
          <Button asChild variant="outline" size="sm">
            <Link to={next.action.path}>
              {next.action.label}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  )
}
