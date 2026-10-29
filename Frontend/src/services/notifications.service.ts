import type {
  MarkAllNotificationsReadResponse,
  Notification,
  NotificationList,
  NotificationQuery,
  NotificationType,
  UpdateNotificationRequest,
} from '@/types'
import { api } from './api-client'

export const notificationsService = {
  list: (query: NotificationQuery) => api.get<NotificationList>('/notifications', { query }),
  update: (notificationId: string, payload: UpdateNotificationRequest) =>
    api.patch<Notification>(`/notifications/${notificationId}`, payload),
  /** Marks unread notifications as read; only those of `type` when one is given. */
  markAllRead: (workspaceId: string, type?: NotificationType) =>
    api.post<MarkAllNotificationsReadResponse>('/notifications/mark-all-read', { workspace_id: workspaceId, ...(type ? { type } : {}) }),
}
