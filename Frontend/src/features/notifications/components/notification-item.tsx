import { ArrowUpRight, Mail, MailOpen } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { NOTIFICATION_TYPE_LABELS, NotificationIcon } from '@/components/status/notification-icon'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resourcePath } from '@/lib/resource-links'
import { cn } from '@/lib/utils'
import type { Notification, ResourceType } from '@/types'

const RESOURCE_LABELS: Record<ResourceType, string> = {
  source: 'source',
  pipeline: 'pipeline',
  run: 'run',
  transformation: 'transformation',
  model: 'model',
  schedule: 'schedule',
  dashboard: 'dashboard',
  report: 'report',
  mapping: 'mapping',
  proposal: 'proposal',
}

export function NotificationItem({
  notification,
  workspaceId,
  pending,
  onOpen,
  onToggleRead,
}: {
  notification: Notification
  workspaceId: string
  pending: boolean
  /** Marks the item read and navigates to its resource (if any). */
  onOpen: (notification: Notification) => void
  onToggleRead: (notification: Notification) => void
}) {
  const unread = !notification.read_at
  const path = notification.resource ? resourcePath(workspaceId, notification.resource.type, notification.resource.id) : null
  const toggleLabel = unread ? 'Mark as read' : 'Mark as unread'

  return (
    <li className={cn('relative flex gap-3 px-4 py-3 transition-colors hover:bg-surface', unread && 'bg-surface/60')}>
      <span className="mt-2 flex w-2 shrink-0 justify-center" aria-hidden>
        {unread ? <span className="size-2 rounded-full bg-foreground" /> : null}
      </span>
      <NotificationIcon type={notification.type} severity={notification.severity} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/* The title button stretches over the whole row so the item is clickable; actions sit above it. */}
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className={cn(
              'text-left text-sm outline-none after:absolute after:inset-0 after:content-[""] focus-visible:after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/30',
              unread ? 'font-semibold' : 'font-medium text-foreground/90',
            )}
          >
            {notification.title}
            {unread ? <span className="sr-only"> (unread)</span> : null}
          </button>
          <span className="text-xs text-muted-foreground">{NOTIFICATION_TYPE_LABELS[notification.type]}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
        <div className="relative z-10 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <TimeAgo value={notification.created_at} />
          {notification.resource && path ? (
            <Link
              to={path}
              onClick={() => {
                if (unread) onToggleRead(notification)
              }}
              className="inline-flex items-center gap-0.5 rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              View {RESOURCE_LABELS[notification.resource.type] ?? 'resource'}
              <span className="sr-only">: {notification.resource.name}</span>
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          ) : null}
          {notification.resource ? <span className="truncate font-mono text-[11px]">{notification.resource.name}</span> : null}
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-pressed={!unread}
              aria-label={`Read: ${notification.title}`}
              disabled={pending}
              onClick={() => onToggleRead(notification)}
            >
              {unread ? <Mail aria-hidden /> : <MailOpen aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
    </li>
  )
}
