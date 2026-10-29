import { CalendarDays, User } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ReportRequest } from '@/types'
import { areaLabel, PRIORITIES, REQUEST_STATUS } from '../lib/labels'

/** Custom report requests submitted to the data team. */
export function RequestsList({ requests }: { requests: ReportRequest[] }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {requests.map((request) => {
        const status = REQUEST_STATUS[request.status]
        const priority = PRIORITIES.find((p) => p.value === request.priority)?.label ?? request.priority
        return (
          <li key={request.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{request.title}</p>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{areaLabel(request.business_area)}</span>
                <span className="inline-flex items-center gap-1">
                  <User className="size-3" aria-hidden />
                  {request.requested_by.name}
                </span>
                <span>
                  Submitted <TimeAgo value={request.created_at} />
                </span>
              </div>
            </div>
            <dl className="flex shrink-0 gap-4 text-xs sm:flex-col sm:items-end sm:gap-1">
              <div className="flex items-center gap-1">
                <dt className="text-muted-foreground">Priority</dt>
                <dd className={cn(request.priority === 'high' ? 'font-semibold text-foreground' : 'text-foreground')}>{priority}</dd>
              </div>
              <div className="flex items-center gap-1">
                <dt className="inline-flex items-center gap-1 text-muted-foreground">
                  <CalendarDays className="size-3" aria-hidden />
                  Needed by
                </dt>
                <dd>{request.needed_by ? formatDate(request.needed_by) : 'No date'}</dd>
              </div>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
