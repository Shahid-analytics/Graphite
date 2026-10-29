import type { AuditChange, CreateWorkspaceRequest, OnboardingStepKey, Permission, UpdateOnboardingRequest, UpdateWorkspaceRequest } from '@/types'
import type { WorkspaceRecord } from '../db'
import { body, httpError, MockHttpError, type MockRoute } from '../router'
import { createSettings } from '../seed/core'
import { db, diffChanges, recordAudit, requirePermission, requireUser, requireWorkspace, userActor, workspaceView } from '../store'
import { newId, nowIso } from '../util'

const STEPS: OnboardingStepKey[] = ['source', 'destination', 'ingestion', 'transformation', 'analytics']

/** Permission needed to mark each onboarding step; matches the permission of the step's own actions. */
const STEP_PERMISSIONS: Record<OnboardingStepKey, Permission> = {
  source: 'sources:write',
  ingestion: 'sources:write',
  destination: 'settings:manage',
  transformation: 'settings:manage',
  analytics: 'settings:manage',
}

const REGIONS = ['ap-south-1 (Mumbai)', 'ap-southeast-1 (Singapore)', 'eu-west-1 (Ireland)', 'us-east-1 (N. Virginia)']
const NAME_MAX = 80

type FieldError = { field: string; message: string }

/** IANA zone names only ("Asia/Kolkata", "UTC"); offsets such as "+05:30" are rejected. */
function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function validateName(name: unknown, errors: FieldError[]) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length < 2) errors.push({ field: 'name', message: 'Workspace name must be at least 2 characters.' })
  else if (trimmed.length > NAME_MAX) errors.push({ field: 'name', message: `Workspace name must be at most ${NAME_MAX} characters.` })
  return trimmed
}

function validateTimezone(timezone: unknown, errors: FieldError[]) {
  if (!isIanaTimezone(timezone)) errors.push({ field: 'timezone', message: 'Choose a valid IANA timezone, for example Asia/Kolkata.' })
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces',
    handler: (ctx) => {
      const user = requireUser(ctx)
      return db.memberships
        .filter((m) => m.user_id === user.id && m.status === 'active')
        .map((m) => workspaceView(m.workspace_id, user.id))
    },
  },
  {
    // The live API answers 201 Created; the mock transport has no success status, so callers only see the body.
    method: 'POST',
    path: '/workspaces',
    handler: (ctx) => {
      const user = requireUser(ctx)
      const input = body<CreateWorkspaceRequest>(ctx)
      const errors: FieldError[] = []
      const name = validateName(input.name, errors)
      if (!REGIONS.includes(input.region)) errors.push({ field: 'region', message: `region must be one of ${REGIONS.join(', ')}.` })
      validateTimezone(input.timezone, errors)
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (!errors.some((e) => e.field === 'name') && !slug) errors.push({ field: 'name', message: 'Workspace name must contain letters or digits.' })
      if (errors.length) throw httpError.validation(errors)
      if (db.workspaces.some((w) => w.slug === slug)) {
        const message = `A workspace named "${name}" already exists.`
        throw new MockHttpError(409, 'workspace_exists', message, { details: { slug }, fieldErrors: [{ field: 'name', message }] })
      }
      const ws: WorkspaceRecord = {
        id: newId('ws'),
        name,
        slug,
        industry: input.industry ?? null,
        region: input.region,
        timezone: input.timezone,
        plan: 'starter',
        created_at: nowIso(),
        onboarding: { steps: { source: false, destination: false, ingestion: false, transformation: false, analytics: false }, completed_at: null, dismissed: false },
      }
      db.workspaces.push(ws)
      db.memberships.push({ user_id: user.id, workspace_id: ws.id, role: 'owner', status: 'active', joined_at: nowIso(), last_active_at: nowIso() })
      const blank = createSettings()['ws_northwind']
      db.settings[ws.id] = structuredClone({ ...blank, scheduler: { ...blank.scheduler, default_timezone: ws.timezone } })
      recordAudit({ workspaceId: ws.id, actor: userActor(user), action: 'workspace.created', resource: { type: 'workspace', id: ws.id, name: ws.name } })
      return workspaceView(ws.id, user.id)
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId',
    handler: (ctx) => {
      const { user } = requireWorkspace(ctx, ctx.params.workspaceId)
      return workspaceView(ctx.params.workspaceId, user.id)
    },
  },
  {
    method: 'PATCH',
    path: '/workspaces/:workspaceId',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'workspace:manage')
      const input = body<UpdateWorkspaceRequest>(ctx)
      const errors: FieldError[] = []
      const name = input.name !== undefined ? validateName(input.name, errors) : undefined
      if (input.timezone !== undefined) validateTimezone(input.timezone, errors)
      if (errors.length) throw httpError.validation(errors)
      // Only these fields are editable; region, plan and onboarding cannot be changed here.
      const patch = Object.fromEntries(
        Object.entries({ name, industry: input.industry, timezone: input.timezone }).filter(([, v]) => v !== undefined),
      ) as Partial<Pick<WorkspaceRecord, 'name' | 'industry' | 'timezone'>>
      const before = { name: workspace.name, industry: workspace.industry, timezone: workspace.timezone }
      Object.assign(workspace, patch)
      recordAudit({ workspaceId: workspace.id, actor: userActor(user), action: 'workspace.updated', resource: { type: 'workspace', id: workspace.id, name: workspace.name }, changes: diffChanges(before, patch) })
      return workspaceView(workspace.id, user.id)
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/onboarding',
    handler: (ctx) => requireWorkspace(ctx, ctx.params.workspaceId).workspace.onboarding,
  },
  {
    method: 'PATCH',
    path: '/workspaces/:workspaceId/onboarding',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      requireWorkspace(ctx, workspaceId)
      const input = body<UpdateOnboardingRequest>(ctx)
      const errors: FieldError[] = []
      if (input.step === undefined && input.dismissed === undefined) {
        errors.push({ field: 'step', message: 'Provide a step to update or a dismissed flag.' })
      }
      if (input.step !== undefined && !STEPS.includes(input.step)) errors.push({ field: 'step', message: `step must be one of ${STEPS.join(', ')}.` })
      if (input.completed !== undefined && typeof input.completed !== 'boolean') errors.push({ field: 'completed', message: 'completed must be true or false.' })
      if (input.dismissed !== undefined && typeof input.dismissed !== 'boolean') errors.push({ field: 'dismissed', message: 'dismissed must be true or false.' })
      if (errors.length) throw httpError.validation(errors)

      // Each part of the request needs the permission of the setting it stands for.
      if (input.step !== undefined) requirePermission(ctx, workspaceId, STEP_PERMISSIONS[input.step])
      const { user, workspace } = input.dismissed !== undefined ? requirePermission(ctx, workspaceId, 'settings:manage') : requireWorkspace(ctx, workspaceId)

      const onboarding = workspace.onboarding
      const changes: AuditChange[] = []
      if (input.step !== undefined) {
        const next = input.completed ?? true
        if (onboarding.steps[input.step] !== next) changes.push({ field: `steps.${input.step}`, before: onboarding.steps[input.step], after: next })
        onboarding.steps[input.step] = next
      }
      if (input.dismissed !== undefined) {
        if (onboarding.dismissed !== input.dismissed) changes.push({ field: 'dismissed', before: onboarding.dismissed, after: input.dismissed })
        onboarding.dismissed = input.dismissed
      }
      const wasCompleted = onboarding.completed_at !== null
      const allDone = STEPS.every((s) => onboarding.steps[s])
      onboarding.completed_at = allDone ? (onboarding.completed_at ?? nowIso()) : null

      const resource = { type: 'workspace', id: workspace.id, name: workspace.name }
      if (changes.length) recordAudit({ workspaceId: workspace.id, actor: userActor(user), action: 'workspace.onboarding_updated', resource, changes })
      if (!wasCompleted && onboarding.completed_at) {
        recordAudit({ workspaceId: workspace.id, actor: userActor(user), action: 'workspace.onboarding_completed', resource, metadata: { completed_at: onboarding.completed_at } })
      }
      return onboarding
    },
  },
]
