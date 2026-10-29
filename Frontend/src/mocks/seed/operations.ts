import type { Pipeline, RunError, Schedule, StageKey } from '@/types'
import type { RunRecord } from '../db'
import { FINANCE_DUPLICATE_INVOICES } from '../engine/failures'
import { ALL_STAGES, createHistoricalRun, createSimRun } from '../engine/runs'
import { ago, prng } from '../util'
import { WS_ACME, userRef } from './core'

const HOUR = 3_600_000
const SCHEDULER = { id: 'svc_scheduler', name: 'Scheduler' }

export const PIPELINE_STAGES: Record<string, StageKey[]> = {
  pl_sales: ALL_STAGES,
  pl_finance: ALL_STAGES,
  pl_inventory: ALL_STAGES,
  pl_web_orders: ALL_STAGES.filter((s) => s !== 'metabase_refresh'),
  pl_customer360: ALL_STAGES,
}

export function createPipelines(): Pipeline[] {
  const base = {
    workspace_id: WS_ACME,
    quality_checks_enabled: true,
    metabase_refresh_enabled: true,
    next_run_at: null,
    last_run: null,
    success_rate_7d: null,
    avg_duration_seconds: null,
  }
  return [
    { ...base, id: 'pl_sales', name: 'Sales Analytics', description: 'Salesforce opportunities and accounts into the sales pipeline and rep performance models.', status: 'active', source_ids: ['src_sf_prod'], dbt_selector: 'tag:sales+', stages: PIPELINE_STAGES.pl_sales, schedule_id: 'sch_sales', owner: userRef('usr_priya'), created_at: ago(60 * 24 * 130), updated_at: ago(60 * 24 * 14) },
    { ...base, id: 'pl_finance', name: 'Finance and Receivables', description: 'ERP invoices and payments into revenue, collections and receivables ageing.', status: 'active', source_ids: ['src_erp'], dbt_selector: 'tag:finance+', stages: PIPELINE_STAGES.pl_finance, schedule_id: 'sch_finance', owner: userRef('usr_rahul'), created_at: ago(60 * 24 * 128), updated_at: ago(60 * 24 * 6) },
    { ...base, id: 'pl_inventory', name: 'Inventory Daily', description: 'Daily stock positions and valuation by warehouse.', status: 'active', source_ids: ['src_erp'], dbt_selector: 'tag:inventory+', stages: PIPELINE_STAGES.pl_inventory, schedule_id: 'sch_inventory', owner: userRef('usr_rahul'), created_at: ago(60 * 24 * 101), updated_at: ago(60 * 24 * 30) },
    { ...base, id: 'pl_web_orders', name: 'Web Orders', description: 'Storefront orders for fulfilment and channel reporting.', status: 'active', source_ids: ['src_web_orders'], dbt_selector: 'tag:web+', stages: PIPELINE_STAGES.pl_web_orders, metabase_refresh_enabled: false, schedule_id: 'sch_web', owner: userRef('usr_priya'), created_at: ago(60 * 24 * 60), updated_at: ago(60 * 24 * 3) },
    { ...base, id: 'pl_customer360', name: 'Customer 360', description: 'Unified customer profile across Salesforce, ERP and web orders. Draft: awaiting approval of AI-suggested mappings.', status: 'draft', source_ids: ['src_sf_prod', 'src_erp', 'src_web_orders'], dbt_selector: 'tag:customer+', stages: PIPELINE_STAGES.pl_customer360, schedule_id: null, owner: userRef('usr_priya'), created_at: ago(60 * 24 * 4), updated_at: ago(60 * 24 * 2) },
  ]
}

const SF_RATE_LIMIT: RunError = { stage: 'ingestion', code: 'source_rate_limited', message: 'Salesforce API returned REQUEST_LIMIT_EXCEEDED.', details: 'TotalRequests Limit exceeded (daily API limit 100000). The next scheduled run will resume from the saved cursor.', retryable: true }
const DBT_COMPILE: RunError = { stage: 'dbt_transform', code: 'dbt_model_error', message: 'Database error in model stg_erp_items: invalid input syntax for type integer: "8471A"', details: 'hsn_code changed from integer to varchar in the source. Update the staging model cast.', retryable: false }
export const WEB_AUTH: RunError = { stage: 'source_connect', code: 'source_auth_failed', message: 'Authentication failed for user "graphite_reader".', details: 'FATAL: password authentication failed for user "graphite_reader" (SQLSTATE 28P01). Update the password in the connection settings and retry.', retryable: true }

/**
 * Metabase is unreachable in the demo, so no seeded pipeline run reports a successful
 * Metabase refresh; the stage is skipped with a reason, as it is for new runs.
 */
const METABASE_SKIPPED: StageKey[] = ['metabase_refresh']

const SF_TABLES = ['Account', 'Contact', 'Opportunity', 'OpportunityLineItem', 'Product2', 'User'].map((t) => ({ table: `salesforce.${t}`, mode: 'incremental' as const }))
const ERP_TABLES = ['public.invoices', 'public.invoice_lines', 'public.customers', 'public.items', 'public.payments', 'inventory.stock_levels', 'inventory.warehouses'].map((t) => ({ table: t, mode: 'incremental' as const }))
const WEB_TABLES = ['public.orders', 'public.order_items'].map((t) => ({ table: t, mode: 'incremental' as const }))

export function createRuns(): RunRecord[] {
  const runs: RunRecord[] = []
  const now = Date.now()
  const rand = prng('runs')
  const align = (intervalH: number, offsetMin: number) => {
    const intervalMs = intervalH * HOUR
    return Math.floor(now / intervalMs) * intervalMs + offsetMin * 60_000 - (offsetMin * 60_000 > now % intervalMs ? intervalMs : 0)
  }

  // Sales Analytics: every 4 hours, 14 days.
  let t = align(4, 2)
  for (let i = 0; i < 84; i++, t -= 4 * HOUR) {
    const failed = i === 9 || i === 37
    runs.push(createHistoricalRun({ id: `run_sales_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'pipeline', trigger: i === 3 ? 'manual' : 'schedule', triggeredBy: i === 3 ? userRef('usr_priya') : SCHEDULER, targetName: 'Sales Analytics', links: { pipeline_id: 'pl_sales', source_id: 'src_sf_prod', schedule_id: i === 3 ? null : 'sch_sales' }, startedMs: t, skipped: METABASE_SKIPPED, status: failed ? 'failed' : 'succeeded', failAt: failed ? SF_RATE_LIMIT : null, records: 900 + Math.floor(rand() * 900), tables: SF_TABLES }))
  }

  // Finance: every 6 hours; latest failed on quality checks.
  t = align(6, 0)
  for (let i = 0; i < 56; i++, t -= 6 * HOUR) {
    let status: 'succeeded' | 'failed' | 'cancelled' = 'succeeded'
    let failAt: RunError | null = null
    if (i === 0) [status, failAt] = ['failed', FINANCE_DUPLICATE_INVOICES]
    if (i === 5) [status, failAt] = ['failed', DBT_COMPILE]
    if (i === 17) status = 'cancelled'
    runs.push(createHistoricalRun({ id: `run_fin_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'pipeline', trigger: i === 17 ? 'manual' : 'schedule', triggeredBy: i === 17 ? userRef('usr_rahul') : SCHEDULER, targetName: 'Finance and Receivables', links: { pipeline_id: 'pl_finance', source_id: 'src_erp', schedule_id: i === 17 ? null : 'sch_finance' }, startedMs: t, status, failAt, skipped: METABASE_SKIPPED, records: 5200 + Math.floor(rand() * 3000), tables: ERP_TABLES }))
  }

  // Inventory daily at 06:00 IST (00:30 UTC).
  t = align(24, 30) - 24 * HOUR
  for (let i = 0; i < 14; i++, t -= 24 * HOUR) {
    runs.push(createHistoricalRun({ id: `run_inv_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'pipeline', trigger: 'schedule', triggeredBy: SCHEDULER, targetName: 'Inventory Daily', links: { pipeline_id: 'pl_inventory', source_id: 'src_erp', schedule_id: 'sch_inventory' }, startedMs: t, skipped: METABASE_SKIPPED, status: 'succeeded', records: 6200 + Math.floor(rand() * 400), tables: ERP_TABLES.slice(5) }))
  }

  // Web orders: daily; the last three attempts failed on authentication.
  t = now - 7 * HOUR
  for (let i = 0; i < 14; i++) {
    const failing = i < 3
    const startedMs = failing ? t - i * 25 * 60_000 : t - (i - 2) * 24 * HOUR
    runs.push(createHistoricalRun({ id: `run_web_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'pipeline', trigger: failing && i < 2 ? 'retry' : 'schedule', triggeredBy: SCHEDULER, targetName: 'Web Orders', links: { pipeline_id: 'pl_web_orders', source_id: 'src_web_orders', schedule_id: 'sch_web' }, startedMs, stages: PIPELINE_STAGES.pl_web_orders, status: failing ? 'failed' : 'succeeded', failAt: failing ? WEB_AUTH : null, attempt: failing ? 3 - i : 1, retryOf: failing && i < 2 ? `run_web_${String(i + 1).padStart(3, '0')}` : null, records: failing ? 0 : 410 + Math.floor(rand() * 120), tables: WEB_TABLES }))
  }

  // Standalone ingestion syncs.
  t = align(1, 0)
  for (let i = 0; i < 36; i++, t -= HOUR) {
    runs.push(createHistoricalRun({ id: `run_sfsync_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'ingestion', trigger: 'schedule', triggeredBy: SCHEDULER, targetName: 'Salesforce Production', links: { source_id: 'src_sf_prod', schedule_id: 'sch_sf_sync' }, startedMs: t + 60_000, status: i === 20 ? 'failed' : 'succeeded', failAt: i === 20 ? SF_RATE_LIMIT : null, records: 120 + Math.floor(rand() * 1400), tables: SF_TABLES }))
  }
  t = align(6, 0) - 6 * HOUR
  for (let i = 0; i < 20; i++, t -= 6 * HOUR) {
    runs.push(createHistoricalRun({ id: `run_erpsync_${String(i).padStart(3, '0')}`, workspaceId: WS_ACME, kind: 'ingestion', trigger: 'schedule', triggeredBy: SCHEDULER, targetName: 'ERP Database', links: { source_id: 'src_erp', schedule_id: 'sch_erp_sync' }, startedMs: t + 5 * 60_000, status: 'succeeded', records: 4000 + Math.floor(rand() * 4000), tables: ERP_TABLES }))
  }
  for (let i = 0; i < 3; i++) {
    runs.push(createHistoricalRun({ id: `run_sbx_${i}`, workspaceId: WS_ACME, kind: 'ingestion', trigger: 'manual', triggeredBy: userRef('usr_rahul'), targetName: 'Salesforce Sandbox', links: { source_id: 'src_sf_sandbox' }, startedMs: now - (6 + i * 3) * 24 * HOUR, status: 'succeeded', records: 1820, tables: SF_TABLES.slice(0, 2).map((x) => ({ ...x })) }))
  }

  // Ad hoc dbt runs and tests.
  const adhoc: [string, string, 'transformation' | 'dbt_test', number, 'succeeded' | 'failed'][] = [
    ['trf_fct_invoices', 'fct_invoices', 'dbt_test', 2.2, 'failed'],
    ['trf_fct_invoices', 'fct_invoices', 'transformation', 2.6, 'succeeded'],
    ['trf_int_customers_unified', 'int_customers_unified', 'transformation', 5, 'succeeded'],
    ['trf_dim_customer', 'dim_customer', 'transformation', 26, 'succeeded'],
    ['trf_fct_sales_pipeline', 'fct_sales_pipeline', 'dbt_test', 30, 'succeeded'],
    ['trf_stg_erp_items', 'stg_erp_items', 'transformation', 30.5, 'failed'],
    ['trf_stg_erp_items', 'stg_erp_items', 'transformation', 29, 'succeeded'],
    ['trf_agg_monthly_revenue', 'agg_monthly_revenue', 'transformation', 50, 'succeeded'],
    ['trf_customers', 'customers', 'dbt_test', 74, 'succeeded'],
  ]
  adhoc.forEach(([id, name, kind, hoursAgo, status], i) => {
    runs.push(createHistoricalRun({ id: `run_dbt_${i}`, workspaceId: WS_ACME, kind, trigger: 'manual', triggeredBy: userRef(i % 2 ? 'usr_rahul' : 'usr_priya'), targetName: name, links: { transformation_id: id }, startedMs: now - hoursAgo * HOUR, status, failAt: status === 'failed' ? (kind === 'dbt_test' ? { ...FINANCE_DUPLICATE_INVOICES, message: 'unique_fct_invoices_invoice_id failed (14 rows).' } : { ...DBT_COMPILE, stage: 'dbt_transform' }) : null }))
  })

  // An Inventory run that is in progress when the demo loads.
  const live = createSimRun({ workspaceId: WS_ACME, kind: 'pipeline', trigger: 'manual', triggeredBy: userRef('usr_rahul'), targetName: 'Inventory Daily', links: { pipeline_id: 'pl_inventory', source_id: 'src_erp' }, stages: PIPELINE_STAGES.pl_inventory, skipped: METABASE_SKIPPED, records: 6380, tables: ERP_TABLES.slice(5) })
  if (live.sim) {
    live.sim.start_ms = now - 9000
    live.queued_at = ago(0.2)
    live.sim.durations_ms = live.sim.durations_ms.map((d) => d * 2)
  }
  runs.push(live)

  return runs.sort((a, b) => Date.parse(b.queued_at) - Date.parse(a.queued_at))
}

export function createSchedules(): Schedule[] {
  const base = {
    workspace_id: WS_ACME,
    timezone: 'Asia/Kolkata',
    enabled: true,
    retry: { max_attempts: 2, backoff_seconds: 300, backoff_strategy: 'exponential' as const },
    concurrency: { max_concurrent_runs: 1, overlap_policy: 'skip' as const },
    next_run_at: null,
    last_run: null,
    created_by: userRef('usr_rahul'),
    created_at: ago(60 * 24 * 120),
    updated_at: ago(60 * 24 * 10),
  }
  return [
    { ...base, id: 'sch_sales', name: 'Sales Analytics every 4 hours', description: 'Keeps pipeline dashboards current through the working day.', target_type: 'pipeline', target_id: 'pl_sales', target_name: 'Sales Analytics', preset: 'custom', cron: '0 */4 * * *' },
    { ...base, id: 'sch_finance', name: 'Finance every 6 hours', description: 'Revenue, collections and receivables.', target_type: 'pipeline', target_id: 'pl_finance', target_name: 'Finance and Receivables', preset: 'every_6_hours', cron: '0 */6 * * *', retry: { max_attempts: 3, backoff_seconds: 600, backoff_strategy: 'exponential' } },
    { ...base, id: 'sch_inventory', name: 'Inventory before business hours', description: 'Stock positions ready by 06:30 IST.', target_type: 'pipeline', target_id: 'pl_inventory', target_name: 'Inventory Daily', preset: 'daily', cron: '0 6 * * *' },
    { ...base, id: 'sch_web', name: 'Web Orders nightly', description: 'Nightly storefront order load.', target_type: 'pipeline', target_id: 'pl_web_orders', target_name: 'Web Orders', preset: 'daily', cron: '30 1 * * *', retry: { max_attempts: 3, backoff_seconds: 1500, backoff_strategy: 'fixed' }, created_by: userRef('usr_priya') },
    { ...base, id: 'sch_sf_sync', name: 'Salesforce hourly sync', description: 'Incremental sync of Salesforce objects into Bronze.', target_type: 'source_sync', target_id: 'src_sf_prod', target_name: 'Salesforce Production', preset: 'hourly', cron: '0 * * * *', concurrency: { max_concurrent_runs: 1, overlap_policy: 'skip' } },
    { ...base, id: 'sch_erp_sync', name: 'ERP sync every 6 hours', description: 'Replicates ERP tables into Bronze.', target_type: 'source_sync', target_id: 'src_erp', target_name: 'ERP Database', preset: 'every_6_hours', cron: '0 */6 * * *' },
    { ...base, id: 'sch_web_sync', name: 'Web Orders DB nightly sync', description: 'Nightly storefront replication.', target_type: 'source_sync', target_id: 'src_web_orders', target_name: 'Web Orders DB', preset: 'daily', cron: '30 1 * * *', created_by: userRef('usr_priya') },
    { ...base, id: 'sch_revenue_rebuild', name: 'Weekly revenue full rebuild', description: 'Full refresh of the monthly revenue aggregate. Disabled while invoice duplicates are investigated.', target_type: 'transformation', target_id: 'trf_agg_monthly_revenue', target_name: 'agg_monthly_revenue', preset: 'weekly', cron: '0 3 * * 1', enabled: false, created_by: userRef('usr_priya'), updated_at: ago(60 * 20) },
  ]
}
