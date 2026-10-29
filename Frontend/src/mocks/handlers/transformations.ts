import type {
  AuditChange,
  DbtProject,
  RunKind,
  RunStatus,
  RunTransformationRequest,
  TestResult,
  Transformation,
  TransformationSummary,
  TransformationType,
  UpdateTransformationRequest,
} from '@/types'
import { isTerminal } from '@/types'
import type { RunRecord } from '../db'
import { checksFor as checksForModel, compileError, testFailure } from '../engine/dbt'
import { createSimRun, publicRun } from '../engine/runs'
import { MockHttpError, body, httpError, paginate, qString, type MockContext, type MockRoute } from '../router'
import { addRun, db, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { nowIso } from '../util'

const TYPES: TransformationType[] = ['staging', 'intermediate', 'silver', 'gold']
const TYPE_ORDER: Record<TransformationType, number> = { staging: 0, intermediate: 1, silver: 2, gold: 3 }
const RUN_STATUSES: RunStatus[] = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped']
const RUN_KINDS: RunKind[] = ['transformation', 'dbt_test']
const TEST_ORDER: Record<TestResult['status'], number> = { failed: 0, warning: 1, not_run: 2, passed: 3 }

const MAX_SQL_LENGTH = 100_000
const MAX_DESCRIPTION_LENGTH = 2_000
const MAX_COMMIT_MESSAGE_LENGTH = 200

// ---------------------------------------------------------------------------
// Lookups. Transformations carry no workspace_id; it comes from the dbt project.
// ---------------------------------------------------------------------------

function projectFor(workspaceId: string) {
  return db.dbtProjects.find((p) => p.workspace_id === workspaceId) ?? null
}

function workspaceOf(t: Transformation) {
  const project = db.dbtProjects.find((p) => p.id === t.project_id)
  if (!project) throw httpError.notFound('dbt project', t.project_id)
  return project.workspace_id
}

/** Resolves a transformation and enforces workspace access (read) or a permission (write). */
function load(ctx: MockContext, permission?: 'transformations:write' | 'transformations:run') {
  const t = findOr404(db.transformations, ctx.params.transformationId, 'Transformation')
  const workspaceId = workspaceOf(t)
  const access = permission ? requirePermission(ctx, workspaceId, permission) : requireWorkspace(ctx, workspaceId)
  return { t, workspaceId, user: access.user }
}

function activeRun(transformationId: string, kind: RunKind) {
  return db.runs.find((r) => r.transformation_id === transformationId && r.kind === kind && !isTerminal(r.status)) ?? null
}

function checksFor(t: Transformation) {
  return checksForModel(db, t)
}

/**
 * Live view of a transformation: test counts are derived from the current quality
 * checks, and an in-flight dbt run is reported as the latest run status.
 */
function view(t: Transformation): Transformation {
  const checks = checksFor(t)
  const running = activeRun(t.id, 'transformation')
  return {
    ...t,
    last_run_status: running ? running.status : t.last_run_status,
    tests: checks.length
      ? {
          total: checks.length,
          passed: checks.filter((c) => c.status === 'passed').length,
          failed: checks.filter((c) => c.status === 'failed').length,
          warned: checks.filter((c) => c.status === 'warning').length,
        }
      : t.tests,
  }
}

function summary(t: Transformation): TransformationSummary {
  const { sql: _sql, columns: _columns, ...rest } = view(t)
  return rest
}

function projectView(project: DbtProject): DbtProject {
  const transformations = db.transformations.filter((t) => t.project_id === project.id)
  const outputIds = new Set(transformations.map((t) => t.output_model_id).filter(Boolean))
  return {
    ...project,
    models_count: transformations.length,
    tests_count: db.qualityChecks.filter((c) => outputIds.has(c.model_id)).length,
  }
}

// ---------------------------------------------------------------------------
// Dependency graph helpers (dbt graph operators "+model" and "model+").
// ---------------------------------------------------------------------------

function upstreamOf(t: Transformation, seen = new Set<string>()): Transformation[] {
  const result: Transformation[] = []
  for (const dep of t.depends_on) {
    const parent = db.transformations.find((x) => x.id === dep)
    if (!parent || seen.has(parent.id)) continue
    seen.add(parent.id)
    result.push(parent, ...upstreamOf(parent, seen))
  }
  return result
}

function downstreamOf(t: Transformation, seen = new Set<string>()): Transformation[] {
  const result: Transformation[] = []
  for (const child of db.transformations.filter((x) => x.depends_on.includes(t.id))) {
    if (seen.has(child.id)) continue
    seen.add(child.id)
    result.push(child, ...downstreamOf(child, seen))
  }
  return result
}

function lineCount(sql: string) {
  return sql.replace(/\n$/, '').split('\n').length
}

/** Short diff summary (line counts only) so the audit trail never stores model SQL. */
function diffSummary(before: string, after: string) {
  const counts = new Map<string, number>()
  before.split('\n').forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1))
  let added = 0
  after.split('\n').forEach((line) => {
    const n = counts.get(line) ?? 0
    if (n > 0) counts.set(line, n - 1)
    else added += 1
  })
  const removed = [...counts.values()].reduce((sum, n) => sum + n, 0)
  return { lines_added: added, lines_removed: removed, lines_before: lineCount(before), lines_after: lineCount(after) }
}

function optionalBoolean(value: unknown, field: string, errors: { field: string; message: string }[]) {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') {
    errors.push({ field, message: `${field} must be true or false.` })
    return false
  }
  return value
}

function enumParam<T extends string>(ctx: MockContext, key: string, allowed: readonly T[]): T | undefined {
  const value = qString(ctx, key)
  if (!value || value === 'all') return undefined
  if (!allowed.includes(value as T)) {
    throw httpError.validation([{ field: key, message: `Unknown ${key} "${value}". Expected one of: ${allowed.join(', ')}.` }])
  }
  return value as T
}

function activeRunConflict(run: RunRecord, t: Transformation, what: string) {
  return httpError.conflict(
    run.kind === 'dbt_test' ? 'transformation_test_in_progress' : 'transformation_run_in_progress',
    `${what} for ${t.name} is already ${run.status} (run ${run.id}). Wait for it to finish or cancel it first.`,
    { run_id: run.id },
  )
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/dbt-project',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const project = projectFor(ctx.params.workspaceId)
      if (!project) {
        throw new MockHttpError(
          404,
          'dbt_not_configured',
          'No dbt project is connected to this workspace. An admin can connect the dbt repository under Settings > dbt project.',
        )
      }
      return projectView(project)
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/transformations',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const type = enumParam(ctx, 'type', TYPES)
      const status = enumParam(ctx, 'status', RUN_STATUSES)
      const tag = qString(ctx, 'tag')
      const q = qString(ctx, 'q')?.trim().toLowerCase()
      const project = projectFor(ctx.params.workspaceId)
      if (!project) return []
      return db.transformations
        .filter((t) => t.project_id === project.id)
        .map(summary)
        .filter((t) => !type || t.type === type)
        .filter((t) => !status || t.last_run_status === status)
        .filter((t) => !tag || tag === 'all' || t.tags.includes(tag))
        .filter((t) => !q || [t.name, t.unique_id, t.description, t.schema, t.owner, ...t.tags].some((f) => f.toLowerCase().includes(q)))
        .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name))
    },
  },
  {
    method: 'GET',
    path: '/transformations/:transformationId',
    handler: (ctx) => view(load(ctx).t),
  },
  {
    method: 'PATCH',
    path: '/transformations/:transformationId',
    handler: (ctx) => {
      const { t, workspaceId, user } = load(ctx, 'transformations:write')
      const input = body<UpdateTransformationRequest>(ctx)
      const errors: { field: string; message: string }[] = []

      if (input.sql === undefined && input.description === undefined) {
        throw httpError.validation([{ field: 'sql', message: 'Provide the model SQL or a description to update.' }])
      }
      if (input.sql !== undefined) {
        if (typeof input.sql !== 'string' || !input.sql.trim()) errors.push({ field: 'sql', message: 'The model SQL cannot be empty.' })
        else if (!/\bselect\b/i.test(input.sql.replace(/--.*$/gm, ''))) errors.push({ field: 'sql', message: 'A dbt model must contain a select statement.' })
        else if (input.sql.length > MAX_SQL_LENGTH) errors.push({ field: 'sql', message: `The model SQL must be at most ${MAX_SQL_LENGTH.toLocaleString('en-US')} characters.` })
      }
      if (input.description !== undefined) {
        if (typeof input.description !== 'string') errors.push({ field: 'description', message: 'Description must be text.' })
        else if (input.description.length > MAX_DESCRIPTION_LENGTH) errors.push({ field: 'description', message: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` })
      }
      if (input.commit_message !== undefined && input.commit_message !== null) {
        if (typeof input.commit_message !== 'string') errors.push({ field: 'commit_message', message: 'Commit message must be text.' })
        else if (input.commit_message.trim().length > MAX_COMMIT_MESSAGE_LENGTH) errors.push({ field: 'commit_message', message: `Commit message must be at most ${MAX_COMMIT_MESSAGE_LENGTH} characters.` })
      }
      if (errors.length) throw httpError.validation(errors)

      const sqlChanged = input.sql !== undefined && input.sql !== t.sql
      const descriptionChanged = input.description !== undefined && input.description.trim() !== t.description
      if (!sqlChanged && !descriptionChanged) return view(t)

      const commitMessage = input.commit_message?.trim() || `Update ${t.name} via Graphite`
      const changes: AuditChange[] = []
      const metadata: Record<string, unknown> = {
        commit_message: commitMessage,
        repository_branch: db.dbtProjects.find((p) => p.id === t.project_id)?.branch ?? null,
        simulated: true,
      }
      if (sqlChanged) {
        const diff = diffSummary(t.sql, input.sql!)
        Object.assign(metadata, diff)
        changes.push({ field: 'sql', before: `${diff.lines_before} lines`, after: `${diff.lines_after} lines (+${diff.lines_added} / -${diff.lines_removed})` })
        t.sql = input.sql!
      }
      if (descriptionChanged) {
        changes.push({ field: 'description', before: t.description, after: input.description!.trim() })
        t.description = input.description!.trim()
      }
      t.updated_at = nowIso()

      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: sqlChanged ? 'transformation.sql_updated' : 'transformation.updated',
        resource: { type: 'transformation', id: t.id, name: t.name },
        changes,
        metadata,
      })
      return view(t)
    },
  },
  {
    method: 'POST',
    path: '/transformations/:transformationId/run',
    handler: (ctx) => {
      const { t, workspaceId, user } = load(ctx, 'transformations:run')
      const input = body<RunTransformationRequest>(ctx)
      const errors: { field: string; message: string }[] = []
      const includeUpstream = optionalBoolean(input.include_upstream, 'include_upstream', errors)
      const includeDownstream = optionalBoolean(input.include_downstream, 'include_downstream', errors)
      const fullRefresh = optionalBoolean(input.full_refresh, 'full_refresh', errors)
      if (errors.length) throw httpError.validation(errors)

      const active = activeRun(t.id, 'transformation')
      if (active) throw activeRunConflict(active, t, 'A dbt run')

      const upstream = includeUpstream ? upstreamOf(t) : []
      const downstream = includeDownstream ? downstreamOf(t) : []
      const selector = `${includeUpstream ? '+' : ''}${t.name}${includeDownstream ? '+' : ''}`
      // Upstream models build first, so their compile errors surface before this model's.
      const failure = [...[...upstream].reverse(), t, ...downstream].map((x) => compileError(db, x)).find(Boolean) ?? null
      const outputRows = [t, ...upstream, ...downstream]
        .map((x) => db.models.find((m) => m.id === x.output_model_id)?.row_count ?? 0)
        .reduce((sum, n) => sum + n, 0)

      const run = addRun(
        createSimRun({
          workspaceId,
          kind: 'transformation',
          trigger: 'manual',
          triggeredBy: { id: user.id, name: user.name },
          targetName: t.name,
          links: { transformation_id: t.id },
          failAt: failure,
          records: outputRows,
        }),
      )
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'transformation.run_requested',
        resource: { type: 'transformation', id: t.id, name: t.name },
        executionId: run.id,
        metadata: {
          include_upstream: includeUpstream,
          include_downstream: includeDownstream,
          full_refresh: fullRefresh,
          selector,
          models_selected: 1 + upstream.length + downstream.length,
          simulated: true,
        },
      })
      return publicRun(run)
    },
  },
  {
    method: 'POST',
    path: '/transformations/:transformationId/test',
    handler: (ctx) => {
      const { t, workspaceId, user } = load(ctx, 'transformations:run')
      const active = activeRun(t.id, 'dbt_test')
      if (active) throw activeRunConflict(active, t, 'A dbt test run')

      const checks = checksFor(t)
      if (!checks.length) {
        throw httpError.conflict(
          'transformation_has_no_tests',
          `${t.name} has no tests defined. Add tests to its schema.yml in the dbt repository, then run dbt test.`,
        )
      }
      const failing = checks.filter((c) => c.status === 'failed' && c.severity === 'error')
      const warnings = checks.filter((c) => c.status === 'warning')
      const failAt = testFailure(db, t)

      const run = addRun(
        createSimRun({
          workspaceId,
          kind: 'dbt_test',
          trigger: 'manual',
          triggeredBy: { id: user.id, name: user.name },
          targetName: t.name,
          links: { transformation_id: t.id },
          failAt,
        }),
      )
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'transformation.test_requested',
        resource: { type: 'transformation', id: t.id, name: t.name },
        executionId: run.id,
        metadata: { tests_selected: checks.length, expected_failures: failing.length, expected_warnings: warnings.length, simulated: true },
      })
      return publicRun(run)
    },
  },
  {
    method: 'GET',
    path: '/transformations/:transformationId/runs',
    handler: (ctx) => {
      const { t } = load(ctx)
      const kind = enumParam(ctx, 'kind', RUN_KINDS)
      const status = enumParam(ctx, 'status', RUN_STATUSES)
      const items = db.runs
        .filter((r) => r.transformation_id === t.id)
        .filter((r) => !kind || r.kind === kind)
        .filter((r) => !status || r.status === status)
        .sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))
        .map(publicRun)
      return paginate(items, ctx, 10)
    },
  },
  {
    method: 'GET',
    path: '/transformations/:transformationId/tests',
    handler: (ctx): TestResult[] => {
      const { t } = load(ctx)
      return checksFor(t)
        .map((c) => ({
          id: c.id,
          name: c.name,
          column: c.column,
          test_type: c.check_type,
          status: c.status,
          failing_rows: c.failing_rows,
          message: c.message,
          last_run_at: c.last_run_at,
        }))
        .sort((a, b) => TEST_ORDER[a.status] - TEST_ORDER[b.status] || a.name.localeCompare(b.name))
    },
  },
]
