import type { SearchResult } from '@/types'
import { qString, type MockRoute } from '../router'
import { CONNECTORS } from '../seed/core'
import { db, requireWorkspace } from '../store'

const connectorName = (type: string) => CONNECTORS.find((c) => c.type === type)?.name ?? type
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/search',
    handler: (ctx) => {
      const ws = ctx.params.workspaceId
      requireWorkspace(ctx, ws)
      const q = (qString(ctx, 'q') ?? '').trim().toLowerCase()
      if (q.length < 2) return { query: q, results: [] }
      const hit = (...fields: (string | null | undefined)[]) => fields.some((f) => f?.toLowerCase().includes(q))
      const results: SearchResult[] = [
        ...db.sources.filter((s) => s.workspace_id === ws && hit(s.name, s.connector_type)).map((s) => ({ type: 'source' as const, id: s.id, title: s.name, subtitle: `Source · ${connectorName(s.connector_type)}` })),
        ...db.pipelines.filter((p) => p.workspace_id === ws && hit(p.name, p.description)).map((p) => ({ type: 'pipeline' as const, id: p.id, title: p.name, subtitle: 'Pipeline' })),
        ...db.models.filter((m) => m.workspace_id === ws && hit(m.name, `${m.schema}.${m.name}`, m.description)).map((m) => ({ type: 'model' as const, id: m.id, title: `${m.schema}.${m.name}`, subtitle: `${capitalize(m.layer)} model · ${m.role}` })),
        ...db.transformations.filter((t) => hit(t.name, t.unique_id)).filter(() => ws === 'ws_acme').map((t) => ({ type: 'transformation' as const, id: t.id, title: t.name, subtitle: `dbt ${t.type} model` })),
        ...db.schedules.filter((s) => s.workspace_id === ws && hit(s.name, s.target_name)).map((s) => ({ type: 'schedule' as const, id: s.id, title: s.name, subtitle: 'Schedule' })),
        ...db.dashboards.filter((d) => d.workspace_id === ws && hit(d.name, d.description)).map((d) => ({ type: 'dashboard' as const, id: d.id, title: d.name, subtitle: `Dashboard · ${capitalize(d.business_area)}` })),
        ...db.reports.filter((r) => r.workspace_id === ws && hit(r.name, r.description)).map((r) => ({ type: 'report' as const, id: r.id, title: r.name, subtitle: `Report · ${capitalize(r.business_area)}` })),
      ]
      return { query: q, results: results.slice(0, 30) }
    },
  },
]
