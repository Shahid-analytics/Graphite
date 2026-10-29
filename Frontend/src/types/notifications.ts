import type { ID, ISODateTime } from './common'

export type NotificationType =
  | 'pipeline_failed'
  | 'sync_completed'
  | 'repeated_retries'
  | 'quality_failed'
  | 'schema_changed'
  | 'stale_data'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type ResourceType =
  | 'source'
  | 'pipeline'
  | 'run'
  | 'transformation'
  | 'model'
  | 'schedule'
  | 'dashboard'
  | 'report'
  | 'mapping'
  | 'proposal'

export interface Notification {
  id: ID
  workspace_id: ID
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  created_at: ISODateTime
  read_at: ISODateTime | null
  /** Resource the notification is about; the frontend maps it to a route. */
  resource: { type: ResourceType; id: ID; name: string } | null
}

export interface NotificationQuery {
  workspace_id: ID
  status?: 'all' | 'unread' | 'read'
  type?: NotificationType
  page?: number
  page_size?: number
}

export interface NotificationList {
  items: Notification[]
  page: number
  page_size: number
  total: number
  /** Unread notifications matching the type filter (all types when none is given); ignores status and paging. */
  unread_count: number
}

export interface UpdateNotificationRequest {
  read: boolean
}

export interface MarkAllNotificationsReadRequest {
  workspace_id: ID
  /** When given, only unread notifications of this type are marked as read. */
  type?: NotificationType
}

export interface MarkAllNotificationsReadResponse {
  updated: number
}
