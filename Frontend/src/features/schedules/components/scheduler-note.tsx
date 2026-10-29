import { ServerCog } from 'lucide-react'
import { cn } from '@/lib/utils'

/** States plainly which part of scheduling the backend owns. */
export function SchedulerNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
      <ServerCog className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Schedules are definitions only. Triggering runs on time, retries, concurrency limits and dependency ordering are performed by the
        backend scheduler; this page configures and monitors it.
      </span>
    </p>
  )
}
