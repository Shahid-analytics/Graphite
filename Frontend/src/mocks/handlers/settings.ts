import type {
  AiProviderConfig,
  AiProviderName,
  AuditRetentionSettings,
  ConnectionTestResponse,
  DbtProjectConfig,
  DestinationConfig,
  FieldError,
  HealthStatus,
  IntegrationStatus,
  InviteMemberRequest,
  Member,
  NotificationPreferences,
  NotificationType,
  Role,
  RoleDefinition,
  SchedulerDefaults,
  SecretState,
  SystemComponentHealth,
  SystemHealth,
  UpdateAiProviderRequest,
  UpdateDbtProjectRequest,
  UpdateDestinationRequest,
  UpdateMemberRequest,
  UpdateMetabaseConfigRequest,
  User,
} from '@/types'
import type { MembershipRecord, WorkspaceSettings } from '../db'
import { metabaseStatus } from '../engine/integrations'
import { ROLE_DESCRIPTIONS, ROLE_PERMISSIONS } from '../permissions'
import { body, httpError, MockHttpError, qString, type MockContext, type MockRoute } from '../router'
import { db, diffChanges, recordAudit, requirePermission, requireUser, requireWorkspace, userActor } from '../store'
import { newId, nowIso } from '../util'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const ROLE_ORDER: Role[] = ['owner', 'admin', 'editor', 'viewer']
const ASSIGNABLE_ROLES: Role[] = ['admin', 'editor', 'viewer']
const NOTIFICATION_TYPES: NotificationType[] = ['pipeline_failed', 'sync_completed', 'repeated_retries', 'quality_failed', 'schema_changed', 'stale_data']
const AI_PROVIDERS: AiProviderName[] = ['none', 'openai', 'anthropic', 'azure_openai', 'self_hosted']
const AI_PROVIDER_LABELS: Record<AiProviderName, string> = {
  none: 'None',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  self_hosted: 'Self-hosted model',
}
const SSL_MODES: DestinationConfig['ssl_mode'][] = ['disable', 'require', 'verify-full']
const SCHEMA_RE = /^[a-z][a-z0-9_]*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const HOST_RE = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const GIT_REF_RE = /^(?!-)(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.lock)$/
const SSH_REPO_RE = /^(?:ssh:\/\/[\w.-]+@[\w.-]+(?::\d+)?\/[\w./-]+|[\w.-]+@[\w.-]+:[\w./-]+)$/
const DB_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/
const SIMULATED_DB = '(simulated: no database was contacted)'
const SIMULATED_REPO = '(simulated: no repository was contacted)'
const SIMULATED_BACKEND = 'Simulated - no backend connected'

type Errors = FieldError[]

function failIf(errors: Errors) {
  if (errors.length) throw httpError.validation(errors)
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch {
    return false
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

function isValidTimezone(tz: string) {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Validates a write-only secret in an update request: a non-empty string sets it,
 * null clears it and an omitted key keeps the stored value.
 */
function checkSecret(errors: Errors, field: string, value: unknown) {
  if (value === undefined || value === null) return
  if (typeof value !== 'string' || !value.trim()) {
    errors.push({ field, message: 'Enter a value, or leave the field out to keep the stored secret.' })
  } else if (value.length > 4096) {
    errors.push({ field, message: 'The value is too long.' })
  }
}

/** Converts a secret request value into the stored SecretState. The value itself is discarded. */
function nextSecret(current: SecretState, value: string | null | undefined): SecretState {
  if (value === undefined) return current
  if (value === null) return { is_set: false, updated_at: null }
  return { is_set: true, updated_at: nowIso() }
}

function settingsFor(workspaceId: string): WorkspaceSettings {
  const settings = db.settings[workspaceId]
  if (!settings) throw httpError.notFound('Workspace settings', workspaceId)
  return settings
}

/** Keys present in the request (secret keys included only when sent). */
function definedEntries(input: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function memberView(membership: MembershipRecord): Member {
  const user = db.users.find((u) => u.id === membership.user_id)
  if (!user) throw httpError.notFound('User', membership.user_id)
  return {
    user,
    role: membership.role,
    status: membership.status,
    joined_at: membership.joined_at,
    last_active_at: membership.last_active_at,
  }
}

function findMembership(workspaceId: string, userId: string) {
  const membership = db.memberships.find((m) => m.workspace_id === workspaceId && m.user_id === userId)
  if (!membership) throw httpError.notFound('Member', userId)
  return membership
}

function nameFromEmail(email: string) {
  const local = email.split('@')[0] ?? email
  const words = local.split(/[._-]+/).filter(Boolean)
  if (!words.length) return email
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ---------------------------------------------------------------------------
// Destination
// ---------------------------------------------------------------------------

function validateDestination(input: Partial<UpdateDestinationRequest>, errors: Errors) {
  const host = str(input.host)
  if (!host) errors.push({ field: 'host', message: 'Enter the warehouse host name or IP address.' })
  else if (!HOST_RE.test(host)) errors.push({ field: 'host', message: 'Enter a host name such as warehouse.example.com, without a scheme or port.' })
  if (!isInt(input.port, 1, 65535)) errors.push({ field: 'port', message: 'Port must be a whole number between 1 and 65535.' })
  const database = str(input.database)
  if (!database) errors.push({ field: 'database', message: 'Enter the database name.' })
  else if (!DB_IDENT_RE.test(database)) errors.push({ field: 'database', message: 'Use letters, numbers, underscores or hyphens (max 63 characters).' })
  const username = str(input.username)
  if (!username) errors.push({ field: 'username', message: 'Enter the database user Graphite loads data as.' })
  else if (!DB_IDENT_RE.test(username)) errors.push({ field: 'username', message: 'Use letters, numbers, underscores or hyphens (max 63 characters).' })
  if (!input.ssl_mode || !SSL_MODES.includes(input.ssl_mode)) errors.push({ field: 'ssl_mode', message: 'Choose disable, require or verify-full.' })

  const schemaFields = ['bronze_schema', 'silver_schema', 'gold_schema'] as const
  const seen = new Map<string, string>()
  for (const field of schemaFields) {
    const value = str(input[field])
    if (!value) errors.push({ field, message: 'Enter a schema name.' })
    else if (!SCHEMA_RE.test(value) || value.length > 63) {
      errors.push({ field, message: 'Use lowercase letters, numbers and underscores, starting with a letter (max 63 characters).' })
    } else if (seen.has(value)) {
      errors.push({ field, message: `Must differ from the ${seen.get(value)} schema. Each layer needs its own schema.` })
    } else {
      seen.set(value, field.replace('_schema', ''))
    }
  }
  checkSecret(errors, 'password', input.password)
}

function testDestinationValues(values: { host: string; port: number; database: string; username: string; bronze_schema: string; silver_schema: string; gold_schema: string }, passwordSet: boolean): ConnectionTestResponse {
  const tested_at = nowIso()
  if (!values.host) {
    return { success: false, message: `No warehouse host is configured. Save the connection details, then test again ${SIMULATED_DB}`, tested_at }
  }
  if (values.host.toLowerCase().includes('fail')) {
    return { success: false, message: `Could not connect to ${values.host}:${values.port}: connection refused ${SIMULATED_DB}`, tested_at }
  }
  if (!passwordSet) {
    return { success: false, message: `Password authentication failed for user "${values.username}": no password is stored ${SIMULATED_DB}`, tested_at }
  }
  return {
    success: true,
    message: `Connected to ${values.host}:${values.port}/${values.database} as ${values.username}; schemas ${values.bronze_schema}, ${values.silver_schema} and ${values.gold_schema} are writable ${SIMULATED_DB}`,
    tested_at,
  }
}

// ---------------------------------------------------------------------------
// dbt
// ---------------------------------------------------------------------------

function isSshRepo(url: string) {
  return SSH_REPO_RE.test(url)
}

function validateDbt(input: Partial<UpdateDbtProjectRequest>, errors: Errors) {
  const repo = str(input.repository_url)
  if (!repo) errors.push({ field: 'repository_url', message: 'Enter the Git repository URL of the dbt project.' })
  else if (!isHttpsUrl(repo) && !isSshRepo(repo)) {
    errors.push({ field: 'repository_url', message: 'Use an HTTPS URL (https://git.example.com/org/repo.git) or an SSH address (git@git.example.com:org/repo.git).' })
  }
  const branch = str(input.branch)
  if (!branch) errors.push({ field: 'branch', message: 'Enter the branch to deploy, for example main.' })
  else if (!GIT_REF_RE.test(branch) || branch.length > 200) errors.push({ field: 'branch', message: 'Enter a valid Git branch name.' })
  const sub = str(input.project_subdirectory)
  if (sub && (sub.startsWith('/') || sub.split('/').includes('..') || !/^[\w./-]+$/.test(sub))) {
    errors.push({ field: 'project_subdirectory', message: 'Use a relative path inside the repository, such as dbt or analytics/dbt.' })
  }
  if (!/^\d+\.\d+$/.test(str(input.dbt_version))) errors.push({ field: 'dbt_version', message: 'Choose a dbt Core version such as 1.10.' })
  const target = str(input.target)
  if (!target) errors.push({ field: 'target', message: 'Enter the dbt target, for example prod.' })
  else if (!/^[a-z][a-z0-9_]*$/.test(target)) errors.push({ field: 'target', message: 'Use lowercase letters, numbers and underscores, starting with a letter.' })
  if (!isInt(input.threads, 1, 16)) errors.push({ field: 'threads', message: 'Threads must be a whole number between 1 and 16.' })
  checkSecret(errors, 'deploy_key', input.deploy_key)
}

// ---------------------------------------------------------------------------
// AI provider
// ---------------------------------------------------------------------------

function aiStatus(config: Pick<AiProviderConfig, 'provider' | 'enabled'>): HealthStatus {
  if (config.provider === 'none') return 'unknown'
  return config.enabled ? 'unknown' : 'paused'
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

function prefsKey(userId: string, workspaceId: string) {
  return `${userId}:${workspaceId}`
}

function defaultPrefs(user: User): NotificationPreferences {
  return {
    email_address: user.email,
    digest: 'daily',
    events: Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { in_app: true, email: t !== 'sync_completed' }])) as NotificationPreferences['events'],
  }
}

function prefsWorkspace(ctx: MockContext) {
  const workspaceId = qString(ctx, 'workspace_id')
  if (!workspaceId) throw httpError.validation([{ field: 'workspace_id', message: 'workspace_id is required.' }])
  return requireWorkspace(ctx, workspaceId)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const SEVERITY: Record<HealthStatus, number> = { healthy: 0, paused: 1, unknown: 2, degraded: 3, unhealthy: 4 }

function worst(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), 'healthy')
}

function destinationConfigured(d: DestinationConfig) {
  return Boolean(d.host && d.database && d.username && d.password.is_set)
}

function warehouseSummary(settings: WorkspaceSettings) {
  const d = settings.destination
  if (!destinationConfigured(d)) {
    return { status: 'unknown' as HealthStatus, configured: false, message: 'Not configured. Add the PostgreSQL warehouse in Settings > Connections.' }
  }
  const tested = d.status === 'healthy' ? 'Last connection test passed' : d.status === 'unhealthy' ? 'Last connection test failed' : 'Not tested since the last change'
  return { status: d.status, configured: true, message: `${d.host}:${d.port}/${d.database}. ${tested}.` }
}

function dbtSummary(settings: WorkspaceSettings) {
  const d = settings.dbt
  if (!d.repository_url) {
    return { status: 'unknown' as HealthStatus, configured: false, message: 'Not configured. Connect the dbt project repository in Settings > dbt project.' }
  }
  const tested = d.status === 'healthy' ? 'Repository reachable' : d.status === 'unhealthy' ? 'Last repository check failed' : 'Not checked since the last change'
  return { status: d.status, configured: true, message: `${d.repository_url} (${d.branch}). ${tested}.` }
}

function aiSummary(settings: WorkspaceSettings) {
  const a = settings.ai
  if (a.provider === 'none') {
    return { status: 'unknown' as HealthStatus, configured: false, message: 'No AI provider configured. AI-assisted features are unavailable until one is connected.' }
  }
  const state = a.enabled ? 'enabled' : 'disabled'
  return {
    status: a.status,
    configured: true,
    message: `${AI_PROVIDER_LABELS[a.provider]}${a.model ? ` (${a.model})` : ''}, ${state}. Keys cannot be verified in demo mode.`,
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const routes: MockRoute[] = [
  // Members and roles -------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/members',
    handler: (ctx) => {
      const { workspace } = requireWorkspace(ctx, ctx.params.workspaceId)
      return db.memberships
        .filter((m) => m.workspace_id === workspace.id)
        .map(memberView)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1
          const byRole = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
          return byRole || a.user.name.localeCompare(b.user.name)
        })
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/invitations',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'members:manage')
      const input = body<Partial<InviteMemberRequest>>(ctx)
      const email = str(input.email).toLowerCase()
      const errors: Errors = []
      if (!email) errors.push({ field: 'email', message: 'Enter an email address.' })
      else if (!EMAIL_RE.test(email) || email.length > 254) errors.push({ field: 'email', message: 'Enter a valid email address.' })
      if ((input.role as Role | undefined) === 'owner') {
        errors.push({ field: 'role', message: 'The owner role cannot be granted by invitation. Ownership transfers are handled by support.' })
      } else if (!input.role || !ASSIGNABLE_ROLES.includes(input.role)) {
        errors.push({ field: 'role', message: 'Choose admin, editor or viewer.' })
      }
      failIf(errors)

      let invitee = db.users.find((u) => u.email.toLowerCase() === email)
      if (invitee) {
        const existing = db.memberships.find((m) => m.workspace_id === workspace.id && m.user_id === invitee!.id)
        if (existing) {
          throw httpError.conflict(
            'already_member',
            existing.status === 'invited' ? `${email} has already been invited to this workspace.` : `${email} is already a member of this workspace.`,
            { user_id: invitee.id, status: existing.status },
          )
        }
      } else {
        invitee = { id: newId('usr'), email, name: nameFromEmail(email), avatar_url: null }
        db.users.push(invitee)
      }
      const membership: MembershipRecord = {
        user_id: invitee.id,
        workspace_id: workspace.id,
        role: input.role as Role,
        status: 'invited',
        joined_at: null,
        last_active_at: null,
      }
      db.memberships.push(membership)
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'member.invited',
        resource: { type: 'member', id: invitee.id, name: invitee.email },
        changes: [{ field: 'role', before: null, after: membership.role }],
        metadata: { email_delivery: 'simulated' },
      })
      return memberView(membership)
    },
  },
  {
    method: 'PATCH',
    path: '/workspaces/:workspaceId/members/:userId',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'members:manage')
      const membership = findMembership(workspace.id, ctx.params.userId)
      const input = body<Partial<UpdateMemberRequest>>(ctx)
      if (membership.role === 'owner') {
        throw httpError.conflict('owner_immutable', 'The workspace owner role cannot be changed. Ownership transfers are handled by support.')
      }
      if ((input.role as Role | undefined) === 'owner') {
        throw httpError.validation([{ field: 'role', message: 'The owner role cannot be assigned. Ownership transfers are handled by support.' }])
      }
      if (!input.role || !ASSIGNABLE_ROLES.includes(input.role)) {
        throw httpError.validation([{ field: 'role', message: 'Choose admin, editor or viewer.' }])
      }
      if (membership.user_id === user.id) {
        throw httpError.conflict('self_role_change', 'You cannot change your own role. Ask another admin or the owner.')
      }
      const before = membership.role
      membership.role = input.role
      if (before !== membership.role) {
        const target = memberView(membership)
        recordAudit({
          workspaceId: workspace.id,
          actor: userActor(user),
          action: 'member.role_changed',
          resource: { type: 'member', id: target.user.id, name: target.user.name },
          changes: [{ field: 'role', before, after: membership.role }],
        })
      }
      return memberView(membership)
    },
  },
  {
    method: 'DELETE',
    path: '/workspaces/:workspaceId/members/:userId',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'members:manage')
      const membership = findMembership(workspace.id, ctx.params.userId)
      if (membership.role === 'owner') {
        throw httpError.conflict('owner_immutable', 'The workspace owner cannot be removed. Ownership transfers are handled by support.')
      }
      if (membership.user_id === user.id) {
        throw httpError.conflict('cannot_remove_self', 'You cannot remove yourself. Ask another admin or the owner.')
      }
      const target = memberView(membership)
      db.memberships = db.memberships.filter((m) => m !== membership)
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: membership.status === 'invited' ? 'member.invitation_revoked' : 'member.removed',
        resource: { type: 'member', id: target.user.id, name: target.user.name },
        changes: [{ field: 'role', before: membership.role, after: null }],
      })
      return null
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/roles',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      return ROLE_ORDER.map<RoleDefinition>((role) => ({ role, description: ROLE_DESCRIPTIONS[role], permissions: ROLE_PERMISSIONS[role] }))
    },
  },

  // Warehouse destination ---------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/destination',
    handler: (ctx) => settingsFor(requireWorkspace(ctx, ctx.params.workspaceId).workspace.id).destination,
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/destination',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<UpdateDestinationRequest>>(ctx)
      const errors: Errors = []
      validateDestination(input, errors)
      failIf(errors)

      const current = settings.destination
      const before = { ...current } as unknown as Record<string, unknown>
      const next: DestinationConfig = {
        ...current,
        host: str(input.host),
        port: input.port!,
        database: str(input.database),
        username: str(input.username),
        ssl_mode: input.ssl_mode!,
        bronze_schema: str(input.bronze_schema),
        silver_schema: str(input.silver_schema),
        gold_schema: str(input.gold_schema),
        password: nextSecret(current.password, input.password),
      }
      const connectionChanged =
        next.host !== current.host ||
        next.port !== current.port ||
        next.database !== current.database ||
        next.username !== current.username ||
        next.ssl_mode !== current.ssl_mode ||
        input.password !== undefined
      if (connectionChanged) next.status = 'unknown'
      settings.destination = next

      if (destinationConfigured(next)) workspace.onboarding.steps.destination = true
      const changes = diffChanges(before, definedEntries({ ...input, host: next.host, database: next.database, username: next.username }), ['password'])
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.destination_updated',
        resource: { type: 'integration', id: 'warehouse', name: 'Warehouse (PostgreSQL)' },
        changes,
      })
      return next
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/destination/test-connection',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<UpdateDestinationRequest>>(ctx)
      const stored = settings.destination
      // An empty body tests the stored configuration; otherwise unsaved values are tested.
      const overrides = input.host !== undefined
      let result: ConnectionTestResponse
      if (overrides) {
        const errors: Errors = []
        validateDestination(input, errors)
        failIf(errors)
        const passwordSet = input.password === undefined ? stored.password.is_set : input.password !== null
        result = testDestinationValues(
          {
            host: str(input.host),
            port: input.port!,
            database: str(input.database),
            username: str(input.username),
            bronze_schema: str(input.bronze_schema),
            silver_schema: str(input.silver_schema),
            gold_schema: str(input.gold_schema),
          },
          passwordSet,
        )
      } else {
        result = testDestinationValues(stored, stored.password.is_set)
        if (stored.host) {
          stored.status = result.success ? 'healthy' : 'unhealthy'
          stored.last_tested_at = result.tested_at
        }
      }
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.destination_tested',
        resource: { type: 'integration', id: 'warehouse', name: 'Warehouse (PostgreSQL)' },
        status: result.success ? 'success' : 'failure',
        metadata: { simulated: true, unsaved_values: overrides },
      })
      return result
    },
  },

  // dbt project ---------------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/integrations/dbt',
    handler: (ctx) => settingsFor(requireWorkspace(ctx, ctx.params.workspaceId).workspace.id).dbt,
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/integrations/dbt',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<UpdateDbtProjectRequest>>(ctx)
      const errors: Errors = []
      validateDbt(input, errors)
      failIf(errors)

      const current = settings.dbt
      const before = { ...current } as unknown as Record<string, unknown>
      const next: DbtProjectConfig = {
        ...current,
        repository_url: str(input.repository_url),
        branch: str(input.branch),
        project_subdirectory: str(input.project_subdirectory),
        dbt_version: str(input.dbt_version),
        target: str(input.target),
        threads: input.threads!,
        deploy_key: nextSecret(current.deploy_key, input.deploy_key),
      }
      const changed =
        next.repository_url !== current.repository_url ||
        next.branch !== current.branch ||
        next.project_subdirectory !== current.project_subdirectory ||
        input.deploy_key !== undefined
      if (changed) next.status = 'unknown'
      settings.dbt = next
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.dbt_updated',
        resource: { type: 'integration', id: 'dbt', name: 'dbt project' },
        changes: diffChanges(before, definedEntries({ ...input, repository_url: next.repository_url, branch: next.branch }), ['deploy_key']),
      })
      return next
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/integrations/dbt/test-connection',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const dbt = settingsFor(workspace.id).dbt
      const tested_at = nowIso()
      let result: ConnectionTestResponse
      if (!dbt.repository_url) {
        result = { success: false, message: `No repository is configured. Save the dbt project settings, then test again ${SIMULATED_REPO}`, tested_at }
      } else if (dbt.repository_url.toLowerCase().includes('fail')) {
        result = { success: false, message: `Could not reach ${dbt.repository_url}: repository not found or access denied ${SIMULATED_REPO}`, tested_at }
      } else if (isSshRepo(dbt.repository_url) && !dbt.deploy_key.is_set) {
        result = { success: false, message: `Permission denied (publickey): an SSH repository needs a deploy key ${SIMULATED_REPO}`, tested_at }
      } else {
        const path = dbt.project_subdirectory ? `${dbt.project_subdirectory}/dbt_project.yml` : 'dbt_project.yml'
        result = { success: true, message: `Checked out ${dbt.branch} and found ${path}; dbt ${dbt.dbt_version} would run with target "${dbt.target}" ${SIMULATED_REPO}`, tested_at }
      }
      dbt.status = result.success ? 'healthy' : 'unhealthy'
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.dbt_tested',
        resource: { type: 'integration', id: 'dbt', name: 'dbt project' },
        status: result.success ? 'success' : 'failure',
        metadata: { simulated: true },
      })
      return result
    },
  },

  // Metabase ----------------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/integrations/metabase',
    handler: (ctx) => {
      const { workspace } = requireWorkspace(ctx, ctx.params.workspaceId)
      const settings = settingsFor(workspace.id)
      settings.metabase.status = metabaseStatus(db, workspace.id).status
      return settings.metabase
    },
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/integrations/metabase',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<UpdateMetabaseConfigRequest>>(ctx)
      const errors: Errors = []
      const siteUrl = str(input.site_url).replace(/\/+$/, '')
      if (input.site_url === undefined) errors.push({ field: 'site_url', message: 'site_url is required (send an empty string to disconnect).' })
      else if (siteUrl && !isHttpsUrl(siteUrl)) errors.push({ field: 'site_url', message: 'Enter an https:// URL, for example https://metabase.example.com.' })
      checkSecret(errors, 'embedding_secret', input.embedding_secret)
      checkSecret(errors, 'api_key', input.api_key)
      if (input.default_collection_id !== undefined && input.default_collection_id !== null && !isInt(input.default_collection_id, 1, 2_147_483_647)) {
        errors.push({ field: 'default_collection_id', message: 'Collection id must be a positive whole number.' })
      }
      failIf(errors)

      const current = settings.metabase
      const before = { ...current } as unknown as Record<string, unknown>
      settings.metabase = {
        ...current,
        site_url: siteUrl,
        embedding_secret: nextSecret(current.embedding_secret, input.embedding_secret),
        api_key: nextSecret(current.api_key, input.api_key),
        default_collection_id: input.default_collection_id === undefined ? current.default_collection_id : input.default_collection_id,
      }
      // A connection test applies to the site it reached; a new site has not been checked yet.
      if (siteUrl !== current.site_url) delete db.metabaseChecks[workspace.id]
      settings.metabase.status = metabaseStatus(db, workspace.id).status
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.metabase_updated',
        resource: { type: 'integration', id: 'metabase', name: 'Metabase' },
        changes: diffChanges(before, definedEntries({ ...input, site_url: siteUrl }), ['embedding_secret', 'api_key']),
      })
      return settings.metabase
    },
  },

  // AI provider -----------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/integrations/ai-provider',
    handler: (ctx) => settingsFor(requireWorkspace(ctx, ctx.params.workspaceId).workspace.id).ai,
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/integrations/ai-provider',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<UpdateAiProviderRequest>>(ctx)
      const current = settings.ai
      const errors: Errors = []
      const provider = input.provider
      if (!provider || !AI_PROVIDERS.includes(provider)) {
        errors.push({ field: 'provider', message: 'Choose none, openai, anthropic, azure_openai or self_hosted.' })
      }
      const model = str(input.model)
      const endpoint = str(input.endpoint_url)
      if (provider && provider !== 'none') {
        if (!model) errors.push({ field: 'model', message: 'Enter the model or deployment name to use.' })
        else if (model.length > 120) errors.push({ field: 'model', message: 'The model name is too long.' })
      }
      if (provider === 'azure_openai') {
        if (!endpoint) errors.push({ field: 'endpoint_url', message: 'Enter the Azure OpenAI resource endpoint.' })
        else if (!isHttpsUrl(endpoint)) errors.push({ field: 'endpoint_url', message: 'Enter an https:// endpoint, for example https://your-resource.openai.azure.com.' })
      } else if (provider === 'self_hosted') {
        if (!endpoint) errors.push({ field: 'endpoint_url', message: 'Enter the base URL of the self-hosted model server.' })
        else if (!isHttpUrl(endpoint)) errors.push({ field: 'endpoint_url', message: 'Enter an http:// or https:// URL.' })
      }
      checkSecret(errors, 'api_key', input.api_key)
      if (input.data_sharing !== 'metadata_only' && input.data_sharing !== 'metadata_and_samples') {
        errors.push({ field: 'data_sharing', message: 'Choose metadata_only or metadata_and_samples.' })
      }
      if (typeof input.enabled !== 'boolean') errors.push({ field: 'enabled', message: 'enabled must be true or false.' })
      failIf(errors)

      const p = provider as AiProviderName
      // A key issued by one provider is never valid for another, so switching discards it.
      const providerChanged = p !== current.provider
      const baseKey: SecretState = providerChanged ? { is_set: false, updated_at: null } : current.api_key
      const apiKey = p === 'none' ? { is_set: false, updated_at: null } : nextSecret(baseKey, input.api_key)
      const enabled = p === 'none' ? false : Boolean(input.enabled)
      if (enabled && p !== 'self_hosted' && !apiKey.is_set) {
        throw httpError.validation([{ field: 'api_key', message: `An API key is required to enable ${AI_PROVIDER_LABELS[p]}.` }])
      }
      const before = { ...current } as unknown as Record<string, unknown>
      const next: AiProviderConfig = {
        provider: p,
        model: p === 'none' ? null : model,
        endpoint_url: p === 'azure_openai' || p === 'self_hosted' ? endpoint : null,
        api_key: apiKey,
        data_sharing: input.data_sharing!,
        enabled,
        status: 'unknown',
      }
      next.status = aiStatus(next)
      settings.ai = next
      const after: Record<string, unknown> = { provider: next.provider, model: next.model, endpoint_url: next.endpoint_url, data_sharing: next.data_sharing, enabled: next.enabled }
      if (input.api_key !== undefined || (providerChanged && current.api_key.is_set)) after.api_key = input.api_key ?? null
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.ai_provider_updated',
        resource: { type: 'integration', id: 'ai_provider', name: 'AI provider' },
        changes: diffChanges(before, after, ['api_key']),
      })
      return next
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/integrations/ai-provider/test-connection',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const ai = settingsFor(workspace.id).ai
      if (ai.provider === 'none') {
        throw new MockHttpError(422, 'ai_provider_not_configured', 'No AI provider is configured. Choose a provider and save before testing.', {
          fieldErrors: [{ field: 'provider', message: 'Choose a provider and save before testing.' }],
        })
      }
      const result: ConnectionTestResponse = {
        success: false,
        message: 'Not tested: demo mode never sends data to AI providers. Connect a live backend to verify the key.',
        tested_at: nowIso(),
      }
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.ai_provider_tested',
        resource: { type: 'integration', id: 'ai_provider', name: 'AI provider' },
        status: 'failure',
        metadata: { simulated: true, provider_contacted: false },
      })
      return result
    },
  },

  // Scheduler defaults --------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/settings/scheduler',
    handler: (ctx) => settingsFor(requireWorkspace(ctx, ctx.params.workspaceId).workspace.id).scheduler,
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/settings/scheduler',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<SchedulerDefaults>>(ctx)
      const errors: Errors = []
      const tz = str(input.default_timezone)
      if (!isValidTimezone(tz)) errors.push({ field: 'default_timezone', message: 'Choose a valid IANA time zone, for example Asia/Kolkata.' })
      if (!isInt(input.max_concurrent_runs, 1, 20)) errors.push({ field: 'max_concurrent_runs', message: 'Enter a whole number between 1 and 20.' })
      if (!isInt(input.default_retry_attempts, 0, 10)) errors.push({ field: 'default_retry_attempts', message: 'Enter a whole number between 0 and 10.' })
      if (!isInt(input.default_backoff_seconds, 30, 86_400)) errors.push({ field: 'default_backoff_seconds', message: 'Enter a number of seconds between 30 and 86400 (24 hours).' })
      const quiet = input.quiet_hours
      if (!quiet || typeof quiet.enabled !== 'boolean') {
        errors.push({ field: 'quiet_hours.enabled', message: 'quiet_hours.enabled must be true or false.' })
      } else {
        if (!TIME_RE.test(str(quiet.start))) errors.push({ field: 'quiet_hours.start', message: 'Use 24-hour HH:MM, for example 22:00.' })
        if (!TIME_RE.test(str(quiet.end))) errors.push({ field: 'quiet_hours.end', message: 'Use 24-hour HH:MM, for example 06:00.' })
        if (quiet.enabled && quiet.start === quiet.end) errors.push({ field: 'quiet_hours.end', message: 'The end time must differ from the start time.' })
      }
      failIf(errors)
      const before = settings.scheduler
      const next: SchedulerDefaults = {
        default_timezone: tz,
        max_concurrent_runs: input.max_concurrent_runs!,
        default_retry_attempts: input.default_retry_attempts!,
        default_backoff_seconds: input.default_backoff_seconds!,
        quiet_hours: { enabled: quiet!.enabled, start: str(quiet!.start), end: str(quiet!.end) },
      }
      settings.scheduler = next
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.scheduler_updated',
        resource: { type: 'settings', id: 'scheduler', name: 'Scheduler defaults' },
        changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>),
      })
      return next
    },
  },

  // Audit retention -----------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/settings/audit-retention',
    handler: (ctx) => settingsFor(requireWorkspace(ctx, ctx.params.workspaceId).workspace.id).retention,
  },
  {
    method: 'PUT',
    path: '/workspaces/:workspaceId/settings/audit-retention',
    handler: (ctx) => {
      const { user, workspace } = requirePermission(ctx, ctx.params.workspaceId, 'settings:manage')
      const settings = settingsFor(workspace.id)
      const input = body<Partial<AuditRetentionSettings>>(ctx)
      const errors: Errors = []
      if (!isInt(input.retention_days, 30, 2555)) errors.push({ field: 'retention_days', message: 'Retention must be between 30 and 2555 days (7 years).' })
      if (typeof input.export_enabled !== 'boolean') errors.push({ field: 'export_enabled', message: 'export_enabled must be true or false.' })
      if (typeof input.include_ip_addresses !== 'boolean') errors.push({ field: 'include_ip_addresses', message: 'include_ip_addresses must be true or false.' })
      failIf(errors)
      const before = settings.retention
      const next: AuditRetentionSettings = {
        retention_days: input.retention_days!,
        export_enabled: input.export_enabled!,
        include_ip_addresses: input.include_ip_addresses!,
      }
      settings.retention = next
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'settings.audit_retention_updated',
        resource: { type: 'settings', id: 'audit_retention', name: 'Audit retention' },
        changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>),
      })
      return next
    },
  },

  // Personal notification preferences ----------------------------------------
  {
    method: 'GET',
    path: '/me/notification-preferences',
    handler: (ctx) => {
      const user = requireUser(ctx)
      const { workspace } = prefsWorkspace(ctx)
      return db.notificationPrefs[prefsKey(user.id, workspace.id)] ?? db.notificationPrefs[user.id] ?? defaultPrefs(user)
    },
  },
  {
    method: 'PUT',
    path: '/me/notification-preferences',
    handler: (ctx) => {
      const user = requireUser(ctx)
      const { workspace } = prefsWorkspace(ctx)
      const input = body<Partial<NotificationPreferences>>(ctx)
      const errors: Errors = []
      const email = str(input.email_address)
      if (!email) errors.push({ field: 'email_address', message: 'Enter the address that receives email notifications.' })
      else if (!EMAIL_RE.test(email) || email.length > 254) errors.push({ field: 'email_address', message: 'Enter a valid email address.' })
      if (!input.digest || !['off', 'daily', 'weekly'].includes(input.digest)) errors.push({ field: 'digest', message: 'Choose off, daily or weekly.' })
      const events = {} as NotificationPreferences['events']
      for (const type of NOTIFICATION_TYPES) {
        const pref = input.events?.[type]
        if (!pref || typeof pref.in_app !== 'boolean' || typeof pref.email !== 'boolean') {
          errors.push({ field: `events.${type}`, message: 'Set in_app and email to true or false.' })
        } else {
          events[type] = { in_app: pref.in_app, email: pref.email }
        }
      }
      failIf(errors)
      const key = prefsKey(user.id, workspace.id)
      const before = db.notificationPrefs[key] ?? db.notificationPrefs[user.id] ?? defaultPrefs(user)
      const next: NotificationPreferences = { email_address: email, digest: input.digest!, events }
      db.notificationPrefs[key] = next
      recordAudit({
        workspaceId: workspace.id,
        actor: userActor(user),
        action: 'user.notification_preferences_updated',
        resource: { type: 'user', id: user.id, name: user.name },
        changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>),
      })
      return next
    },
  },

  // Integration status and system health -------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/integrations',
    handler: (ctx) => {
      const { workspace } = requireWorkspace(ctx, ctx.params.workspaceId)
      const settings = settingsFor(workspace.id)
      const metabase = metabaseStatus(db, workspace.id)
      const warehouse = warehouseSummary(settings)
      const dbt = dbtSummary(settings)
      const ai = aiSummary(settings)
      const items: IntegrationStatus[] = [
        { key: 'warehouse', name: 'Warehouse (PostgreSQL)', ...warehouse, last_checked_at: settings.destination.last_tested_at },
        { key: 'dbt', name: 'dbt project', ...dbt, last_checked_at: settings.dbt.last_compiled_at },
        { key: 'metabase', name: 'Metabase', status: metabase.health, configured: metabase.status !== 'not_configured', message: metabase.message, last_checked_at: metabase.last_checked_at },
        { key: 'ai_provider', name: 'AI provider', ...ai, last_checked_at: null },
        { key: 'email', name: 'Email delivery', status: 'unknown', configured: false, message: 'Provided by the backend', last_checked_at: null },
        { key: 'scheduler', name: 'Scheduler', status: 'unknown', configured: false, message: 'Provided by the backend', last_checked_at: null },
      ]
      return items
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/system-health',
    handler: (ctx) => {
      const { workspace } = requireWorkspace(ctx, ctx.params.workspaceId)
      const settings = settingsFor(workspace.id)
      // Each component reports when it was really last checked; nothing is probed on this request.
      const simulated = (component: string): SystemComponentHealth => ({ component, status: 'unknown', latency_ms: null, message: SIMULATED_BACKEND, checked_at: null })
      const warehouse = warehouseSummary(settings)
      const dbt = dbtSummary(settings)
      const ai = aiSummary(settings)
      const metabase = metabaseStatus(db, workspace.id)
      const components: SystemComponentHealth[] = [
        simulated('API gateway'),
        simulated('Scheduler'),
        simulated('Worker queue'),
        { component: 'Warehouse (PostgreSQL)', status: warehouse.status, latency_ms: null, message: warehouse.message, checked_at: settings.destination.last_tested_at },
        { component: 'dbt runner', status: dbt.status, latency_ms: null, message: dbt.message, checked_at: settings.dbt.last_compiled_at },
        { component: 'Metabase', status: metabase.health, latency_ms: null, message: metabase.message, checked_at: metabase.last_checked_at },
        { component: 'AI provider', status: ai.status, latency_ms: null, message: ai.message, checked_at: null },
      ]
      const result: SystemHealth = { overall: worst(components.map((c) => c.status)), components, version: '0.1.0-mock' }
      return result
    },
  },
]
