import { describe, expect, it } from 'vitest'
import type { Permission } from '@/types'
import { ROLE_PERMISSIONS } from '../permissions'
import { createDb } from '../seed'

describe('demo seed', () => {
  const db = createDb()
  const sourceIds = new Set(db.sources.map((s) => s.id))
  const modelIds = new Set(db.models.map((m) => m.id))
  const transformationIds = new Set(db.transformations.map((t) => t.id))

  it('has no dangling references', () => {
    db.pipelines.forEach((p) => p.source_ids.forEach((id) => expect(sourceIds, `pipeline ${p.id}`).toContain(id)))
    db.schedules.forEach((s) => {
      const pool = s.target_type === 'pipeline' ? db.pipelines.map((p) => p.id) : s.target_type === 'source_sync' ? [...sourceIds] : [...transformationIds]
      expect(pool, `schedule ${s.id}`).toContain(s.target_id)
    })
    db.dashboards.forEach((d) => d.datasets.forEach((ds) => expect(modelIds, `dashboard ${d.id}`).toContain(ds.model_id)))
    db.reports.forEach((r) => expect(modelIds, `report ${r.id}`).toContain(r.dataset.model_id))
    db.relationships.forEach((r) => expect(modelIds).toContain(r.to_model_id))
    Object.entries(db.lineage).forEach(([id, ups]) => ups.forEach((u) => expect(modelIds.has(u) || sourceIds.has(u), `${id} <- ${u}`).toBe(true)))
    db.transformations.forEach((t) => t.depends_on.forEach((d) => expect(transformationIds.has(d) || modelIds.has(d), `${t.id} <- ${d}`).toBe(true)))
    db.runs.forEach((r) => {
      if (r.source_id) expect(sourceIds).toContain(r.source_id)
      if (r.transformation_id) expect(transformationIds).toContain(r.transformation_id)
    })
  })

  it('uses unique ids', () => {
    for (const list of [db.runs, db.models, db.qualityChecks, db.auditEvents, db.notifications]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length)
    }
  })

  it('records privileged audit events only for members whose role allows them', () => {
    const roleOf = new Map(db.memberships.filter((m) => m.workspace_id === 'ws_acme').map((m) => [m.user_id, m.role]))
    const needs: Record<string, Permission> = {
      'member.role_changed': 'members:manage',
      'settings.metabase_updated': 'settings:manage',
      'schedule.updated': 'schedules:write',
      'transformation.sql_updated': 'transformations:write',
      'audit.exported': 'audit:export',
    }
    const checked = db.auditEvents.filter((e) => e.workspace_id === 'ws_acme' && e.actor.type === 'user' && needs[e.action])
    expect(checked.length).toBeGreaterThan(0)
    for (const e of checked) {
      const role = roleOf.get(e.actor.id)
      expect(role, `${e.id} actor`).toBeDefined()
      const holds = ROLE_PERMISSIONS[role!].includes(needs[e.action])
      expect(holds, `${e.id} ${e.action} by ${e.actor.name} (${role}, ${e.status})`).toBe(e.status !== 'denied')
    }
  })

  it('never reports a Metabase refresh as succeeded while Metabase is unreachable', () => {
    const refreshes = db.runs.flatMap((r) => r.stages.filter((s) => s.key === 'metabase_refresh'))
    expect(refreshes.length).toBeGreaterThan(0)
    expect(refreshes.some((s) => s.status === 'succeeded')).toBe(false)
    expect(refreshes.filter((s) => s.status === 'skipped').every((s) => s.skip_reason)).toBe(true)
  })

  it('starts with one in-flight simulated run', () => {
    expect(db.runs.filter((r) => r.sim && !r.sim.settled)).toHaveLength(1)
  })
})
