import type { Pipeline, Run, RunError, StageKey } from '@/types'
import type { MockDb } from '../db'
import { compileError, testFailure } from './dbt'
import { metabaseStatus } from './integrations'

export const FINANCE_PIPELINE_ID = 'pl_finance'

/** Seeded data quality failure of the Finance pipeline (duplicate invoice ids from re-issued credit notes). */
export const FINANCE_DUPLICATE_INVOICES: RunError = {
  stage: 'quality_checks',
  code: 'quality_checks_failed',
  message: '1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).',
  details:
    'Credit notes re-issued in the ERP reuse the original invoice_id. Downstream model agg_receivables_aging was not refreshed and Metabase refresh was skipped.',
  retryable: true,
}

export interface ExpectedFailure {
  error: RunError
  /** Source that causes the failure, when it is a source problem. */
  sourceId: string | null
}

/** A source with a simulated connection failure fails any run that executes the failing stage. */
function sourceFailure(db: MockDb, sourceIds: (string | null)[], executed: StageKey[]): ExpectedFailure | null {
  for (const id of sourceIds) {
    const failure = id ? db.sourceFailures[id] : undefined
    if (id && failure?.stage && executed.includes(failure.stage)) return { error: failure, sourceId: id }
  }
  return null
}

/**
 * Failure a pipeline run executing `executed` hits with the current demo state: a
 * misconfigured source fails at connection time, otherwise Finance trips its
 * duplicate-invoice test until the ERP data is fixed. Null when the run would succeed.
 */
export function pipelineFailure(db: MockDb, pipeline: Pipeline, executed: StageKey[]): ExpectedFailure | null {
  const broken = sourceFailure(db, pipeline.source_ids, executed)
  if (broken) return broken
  if (pipeline.id === FINANCE_PIPELINE_ID && executed.includes('quality_checks')) return { error: FINANCE_DUPLICATE_INVOICES, sourceId: null }
  return null
}

/**
 * Whether a new attempt of `run` would fail again because the cause is still there
 * (source credentials, the Finance data problem, broken SQL, failing tests). A
 * data-caused failure repeats with the original error, so a retry fails the same way.
 */
export function persistentFailure(db: MockDb, run: Run, executed: StageKey[]): ExpectedFailure | null {
  const sameDataProblem = (expected: ExpectedFailure | null): ExpectedFailure | null =>
    expected && run.error?.code === expected.error.code && run.error.stage === expected.error.stage && !expected.sourceId
      ? { error: run.error, sourceId: null }
      : expected
  if (run.kind === 'pipeline') {
    const pipeline = db.pipelines.find((p) => p.id === run.pipeline_id)
    return pipeline ? sameDataProblem(pipelineFailure(db, pipeline, executed)) : sourceFailure(db, [run.source_id], executed)
  }
  if (run.kind === 'ingestion') return sourceFailure(db, [run.source_id], executed)
  const t = db.transformations.find((x) => x.id === run.transformation_id)
  if (!t) return null
  if (run.kind === 'transformation') {
    const error = compileError(db, t)
    return error ? { error, sourceId: null } : null
  }
  if (run.kind === 'dbt_test') {
    const error = testFailure(db, t)
    return sameDataProblem(error ? { error, sourceId: null } : null)
  }
  return null
}

/**
 * True when a run of `stages` must report the Metabase refresh as skipped because the
 * integration is not connected (the demo API can never reach Metabase).
 */
export function metabaseRefreshUnavailable(db: MockDb, workspaceId: string, stages: StageKey[]) {
  return stages.includes('metabase_refresh') && metabaseStatus(db, workspaceId).status !== 'connected'
}
