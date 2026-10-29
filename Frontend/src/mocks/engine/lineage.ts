import type { DataModel, LineageEdge, LineageGraph, LineageNode, LineageNodeKind } from '@/types'
import type { MockDb } from '../db'

function modelKind(model: DataModel): LineageNodeKind {
  if (model.layer === 'bronze') return 'bronze'
  if (model.layer === 'gold') return 'gold'
  if (model.role === 'staging') return 'staging'
  if (model.role === 'intermediate') return 'intermediate'
  return 'silver'
}

function modelStatus(model: DataModel): LineageNode['status'] {
  if (model.quality.failed > 0) return 'error'
  if (model.freshness_status === 'stale' || model.quality.warned > 0 || model.schema_changes.some((c) => !c.acknowledged)) return 'warning'
  return 'ok'
}

/**
 * Builds the workspace lineage graph: sources -> Bronze -> Silver -> Gold -> dashboards.
 * When `focusModelId` is set, the graph is limited to nodes within `depth` hops
 * upstream and downstream of that model.
 */
export function buildLineage(db: MockDb, workspaceId: string, focusModelId: string | null = null, depth = 3): LineageGraph {
  const nodes = new Map<string, LineageNode>()
  const edges: LineageEdge[] = []

  const models = db.models.filter((m) => m.workspace_id === workspaceId)
  const modelIds = new Set(models.map((m) => m.id))
  for (const model of models) {
    nodes.set(model.id, { id: model.id, name: model.layer === 'bronze' ? `${model.schema}.${model.name}` : model.name, kind: modelKind(model), ref_id: model.id, ref_type: 'model', status: modelStatus(model) })
  }
  for (const source of db.sources.filter((s) => s.workspace_id === workspaceId)) {
    nodes.set(source.id, { id: source.id, name: source.name, kind: 'source', ref_id: source.id, ref_type: 'source', status: source.health === 'unhealthy' ? 'error' : source.health === 'degraded' ? 'warning' : 'ok' })
  }
  for (const model of models) {
    for (const upstream of db.lineage[model.id] ?? []) {
      if (nodes.has(upstream)) edges.push({ from: upstream, to: model.id })
    }
  }
  for (const dashboard of db.dashboards.filter((d) => d.workspace_id === workspaceId)) {
    const id = `node_${dashboard.id}`
    nodes.set(id, { id, name: dashboard.name, kind: 'dashboard', ref_id: dashboard.id, ref_type: 'dashboard', status: dashboard.status === 'draft' ? 'unknown' : 'ok' })
    dashboard.datasets.filter((d) => modelIds.has(d.model_id)).forEach((d) => edges.push({ from: d.model_id, to: id }))
  }

  // Drop sources without any downstream tables (e.g. paused sandbox with a separate schema).
  const used = new Set(edges.flatMap((e) => [e.from, e.to]))
  for (const [id, node] of nodes) if (node.kind === 'source' && !used.has(id)) nodes.delete(id)

  if (!focusModelId) return { nodes: [...nodes.values()], edges, focus_id: null }

  const keep = new Set<string>([focusModelId])
  const walk = (frontier: string[], dir: 'up' | 'down', remaining: number) => {
    if (!remaining || !frontier.length) return
    const next: string[] = []
    for (const id of frontier) {
      for (const e of edges) {
        const other = dir === 'up' ? (e.to === id ? e.from : null) : e.from === id ? e.to : null
        if (other && !keep.has(other)) {
          keep.add(other)
          next.push(other)
        }
      }
    }
    walk(next, dir, remaining - 1)
  }
  walk([focusModelId], 'up', depth)
  walk([focusModelId], 'down', depth)
  return {
    nodes: [...nodes.values()].filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    focus_id: focusModelId,
  }
}
