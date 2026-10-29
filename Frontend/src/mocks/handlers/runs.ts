import type { RunKind, RunStatus, StageKey } from '@/types'
import { isTerminal } from '@/types'
import type { RunRecord } from '../db'
import { metabaseRefreshUnavailable, persistentFailure } from '../engine/failures'
import { createSimRun, buildRunLogs, publicRun } from '../engine/runs'
import { httpError, paginate, qNumber, qString, type MockRoute } from '../router'
import { addRun, db, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'

const RUN_KINDS: RunKind[] = ['ingestion', 'pipeline', 'transformation', 'dbt_test', 'schema_apply']
const RUN_STATUSES: RunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped']

function permissionFor(kind: RunKind) {
  if (kind === 'ingestion') return 'sources:sync' as const
  if (kind === 'pipeline') return 'pipelines:run' as const
  return 'transformations:run' as const
}

/** Parses `kind` as one kind or a comma-separated list (kind=transformation,dbt_test). */
function kindFilter(value: string | undefined): RunKind[] | null {
  if (!value) return null
  const kinds = value.split(',').map((k) => k.trim()).filter(Boolean)
  const invalid = kinds.filter((k) => !RUN_KINDS.includes(k as RunKind))
  if (invalid.length) throw httpError.validation([{ field: 'kind', message: `Unknown run kind: ${invalid.join(', ')}. Use ${RUN_KINDS.join(', ')}.` }])
  return kinds as RunKind[]
}

/**
 * Stages the original run skipped by plan (a stage subset or an unavailable
 * integration), as opposed to stages skipped because an earlier stage failed.
 */
function plannedSkips(run: RunRecord): StageKey[] {
  const failedIndex = run.stages.findIndex((s) => s.status === 'failed')
  return run.stages.filter((s, i) => s.status === 'skipped' && !s.started_at && (failedIndex === -1 || i < failedIndex)).map((s) => s.key)
}

/** Records of the latest successful run of the same target, so a retry reports a realistic volume. */
function typicalRecords(run: RunRecord) {
  const sameTarget = (r: RunRecord) =>
    run.kind === 'pipeline' ? r.pipeline_id === run.pipeline_id : run.kind === 'ingestion' ? r.source_id === run.source_id : r.transformation_id === run.transformation_id
  const previous = db.runs.find((r) => r.kind === run.kind && r.status === 'succeeded' && r.records_processed && sameTarget(r))
  return previous?.records_processed ?? (run.kind === 'pipeline' || run.kind === 'ingestion' ? 1200 : 0)
}

/** Refuses a pipeline retry the pipelines trigger would also refuse (409). */
function assertPipelineRunnable(run: RunRecord) {
  const pipeline = db.pipelines.find((p) => p.id === run.pipeline_id)
  if (!pipeline) {
    throw httpError.conflict('pipeline_not_runnable', `The pipeline "${run.target_name}" has been deleted, so this run cannot be retried.`, { status: 'deleted' })
  }
  if (pipeline.status !== 'active') {
    throw httpError.conflict(
      'pipeline_not_runnable',
      pipeline.status === 'draft' ? `"${pipeline.name}" is a draft. Activate it before retrying.` : `"${pipeline.name}" is paused. Resume it before retrying.`,
      { status: pipeline.status },
    )
  }
  const active = db.runs.find((r) => r.pipeline_id === pipeline.id && !isTerminal(r.status))
  if (active) {
    throw httpError.conflict('run_in_progress', `Run ${active.id} is already ${active.status} for "${pipeline.name}". Wait for it to finish before retrying.`, { run_id: active.id })
  }
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/runs',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const kinds = kindFilter(qString(ctx, 'kind'))
      const status = qString(ctx, 'status') as RunStatus | undefined
      if (status && !RUN_STATUSES.includes(status)) {
        throw httpError.validation([{ field: 'status', message: `Status must be one of ${RUN_STATUSES.join(', ')}.` }])
      }
      const items = db.runs
        .filter((r) => r.workspace_id === ctx.params.workspaceId)
        .filter((r) => !kinds || kinds.includes(r.kind))
        .filter((r) => !status || r.status === status)
        .sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))
        .map(publicRun)
      return paginate(items, ctx, 25)
    },
  },
  {
    method: 'GET',
    path: '/runs/:runId',
    handler: (ctx) => {
      const run = findOr404(db.runs, ctx.params.runId, 'Run')
      requireWorkspace(ctx, run.workspace_id)
      return publicRun(run)
    },
  },
  {
    method: 'GET',
    path: '/runs/:runId/logs',
    handler: (ctx) => {
      const run = findOr404(db.runs, ctx.params.runId, 'Run')
      requireWorkspace(ctx, run.workspace_id)
      const after = qNumber(ctx, 'after', 0)
      const level = qString(ctx, 'level')
      const all = buildRunLogs(run)
      const lines = all.filter((l) => l.seq > after).filter((l) => !level || l.level === level)
      return { run_id: run.id, lines, next_cursor: all.length ? all[all.length - 1].seq : after, complete: isTerminal(run.status) }
    },
  },
  {
    method: 'POST',
    path: '/runs/:runId/retry',
    handler: (ctx) => {
      const original = findOr404(db.runs, ctx.params.runId, 'Run')
      const { user } = requirePermission(ctx, original.workspace_id, permissionFor(original.kind))
      if (!['failed', 'cancelled'].includes(original.status)) {
        throw httpError.conflict('run_not_retryable', `Only failed or cancelled runs can be retried (current status: ${original.status}).`)
      }
      if (original.error && !original.error.retryable) {
        throw httpError.conflict('run_not_retryable', `This failure is not retryable: ${original.error.message} Fix the underlying issue and trigger a new run.`)
      }
      if (original.kind === 'pipeline') assertPipelineRunnable(original)

      const stages = original.stages.map((s) => s.key)
      const skipped = new Set(plannedSkips(original))
      // The demo API can never reach Metabase, so a refresh is reported as skipped rather than simulated as successful.
      const metabaseUnavailable = metabaseRefreshUnavailable(db, original.workspace_id, stages)
      if (metabaseUnavailable) skipped.add('metabase_refresh')
      const executed = stages.filter((s) => !skipped.has(s))
      // A cause that is still there (source credentials, the Finance data problem, broken SQL) fails the retry the same way.
      const persistent = persistentFailure(db, original, executed)
      if (persistent?.error.stage === 'quality_checks' && stages.includes('metabase_refresh')) skipped.add('metabase_refresh')
      const syncs = executed.includes('ingestion') || original.kind === 'ingestion'

      const run = addRun(
        createSimRun({
          workspaceId: original.workspace_id,
          kind: original.kind,
          trigger: 'retry',
          triggeredBy: { id: user.id, name: user.name },
          targetName: original.target_name,
          links: {
            pipeline_id: original.pipeline_id,
            source_id: persistent?.sourceId ?? original.source_id,
            transformation_id: original.transformation_id,
            schedule_id: original.schedule_id,
            schema_proposal_id: original.schema_proposal_id,
          },
          stages,
          skipped: [...skipped],
          failAt: persistent?.error ?? null,
          records: original.kind === 'pipeline' && !syncs ? 0 : typicalRecords(original),
          tables: syncs ? original.tables.map((t) => ({ table: t.table, mode: t.mode })) : [],
          retryOf: original.id,
          attempt: original.attempt + 1,
        }),
      )
      recordAudit({
        workspaceId: run.workspace_id,
        actor: userActor(user),
        action: 'run.retried',
        resource: { type: 'run', id: original.id, name: original.target_name },
        executionId: run.id,
        metadata: {
          attempt: run.attempt,
          skipped_stages: [...skipped],
          simulated: true,
          ...(metabaseUnavailable ? { metabase_refresh_skipped: 'Metabase is not connected' } : {}),
        },
      })
      return publicRun(run)
    },
  },
  {
    method: 'POST',
    path: '/runs/:runId/cancel',
    handler: (ctx) => {
      const run = findOr404(db.runs, ctx.params.runId, 'Run')
      const { user } = requirePermission(ctx, run.workspace_id, permissionFor(run.kind))
      if (isTerminal(run.status) || !run.sim) {
        throw httpError.conflict('run_not_cancellable', `The run has already finished with status ${run.status}.`)
      }
      run.sim.cancelled_at_ms = Date.now()
      recordAudit({ workspaceId: run.workspace_id, actor: userActor(user), action: 'run.cancel_requested', resource: { type: 'run', id: run.id, name: run.target_name }, executionId: run.id })
      return publicRun(run)
    },
  },
]
