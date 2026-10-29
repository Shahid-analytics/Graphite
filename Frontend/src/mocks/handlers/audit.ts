import type { AuditChange, AuditEvent, AuditExportFormat, AuditFacets, AuditStatus } from '@/types'
import { httpError, qNumber, qString, matchesText, type MockContext, type MockRoute } from '../router'
import { db, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { nowIso } from '../util'

const STATUSES: AuditStatus[] = ['success', 'failure', 'denied']
const FORMATS: AuditExportFormat[] = ['jsonl', 'txt']
const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 200
const MAX_EXPORT_ROWS = 10_000
const SECRET_FIELD = /(password|secret|token|api_?key|private_?key|credential)/i

interface AuditFilters {
  q?: string
  actor_id?: string
  resource_type?: string
  action?: string
  status?: AuditStatus
  from?: string
  to?: string
}

function parseTimestamp(value: string | undefined, field: string, errors: { field: string; message: string }[]) {
  if (value === undefined) return undefined
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    errors.push({ field, message: `${field} must be an ISO 8601 timestamp, e.g. 2026-10-28T00:00:00Z.` })
    return undefined
  }
  return ms
}

/** Reads and validates the shared filter parameters used by list and export. */
function readFilters(ctx: MockContext) {
  const errors: { field: string; message: string }[] = []
  const filters: AuditFilters = {
    q: qString(ctx, 'q')?.trim() || undefined,
    actor_id: qString(ctx, 'actor_id') || undefined,
    resource_type: qString(ctx, 'resource_type') || undefined,
    action: qString(ctx, 'action')?.trim() || undefined,
    from: qString(ctx, 'from') || undefined,
    to: qString(ctx, 'to') || undefined,
  }
  const status = qString(ctx, 'status')
  if (status) {
    if (STATUSES.includes(status as AuditStatus)) filters.status = status as AuditStatus
    else errors.push({ field: 'status', message: `status must be one of ${STATUSES.join(', ')}.` })
  }
  const fromMs = parseTimestamp(filters.from, 'from', errors)
  const toMs = parseTimestamp(filters.to, 'to', errors)
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
    errors.push({ field: 'from', message: 'from must be earlier than or equal to to.' })
  }
  if (errors.length) throw httpError.validation(errors)
  return { filters, fromMs, toMs }
}

/** Exact match, or a prefix match when the filter ends with "." or ".*" (e.g. "pipeline."). */
function matchesAction(action: string, filter: string | undefined) {
  if (!filter) return true
  const normalised = filter.endsWith('.*') ? filter.slice(0, -1) : filter
  return normalised.endsWith('.') ? action.startsWith(normalised) : action === normalised
}

/** Applies workspace retention settings: events older than the window are hidden; IPs optionally removed. */
function retentionView(workspaceId: string, event: AuditEvent): AuditEvent {
  const retention = db.settings[workspaceId]?.retention
  if (!retention || retention.include_ip_addresses) return event
  return { ...event, ip_address: null }
}

/** Events of the workspace that are still inside the retention window. */
function retainedEvents(workspaceId: string) {
  const retentionDays = db.settings[workspaceId]?.retention.retention_days
  const retentionFloor = retentionDays ? Date.now() - retentionDays * 86_400_000 : -Infinity
  return db.auditEvents.filter((e) => e.workspace_id === workspaceId && Date.parse(e.occurred_at) >= retentionFloor)
}

function filteredEvents(workspaceId: string, ctx: MockContext) {
  const { filters, fromMs, toMs } = readFilters(ctx)
  const items = retainedEvents(workspaceId)
    .filter((e) => {
      const at = Date.parse(e.occurred_at)
      if (fromMs !== undefined && at < fromMs) return false
      if (toMs !== undefined && at > toMs) return false
      if (filters.actor_id && e.actor.id !== filters.actor_id) return false
      if (filters.resource_type && e.resource.type !== filters.resource_type) return false
      if (filters.status && e.status !== filters.status) return false
      if (!matchesAction(e.action, filters.action)) return false
      return matchesText(filters.q, e.action, e.resource.name, e.resource.id, e.actor.name, e.actor.email, e.execution_id)
    })
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .map((e) => retentionView(workspaceId, e))
  return { items, filters }
}

function formatValue(field: string, value: unknown) {
  if (SECRET_FIELD.test(field) && !(typeof value === 'string' && value.startsWith('[secret'))) return value === null ? 'null' : '[redacted]'
  if (value === null || value === undefined) return 'null'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function summariseChanges(changes: AuditChange[]) {
  if (!changes.length) return '-'
  return changes.map((c) => `${c.field}: ${formatValue(c.field, c.before)} -> ${formatValue(c.field, c.after)}`).join('; ')
}

/** Defence in depth: never export a secret value even if one reached the change log. */
function redactEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    changes: event.changes.map((c) =>
      SECRET_FIELD.test(c.field) ? { field: c.field, before: formatValue(c.field, c.before), after: formatValue(c.field, c.after) } : c,
    ),
  }
}

function describeFilters(filters: AuditFilters) {
  const parts = Object.entries(filters)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`)
  return parts.length ? parts.join(', ') : 'none'
}

function buildJsonl(meta: Record<string, unknown>, events: AuditEvent[]) {
  return [JSON.stringify(meta), ...events.map((e) => JSON.stringify(redactEvent(e)))].join('\n') + '\n'
}

function buildText(meta: { generated_at: string; workspace_id: string; workspace_name: string; filters: AuditFilters; row_count: number; truncated: boolean }, events: AuditEvent[]) {
  const rule = '-'.repeat(96)
  const header = [
    'DEMO EXPORT - simulated audit events',
    'Source: Graphite mock API. These events are simulated and are not a durable audit record.',
    `Generated at: ${meta.generated_at}`,
    `Workspace: ${meta.workspace_name} (${meta.workspace_id})`,
    `Filters: ${describeFilters(meta.filters)}`,
    `Events: ${meta.row_count}${meta.truncated ? ` (truncated to the ${MAX_EXPORT_ROWS} most recent)` : ''}`,
    'Columns: timestamp | actor | action | resource | status | execution id | changes',
    rule,
  ]
  const lines = events.map((e) => {
    const actor = `${e.actor.name}${e.actor.email ? ` <${e.actor.email}>` : ''} (${e.actor.type})`
    const resource = `${e.resource.type} "${e.resource.name}" (${e.resource.id})`
    return [e.occurred_at, actor, e.action, resource, e.status, e.execution_id ?? '-', summariseChanges(e.changes)].join(' | ')
  })
  return [...header, ...lines].join('\n') + '\n'
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/audit-events',
    handler: (ctx) => {
      const { workspaceId } = ctx.params
      requireWorkspace(ctx, workspaceId)
      const requestedSize = Math.max(1, Math.floor(qNumber(ctx, 'page_size', DEFAULT_PAGE_SIZE)))
      if (requestedSize > MAX_PAGE_SIZE) {
        throw httpError.validation([{ field: 'page_size', message: `page_size must be between 1 and ${MAX_PAGE_SIZE}.` }])
      }
      const { items } = filteredEvents(workspaceId, ctx)
      const page = Math.max(1, Math.floor(qNumber(ctx, 'page', 1)))
      const start = (page - 1) * requestedSize
      return { items: items.slice(start, start + requestedSize), page, page_size: requestedSize, total: items.length }
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/audit-events/facets',
    handler: (ctx): AuditFacets => {
      const { workspaceId } = ctx.params
      requireWorkspace(ctx, workspaceId)
      const events = retainedEvents(workspaceId)
      const actors = new Map<string, AuditFacets['actors'][number]>()
      events.forEach((e) => {
        if (!actors.has(e.actor.id)) actors.set(e.actor.id, { id: e.actor.id, name: e.actor.name, type: e.actor.type })
      })
      return {
        actors: [...actors.values()].sort((a, b) => a.name.localeCompare(b.name)),
        resource_types: [...new Set(events.map((e) => e.resource.type))].sort(),
        actions: [...new Set(events.map((e) => e.action))].sort(),
      }
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/audit-events/export',
    handler: (ctx) => {
      const { workspaceId } = ctx.params
      const { user, workspace } = requirePermission(ctx, workspaceId, 'audit:export')
      const format = qString(ctx, 'format') as AuditExportFormat | undefined
      if (!format || !FORMATS.includes(format)) {
        throw httpError.validation([{ field: 'format', message: `format must be one of ${FORMATS.join(', ')}.` }])
      }
      if (db.settings[workspaceId]?.retention.export_enabled === false) {
        throw httpError.conflict('audit_export_disabled', 'Audit exports are turned off for this workspace. An admin can enable them in Settings > Audit retention.')
      }
      const { items, filters } = filteredEvents(workspaceId, ctx)
      const rows = items.slice(0, MAX_EXPORT_ROWS)
      const truncated = items.length > rows.length
      const generatedAt = nowIso()

      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'audit.exported',
        resource: { type: 'audit_log', id: 'audit', name: 'Audit log' },
        metadata: { format, row_count: rows.length, truncated, filters, demo: true },
      })

      if (format === 'jsonl') {
        const meta = {
          record_type: 'export_metadata',
          demo: true,
          generated_at: generatedAt,
          workspace_id: workspaceId,
          workspace_name: workspace.name,
          filters,
          row_count: rows.length,
          truncated,
          note: 'Demo export of simulated audit events from the Graphite mock API',
        }
        return new Blob([buildJsonl(meta, rows)], { type: 'application/x-ndjson' })
      }
      const text = buildText({ generated_at: generatedAt, workspace_id: workspaceId, workspace_name: workspace.name, filters, row_count: rows.length, truncated }, rows)
      return new Blob([text], { type: 'text/plain' })
    },
  },
]
