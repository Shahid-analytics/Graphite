import type { NotificationType, UpdateNotificationRequest } from '@/types'
import { body, httpError, qString, paginate, type MockContext, type MockRoute } from '../router'
import { db, findOr404, requireWorkspace } from '../store'
import { nowIso } from '../util'

const TYPES: NotificationType[] = ['pipeline_failed', 'sync_completed', 'repeated_retries', 'quality_failed', 'schema_changed', 'stale_data']
const STATUSES = ['all', 'unread', 'read']

/** Validates an optional notification type filter; 422 for unknown values. */
function readType(value: unknown, field = 'type'): NotificationType | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !TYPES.includes(value as NotificationType)) {
    throw httpError.validation([{ field, message: `${field} must be one of ${TYPES.join(', ')}.` }])
  }
  return value as NotificationType
}

function requireWorkspaceId(ctx: MockContext, value: unknown) {
  if (typeof value !== 'string' || !value) throw httpError.validation([{ field: 'workspace_id', message: 'workspace_id is required.' }])
  requireWorkspace(ctx, value)
  return value
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/notifications',
    handler: (ctx) => {
      const workspaceId = requireWorkspaceId(ctx, qString(ctx, 'workspace_id'))
      const status = qString(ctx, 'status') ?? 'all'
      if (!STATUSES.includes(status)) throw httpError.validation([{ field: 'status', message: `status must be one of ${STATUSES.join(', ')}.` }])
      const type = readType(qString(ctx, 'type'))
      const ofType = db.notifications.filter((n) => n.workspace_id === workspaceId && (!type || n.type === type))
      const items = ofType
        .filter((n) => status === 'all' || (status === 'unread' ? !n.read_at : !!n.read_at))
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      // unread_count ignores status and pagination but honours the type filter: unread of that type, or of all types when none is given.
      return { ...paginate(items, ctx, 20), unread_count: ofType.filter((n) => !n.read_at).length }
    },
  },
  {
    method: 'PATCH',
    path: '/notifications/:notificationId',
    handler: (ctx) => {
      const notification = findOr404(db.notifications, ctx.params.notificationId, 'Notification')
      requireWorkspace(ctx, notification.workspace_id)
      const { read } = body<Partial<UpdateNotificationRequest>>(ctx)
      if (typeof read !== 'boolean') throw httpError.validation([{ field: 'read', message: 'read must be true or false.' }])
      notification.read_at = read ? (notification.read_at ?? nowIso()) : null
      return notification
    },
  },
  {
    method: 'POST',
    path: '/notifications/mark-all-read',
    handler: (ctx) => {
      const input = body<{ workspace_id?: unknown; type?: unknown }>(ctx)
      const workspaceId = requireWorkspaceId(ctx, input.workspace_id)
      // With a type, only unread notifications of that type are marked; without one, every unread notification is.
      const type = readType(input.type)
      let updated = 0
      db.notifications.forEach((n) => {
        if (n.workspace_id === workspaceId && !n.read_at && (!type || n.type === type)) {
          n.read_at = nowIso()
          updated += 1
        }
      })
      return { updated }
    },
  },
]
