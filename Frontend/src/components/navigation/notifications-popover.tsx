import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { NotificationIcon } from '@/components/status/notification-icon'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { wsPath } from '@/hooks/use-workspace'
import { formatRelative } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { notificationsService } from '@/services/notifications.service'
import type { Notification } from '@/types'

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (workspaceId: string, query: object) => ['notifications', workspaceId, query] as const,
  unread: (workspaceId: string) => ['notifications', workspaceId, 'unread-count'] as const,
}

/** Unread count, polled every 30 seconds for the bell and sidebar badge. */
export function useUnreadCount(workspaceId: string) {
  return useQuery({
    queryKey: notificationKeys.unread(workspaceId),
    queryFn: () => notificationsService.list({ workspace_id: workspaceId, status: 'unread', page_size: 1 }),
    select: (data) => data.unread_count,
    refetchInterval: 30_000,
  })
}

export function NotificationsPopover({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const unread = useUnreadCount(workspaceId)
  const recent = useQuery({
    queryKey: notificationKeys.list(workspaceId, { popover: true }),
    queryFn: () => notificationsService.list({ workspace_id: workspaceId, status: 'all', page_size: 8 }),
    enabled: open,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.update(id, { read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
  const markAll = useMutation({
    mutationFn: () => notificationsService.markAllRead(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    onError: (error) => toastError(error, 'Could not mark notifications as read'),
  })

  const openItem = (item: Notification) => {
    if (!item.read_at) markRead.mutate(item.id)
    const path = item.resource ? resourcePath(workspaceId, item.resource.type, item.resource.id) : null
    setOpen(false)
    navigate(path ?? wsPath(workspaceId, 'notifications'))
  }

  const count = unread.data ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}>
          <Bell className="size-4" />
          {count > 0 ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-danger ring-2 ring-background" aria-hidden /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={!count} loading={markAll.isPending}>
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[380px] overflow-y-auto">
          {recent.isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : recent.isError ? (
            <p className="px-3 py-8 text-center text-sm text-danger">Could not load notifications.</p>
          ) : recent.data?.items.length ? (
            <ul>
              {recent.data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn('flex w-full gap-3 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-surface', !item.read_at && 'bg-surface/60')}
                  >
                    <NotificationIcon type={item.type} severity={item.severity} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', !item.read_at && 'font-medium')}>{item.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{item.message}</span>
                      <span className="mt-0.5 block text-[11px] text-subtle-foreground">{formatRelative(item.created_at)}</span>
                    </span>
                    {!item.read_at ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground" aria-label="Unread" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You are all caught up.</p>
          )}
        </div>
        <div className="border-t border-border p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
            <Link to={wsPath(workspaceId, 'notifications')}>View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
