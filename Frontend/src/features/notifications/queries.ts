import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationKeys } from '@/components/navigation/notifications-popover'
import { notificationsService } from '@/services/notifications.service'
import type { NotificationType } from '@/types'

export const NOTIFICATIONS_PAGE_SIZE = 20

export type NotificationTab = 'all' | 'unread' | 'read'

const POLL_MS = 30_000

export function useNotificationList(workspaceId: string, status: NotificationTab, type: NotificationType | undefined, page: number) {
  return useQuery({
    queryKey: notificationKeys.list(workspaceId, { status, type: type ?? null, page, page_size: NOTIFICATIONS_PAGE_SIZE }),
    queryFn: () => notificationsService.list({ workspace_id: workspaceId, status, type, page, page_size: NOTIFICATIONS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
  })
}

/**
 * Tab counts for the current type filter from one request: `total` counts every
 * notification of the type and `unread_count` the unread ones, so read is derived.
 */
export function useNotificationCounts(workspaceId: string, type: NotificationType | undefined) {
  const counts = useQuery({
    queryKey: notificationKeys.list(workspaceId, { counts: 'all', type: type ?? null }),
    queryFn: () => notificationsService.list({ workspace_id: workspaceId, status: 'all', type, page_size: 1 }),
    refetchInterval: POLL_MS,
  })
  const total = counts.data?.total
  const unread = counts.data?.unread_count
  return {
    all: total,
    unread,
    read: total !== undefined && unread !== undefined ? Math.max(0, total - unread) : undefined,
  }
}

export function useSetNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => notificationsService.update(id, { read }),
    // Refresh the page list, tab counts, the bell and the sidebar badge together.
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

/** Marks unread notifications as read: only those of `type` when one is given, otherwise all. */
export function useMarkAllNotificationsRead(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (type: NotificationType | undefined) => notificationsService.markAllRead(workspaceId, type),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
