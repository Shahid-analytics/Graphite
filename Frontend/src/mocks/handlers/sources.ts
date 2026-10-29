import type {
  ConfigValue,
  ConnectionCheck,
  ConnectorDefinition,
  ConnectorType,
  CreateSourceRequest,
  DiscoverRequest,
  FieldError,
  HealthStatus,
  IntervalPreset,
  PreviewColumn,
  RunError,
  RunKind,
  RunStatus,
  Schedule,
  SecretState,
  SelectedTable,
  Source,
  SourceSchema,
  SourceStatus,
  SourceTable,
  SyncFrequency,
  SyncScheduleConfig,
  TestConnectionResult,
  TestNewConnectionRequest,
  TriggerSyncRequest,
  UpdateSourceRequest,
  User,
} from '@/types'
import { isTerminal } from '@/types'
import { validateCron } from '@/lib/cron'
import { createSimRun, publicRun } from '../engine/runs'
import { generateRows } from '../engine/sample-rows'
import { body, httpError, MockHttpError, paginate, qNumber, qString, type MockContext, type MockRoute } from '../router'
import { ERP_TABLES, GENERIC_PG_TABLES, SALESFORCE_TABLES, WEB_TABLES } from '../seed/sources'
import {
  addRun,
  db,
  diffChanges,
  findOr404,
  recordAudit,
  requirePermission,
  requireUser,
  requireWorkspace,
  sourceView,
  userActor,
} from '../store'
import { newId, nowIso, prng } from '../util'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEMA_RE = /^[a-z][a-z0-9_]{1,62}$/
const RESERVED_SCHEMAS = ['public', 'silver', 'gold', 'information_schema', 'pg_catalog']
const FREQUENCIES: SyncFrequency[] = ['manual', 'hourly', 'every_6_hours', 'daily', 'weekly', 'custom']
const PRESET_CRON: Record<Exclude<SyncFrequency, 'manual' | 'custom'>, string> = {
  hourly: '0 * * * *',
  every_6_hours: '0 */6 * * *',
  daily: '0 2 * * *',
  weekly: '0 2 * * 1',
}
const PREVIEW_MAX_ROWS = 100

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function findSource(ctx: MockContext) {
  return findOr404(db.sources, ctx.params.sourceId, 'Source')
}

function connectorOr422(type: unknown): ConnectorDefinition {
  const connector = db.connectors.find((c) => c.type === type)
  if (!connector) throw httpError.validation([{ field: 'connector_type', message: 'Choose a connector from the catalog.' }])
  return connector
}

function requireAvailable(connector: ConnectorDefinition) {
  if (connector.status !== 'available') {
    throw httpError.conflict('connector_unavailable', `The ${connector.name} connector is not yet available. Ask your administrator if you need it.`, {
      connector_type: connector.type,
    })
  }
}

function secretKeys(connector: ConnectorDefinition) {
  return connector.config_fields.filter((f) => f.secret).map((f) => f.key)
}

function isBlank(value: ConfigValue | undefined) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function activeIngestion(sourceId: string) {
  return db.runs.find((r) => r.source_id === sourceId && r.kind === 'ingestion' && !isTerminal(r.status)) ?? null
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates connector configuration. `storedSecrets` lists secret keys already
 * stored for an existing source (so they are not required again).
 */
function validateConfig(
  connector: ConnectorDefinition,
  config: Record<string, ConfigValue>,
  options: { storedSecrets?: string[]; partial?: boolean; prefix?: string } = {},
): FieldError[] {
  const errors: FieldError[] = []
  const prefix = options.prefix ?? 'config.'
  const known = new Set(connector.config_fields.map((f) => f.key))
  for (const key of Object.keys(config)) {
    if (!known.has(key)) errors.push({ field: `${prefix}${key}`, message: `Unknown setting "${key}" for the ${connector.name} connector.` })
  }
  for (const field of connector.config_fields) {
    const present = Object.prototype.hasOwnProperty.call(config, field.key)
    const value = config[field.key]
    if (options.partial && !present) continue
    if (field.secret) {
      const stored = options.storedSecrets?.includes(field.key) ?? false
      if (field.required && isBlank(value) && !(stored && value !== null)) {
        errors.push({ field: `${prefix}${field.key}`, message: value === null ? `${field.label} is required and cannot be cleared.` : `${field.label} is required.` })
      }
      continue
    }
    if (isBlank(value)) {
      if (field.required) errors.push({ field: `${prefix}${field.key}`, message: `${field.label} is required.` })
      continue
    }
    if (field.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) errors.push({ field: `${prefix}${field.key}`, message: `${field.label} must be a number.` })
      else if (field.key === 'port' && (n < 1 || n > 65535 || !Number.isInteger(n))) {
        errors.push({ field: `${prefix}${field.key}`, message: 'Port must be a whole number between 1 and 65535.' })
      }
    }
    if (field.type === 'url' && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(String(value))) {
      errors.push({ field: `${prefix}${field.key}`, message: `${field.label} must be an https:// URL.` })
    }
    if (field.type === 'select' && field.options && !field.options.some((o) => o.value === value)) {
      errors.push({ field: `${prefix}${field.key}`, message: `Choose one of: ${field.options.map((o) => o.label).join(', ')}.` })
    }
    if (field.key === 'start_date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      errors.push({ field: `${prefix}${field.key}`, message: 'Use the format YYYY-MM-DD.' })
    }
  }
  return errors
}

function validateName(workspaceId: string, raw: unknown, excludeId?: string): { name: string; errors: FieldError[] } {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length < 2) return { name, errors: [{ field: 'name', message: 'Name must be at least 2 characters.' }] }
  if (name.length > 80) return { name, errors: [{ field: 'name', message: 'Name must be 80 characters or fewer.' }] }
  const taken = db.sources.some((s) => s.workspace_id === workspaceId && s.id !== excludeId && s.name.toLowerCase() === name.toLowerCase())
  return { name, errors: taken ? [{ field: 'name', message: `A source named "${name}" already exists in this workspace.` }] : [] }
}

function validateDestinationSchema(workspaceId: string, raw: unknown): FieldError[] {
  const schema = typeof raw === 'string' ? raw : ''
  if (!SCHEMA_RE.test(schema)) {
    return [{ field: 'destination_schema', message: 'Use 2 to 63 lowercase letters, digits or underscores, starting with a letter.' }]
  }
  if (RESERVED_SCHEMAS.includes(schema)) return [{ field: 'destination_schema', message: `"${schema}" is reserved. Choose a Bronze schema name such as bronze_${schema}.` }]
  const owner = db.sources.find((s) => s.workspace_id === workspaceId && s.destination_schema === schema)
  if (owner) return [{ field: 'destination_schema', message: `Schema "${schema}" is already used by "${owner.name}".` }]
  return []
}

function validateTables(selected: unknown, available: SourceTable[], incrementalSupported: boolean): FieldError[] {
  if (!Array.isArray(selected) || selected.length === 0) return [{ field: 'selected_tables', message: 'Select at least one table to replicate.' }]
  const errors: FieldError[] = []
  const seen = new Set<string>()
  ;(selected as SelectedTable[]).forEach((table, i) => {
    const key = `${table.schema}.${table.name}`
    const field = `selected_tables.${i}`
    if (seen.has(key)) errors.push({ field, message: `${key} is selected more than once.` })
    seen.add(key)
    const found = available.find((t) => t.schema === table.schema && t.name === table.name)
    if (!found) {
      errors.push({ field, message: `${key} was not found in the source. Run discovery again.` })
      return
    }
    if (table.ingestion_mode !== 'full' && table.ingestion_mode !== 'incremental') {
      errors.push({ field: `${field}.ingestion_mode`, message: 'Ingestion mode must be "full" or "incremental".' })
    }
    if (table.ingestion_mode === 'incremental') {
      if (!incrementalSupported || !found.supports_incremental) {
        errors.push({ field: `${field}.ingestion_mode`, message: `${key} does not support incremental sync. Use a full load.` })
      } else if (!table.cursor_field || !found.cursor_candidates.includes(table.cursor_field)) {
        errors.push({ field: `${field}.cursor_field`, message: `Choose a cursor field for ${key} (${found.cursor_candidates.join(', ')}).` })
      }
    }
  })
  return errors
}

function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Validates and normalises a schedule, returning the canonical config. */
function normaliseSchedule(raw: unknown): { schedule: SyncScheduleConfig; errors: FieldError[] } {
  const input = (raw ?? {}) as Partial<SyncScheduleConfig>
  const errors: FieldError[] = []
  const frequency = input.frequency ?? 'manual'
  const timezone = input.timezone || 'Asia/Kolkata'
  if (!FREQUENCIES.includes(frequency)) errors.push({ field: 'schedule.frequency', message: 'Choose a sync frequency.' })
  if (!validTimezone(timezone)) errors.push({ field: 'schedule.timezone', message: `Unknown time zone "${timezone}".` })
  let cron: string | null = null
  if (frequency === 'custom') {
    const check = validateCron(input.cron ?? '', validTimezone(timezone) ? timezone : 'UTC')
    if (!check.valid) errors.push({ field: 'schedule.cron', message: check.error ?? 'Enter a valid cron expression.' })
    else if ((check.minIntervalMinutes ?? 60) < 15) errors.push({ field: 'schedule.cron', message: 'Syncs can run at most every 15 minutes.' })
    cron = (input.cron ?? '').trim().replace(/\s+/g, ' ')
  } else if (frequency !== 'manual' && FREQUENCIES.includes(frequency)) {
    // Presets accept a client-supplied variant (e.g. a different hour), otherwise the default.
    const candidate = input.cron?.trim()
    cron = candidate && validateCron(candidate, 'UTC').valid ? candidate : PRESET_CRON[frequency]
  }
  return { schedule: { frequency, cron, timezone }, errors }
}

// ---------------------------------------------------------------------------
// Simulated connectivity
// ---------------------------------------------------------------------------

function endpointOf(connectorType: ConnectorType, config: Record<string, ConfigValue>) {
  return String((connectorType === 'salesforce' ? config.instance_url : config.host) ?? '')
}

function check(name: string, status: ConnectionCheck['status'], message: string): ConnectionCheck {
  return { name, status, message }
}

const NOT_RUN = 'Not run because an earlier check failed.'

/**
 * Deterministic connection test. Hosts containing "fail" are unreachable; a secret
 * equal to "wrong" fails authentication; an existing source with a recorded failure
 * keeps failing until replacement credentials are supplied.
 */
function simulateConnection(
  connector: ConnectorDefinition,
  config: Record<string, ConfigValue>,
  existing?: Source,
): TestConnectionResult {
  const endpoint = endpointOf(connector.type, config)
  const rand = prng(`${connector.type}:${endpoint}`)
  const latency = 40 + Math.round(rand() * 160)
  const tested_at = nowIso()
  const isSf = connector.type === 'salesforce'
  const limitsName = isSf ? 'API limits' : 'Replication'
  const keys = secretKeys(connector)
  const suppliedSecrets = keys.filter((k) => typeof config[k] === 'string' && (config[k] as string).length > 0)
  const wrongSecret = suppliedSecrets.some((k) => config[k] === 'wrong')
  const persistent = existing ? db.sourceFailures[existing.id] : undefined
  const host = isSf ? endpoint.replace(/^https?:\/\//, '') : `${endpoint}:${config.port ?? 5432}`

  if (endpoint.toLowerCase().includes('fail')) {
    const message = isSf ? `Could not reach ${host}. Check the instance URL.` : `Could not connect to ${host}: connection timed out after 10s.`
    return {
      success: false,
      latency_ms: null,
      tested_at,
      error: { code: 'source_unreachable', message },
      checks: [
        check('Network', 'failed', `${message} Make sure the host is reachable from the Graphite egress IPs.`),
        check('Authentication', 'warning', NOT_RUN),
        check('Permissions', 'warning', NOT_RUN),
        check(limitsName, 'warning', NOT_RUN),
      ],
    }
  }

  const authFailure: RunError | null = wrongSecret
    ? {
        stage: 'source_connect',
        code: 'source_auth_failed',
        message: isSf
          ? 'Salesforce rejected the credentials (INVALID_CLIENT_CREDENTIALS).'
          : `Authentication failed for user "${String(config.username ?? '')}".`,
        details: null,
        retryable: true,
      }
    : persistent && suppliedSecrets.length === 0
      ? persistent
      : null

  if (authFailure) {
    return {
      success: false,
      latency_ms: latency,
      tested_at,
      error: { code: authFailure.code, message: authFailure.message },
      checks: [
        check('Network', 'passed', `Reached ${host} over TLS in ${latency} ms.`),
        check('Authentication', 'failed', `${authFailure.message} ${isSf ? 'Check the consumer secret and security token.' : 'The password may have been rotated.'}`),
        check('Permissions', 'warning', NOT_RUN),
        check(limitsName, 'warning', NOT_RUN),
      ],
    }
  }

  const checks: ConnectionCheck[] = [
    check('Network', 'passed', `Reached ${host} over TLS in ${latency} ms.`),
    check('Authentication', 'passed', isSf ? `Authenticated as ${String(config.username ?? 'the integration user')} via OAuth.` : `Authenticated as ${String(config.username ?? '')}.`),
  ]
  if (isSf) {
    const used = 12_000 + Math.round(rand() * 30_000)
    checks.push(check('Permissions', 'passed', 'Read access confirmed for standard objects (Account, Contact, Opportunity, Product2).'))
    checks.push(check('API limits', 'passed', `${used.toLocaleString('en')} of 100,000 daily API requests used (${Math.round(used / 1000)}%).`))
  } else {
    checks.push(check('Permissions', 'passed', `SELECT granted on the discovered schemas for ${String(config.username ?? 'this user')}.`))
    checks.push(
      config.ssl_mode === 'disable'
        ? check('Replication', 'warning', 'SSL is disabled. Data will travel unencrypted; use "require" or "verify-full" in production.')
        : check('Replication', 'passed', 'Cursor-based incremental replication available; 12 of 100 connections in use.'),
    )
  }
  return { success: true, latency_ms: latency, tested_at, error: null, checks }
}

function discoverTables(connectorType: ConnectorType, config: Record<string, ConfigValue>): SourceTable[] {
  if (connectorType === 'salesforce') return SALESFORCE_TABLES
  const host = String(config.host ?? '').toLowerCase()
  const database = String(config.database ?? '').toLowerCase()
  if (host.includes('erp') || database.includes('erp')) return ERP_TABLES
  if (host.includes('order') || host.includes('storefront') || database.includes('storefront')) return WEB_TABLES
  return GENERIC_PG_TABLES
}

function schemasOf(tables: SourceTable[]): SourceSchema[] {
  const counts = new Map<string, number>()
  tables.forEach((t) => counts.set(t.schema, (counts.get(t.schema) ?? 0) + 1))
  return [...counts.entries()].map(([name, tables_count]) => ({ name, tables_count }))
}

// ---------------------------------------------------------------------------
// Health, schedules and audit helpers
// ---------------------------------------------------------------------------

/** Health derived from known failures and unacknowledged schema changes. */
function deriveHealth(source: Source): { status: SourceStatus; health: HealthStatus; message: string | null } {
  const failure = db.sourceFailures[source.id]
  if (failure) return { status: 'error', health: 'unhealthy', message: failure.message }
  for (const model of db.models.filter((m) => m.source_id === source.id && m.layer === 'bronze')) {
    const change = model.schema_changes.find((c) => !c.acknowledged)
    if (change) {
      const detail = change.change_type === 'type_changed' ? `changed from ${change.from_type} to ${change.to_type}` : change.change_type === 'column_added' ? 'was added' : 'was removed'
      return { status: 'active', health: 'degraded', message: `Schema change detected: ${model.name}.${change.column} ${detail}.` }
    }
  }
  if (source.last_sync_status === 'succeeded') return { status: 'active', health: 'healthy', message: null }
  return { status: 'active', health: 'unknown', message: null }
}

const FREQUENCY_TO_PRESET: Record<Exclude<SyncFrequency, 'manual'>, IntervalPreset> = {
  hourly: 'hourly',
  every_6_hours: 'every_6_hours',
  daily: 'daily',
  weekly: 'weekly',
  custom: 'custom',
}

/** Keeps the source_sync schedule record aligned with the source's schedule and status. */
function syncScheduleRecord(source: Source, user: User, previousName = source.name) {
  const existing = db.schedules.filter((s) => s.target_type === 'source_sync' && s.target_id === source.id)
  if (source.schedule.frequency === 'manual' || !source.schedule.cron) {
    if (existing.length) db.schedules = db.schedules.filter((s) => !existing.includes(s))
    return
  }
  const now = nowIso()
  const preset = FREQUENCY_TO_PRESET[source.schedule.frequency]
  if (existing.length) {
    existing.forEach((s) => {
      s.preset = preset
      s.cron = source.schedule.cron!
      s.timezone = source.schedule.timezone
      s.target_name = source.name
      if (s.name === `${previousName} sync`) s.name = `${source.name} sync`
      s.enabled = source.status !== 'paused'
      s.updated_at = now
    })
    return
  }
  const defaults = db.settings[source.workspace_id]?.scheduler
  const schedule: Schedule = {
    id: newId('sch'),
    workspace_id: source.workspace_id,
    name: `${source.name} sync`,
    description: `Syncs ${source.name} into ${source.destination_schema}.`,
    target_type: 'source_sync',
    target_id: source.id,
    target_name: source.name,
    preset,
    cron: source.schedule.cron,
    timezone: source.schedule.timezone,
    enabled: source.status !== 'paused',
    retry: { max_attempts: defaults?.default_retry_attempts ?? 2, backoff_seconds: defaults?.default_backoff_seconds ?? 300, backoff_strategy: 'exponential' },
    concurrency: { max_concurrent_runs: 1, overlap_policy: 'skip' },
    next_run_at: null,
    last_run: null,
    created_by: { id: user.id, name: user.name },
    created_at: now,
    updated_at: now,
  }
  db.schedules.push(schedule)
}

function tablesLabel(tables: SelectedTable[]) {
  return tables.map((t) => `${t.schema}.${t.name} (${t.ingestion_mode}${t.cursor_field ? `: ${t.cursor_field}` : ''})`)
}

function scheduleLabel(schedule: SyncScheduleConfig) {
  return schedule.frequency === 'manual' ? 'manual' : `${schedule.frequency} (${schedule.cron}, ${schedule.timezone})`
}

function auditSnapshot(source: Source): Record<string, unknown> {
  return {
    name: source.name,
    status: source.status,
    ...source.config,
    ...Object.fromEntries(Object.keys(source.secrets).map((k) => [k, '[secret]'])),
    selected_tables: tablesLabel(source.selected_tables),
    schedule: scheduleLabel(source.schedule),
  }
}

/** Rows each table loads in a sync: the whole table on a full load, a small delta otherwise. */
function estimateRecords(source: Source, tables: SelectedTable[], mode: 'full' | 'incremental' | undefined) {
  const discovered = db.sourceTables[source.id] ?? []
  // Seeded by the number of earlier runs so repeated demos produce the same figures.
  const rand = prng(`${source.id}:${db.runs.filter((r) => r.source_id === source.id).length}`)
  return tables.map((t) => {
    const rows = discovered.find((d) => d.schema === t.schema && d.name === t.name)?.row_count_estimate ?? 1000
    const full = mode === 'full' || t.ingestion_mode === 'full' || !source.last_successful_sync_at
    return full ? rows : Math.max(5, Math.round(rows * (0.005 + rand() * 0.02)))
  })
}

function startSync(source: Source, user: User, input: TriggerSyncRequest, trigger: 'manual' | 'onboarding' = 'manual') {
  const selected = input.tables?.length
    ? source.selected_tables.filter((t) => input.tables!.includes(`${t.schema}.${t.name}`))
    : source.selected_tables
  const failAt = db.sourceFailures[source.id] ?? null
  const records = estimateRecords(source, selected, input.mode)
  const run = addRun(
    createSimRun({
      workspaceId: source.workspace_id,
      kind: 'ingestion',
      trigger,
      triggeredBy: { id: user.id, name: user.name },
      targetName: source.name,
      links: { source_id: source.id },
      failAt,
      records: records.reduce((sum, n) => sum + n, 0),
      tables: selected.map((t, i) => ({ table: `${t.schema}.${t.name}`, mode: input.mode === 'full' ? 'full' : t.ingestion_mode, records: records[i] })),
    }),
  )
  return run
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

function previewColumns(source: Source, table: SourceTable): PreviewColumn[] {
  const model = db.models.find((m) => m.source_id === source.id && m.layer === 'bronze' && normalise(m.name) === normalise(table.name))
  const profiled = model ? db.columns[model.id] : undefined
  if (profiled?.length) return profiled.map((c) => ({ name: c.name, data_type: c.data_type }))
  // Synthesise plausible columns from the discovered metadata.
  const isSf = source.connector_type === 'salesforce'
  const columns: PreviewColumn[] = table.primary_key.map((pk) => ({ name: pk, data_type: isSf ? 'varchar' : pk === 'id' || pk.endsWith('_id') ? 'bigint' : 'varchar' }))
  const extras: PreviewColumn[] = isSf
    ? [
        { name: 'Name', data_type: 'varchar' },
        { name: 'OwnerId', data_type: 'varchar' },
        { name: 'CreatedDate', data_type: 'timestamptz' },
      ]
    : [
        { name: 'name', data_type: 'varchar' },
        { name: 'status', data_type: 'varchar' },
        { name: 'amount', data_type: 'numeric' },
        { name: 'city', data_type: 'varchar' },
        { name: 'created_at', data_type: 'timestamptz' },
      ]
  for (const column of [...extras, ...table.cursor_candidates.map((c) => ({ name: c, data_type: c.endsWith('_date') || c === 'snapshot_date' ? 'date' : 'timestamptz' }))]) {
    if (!columns.some((c) => c.name === column.name)) columns.push(column)
  }
  return columns.slice(0, Math.max(4, Math.min(table.columns_count, 10)))
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/connectors',
    handler: (ctx) => {
      requireUser(ctx)
      return db.connectors
    },
  },
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/sources',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      const q = qString(ctx, 'q')?.trim().toLowerCase()
      const connectorType = qString(ctx, 'connector_type')
      const status = qString(ctx, 'status')
      const health = qString(ctx, 'health')
      return db.sources
        .filter((s) => s.workspace_id === ctx.params.workspaceId)
        .filter((s) => !connectorType || s.connector_type === connectorType)
        .filter((s) => !status || s.status === status)
        .filter((s) => !health || s.health === health)
        .filter((s) => {
          if (!q) return true
          const connectorName = db.connectors.find((c) => c.type === s.connector_type)?.name ?? ''
          return [s.name, s.destination_schema, connectorName].some((v) => v.toLowerCase().includes(q))
        })
        .map(sourceView)
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/sources',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user, workspace } = requirePermission(ctx, workspaceId, 'sources:write')
      const input = body<CreateSourceRequest>(ctx)
      const connector = connectorOr422(input.connector_type)
      requireAvailable(connector)
      const config = input.config ?? {}
      const available = discoverTables(connector.type, config)
      const { name, errors: nameErrors } = validateName(workspaceId, input.name)
      const { schedule, errors: scheduleErrors } = normaliseSchedule(input.schedule)
      const errors = [
        ...nameErrors,
        ...validateConfig(connector, config),
        ...validateDestinationSchema(workspaceId, input.destination_schema),
        ...validateTables(input.selected_tables, available, connector.supports_incremental),
        ...scheduleErrors,
      ]
      if (errors.length) throw httpError.validation(errors)

      const test = simulateConnection(connector, config)
      if (!test.success) {
        throw new MockHttpError(400, test.error?.code ?? 'connection_failed', `The connection test failed: ${test.error?.message ?? 'unknown error'} Fix the configuration and try again.`)
      }

      const now = nowIso()
      const keys = secretKeys(connector)
      const secrets: Record<string, SecretState> = Object.fromEntries(
        keys.map((k) => [k, isBlank(config[k]) ? { is_set: false, updated_at: null } : { is_set: true, updated_at: now }]),
      )
      const storedConfig: Record<string, ConfigValue> = {}
      for (const field of connector.config_fields) {
        if (field.secret) continue
        const value = config[field.key]
        if (isBlank(value)) continue
        storedConfig[field.key] = field.type === 'number' ? Number(value) : (value as ConfigValue)
      }
      const source: Source = {
        id: newId('src'),
        workspace_id: workspaceId,
        name,
        connector_type: connector.type,
        status: 'active',
        health: 'unknown',
        health_message: null,
        config: storedConfig,
        secrets,
        destination_schema: input.destination_schema,
        selected_tables: input.selected_tables.map((t) => ({
          schema: t.schema,
          name: t.name,
          ingestion_mode: t.ingestion_mode,
          cursor_field: t.ingestion_mode === 'incremental' ? t.cursor_field : null,
          primary_key: available.find((a) => a.schema === t.schema && a.name === t.name)?.primary_key ?? t.primary_key ?? [],
        })),
        schedule,
        last_sync_at: null,
        last_successful_sync_at: null,
        last_sync_status: null,
        last_sync_duration_seconds: null,
        last_sync_records: null,
        total_records: 0,
        next_sync_at: null,
        created_at: now,
        updated_at: now,
        created_by: { id: user.id, name: user.name },
      }
      db.sources.push(source)
      db.sourceTables[source.id] = available
      syncScheduleRecord(source, user)
      workspace.onboarding.steps.source = true

      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'source.created',
        resource: { type: 'source', id: source.id, name: source.name },
        changes: [
          { field: 'connector_type', before: null, after: connector.type },
          { field: 'destination_schema', before: null, after: source.destination_schema },
          { field: 'selected_tables', before: null, after: tablesLabel(source.selected_tables) },
          { field: 'schedule', before: null, after: scheduleLabel(schedule) },
          ...keys.filter((k) => secrets[k].is_set).map((k) => ({ field: k, before: null, after: '[secret set]' })),
        ],
      })

      let initialRunId: string | null = null
      if (input.run_initial_sync) {
        const run = startSync(source, user, {}, workspace.onboarding.completed_at ? 'manual' : 'onboarding')
        initialRunId = run.id
        recordAudit({ workspaceId, actor: userActor(user), action: 'source.sync_triggered', resource: { type: 'source', id: source.id, name: source.name }, executionId: run.id, metadata: { initial: true } })
      }
      return { source: sourceView(source), initial_run_id: initialRunId }
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/sources/test-connection',
    handler: (ctx) => {
      requirePermission(ctx, ctx.params.workspaceId, 'sources:write')
      const input = body<TestNewConnectionRequest>(ctx)
      const connector = connectorOr422(input.connector_type)
      requireAvailable(connector)
      const config = input.config ?? {}
      const errors = validateConfig(connector, config)
      if (errors.length) throw httpError.validation(errors, 'Complete the required connection settings before testing.')
      return simulateConnection(connector, config)
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/sources/discover',
    handler: (ctx) => {
      requirePermission(ctx, ctx.params.workspaceId, 'sources:write')
      const input = body<DiscoverRequest>(ctx)
      const connector = connectorOr422(input.connector_type)
      requireAvailable(connector)
      const config = input.config ?? {}
      const errors = validateConfig(connector, config)
      if (errors.length) throw httpError.validation(errors, 'Complete the required connection settings before discovery.')
      const test = simulateConnection(connector, config)
      if (!test.success) {
        throw new MockHttpError(400, test.error?.code ?? 'connection_failed', `Discovery could not connect: ${test.error?.message ?? 'unknown error'}`)
      }
      const tables = discoverTables(connector.type, config)
      return { schemas: schemasOf(tables), tables }
    },
  },
  {
    method: 'GET',
    path: '/sources/:sourceId',
    handler: (ctx) => {
      const source = findSource(ctx)
      requireWorkspace(ctx, source.workspace_id)
      return sourceView(source)
    },
  },
  {
    method: 'PATCH',
    path: '/sources/:sourceId',
    handler: (ctx) => {
      const source = findSource(ctx)
      const { user } = requirePermission(ctx, source.workspace_id, 'sources:write')
      const input = body<UpdateSourceRequest>(ctx)
      const connector = connectorOr422(source.connector_type)
      const keys = secretKeys(connector)
      const errors: FieldError[] = []

      let name = source.name
      if (input.name !== undefined) {
        const checked = validateName(source.workspace_id, input.name, source.id)
        name = checked.name
        errors.push(...checked.errors)
      }
      if (input.status !== undefined && input.status !== 'active' && input.status !== 'paused') {
        errors.push({ field: 'status', message: 'Status can only be set to "active" or "paused".' })
      }
      const config = input.config ?? {}
      if (input.config) {
        const storedSecrets = keys.filter((k) => source.secrets[k]?.is_set)
        errors.push(...validateConfig(connector, config, { storedSecrets, partial: true }))
      }
      if (input.selected_tables !== undefined) {
        errors.push(...validateTables(input.selected_tables, db.sourceTables[source.id] ?? [], connector.supports_incremental))
      }
      let schedule = source.schedule
      if (input.schedule !== undefined) {
        const checked = normaliseSchedule(input.schedule)
        schedule = checked.schedule
        errors.push(...checked.errors)
      }
      if (errors.length) throw httpError.validation(errors)
      if (input.status === 'active' && source.status === 'draft') {
        throw httpError.conflict('source_draft', 'Finish configuring this source before activating it.')
      }

      const before = auditSnapshot(source)
      const previousName = source.name
      const auditAfter: Record<string, unknown> = {}
      const now = nowIso()

      if (input.name !== undefined) {
        source.name = name
        auditAfter.name = name
      }
      let credentialsReplaced = false
      for (const [key, value] of Object.entries(config)) {
        if (keys.includes(key)) {
          if (value === null) {
            source.secrets[key] = { is_set: false, updated_at: now }
            auditAfter[key] = null
          } else if (typeof value === 'string' && value.length > 0) {
            source.secrets[key] = { is_set: true, updated_at: now }
            auditAfter[key] = '[updated]'
            credentialsReplaced = true
            if (value === 'wrong') {
              db.sourceFailures[source.id] = {
                stage: 'source_connect',
                code: 'source_auth_failed',
                message: connector.type === 'salesforce' ? 'Salesforce rejected the credentials (INVALID_CLIENT_CREDENTIALS).' : `Authentication failed for user "${String(source.config.username ?? '')}".`,
                details: 'The stored credentials were rejected by the source. Update them in the connection settings and retry.',
                retryable: true,
              }
              credentialsReplaced = false
            }
          }
          // Empty strings keep the stored secret.
          continue
        }
        const field = connector.config_fields.find((f) => f.key === key)
        if (isBlank(value)) delete source.config[key]
        else source.config[key] = field?.type === 'number' ? Number(value) : value
        auditAfter[key] = source.config[key] ?? null
      }
      if (credentialsReplaced && db.sourceFailures[source.id]) {
        // New credentials: clear the simulated failure; the next sync verifies them.
        delete db.sourceFailures[source.id]
        if (source.status === 'error') source.status = 'active'
        if (source.status !== 'paused') {
          source.health = 'unknown'
          source.health_message = 'Credentials updated. Run a sync to verify the connection.'
        }
      } else if (db.sourceFailures[source.id] && source.status !== 'paused') {
        source.status = 'error'
        source.health = 'unhealthy'
        source.health_message = db.sourceFailures[source.id].message
      }
      if (input.selected_tables !== undefined) {
        const available = db.sourceTables[source.id] ?? []
        source.selected_tables = input.selected_tables.map((t) => ({
          schema: t.schema,
          name: t.name,
          ingestion_mode: t.ingestion_mode,
          cursor_field: t.ingestion_mode === 'incremental' ? t.cursor_field : null,
          primary_key: available.find((a) => a.schema === t.schema && a.name === t.name)?.primary_key ?? t.primary_key ?? [],
        }))
        auditAfter.selected_tables = tablesLabel(source.selected_tables)
      }
      if (input.schedule !== undefined) {
        source.schedule = schedule
        auditAfter.schedule = scheduleLabel(schedule)
      }
      let action = 'source.updated'
      if (input.status !== undefined && input.status !== source.status && !(input.status === 'active' && source.status === 'error')) {
        if (input.status === 'paused') {
          source.status = 'paused'
          source.health = 'paused'
          source.health_message = `Paused by ${user.name}.`
          action = 'source.paused'
        } else {
          const derived = deriveHealth(source)
          source.status = derived.status
          source.health = derived.health
          source.health_message = derived.message
          action = 'source.resumed'
        }
        auditAfter.status = source.status
      }
      source.updated_at = now
      syncScheduleRecord(source, user, previousName)

      const changes = diffChanges(before, auditAfter, keys)
      // Nothing changed: skip the audit entry.
      if (action === 'source.updated' && changes.length === 0) return sourceView(source)
      recordAudit({
        workspaceId: source.workspace_id,
        actor: userActor(user),
        action,
        resource: { type: 'source', id: source.id, name: source.name },
        changes,
      })
      return sourceView(source)
    },
  },
  {
    method: 'DELETE',
    path: '/sources/:sourceId',
    handler: (ctx) => {
      const source = findSource(ctx)
      const { user } = requirePermission(ctx, source.workspace_id, 'sources:write')
      const pipelines = db.pipelines.filter((p) => p.source_ids.includes(source.id))
      if (pipelines.length) {
        throw httpError.conflict(
          'source_in_use',
          `"${source.name}" is used by ${pipelines.length} pipeline${pipelines.length === 1 ? '' : 's'} (${pipelines.map((p) => p.name).join(', ')}). Remove it from those pipelines first.`,
          { pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })) },
        )
      }
      const running = activeIngestion(source.id)
      if (running) {
        throw httpError.conflict('sync_in_progress', 'A sync is running for this source. Cancel it or wait for it to finish before deleting.', { run_id: running.id })
      }
      const removedSchedules = db.schedules.filter((s) => s.target_type === 'source_sync' && s.target_id === source.id)
      db.sources = db.sources.filter((s) => s.id !== source.id)
      db.schedules = db.schedules.filter((s) => !removedSchedules.includes(s))
      delete db.sourceTables[source.id]
      delete db.sourceFailures[source.id]
      recordAudit({
        workspaceId: source.workspace_id,
        actor: userActor(user),
        action: 'source.deleted',
        resource: { type: 'source', id: source.id, name: source.name },
        changes: [{ field: 'name', before: source.name, after: null }],
        metadata: { destination_schema: source.destination_schema, removed_schedules: removedSchedules.map((s) => s.id), bronze_data_retained: true },
      })
      return undefined
    },
  },
  {
    method: 'POST',
    path: '/sources/:sourceId/test-connection',
    handler: (ctx) => {
      const source = findSource(ctx)
      const input = body<{ config?: Record<string, ConfigValue> }>(ctx)
      const replacing = Boolean(input.config && Object.keys(input.config).length)
      const { user } = requirePermission(ctx, source.workspace_id, replacing ? 'sources:write' : 'sources:sync')
      const connector = connectorOr422(source.connector_type)
      const overrides = input.config ?? {}
      const errors = validateConfig(connector, overrides, { partial: true })
      if (errors.length) throw httpError.validation(errors)
      const merged = { ...source.config, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => !isBlank(v))) }
      const result = simulateConnection(connector, merged, source)
      recordAudit({
        workspaceId: source.workspace_id,
        actor: userActor(user),
        action: 'source.connection_tested',
        resource: { type: 'source', id: source.id, name: source.name },
        status: result.success ? 'success' : 'failure',
        metadata: { error_code: result.error?.code ?? null, replacement_values: replacing },
      })
      return result
    },
  },
  {
    method: 'GET',
    path: '/sources/:sourceId/schemas',
    handler: (ctx) => {
      const source = findSource(ctx)
      requireWorkspace(ctx, source.workspace_id)
      return schemasOf(db.sourceTables[source.id] ?? [])
    },
  },
  {
    method: 'GET',
    path: '/sources/:sourceId/tables',
    handler: (ctx) => {
      const source = findSource(ctx)
      requireWorkspace(ctx, source.workspace_id)
      const schema = qString(ctx, 'schema')
      return (db.sourceTables[source.id] ?? []).filter((t) => !schema || t.schema === schema)
    },
  },
  {
    method: 'GET',
    path: '/sources/:sourceId/tables/:table/preview',
    handler: (ctx) => {
      const source = findSource(ctx)
      requireWorkspace(ctx, source.workspace_id)
      const ref = ctx.params.table
      const dot = ref.indexOf('.')
      if (dot <= 0) throw httpError.badRequest('Table must be given as "schema.table".')
      const schemaName = ref.slice(0, dot)
      const tableName = ref.slice(dot + 1)
      const table = (db.sourceTables[source.id] ?? []).find((t) => t.schema === schemaName && t.name === tableName)
      const selected = source.selected_tables.some((t) => t.schema === schemaName && t.name === tableName)
      if (!table || !selected) throw httpError.notFound('Selected table', ref)
      if (!source.last_successful_sync_at) {
        throw httpError.conflict('no_data_loaded', 'No data has been loaded for this source yet. Run a sync, then preview the Bronze sample.')
      }
      const columns = previewColumns(source, table)
      const pageSize = Math.min(qNumber(ctx, 'page_size', 25), PREVIEW_MAX_ROWS)
      const total = Math.min(PREVIEW_MAX_ROWS, table.row_count_estimate ?? PREVIEW_MAX_ROWS)
      const page = qNumber(ctx, 'page', 1)
      const offset = (page - 1) * pageSize
      const count = Math.max(0, Math.min(pageSize, total - offset))
      return {
        columns,
        rows: generateRows(columns, count, `${source.id}:${ref}`, offset),
        total_rows: total,
        page,
        page_size: pageSize,
        sampled_at: source.last_successful_sync_at,
      }
    },
  },
  {
    method: 'POST',
    path: '/sources/:sourceId/sync',
    handler: (ctx) => {
      const source = findSource(ctx)
      const { user } = requirePermission(ctx, source.workspace_id, 'sources:sync')
      const input = body<TriggerSyncRequest>(ctx)
      if (source.status === 'paused') throw httpError.conflict('source_paused', `"${source.name}" is paused. Resume it before syncing.`)
      if (source.status === 'draft') throw httpError.conflict('source_draft', `"${source.name}" is a draft. Finish its configuration before syncing.`)
      const running = activeIngestion(source.id)
      if (running) throw httpError.conflict('sync_in_progress', `A sync for "${source.name}" is already ${running.status}.`, { run_id: running.id })
      if (input.mode !== undefined && input.mode !== 'full' && input.mode !== 'incremental') {
        throw httpError.validation([{ field: 'mode', message: 'Mode must be "full" or "incremental".' }])
      }
      if (input.tables?.length) {
        const known = new Set(source.selected_tables.map((t) => `${t.schema}.${t.name}`))
        const unknown = input.tables.filter((t) => !known.has(t))
        if (unknown.length) throw httpError.validation([{ field: 'tables', message: `Not selected for this source: ${unknown.join(', ')}.` }])
      }
      if (!source.selected_tables.length) throw httpError.conflict('no_tables_selected', 'Select at least one table before syncing.')
      const run = startSync(source, user, input)
      recordAudit({
        workspaceId: source.workspace_id,
        actor: userActor(user),
        action: 'source.sync_triggered',
        resource: { type: 'source', id: source.id, name: source.name },
        executionId: run.id,
        metadata: { mode: input.mode ?? 'default', tables: input.tables ?? 'all_selected' },
      })
      return publicRun(run)
    },
  },
  {
    method: 'GET',
    path: '/sources/:sourceId/runs',
    handler: (ctx) => {
      const source = findSource(ctx)
      requireWorkspace(ctx, source.workspace_id)
      const status = qString(ctx, 'status') as RunStatus | undefined
      const kind = qString(ctx, 'kind') as RunKind | undefined
      const items = db.runs
        .filter((r) => r.source_id === source.id && (r.kind === 'ingestion' || r.kind === 'pipeline'))
        .filter((r) => !status || r.status === status)
        .filter((r) => !kind || r.kind === kind)
        .sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))
        .map(publicRun)
      return paginate(items, ctx, 20)
    },
  },
]
