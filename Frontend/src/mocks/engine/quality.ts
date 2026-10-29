import type { DataLayer, QualitySummary } from '@/types'
import type { MockDb } from '../db'
import { nowIso } from '../util'

export function computeQualitySummary(db: MockDb, workspaceId: string): QualitySummary {
  const modelIds = new Set(db.models.filter((m) => m.workspace_id === workspaceId).map((m) => m.id))
  const checks = db.qualityChecks.filter((c) => modelIds.has(c.model_id))
  const count = (status: string) => checks.filter((c) => c.status === status).length
  const passed = count('passed')
  const failed = count('failed')
  const warning = count('warning')
  const notRun = count('not_run')
  const executed = passed + failed + warning
  const byLayer = Object.fromEntries(
    (['bronze', 'silver', 'gold'] as DataLayer[]).map((layer) => {
      const inLayer = checks.filter((c) => c.layer === layer)
      return [layer, { passed: inLayer.filter((c) => c.status === 'passed').length, failed: inLayer.filter((c) => c.status === 'failed').length, warning: inLayer.filter((c) => c.status === 'warning').length }]
    }),
  ) as QualitySummary['by_layer']
  return {
    generated_at: nowIso(),
    total: checks.length,
    passed,
    failed,
    warning,
    not_run: notRun,
    pass_rate: executed ? passed / executed : 0,
    by_layer: byLayer,
    stale_models: db.models.filter((m) => modelIds.has(m.id) && m.freshness_status === 'stale').length,
    failing_checks: checks
      .filter((c) => c.status === 'failed' || c.status === 'warning')
      .sort((a, b) => (a.status === b.status ? b.failing_rows - a.failing_rows : a.status === 'failed' ? -1 : 1)),
  }
}
