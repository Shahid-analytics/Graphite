import type { DataLayer, DataModel, FreshnessStatus, ModelRole, PreviewColumn, TablePreview } from '@/types'
import { buildLineage } from '../engine/lineage'
import { computeQualitySummary } from '../engine/quality'
import { generateRows } from '../engine/sample-rows'
import { httpError, matchesText, qBool, qNumber, qString, type MockContext, type MockRoute } from '../router'
import { db, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { nowIso } from '../util'

const LAYERS: DataLayer[] = ['bronze', 'silver', 'gold']
const ROLES: ModelRole[] = ['raw', 'staging', 'intermediate', 'fact', 'dimension', 'aggregate']
const FRESHNESS: FreshnessStatus[] = ['fresh', 'stale', 'unknown']

/** Upper bound of the deterministic sample pool served by the preview endpoint. */
const PREVIEW_POOL_MAX = 250
const PREVIEW_PAGE_SIZE_MAX = 100
const LINEAGE_DEPTH_MAX = 6

function enumParam<T extends string>(ctx: MockContext, key: string, allowed: readonly T[]): T | undefined {
  const value = qString(ctx, key)
  if (value === undefined || value === '') return undefined
  if (!allowed.includes(value as T)) {
    throw httpError.validation([{ field: key, message: `Unknown ${key} "${value}". Expected one of: ${allowed.join(', ')}.` }])
  }
  return value as T
}

/** Loads a model and checks that the caller can read its workspace. */
function readableModel(ctx: MockContext) {
  const model = findOr404(db.models, ctx.params.modelId, 'Model')
  const access = requireWorkspace(ctx, model.workspace_id)
  return { model, access }
}

function workspaceModelIds(workspaceId: string) {
  return new Set(db.models.filter((m) => m.workspace_id === workspaceId).map((m) => m.id))
}

function compareModels(a: DataModel, b: DataModel) {
  return LAYERS.indexOf(a.layer) - LAYERS.indexOf(b.layer) || a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name)
}

const SCHEMA_DRIFT_PREFIX = 'Schema change detected'

/**
 * A source degraded only by schema drift on its Bronze tables recovers once every
 * change on those tables is acknowledged; otherwise its message names the next one.
 */
function reconcileSourceDrift(sourceId: string | null) {
  if (!sourceId) return
  const source = db.sources.find((s) => s.id === sourceId)
  if (!source || source.health !== 'degraded' || db.sourceFailures[source.id] || !source.health_message?.startsWith(SCHEMA_DRIFT_PREFIX)) return
  for (const model of db.models.filter((m) => m.source_id === sourceId && m.layer === 'bronze')) {
    const next = model.schema_changes.find((c) => !c.acknowledged)
    if (next) {
      const detail = next.change_type === 'type_changed' ? `changed from ${next.from_type} to ${next.to_type}` : next.change_type === 'column_added' ? 'was added' : 'was removed'
      source.health_message = `${SCHEMA_DRIFT_PREFIX}: ${model.name}.${next.column} ${detail}.`
      return
    }
  }
  source.health = source.last_sync_status === 'succeeded' ? 'healthy' : 'unknown'
  source.health_message = null
}

function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1
  return String(a).localeCompare(String(b))
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/models',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const q = qString(ctx, 'q')?.trim()
      const layer = enumParam(ctx, 'layer', LAYERS)
      const role = enumParam(ctx, 'role', ROLES)
      const freshness = enumParam(ctx, 'freshness', FRESHNESS)
      const schema = qString(ctx, 'schema')
      const hasChanges = qBool(ctx, 'has_schema_changes')
      return db.models
        .filter((m) => m.workspace_id === ctx.params.workspaceId)
        .filter((m) => !layer || m.layer === layer)
        .filter((m) => !role || m.role === role)
        .filter((m) => !freshness || m.freshness_status === freshness)
        .filter((m) => !schema || m.schema === schema)
        .filter((m) => hasChanges === undefined || m.schema_changes.some((c) => !c.acknowledged) === hasChanges)
        .filter((m) => matchesText(q, m.name, m.schema, `${m.schema}.${m.name}`, m.description, ...m.tags))
        .sort(compareModels)
    },
  },
  {
    method: 'GET',
    path: '/models/:modelId',
    handler: (ctx) => readableModel(ctx).model,
  },
  {
    method: 'GET',
    path: '/models/:modelId/columns',
    handler: (ctx) => {
      const { model } = readableModel(ctx)
      return db.columns[model.id] ?? []
    },
  },
  {
    method: 'GET',
    path: '/models/:modelId/preview',
    handler: (ctx): TablePreview => {
      const { model } = readableModel(ctx)
      const columns: PreviewColumn[] = (db.columns[model.id] ?? []).map((c) => ({ name: c.name, data_type: c.data_type }))
      const page = Math.max(1, Math.floor(qNumber(ctx, 'page', 1)))
      const pageSize = Math.min(Math.max(1, Math.floor(qNumber(ctx, 'page_size', 25))), PREVIEW_PAGE_SIZE_MAX)
      const sort = qString(ctx, 'sort') || undefined
      const order = qString(ctx, 'order') || 'asc'
      const q = qString(ctx, 'q')?.trim().toLowerCase()

      const errors: { field: string; message: string }[] = []
      if (sort && !columns.some((c) => c.name === sort)) errors.push({ field: 'sort', message: `Column "${sort}" does not exist in ${model.schema}.${model.name}.` })
      if (order !== 'asc' && order !== 'desc') errors.push({ field: 'order', message: 'Order must be "asc" or "desc".' })
      if (errors.length) throw httpError.validation(errors)

      const poolSize = Math.min(model.row_count ?? 0, PREVIEW_POOL_MAX)
      let rows = generateRows(columns, poolSize, model.id)
      // Matches any cell by its text, so ids and amounts can be found as well as names.
      if (q) rows = rows.filter((row) => Object.values(row).some((value) => value !== null && String(value).toLowerCase().includes(q)))
      if (sort) {
        const direction = order === 'desc' ? -1 : 1
        rows = [...rows].sort((a, b) => compareValues(a[sort], b[sort]) * direction)
      }
      const start = (page - 1) * pageSize
      return {
        columns,
        rows: rows.slice(start, start + pageSize),
        total_rows: rows.length,
        page,
        page_size: pageSize,
        sampled_at: nowIso(),
      }
    },
  },
  {
    method: 'GET',
    path: '/models/:modelId/lineage',
    handler: (ctx) => {
      const { model } = readableModel(ctx)
      const raw = qString(ctx, 'depth')
      const depth = raw === undefined ? 3 : Number(raw)
      if (!Number.isInteger(depth) || depth < 1 || depth > LINEAGE_DEPTH_MAX) {
        throw httpError.validation([{ field: 'depth', message: `Depth must be a whole number between 1 and ${LINEAGE_DEPTH_MAX}.` }])
      }
      return buildLineage(db, model.workspace_id, model.id, depth)
    },
  },
  {
    method: 'GET',
    path: '/models/:modelId/relationships',
    handler: (ctx) => {
      const { model } = readableModel(ctx)
      return db.relationships.filter((r) => r.from_model_id === model.id || r.to_model_id === model.id)
    },
  },
  {
    method: 'GET',
    path: '/models/:modelId/quality-checks',
    handler: (ctx) => {
      const { model } = readableModel(ctx)
      const rank = { failed: 0, warning: 1, not_run: 2, passed: 3 } as const
      return db.qualityChecks
        .filter((c) => c.model_id === model.id)
        .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
    },
  },
  {
    method: 'POST',
    path: '/models/:modelId/schema-changes/:changeId/acknowledge',
    handler: (ctx) => {
      const model = findOr404(db.models, ctx.params.modelId, 'Model')
      const { user } = requirePermission(ctx, model.workspace_id, 'models:approve')
      const change = model.schema_changes.find((c) => c.id === ctx.params.changeId)
      if (!change) throw httpError.notFound('Schema change', ctx.params.changeId)
      if (change.acknowledged) {
        throw httpError.conflict('schema_change_already_acknowledged', `The ${change.change_type.replace('_', ' ')} change on "${change.column}" has already been acknowledged.`, { change_id: change.id })
      }
      change.acknowledged = true
      reconcileSourceDrift(model.layer === 'bronze' ? model.source_id : null)
      recordAudit({
        workspaceId: model.workspace_id,
        actor: userActor(user),
        action: 'model.schema_change_acknowledged',
        resource: { type: 'model', id: model.id, name: `${model.schema}.${model.name}` },
        changes: [{ field: `schema_changes.${change.id}.acknowledged`, before: false, after: true }],
        metadata: { change_id: change.id, change_type: change.change_type, column: change.column, from_type: change.from_type, to_type: change.to_type },
      })
      return model
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/lineage',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      return buildLineage(db, ctx.params.workspaceId)
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/relationships',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const ids = workspaceModelIds(ctx.params.workspaceId)
      return db.relationships.filter((r) => ids.has(r.from_model_id))
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/quality-summary',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      return computeQualitySummary(db, ctx.params.workspaceId)
    },
  },
]
