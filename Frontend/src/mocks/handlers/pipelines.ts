import type {
  CreatePipelineRequest,
  FieldError,
  Pipeline,
  PipelineStatus,
  RunError,
  RunStatus,
  StageKey,
  TriggerPipelineRunRequest,
  UpdatePipelineRequest,
} from '@/types'
import { isTerminal } from '@/types'
import { metabaseStatus } from '../engine/integrations'
import { ALL_STAGES, createSimRun, publicRun } from '../engine/runs'
import { body, httpError, matchesText, paginate, qString, type MockRoute } from '../router'
import {
  addRun,
  db,
  diffChanges,
  findOr404,
  pipelineView,
  recordAudit,
  requirePermission,
  requireWorkspace,
  userActor,
} from '../store'
import { newId, nowIso } from '../util'

const PIPELINE_STATUSES: PipelineStatus[] = ['active', 'paused', 'draft']
const RUN_STATUSES: RunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped']
/** dbt node selection syntax: methods (tag:, path:, source:), graph operators (+, @, *) and unions (spaces, commas). */
const SELECTOR_PATTERN = /^[A-Za-z0-9_.:/*+@,\- ]+$/

/** Seeded failure that keeps the Finance pipeline coherent with the demo story. */
const FINANCE_DUPLICATE_INVOICES: RunError = {
  stage: 'quality_checks',
  code: 'quality_checks_failed',
  message: '1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).',
  details:
    'Credit notes re-issued in the ERP reuse the original invoice_id. Downstream model agg_receivables_aging was not refreshed and Metabase refresh was skipped.',
  retryable: true,
}

function stagesFor(input: { quality_checks_enabled: boolean; metabase_refresh_enabled: boolean }): StageKey[] {
  return ALL_STAGES.filter(
    (stage) => (stage !== 'quality_checks' || input.quality_checks_enabled) && (stage !== 'metabase_refresh' || input.metabase_refresh_enabled),
  )
}

/** Schedules (from the schedules domain) that target this pipeline. */
function schedulesTargeting(pipelineId: string) {
  return db.schedules.filter((s) => s.target_type === 'pipeline' && s.target_id === pipelineId)
}

/** pipelineView plus a schedule link resolved from the schedules table when the pipeline record has none. */
function view(pipeline: Pipeline): Pipeline {
  const linked = pipeline.schedule_id && db.schedules.some((s) => s.id === pipeline.schedule_id) ? pipeline.schedule_id : null
  return pipelineView({ ...pipeline, schedule_id: linked ?? schedulesTargeting(pipeline.id)[0]?.id ?? null })
}

function activeRunFor(pipelineId: string) {
  return db.runs.find((r) => r.pipeline_id === pipelineId && !isTerminal(r.status)) ?? null
}

/** Validates the editable fields. `partial` skips required checks for keys that are absent (PATCH). */
function validate(workspaceId: string, input: Partial<CreatePipelineRequest>, partial: boolean, selfId?: string): FieldError[] {
  const errors: FieldError[] = []
  if (!partial || input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name.length < 2) errors.push({ field: 'name', message: 'Name must be at least 2 characters.' })
    else if (name.length > 80) errors.push({ field: 'name', message: 'Name must be 80 characters or fewer.' })
    else if (db.pipelines.some((p) => p.workspace_id === workspaceId && p.id !== selfId && p.name.toLowerCase() === name.toLowerCase())) {
      errors.push({ field: 'name', message: `A pipeline named "${name}" already exists in this workspace.` })
    }
  }
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') errors.push({ field: 'description', message: 'Description must be text.' })
    else if (input.description.length > 500) errors.push({ field: 'description', message: 'Description must be 500 characters or fewer.' })
  }
  if (!partial || input.source_ids !== undefined) {
    const ids = Array.isArray(input.source_ids) ? input.source_ids : []
    const workspaceSources = db.sources.filter((s) => s.workspace_id === workspaceId)
    if (!workspaceSources.length) {
      errors.push({ field: 'source_ids', message: 'This workspace has no data sources yet. Connect a source before creating a pipeline.' })
    } else if (!ids.length) {
      errors.push({ field: 'source_ids', message: 'Select at least one source.' })
    } else {
      const unknown = ids.filter((id) => !workspaceSources.some((s) => s.id === id))
      if (unknown.length) errors.push({ field: 'source_ids', message: `Unknown source${unknown.length > 1 ? 's' : ''} in this workspace: ${unknown.join(', ')}.` })
      if (new Set(ids).size !== ids.length) errors.push({ field: 'source_ids', message: 'Each source can only be selected once.' })
    }
  }
  if (!partial || input.dbt_selector !== undefined) {
    const selector = typeof input.dbt_selector === 'string' ? input.dbt_selector.trim() : ''
    if (!selector) errors.push({ field: 'dbt_selector', message: 'Enter a dbt selector, for example tag:sales+.' })
    else if (selector.length > 200) errors.push({ field: 'dbt_selector', message: 'Selector must be 200 characters or fewer.' })
    else if (!SELECTOR_PATTERN.test(selector)) {
      errors.push({ field: 'dbt_selector', message: 'Selector contains unsupported characters. Use dbt node selection syntax such as tag:finance+ or +fct_invoices.' })
    }
  }
  for (const key of ['quality_checks_enabled', 'metabase_refresh_enabled'] as const) {
    if ((!partial || input[key] !== undefined) && typeof input[key] !== 'boolean') errors.push({ field: key, message: 'Must be true or false.' })
  }
  return errors
}

function editableSnapshot(p: Pipeline) {
  return {
    name: p.name,
    description: p.description,
    status: p.status,
    source_ids: p.source_ids,
    dbt_selector: p.dbt_selector,
    quality_checks_enabled: p.quality_checks_enabled,
    metabase_refresh_enabled: p.metabase_refresh_enabled,
  }
}

/** Approximates records per run from recent successful runs, falling back to the sources' last sync volume. */
function estimatedRecords(pipeline: Pipeline, fullRefresh: boolean) {
  const recent = db.runs.filter((r) => r.pipeline_id === pipeline.id && r.status === 'succeeded' && r.records_processed).slice(0, 5)
  const base = recent.length
    ? Math.round(recent.reduce((sum, r) => sum + (r.records_processed ?? 0), 0) / recent.length)
    : db.sources.filter((s) => pipeline.source_ids.includes(s.id)).reduce((sum, s) => sum + (s.last_sync_records ?? 0), 0) || 1200
  // A full refresh re-extracts every row instead of the incremental delta.
  return fullRefresh ? base * 4 : base
}

function tablesFor(pipeline: Pipeline, fullRefresh: boolean) {
  return db.sources
    .filter((s) => pipeline.source_ids.includes(s.id))
    .flatMap((s) =>
      s.selected_tables.map((t) => ({
        table: `${t.schema}.${t.name}`,
        mode: fullRefresh ? ('full' as const) : t.ingestion_mode,
      })),
    )
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/pipelines',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const q = qString(ctx, 'q')?.trim()
      const status = qString(ctx, 'status')
      const lastRunStatus = qString(ctx, 'last_run_status')
      const sourceId = qString(ctx, 'source_id')
      if (status && !PIPELINE_STATUSES.includes(status as PipelineStatus)) {
        throw httpError.validation([{ field: 'status', message: `Status must be one of ${PIPELINE_STATUSES.join(', ')}.` }])
      }
      if (lastRunStatus && !RUN_STATUSES.includes(lastRunStatus as RunStatus)) {
        throw httpError.validation([{ field: 'last_run_status', message: `Run status must be one of ${RUN_STATUSES.join(', ')}.` }])
      }
      return db.pipelines
        .filter((p) => p.workspace_id === ctx.params.workspaceId)
        .filter((p) => matchesText(q, p.name, p.description, p.dbt_selector))
        .filter((p) => !status || p.status === status)
        .filter((p) => !sourceId || p.source_ids.includes(sourceId))
        .map(view)
        .filter((p) => !lastRunStatus || p.last_run?.status === lastRunStatus)
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/pipelines',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user } = requirePermission(ctx, workspaceId, 'pipelines:write')
      const input = body<CreatePipelineRequest>(ctx)
      const errors = validate(workspaceId, input, false)
      if (errors.length) throw httpError.validation(errors)
      const now = nowIso()
      const flags = { quality_checks_enabled: input.quality_checks_enabled, metabase_refresh_enabled: input.metabase_refresh_enabled }
      const pipeline: Pipeline = {
        id: newId('pl'),
        workspace_id: workspaceId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        status: 'active',
        source_ids: [...input.source_ids],
        dbt_selector: input.dbt_selector.trim(),
        stages: stagesFor(flags),
        ...flags,
        schedule_id: null,
        next_run_at: null,
        last_run: null,
        success_rate_7d: null,
        avg_duration_seconds: null,
        owner: { id: user.id, name: user.name },
        created_at: now,
        updated_at: now,
      }
      db.pipelines.unshift(pipeline)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'pipeline.created',
        resource: { type: 'pipeline', id: pipeline.id, name: pipeline.name },
        changes: diffChanges({}, editableSnapshot(pipeline)),
      })
      return view(pipeline)
    },
  },
  {
    method: 'GET',
    path: '/pipelines/:pipelineId',
    handler: (ctx) => {
      const pipeline = findOr404(db.pipelines, ctx.params.pipelineId, 'Pipeline')
      requireWorkspace(ctx, pipeline.workspace_id)
      return view(pipeline)
    },
  },
  {
    method: 'PATCH',
    path: '/pipelines/:pipelineId',
    handler: (ctx) => {
      const pipeline = findOr404(db.pipelines, ctx.params.pipelineId, 'Pipeline')
      const { user } = requirePermission(ctx, pipeline.workspace_id, 'pipelines:write')
      const input = body<UpdatePipelineRequest>(ctx)
      const errors = validate(pipeline.workspace_id, input, true, pipeline.id)
      if (input.status !== undefined && !PIPELINE_STATUSES.includes(input.status)) {
        errors.push({ field: 'status', message: `Status must be one of ${PIPELINE_STATUSES.join(', ')}.` })
      }
      if (errors.length) throw httpError.validation(errors)
      if (input.status === 'draft' && pipeline.status !== 'draft') {
        throw httpError.conflict('invalid_status_transition', 'An active or paused pipeline cannot be moved back to draft. Pause it instead.')
      }

      const before = editableSnapshot(pipeline)
      if (input.name !== undefined) pipeline.name = input.name.trim()
      if (input.description !== undefined) pipeline.description = (input.description ?? '').trim()
      if (input.source_ids !== undefined) pipeline.source_ids = [...input.source_ids]
      if (input.dbt_selector !== undefined) pipeline.dbt_selector = input.dbt_selector.trim()
      if (input.quality_checks_enabled !== undefined) pipeline.quality_checks_enabled = input.quality_checks_enabled
      if (input.metabase_refresh_enabled !== undefined) pipeline.metabase_refresh_enabled = input.metabase_refresh_enabled
      if (input.status !== undefined) pipeline.status = input.status
      pipeline.stages = stagesFor(pipeline)
      pipeline.updated_at = nowIso()

      const changes = diffChanges(before, editableSnapshot(pipeline))
      const onlyStatus = changes.length === 1 && changes[0].field === 'status'
      const action = onlyStatus ? (pipeline.status === 'paused' ? 'pipeline.paused' : before.status === 'draft' ? 'pipeline.activated' : 'pipeline.resumed') : 'pipeline.updated'
      if (changes.length) {
        recordAudit({ workspaceId: pipeline.workspace_id, actor: userActor(user), action, resource: { type: 'pipeline', id: pipeline.id, name: pipeline.name }, changes })
      }
      return view(pipeline)
    },
  },
  {
    method: 'DELETE',
    path: '/pipelines/:pipelineId',
    handler: (ctx) => {
      const pipeline = findOr404(db.pipelines, ctx.params.pipelineId, 'Pipeline')
      const { user } = requirePermission(ctx, pipeline.workspace_id, 'pipelines:write')
      const schedules = schedulesTargeting(pipeline.id)
      if (schedules.length) {
        throw httpError.conflict(
          'pipeline_has_schedules',
          `"${pipeline.name}" is the target of ${schedules.length === 1 ? 'a schedule' : `${schedules.length} schedules`}: ${schedules.map((s) => s.name).join(', ')}. Delete or retarget ${schedules.length === 1 ? 'it' : 'them'} first.`,
          { schedules: schedules.map((s) => ({ id: s.id, name: s.name })) },
        )
      }
      const active = activeRunFor(pipeline.id)
      if (active) {
        throw httpError.conflict('run_in_progress', `Run ${active.id} is still ${active.status}. Cancel it or wait for it to finish before deleting the pipeline.`, { run_id: active.id })
      }
      db.pipelines = db.pipelines.filter((p) => p.id !== pipeline.id)
      recordAudit({ workspaceId: pipeline.workspace_id, actor: userActor(user), action: 'pipeline.deleted', resource: { type: 'pipeline', id: pipeline.id, name: pipeline.name }, changes: diffChanges(editableSnapshot(pipeline), {}) })
      return null
    },
  },
  {
    method: 'POST',
    path: '/pipelines/:pipelineId/runs',
    handler: (ctx) => {
      const pipeline = findOr404(db.pipelines, ctx.params.pipelineId, 'Pipeline')
      const { user } = requirePermission(ctx, pipeline.workspace_id, 'pipelines:run')
      const input = body<TriggerPipelineRunRequest>(ctx)

      if (input.full_refresh !== undefined && typeof input.full_refresh !== 'boolean') {
        throw httpError.validation([{ field: 'full_refresh', message: 'full_refresh must be true or false.' }])
      }
      if (input.stages !== undefined) {
        if (!Array.isArray(input.stages) || !input.stages.length) throw httpError.validation([{ field: 'stages', message: 'Select at least one stage to run.' }])
        const invalid = input.stages.filter((s) => !pipeline.stages.includes(s))
        if (invalid.length) throw httpError.validation([{ field: 'stages', message: `Not part of this pipeline: ${invalid.join(', ')}.` }])
      }
      if (pipeline.status !== 'active') {
        throw httpError.conflict(
          'pipeline_not_runnable',
          pipeline.status === 'draft' ? `"${pipeline.name}" is a draft. Activate it before running.` : `"${pipeline.name}" is paused. Resume it before running.`,
          { status: pipeline.status },
        )
      }
      const active = activeRunFor(pipeline.id)
      if (active) {
        throw httpError.conflict('run_in_progress', `Run ${active.id} is already ${active.status} for "${pipeline.name}".`, { run_id: active.id })
      }

      const fullRefresh = input.full_refresh ?? false
      const executed = input.stages ?? pipeline.stages
      const skipped = new Set(pipeline.stages.filter((s) => !executed.includes(s)))

      // A misconfigured source fails at connection time; otherwise Finance trips its duplicate-invoice test.
      let failAt: RunError | null = null
      const brokenSource = pipeline.source_ids.find((id) => db.sourceFailures[id])
      if (brokenSource && executed.includes('source_connect')) failAt = db.sourceFailures[brokenSource]
      else if (pipeline.id === 'pl_finance' && executed.includes('quality_checks')) {
        failAt = FINANCE_DUPLICATE_INVOICES
        if (pipeline.stages.includes('metabase_refresh')) skipped.add('metabase_refresh')
      }
      // The demo API can never reach Metabase, so a refresh is reported as skipped rather than simulated as successful.
      const metabase = metabaseStatus(db, pipeline.workspace_id)
      const metabaseUnavailable = executed.includes('metabase_refresh') && metabase.status !== 'connected'
      if (metabaseUnavailable) skipped.add('metabase_refresh')

      const run = addRun(
        createSimRun({
          workspaceId: pipeline.workspace_id,
          kind: 'pipeline',
          trigger: 'manual',
          triggeredBy: { id: user.id, name: user.name },
          targetName: pipeline.name,
          // Link the failing source when there is one, so settlement and retries attribute the failure correctly.
          links: { pipeline_id: pipeline.id, source_id: (failAt?.stage === 'source_connect' ? brokenSource : null) ?? pipeline.source_ids[0] ?? null },
          stages: pipeline.stages,
          skipped: [...skipped],
          failAt,
          records: executed.includes('ingestion') ? estimatedRecords(pipeline, fullRefresh) : 0,
          tables: executed.includes('ingestion') ? tablesFor(pipeline, fullRefresh) : [],
        }),
      )
      recordAudit({
        workspaceId: pipeline.workspace_id,
        actor: userActor(user),
        action: 'pipeline.run_triggered',
        resource: { type: 'pipeline', id: pipeline.id, name: pipeline.name },
        executionId: run.id,
        metadata: {
          full_refresh: fullRefresh,
          stages: executed,
          simulated: true,
          ...(metabaseUnavailable ? { metabase_refresh_skipped: `Metabase status: ${metabase.status}` } : {}),
        },
      })
      return publicRun(run)
    },
  },
  {
    method: 'GET',
    path: '/pipelines/:pipelineId/runs',
    handler: (ctx) => {
      const pipeline = findOr404(db.pipelines, ctx.params.pipelineId, 'Pipeline')
      requireWorkspace(ctx, pipeline.workspace_id)
      const status = qString(ctx, 'status')
      if (status && !RUN_STATUSES.includes(status as RunStatus)) {
        throw httpError.validation([{ field: 'status', message: `Status must be one of ${RUN_STATUSES.join(', ')}.` }])
      }
      const items = db.runs.filter((r) => r.pipeline_id === pipeline.id && (!status || r.status === status)).map(publicRun)
      return paginate(items, ctx, 20)
    },
  },
]
