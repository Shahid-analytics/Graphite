import type { AuditEvent, MappingSuggestionSet, Notification, Permission, SchemaProposal } from '@/types'
import type { RunRecord } from '../db'
import { ROLE_PERMISSIONS } from '../permissions'
import { ago, pick, prng } from '../util'
import { createMemberships, USERS, WS_ACME, userRef } from './core'

const IPS = ['103.21.58.14', '49.36.112.7', '106.51.73.220', '182.70.14.91']

interface AuditTemplate {
  action: string
  resource: { type: string; id: string; name: string }
  /** "run": the event records a seeded run, whose trigger time, actor and id it takes. */
  actor: 'user' | 'scheduler' | 'service' | 'run'
  status?: AuditEvent['status']
  changes?: AuditEvent['changes']
  /** Permission the event needs: the actor holds it, or lacks it when the status is "denied". */
  permission?: Permission
}

const TEMPLATES: AuditTemplate[] = [
  { action: 'pipeline.run_triggered', resource: { type: 'pipeline', id: 'pl_sales', name: 'Sales Analytics' }, actor: 'run' },
  { action: 'pipeline.run_triggered', resource: { type: 'pipeline', id: 'pl_finance', name: 'Finance and Receivables' }, actor: 'run' },
  { action: 'source.sync_triggered', resource: { type: 'source', id: 'src_sf_prod', name: 'Salesforce Production' }, actor: 'run' },
  { action: 'source.sync_triggered', resource: { type: 'source', id: 'src_erp', name: 'ERP Database' }, actor: 'run' },
  { action: 'transformation.run_triggered', resource: { type: 'transformation', id: 'trf_fct_invoices', name: 'fct_invoices' }, actor: 'run' },
  { action: 'transformation.sql_updated', resource: { type: 'transformation', id: 'trf_stg_erp_items', name: 'stg_erp_items' }, actor: 'user', permission: 'transformations:write', changes: [{ field: 'sql', before: 'hsn_code::integer', after: 'hsn_code::varchar' }] },
  { action: 'schedule.updated', resource: { type: 'schedule', id: 'sch_finance', name: 'Finance every 6 hours' }, actor: 'user', permission: 'schedules:write', changes: [{ field: 'retry.max_attempts', before: 2, after: 3 }] },
  { action: 'schedule.disabled', resource: { type: 'schedule', id: 'sch_revenue_rebuild', name: 'Weekly revenue full rebuild' }, actor: 'user', permission: 'schedules:write', changes: [{ field: 'enabled', before: true, after: false }] },
  { action: 'dashboard.viewed', resource: { type: 'dashboard', id: 'dsh_exec_revenue', name: 'Executive Revenue Overview' }, actor: 'user' },
  { action: 'report.exported', resource: { type: 'report', id: 'rpt_overdue', name: 'Invoices overdue more than 60 days' }, actor: 'user' },
  { action: 'member.role_changed', resource: { type: 'member', id: 'usr_priya', name: 'Priya Nair' }, actor: 'user', permission: 'members:manage', changes: [{ field: 'role', before: 'viewer', after: 'editor' }] },
  { action: 'source.updated', resource: { type: 'source', id: 'src_sf_sandbox', name: 'Salesforce Sandbox' }, actor: 'user', permission: 'sources:write', changes: [{ field: 'status', before: 'active', after: 'paused' }] },
  { action: 'auth.login', resource: { type: 'session', id: 'ses', name: 'Web session' }, actor: 'user' },
  { action: 'auth.login_failed', resource: { type: 'session', id: 'ses', name: 'Web session' }, actor: 'user', status: 'failure' },
  { action: 'settings.metabase_updated', resource: { type: 'integration', id: 'metabase', name: 'Metabase' }, actor: 'user', permission: 'settings:manage', changes: [{ field: 'default_collection_id', before: 4, after: 7 }, { field: 'api_key', before: '[secret]', after: '[secret rotated]' }] },
  { action: 'mapping.suggestions_requested', resource: { type: 'mapping', id: 'map_erp_gold', name: 'ERP to Gold mappings' }, actor: 'user', permission: 'mappings:review' },
  { action: 'audit.exported', resource: { type: 'audit_log', id: 'audit', name: 'Audit log' }, actor: 'user', status: 'denied', permission: 'audit:export' },
  { action: 'source.connection_tested', resource: { type: 'source', id: 'src_web_orders', name: 'Web Orders DB' }, actor: 'user', status: 'failure', permission: 'sources:write' },
]

const SCHEDULER_ACTOR = { type: 'scheduler' as const, id: 'svc_scheduler', name: 'Scheduler' }

/**
 * The drawn user when their Acme role fits the event, otherwise the next active member
 * (in seed order) who does: a viewer never appears to change settings, and a denied
 * event is never recorded for someone who holds the permission.
 */
function actorFor(drawn: (typeof USERS)[number], permission: Permission | undefined, denied: boolean) {
  if (!permission) return drawn
  const roles = new Map(createMemberships().filter((m) => m.workspace_id === WS_ACME && m.status === 'active').map((m) => [m.user_id, m.role]))
  const allowed = (id: string) => {
    const role = roles.get(id)
    return role !== undefined && ROLE_PERMISSIONS[role].includes(permission) !== denied
  }
  if (allowed(drawn.id)) return drawn
  const start = USERS.indexOf(drawn)
  return [...USERS.slice(start + 1), ...USERS.slice(0, start)].find((u) => allowed(u.id)) ?? drawn
}

/** Audit actor for whoever triggered a seeded run. */
function runActor(run: RunRecord): AuditEvent['actor'] {
  if (run.triggered_by.id === SCHEDULER_ACTOR.id) return SCHEDULER_ACTOR
  const user = USERS.find((u) => u.id === run.triggered_by.id)
  return user ? { type: 'user', id: user.id, name: user.name, email: user.email } : { type: 'service', id: run.triggered_by.id, name: run.triggered_by.name }
}

/** Finished seeded runs of a resource: pipeline runs, source ingestion syncs or transformation builds. */
function runsOf(runs: RunRecord[], resource: AuditTemplate['resource']) {
  return runs.filter((r) => {
    if (r.sim) return false
    if (resource.type === 'pipeline') return r.kind === 'pipeline' && r.pipeline_id === resource.id
    if (resource.type === 'source') return r.kind === 'ingestion' && r.source_id === resource.id
    if (resource.type === 'transformation') return r.kind === 'transformation' && r.transformation_id === resource.id
    return false
  })
}

/** Time a seeded run finished (never in the future), falling back to `fallbackMinutesAgo` when the run is missing. */
function finishedAt(runs: RunRecord[], runId: string, fallbackMinutesAgo: number) {
  const finished = runs.find((r) => r.id === runId)?.finished_at
  if (!finished) return ago(fallbackMinutesAgo)
  return Date.parse(finished) > Date.now() ? ago(0) : finished
}

/** Seeded audit trail. Events about executions reference real seeded runs so their run links resolve. */
export function createAuditEvents(runs: RunRecord[]): AuditEvent[] {
  const rand = prng('audit')
  const events: AuditEvent[] = []
  const curated: AuditEvent[] = [
    { id: 'aud_c1', workspace_id: WS_ACME, workspace_name: 'Acme Distributors', occurred_at: finishedAt(runs, 'run_fin_000', 4), actor: SCHEDULER_ACTOR, action: 'pipeline.run_failed', resource: { type: 'pipeline', id: 'pl_finance', name: 'Finance and Receivables' }, status: 'failure', execution_id: 'run_fin_000', ip_address: null, changes: [], metadata: { stage: 'quality_checks', failing_test: 'unique_fct_invoices_invoice_id' } },
    { id: 'aud_c2', workspace_id: WS_ACME, workspace_name: 'Acme Distributors', occurred_at: finishedAt(runs, 'run_web_000', 60 * 7), actor: SCHEDULER_ACTOR, action: 'pipeline.run_failed', resource: { type: 'pipeline', id: 'pl_web_orders', name: 'Web Orders' }, status: 'failure', execution_id: 'run_web_000', ip_address: null, changes: [], metadata: { attempt: 3, error_code: 'source_auth_failed' } },
    { id: 'aud_c3', workspace_id: WS_ACME, workspace_name: 'Acme Distributors', occurred_at: finishedAt(runs, 'run_sfsync_008', 60 * 9), actor: { type: 'service', id: 'svc_ingestion', name: 'Ingestion service' }, action: 'model.schema_change_detected', resource: { type: 'model', id: 'mdl_bsf_opportunity', name: 'bronze_salesforce.opportunity' }, status: 'success', execution_id: 'run_sfsync_008', ip_address: null, changes: [{ field: 'columns', before: null, after: 'discount_approval__c (boolean)' }], metadata: {} },
    { id: 'aud_c4', workspace_id: WS_ACME, workspace_name: 'Acme Distributors', occurred_at: ago(60 * 26), actor: { type: 'user', id: 'usr_priya', name: 'Priya Nair', email: USERS[2].email }, action: 'mapping.submitted_for_review', resource: { type: 'mapping', id: 'map_erp_gold', name: 'ERP to Gold mappings' }, status: 'success', execution_id: null, ip_address: IPS[1], changes: [{ field: 'status', before: 'ready', after: 'in_review' }], metadata: { accepted: 9, modified: 2, rejected: 1 } },
    { id: 'aud_c5', workspace_id: WS_ACME, workspace_name: 'Acme Distributors', occurred_at: ago(60 * 24 * 3), actor: { type: 'user', id: 'usr_priya', name: 'Priya Nair', email: USERS[2].email }, action: 'source.created', resource: { type: 'source', id: 'src_web_orders', name: 'Web Orders DB' }, status: 'success', execution_id: null, ip_address: IPS[1], changes: [{ field: 'connector_type', before: null, after: 'postgres' }, { field: 'password', before: null, after: '[secret set]' }], metadata: {} },
  ]
  events.push(...curated)
  // Each seeded run is recorded at most once, so two "triggered" events never share an execution id.
  const recorded = new Set<string>()
  for (let i = 0; i < 140; i++) {
    const tpl = pick(rand, TEMPLATES)
    const user = actorFor(pick(rand, USERS.slice(0, 4)), tpl.permission, tpl.status === 'denied')
    const minutesAgo = 20 + i * 140 + Math.floor(rand() * 120)
    let occurredAt = ago(minutesAgo)
    let executionId: string | null = null
    let actor: AuditEvent['actor'] =
      tpl.actor === 'scheduler'
        ? SCHEDULER_ACTOR
        : tpl.actor === 'service'
          ? { type: 'service', id: 'svc_ingestion', name: 'Ingestion service' }
          : { type: 'user', id: user.id, name: user.name, email: user.email }
    if (tpl.actor === 'run') {
      // The unrecorded run of this resource closest to the slot; skip the slot when none is left.
      const target = Date.parse(occurredAt)
      const run = runsOf(runs, tpl.resource)
        .filter((r) => !recorded.has(r.id))
        .reduce<RunRecord | null>((best, r) => (!best || Math.abs(Date.parse(r.queued_at) - target) < Math.abs(Date.parse(best.queued_at) - target) ? r : best), null)
      if (!run) continue
      recorded.add(run.id)
      occurredAt = run.queued_at
      executionId = run.id
      actor = runActor(run)
    }
    events.push({
      id: `aud_${String(i).padStart(4, '0')}`,
      workspace_id: WS_ACME,
      workspace_name: 'Acme Distributors',
      occurred_at: occurredAt,
      actor,
      action: tpl.action,
      resource: tpl.resource,
      status: tpl.status ?? 'success',
      execution_id: executionId,
      ip_address: actor.type === 'user' ? pick(rand, IPS) : null,
      changes: tpl.changes ?? [],
      metadata: tpl.action === 'auth.login_failed' ? { reason: 'invalid_password' } : {},
    })
  }
  return events.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
}

export function createNotifications(runs: RunRecord[]): Notification[] {
  const n = (id: string, minutes: number, type: Notification['type'], severity: Notification['severity'], title: string, message: string, resource: Notification['resource'], read = false): Notification => ({
    id, workspace_id: WS_ACME, type, severity, title, message, created_at: ago(minutes), read_at: read ? ago(Math.max(1, minutes - 5)) : null, resource,
  })
  // The Finance quality failure is announced when run_fin_000 actually failed.
  const financeFailedAgo = Math.max(1, Math.round((Date.now() - Date.parse(finishedAt(runs, 'run_fin_000', 4))) / 60_000))
  return [
    n('ntf_01', financeFailedAgo, 'quality_failed', 'critical', 'Data quality check failed: fct_invoices', 'unique_fct_invoices_invoice_id failed with 14 duplicate rows. The Finance pipeline stopped before refreshing Metabase.', { type: 'model', id: 'mdl_g_fct_invoices', name: 'gold.fct_invoices' }),
    n('ntf_02', financeFailedAgo, 'pipeline_failed', 'critical', 'Finance and Receivables failed', 'Run run_fin_000 failed at Data quality checks.', { type: 'run', id: 'run_fin_000', name: 'Finance and Receivables' }),
    n('ntf_03', 60 * 7, 'repeated_retries', 'critical', 'Web Orders failed after 3 attempts', 'Authentication to Web Orders DB keeps failing. Update the stored password to resume syncs.', { type: 'source', id: 'src_web_orders', name: 'Web Orders DB' }),
    n('ntf_04', 60 * 9, 'schema_changed', 'warning', 'New column in Salesforce Opportunity', 'discount_approval__c (boolean) was added to bronze_salesforce.opportunity.', { type: 'model', id: 'mdl_bsf_opportunity', name: 'bronze_salesforce.opportunity' }),
    n('ntf_05', 19, 'sync_completed', 'success', 'Salesforce Production synced', '1,284 records loaded into bronze_salesforce in 2m 28s.', { type: 'source', id: 'src_sf_prod', name: 'Salesforce Production' }, true),
    n('ntf_06', 60 * 30, 'schema_changed', 'warning', 'Column type changed in ERP items', 'hsn_code changed from integer to varchar in bronze_erp.items.', { type: 'model', id: 'mdl_berp_items', name: 'bronze_erp.items' }),
    n('ntf_07', 60 * 20, 'stale_data', 'warning', 'agg_receivables_aging is stale', 'Last refreshed 31 hours ago against a 24 hour freshness SLA.', { type: 'model', id: 'mdl_g_agg_receivables_aging', name: 'gold.agg_receivables_aging' }),
    n('ntf_08', 60 * 50, 'stale_data', 'warning', 'Web order tables are stale', 'bronze_web.orders has not been refreshed for 3 days.', { type: 'model', id: 'mdl_bweb_orders', name: 'bronze_web.orders' }, true),
    n('ntf_09', 134, 'sync_completed', 'success', 'ERP Database synced', '6,913 records loaded into bronze_erp in 6m 52s.', { type: 'source', id: 'src_erp', name: 'ERP Database' }, true),
    n('ntf_10', 60 * 24 * 1 + 30, 'sync_completed', 'success', 'Inventory Daily completed', 'Stock snapshot refreshed for 6 warehouses.', { type: 'pipeline', id: 'pl_inventory', name: 'Inventory Daily' }, true),
    n('ntf_11', 60 * 24 * 2, 'quality_failed', 'warning', 'Warning-level tests on fct_payments', '6 payments reference invoices that are missing from fct_invoices.', { type: 'model', id: 'mdl_g_fct_payments', name: 'gold.fct_payments' }, true),
    n('ntf_12', 60 * 31, 'pipeline_failed', 'critical', 'Finance and Receivables failed', 'Database error in model stg_erp_items after the hsn_code type change.', { type: 'pipeline', id: 'pl_finance', name: 'Finance and Receivables' }, true),
  ]
}

export function createMappingSets(): MappingSuggestionSet[] {
  const provider = { name: 'Graphite mock suggestion engine', model: 'simulated', simulated: true }
  const erp: MappingSuggestionSet = {
    id: 'map_erp_gold',
    workspace_id: WS_ACME,
    source_id: 'src_erp',
    source_name: 'ERP Database',
    source_tables: ['public.invoices', 'public.payments', 'public.customers'],
    target_layer: 'gold',
    business_context: 'We want a collections fact to track how fast distributors pay and a customer dimension keyed on GSTIN.',
    status: 'in_review',
    provider,
    created_at: ago(60 * 28),
    created_by: userRef('usr_priya'),
    submitted_at: ago(60 * 26),
    field_mappings: [
      { id: 'fm_1', source_table: 'public.invoices', source_field: 'invoice_no', source_type: 'varchar', target_model: 'fct_collections', target_field: 'invoice_number', target_type: 'varchar(32)', normalization_rule: 'trim, upper', confidence: 0.96, rationale: 'Values match the pattern INV/YY-YY/NNNNN and are unique per fiscal year.', decision: 'accepted' },
      { id: 'fm_2', source_table: 'public.invoices', source_field: 'invoice_date', source_type: 'date', target_model: 'fct_collections', target_field: 'invoice_date_key', target_type: 'integer', normalization_rule: "to_char(invoice_date, 'YYYYMMDD')::integer", confidence: 0.93, rationale: 'Gold facts join to dim_date on an integer date key.', decision: 'accepted' },
      { id: 'fm_3', source_table: 'public.payments', source_field: 'paid_on', source_type: 'date', target_model: 'fct_collections', target_field: 'paid_date_key', target_type: 'integer', normalization_rule: "to_char(paid_on, 'YYYYMMDD')::integer", confidence: 0.91, rationale: 'Same convention as invoice_date_key.', decision: 'accepted' },
      { id: 'fm_4', source_table: 'public.payments', source_field: 'amount', source_type: 'numeric', target_model: 'fct_collections', target_field: 'amount_collected', target_type: 'numeric(18,2)', normalization_rule: 'round to 2 decimals', confidence: 0.94, rationale: 'Currency amounts in INR with paise precision.', decision: 'accepted' },
      { id: 'fm_5', source_table: 'public.payments', source_field: 'mode', source_type: 'varchar', target_model: 'fct_collections', target_field: 'payment_mode', target_type: 'varchar(16)', normalization_rule: "map {'neft','NEFT ','Neft'} -> 'NEFT'; {'upi','UPI'} -> 'UPI'", confidence: 0.78, rationale: '11 distinct spellings collapse into 5 canonical payment modes.', decision: 'modified' },
      { id: 'fm_6', source_table: 'public.customers', source_field: 'gstin', source_type: 'varchar', target_model: 'dim_distributor', target_field: 'gstin', target_type: 'char(15)', normalization_rule: 'upper(trim(gstin)); null when not 15 characters', confidence: 0.88, rationale: '93% of values are valid 15-character GSTINs; 212 rows are null.', decision: 'accepted' },
      { id: 'fm_7', source_table: 'public.customers', source_field: 'customer_name', source_type: 'varchar', target_model: 'dim_distributor', target_field: 'distributor_name', target_type: 'varchar(200)', normalization_rule: 'trim; collapse repeated spaces', confidence: 0.9, rationale: 'Display name for the distributor dimension.', decision: 'accepted' },
      { id: 'fm_8', source_table: 'public.customers', source_field: 'state', source_type: 'varchar', target_model: 'dim_distributor', target_field: 'state_code', target_type: 'char(2)', normalization_rule: 'map state name to ISO 3166-2:IN code', confidence: 0.71, rationale: 'State names are free text (e.g. "Maharastra", "MH").', decision: 'modified' },
      { id: 'fm_9', source_table: 'public.customers', source_field: 'credit_limit', source_type: 'numeric', target_model: 'dim_distributor', target_field: 'credit_limit', target_type: 'numeric(18,2)', normalization_rule: null, confidence: 0.86, rationale: 'Direct mapping.', decision: 'accepted' },
      { id: 'fm_10', source_table: 'public.invoices', source_field: 'status', source_type: 'varchar', target_model: 'fct_collections', target_field: 'is_cancelled', target_type: 'boolean', normalization_rule: "status = 'CANCELLED'", confidence: 0.64, rationale: 'Cancelled invoices should be excluded from collection metrics.', decision: 'rejected' },
      { id: 'fm_11', source_table: 'public.payments', source_field: 'reference_no', source_type: 'varchar', target_model: 'fct_collections', target_field: 'bank_reference', target_type: 'varchar(64)', normalization_rule: 'trim', confidence: 0.82, rationale: 'UTR or cheque number for reconciliation.', decision: 'accepted' },
      { id: 'fm_12', source_table: 'public.invoices', source_field: 'due_date', source_type: 'date', target_model: 'fct_collections', target_field: 'days_past_due', target_type: 'integer', normalization_rule: 'paid_on - due_date', confidence: 0.84, rationale: 'Derived measure for collection efficiency.', decision: 'accepted' },
    ],
    join_candidates: [
      { id: 'jc_1', left_table: 'public.payments', left_field: 'invoice_id', right_table: 'public.invoices', right_field: 'invoice_id', cardinality: 'many_to_one', match_rate: 0.9988, confidence: 0.97, rationale: '99.88% of payments match an invoice; 6 orphan payments found.', decision: 'accepted' },
      { id: 'jc_2', left_table: 'public.invoices', left_field: 'customer_code', right_table: 'public.customers', right_field: 'customer_code', cardinality: 'many_to_one', match_rate: 1, confidence: 0.98, rationale: 'Every invoice references an existing customer.', decision: 'accepted' },
      { id: 'jc_3', left_table: 'public.customers', left_field: 'gstin', right_table: 'salesforce.Account', right_field: 'GSTIN__c', cardinality: 'one_to_one', match_rate: 0.62, confidence: 0.58, rationale: 'Only 62% of Salesforce accounts carry a GSTIN; consider a fallback on normalised name and city.', decision: 'pending' },
    ],
    key_candidates: [
      { id: 'kc_1', table: 'public.customers', fields: ['customer_code'], key_type: 'primary', uniqueness: 1, confidence: 0.99, rationale: 'Unique and never null.', decision: 'accepted' },
      { id: 'kc_2', table: 'public.customers', fields: ['gstin'], key_type: 'business', uniqueness: 0.991, confidence: 0.81, rationale: 'Business identifier, but 212 nulls and 27 shared GSTINs (branches of the same firm).', decision: 'accepted' },
      { id: 'kc_3', table: 'dim_distributor', fields: ['customer_code', 'valid_from'], key_type: 'surrogate', uniqueness: 1, confidence: 0.9, rationale: 'Hash surrogate key to support SCD type 2 history.', decision: 'accepted' },
      { id: 'kc_4', table: 'public.invoices', fields: ['invoice_id'], key_type: 'primary', uniqueness: 0.9998, confidence: 0.74, rationale: '14 duplicate ids caused by re-issued credit notes. Consider (invoice_id, invoice_type).', decision: 'pending' },
    ],
    model_proposals: [
      { id: 'mp_1', name: 'fct_collections', model_type: 'fact', grain: 'One row per payment allocated to an invoice', description: 'Collections with days past due for receivables analysis.', source_tables: ['public.payments', 'public.invoices'], columns: [{ name: 'payment_id', data_type: 'bigint', expression: 'payments.payment_id', description: 'Payment identifier.' }, { name: 'invoice_number', data_type: 'varchar(32)', expression: 'upper(trim(invoices.invoice_no))', description: 'Invoice number.' }, { name: 'distributor_sk', data_type: 'varchar(32)', expression: 'dim_distributor.distributor_sk', description: 'Distributor surrogate key.' }, { name: 'amount_collected', data_type: 'numeric(18,2)', expression: 'round(payments.amount, 2)', description: 'Amount collected.' }, { name: 'days_past_due', data_type: 'integer', expression: 'payments.paid_on - invoices.due_date', description: 'Days paid after due date.' }], confidence: 0.87, rationale: 'Payments carry invoice references and amounts; a payment-grain fact supports DSO and ageing.', decision: 'accepted' },
      { id: 'mp_2', name: 'dim_distributor', model_type: 'dimension', grain: 'One row per distributor version (SCD type 2)', description: 'Distributor master with GSTIN, state code and credit limit.', source_tables: ['public.customers'], columns: [{ name: 'distributor_sk', data_type: 'varchar(32)', expression: "md5(customer_code || valid_from)", description: 'Surrogate key.' }, { name: 'customer_code', data_type: 'varchar(20)', expression: 'customers.customer_code', description: 'ERP customer code.' }, { name: 'gstin', data_type: 'char(15)', expression: 'upper(trim(customers.gstin))', description: 'GSTIN.' }, { name: 'state_code', data_type: 'char(2)', expression: 'state_code_map(customers.state)', description: 'ISO state code.' }], confidence: 0.84, rationale: 'Customer attributes change over time (credit limit); SCD2 preserves history for reporting.', decision: 'modified' },
    ],
    review: null,
  }
  const sf: MappingSuggestionSet = {
    id: 'map_sf_silver',
    workspace_id: WS_ACME,
    source_id: 'src_sf_prod',
    source_name: 'Salesforce Production',
    source_tables: ['salesforce.Opportunity', 'salesforce.Account'],
    target_layer: 'silver',
    business_context: 'Standardise opportunity stages and account locations.',
    status: 'approved',
    provider,
    created_at: ago(60 * 24 * 21),
    created_by: userRef('usr_priya'),
    submitted_at: ago(60 * 24 * 20),
    field_mappings: [
      { id: 'fm_s1', source_table: 'salesforce.Opportunity', source_field: 'StageName', source_type: 'varchar', target_model: 'stg_sf_opportunities', target_field: 'stage', target_type: 'varchar(40)', normalization_rule: 'map legacy stages to the 2025 sales process', confidence: 0.83, rationale: 'Two stage vocabularies are in use.', decision: 'accepted' },
      { id: 'fm_s2', source_table: 'salesforce.Account', source_field: 'BillingCity', source_type: 'varchar', target_model: 'stg_sf_accounts', target_field: 'city', target_type: 'varchar(80)', normalization_rule: 'initcap(trim())', confidence: 0.9, rationale: 'Mixed casing.', decision: 'accepted' },
    ],
    join_candidates: [],
    key_candidates: [{ id: 'kc_s1', table: 'salesforce.Opportunity', fields: ['Id'], key_type: 'primary', uniqueness: 1, confidence: 0.99, rationale: 'Salesforce record id.', decision: 'accepted' }],
    model_proposals: [],
    review: { action: 'approved', reviewed_by: userRef('usr_rahul'), reviewed_at: ago(60 * 24 * 19), comment: 'Approved. Stage mapping agreed with sales operations.' },
  }
  return [erp, sf]
}

export function createProposals(): SchemaProposal[] {
  return [
    {
      id: 'prop_collections',
      workspace_id: WS_ACME,
      title: 'Collections fact and distributor dimension',
      description: 'Drafted by hand from the finance team collections requirements. Adds fct_collections, dim_distributor with an SCD2 surrogate key, and their relationship. The ERP to Gold AI mapping suggestions for the same tables are still in review and are not the basis of this proposal.',
      status: 'pending_review',
      origin: 'manual',
      mapping_suggestion_id: null,
      changes: [
        { id: 'chg_1', change_type: 'create_table', model_name: 'dim_distributor', layer: 'gold', model_role: 'dimension', summary: 'Create SCD type 2 distributor dimension.', columns: [{ name: 'distributor_sk', data_type: 'varchar(32)', is_key: true, description: 'Surrogate key.' }, { name: 'customer_code', data_type: 'varchar(20)', is_key: false, description: 'Business key.' }, { name: 'gstin', data_type: 'char(15)', is_key: false, description: 'GSTIN.' }, { name: 'state_code', data_type: 'char(2)', is_key: false, description: 'ISO state code.' }, { name: 'credit_limit', data_type: 'numeric(18,2)', is_key: false, description: 'Credit limit.' }, { name: 'valid_from', data_type: 'date', is_key: false, description: 'Version start.' }, { name: 'is_current', data_type: 'boolean', is_key: false, description: 'Current version flag.' }], relationship: null, ddl_preview: 'create table gold.dim_distributor (\n  distributor_sk varchar(32) primary key,\n  customer_code  varchar(20) not null,\n  gstin          char(15),\n  state_code     char(2),\n  credit_limit   numeric(18,2),\n  valid_from     date not null,\n  is_current     boolean not null\n);' },
        { id: 'chg_2', change_type: 'create_table', model_name: 'fct_collections', layer: 'gold', model_role: 'fact', summary: 'Create payment-grain collections fact.', columns: [{ name: 'payment_id', data_type: 'bigint', is_key: true, description: 'Payment id.' }, { name: 'invoice_number', data_type: 'varchar(32)', is_key: false, description: 'Invoice number.' }, { name: 'distributor_sk', data_type: 'varchar(32)', is_key: false, description: 'Distributor key.' }, { name: 'paid_date_key', data_type: 'integer', is_key: false, description: 'Payment date key.' }, { name: 'amount_collected', data_type: 'numeric(18,2)', is_key: false, description: 'Amount.' }, { name: 'days_past_due', data_type: 'integer', is_key: false, description: 'Days late.' }], relationship: null, ddl_preview: 'create table gold.fct_collections (\n  payment_id       bigint primary key,\n  invoice_number   varchar(32) not null,\n  distributor_sk   varchar(32) not null,\n  paid_date_key    integer not null,\n  amount_collected numeric(18,2) not null,\n  days_past_due    integer\n);' },
        { id: 'chg_3', change_type: 'add_relationship', model_name: 'fct_collections', layer: 'gold', model_role: 'fact', summary: 'fct_collections.distributor_sk references dim_distributor.distributor_sk.', columns: [], relationship: { from_column: 'distributor_sk', to_model: 'dim_distributor', to_column: 'distributor_sk' }, ddl_preview: "-- dbt test (schema.yml)\n- name: distributor_sk\n  tests:\n    - relationships:\n        to: ref('dim_distributor')\n        field: distributor_sk" },
      ],
      created_by: userRef('usr_priya'),
      created_at: ago(60 * 25),
      reviewed_by: null,
      reviewed_at: null,
      review_comment: null,
      apply_run_id: null,
    },
    {
      id: 'prop_sales_rep_sk',
      workspace_id: WS_ACME,
      title: 'Surrogate key for dim_sales_rep',
      description: 'Replace the natural Salesforce user id with a surrogate key so reps can be re-assigned without breaking history.',
      status: 'applied',
      origin: 'manual',
      mapping_suggestion_id: null,
      changes: [
        { id: 'chg_r1', change_type: 'add_surrogate_key', model_name: 'dim_sales_rep', layer: 'gold', model_role: 'dimension', summary: 'Add sales_rep_sk generated from user_id.', columns: [{ name: 'sales_rep_sk', data_type: 'bigint', is_key: true, description: 'Surrogate key.' }, { name: 'user_id', data_type: 'varchar', is_key: false, description: 'Salesforce user id the key is generated from.' }], relationship: null, ddl_preview: "alter table gold.dim_sales_rep\n  add column sales_rep_sk bigint;\n-- populated in the dbt model by:\n-- {{ dbt_utils.generate_surrogate_key(['user_id']) }} as sales_rep_sk" },
      ],
      created_by: userRef('usr_priya'),
      created_at: ago(60 * 24 * 34),
      reviewed_by: userRef('usr_rahul'),
      reviewed_at: ago(60 * 24 * 33),
      review_comment: 'Looks good.',
      apply_run_id: null,
    },
    {
      id: 'prop_order_channel',
      workspace_id: WS_ACME,
      title: 'Add channel dimension for web orders',
      description: 'Draft: normalise storefront channels (web, app, marketplace) into a small dimension.',
      status: 'draft',
      origin: 'manual',
      mapping_suggestion_id: null,
      changes: [
        { id: 'chg_o1', change_type: 'create_table', model_name: 'dim_channel', layer: 'gold', model_role: 'dimension', summary: 'Create channel dimension.', columns: [{ name: 'channel_sk', data_type: 'integer', is_key: true, description: 'Surrogate key.' }, { name: 'channel_code', data_type: 'varchar(20)', is_key: false, description: 'Channel code.' }, { name: 'channel_name', data_type: 'varchar(60)', is_key: false, description: 'Display name.' }], relationship: null, ddl_preview: 'create table gold.dim_channel (\n  channel_sk   integer primary key,\n  channel_code varchar(20) not null,\n  channel_name varchar(60) not null\n);' },
      ],
      created_by: userRef('usr_priya'),
      created_at: ago(60 * 24 * 1),
      reviewed_by: null,
      reviewed_at: null,
      review_comment: null,
      apply_run_id: null,
    },
  ]
}

