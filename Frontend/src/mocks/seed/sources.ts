import type { RunError, Source, SourceTable } from '@/types'
import { ago, fromNow } from '../util'
import { WS_ACME, userRef } from './core'

const notSet = { is_set: false, updated_at: null }

export function createSources(): Source[] {
  return [
    {
      id: 'src_sf_prod',
      workspace_id: WS_ACME,
      name: 'Salesforce Production',
      connector_type: 'salesforce',
      status: 'active',
      health: 'healthy',
      health_message: null,
      config: { instance_url: 'https://acme-distributors.my.salesforce.com', environment: 'production', username: 'integration@acme-distributors.example', client_id: '3MVG9A2kN8Bx...redacted', start_date: '2023-04-01' },
      secrets: { client_secret: { is_set: true, updated_at: ago(60 * 24 * 138) }, security_token: { is_set: true, updated_at: ago(60 * 24 * 138) } },
      destination_schema: 'bronze_salesforce',
      selected_tables: [
        { schema: 'salesforce', name: 'Account', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
        { schema: 'salesforce', name: 'Contact', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
        { schema: 'salesforce', name: 'Opportunity', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
        { schema: 'salesforce', name: 'OpportunityLineItem', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
        { schema: 'salesforce', name: 'Product2', ingestion_mode: 'full', cursor_field: null, primary_key: ['Id'] },
        { schema: 'salesforce', name: 'User', ingestion_mode: 'full', cursor_field: null, primary_key: ['Id'] },
      ],
      schedule: { frequency: 'hourly', cron: '0 * * * *', timezone: 'Asia/Kolkata' },
      last_sync_at: ago(19),
      last_successful_sync_at: ago(19),
      last_sync_status: 'succeeded',
      last_sync_duration_seconds: 148,
      last_sync_records: 1284,
      total_records: 45050,
      next_sync_at: fromNow(41),
      created_at: ago(60 * 24 * 138),
      updated_at: ago(60 * 24 * 21),
      created_by: userRef('usr_rahul'),
    },
    {
      id: 'src_erp',
      workspace_id: WS_ACME,
      name: 'ERP Database',
      connector_type: 'postgres',
      status: 'active',
      health: 'degraded',
      health_message: 'Schema change detected: items.hsn_code changed from integer to varchar.',
      config: { host: 'erp-db.acme-distributors.internal', port: 5432, database: 'erp_prod', username: 'graphite_readonly', ssl_mode: 'require', ssh_tunnel: true },
      secrets: { password: { is_set: true, updated_at: ago(60 * 24 * 90) } },
      destination_schema: 'bronze_erp',
      selected_tables: [
        { schema: 'public', name: 'invoices', ingestion_mode: 'incremental', cursor_field: 'updated_at', primary_key: ['invoice_id'] },
        { schema: 'public', name: 'invoice_lines', ingestion_mode: 'incremental', cursor_field: 'updated_at', primary_key: ['line_id'] },
        { schema: 'public', name: 'customers', ingestion_mode: 'full', cursor_field: null, primary_key: ['customer_code'] },
        { schema: 'public', name: 'items', ingestion_mode: 'full', cursor_field: null, primary_key: ['item_code'] },
        { schema: 'public', name: 'payments', ingestion_mode: 'incremental', cursor_field: 'paid_on', primary_key: ['payment_id'] },
        { schema: 'inventory', name: 'stock_levels', ingestion_mode: 'incremental', cursor_field: 'snapshot_date', primary_key: ['item_code', 'warehouse_code', 'snapshot_date'] },
        { schema: 'inventory', name: 'warehouses', ingestion_mode: 'full', cursor_field: null, primary_key: ['warehouse_code'] },
      ],
      schedule: { frequency: 'every_6_hours', cron: '0 */6 * * *', timezone: 'Asia/Kolkata' },
      last_sync_at: ago(134),
      last_successful_sync_at: ago(134),
      last_sync_status: 'succeeded',
      last_sync_duration_seconds: 412,
      last_sync_records: 6913,
      total_records: 543431,
      next_sync_at: fromNow(226),
      created_at: ago(60 * 24 * 136),
      updated_at: ago(60 * 24 * 9),
      created_by: userRef('usr_rahul'),
    },
    {
      id: 'src_web_orders',
      workspace_id: WS_ACME,
      name: 'Web Orders DB',
      connector_type: 'postgres',
      status: 'error',
      health: 'unhealthy',
      health_message: 'Authentication failed for user "graphite_reader". The password may have been rotated.',
      config: { host: 'orders-db.storefront.example.com', port: 5432, database: 'storefront', username: 'graphite_reader', ssl_mode: 'verify-full', ssh_tunnel: false },
      secrets: { password: { is_set: true, updated_at: ago(60 * 24 * 60) } },
      destination_schema: 'bronze_web',
      selected_tables: [
        { schema: 'public', name: 'orders', ingestion_mode: 'incremental', cursor_field: 'updated_at', primary_key: ['order_id'] },
        { schema: 'public', name: 'order_items', ingestion_mode: 'incremental', cursor_field: 'order_id', primary_key: ['order_item_id'] },
      ],
      schedule: { frequency: 'daily', cron: '30 1 * * *', timezone: 'Asia/Kolkata' },
      last_sync_at: ago(60 * 7),
      last_successful_sync_at: ago(60 * 74),
      last_sync_status: 'failed',
      last_sync_duration_seconds: 6,
      last_sync_records: 0,
      total_records: 70750,
      next_sync_at: fromNow(60 * 17),
      created_at: ago(60 * 24 * 64),
      updated_at: ago(60 * 24 * 3),
      created_by: userRef('usr_priya'),
    },
    {
      id: 'src_sf_sandbox',
      workspace_id: WS_ACME,
      name: 'Salesforce Sandbox',
      connector_type: 'salesforce',
      status: 'paused',
      health: 'paused',
      health_message: 'Paused by Rahul Mehta while the sandbox is refreshed.',
      config: { instance_url: 'https://acme-distributors--uat.sandbox.my.salesforce.com', environment: 'sandbox', username: 'integration@acme-distributors.example.uat', client_id: '3MVG9B7xQ1Lm...redacted', start_date: '2025-01-01' },
      secrets: { client_secret: { is_set: true, updated_at: ago(60 * 24 * 50) }, security_token: notSet },
      destination_schema: 'bronze_salesforce_uat',
      selected_tables: [
        { schema: 'salesforce', name: 'Account', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
        { schema: 'salesforce', name: 'Opportunity', ingestion_mode: 'incremental', cursor_field: 'SystemModstamp', primary_key: ['Id'] },
      ],
      schedule: { frequency: 'manual', cron: null, timezone: 'Asia/Kolkata' },
      last_sync_at: ago(60 * 24 * 6),
      last_successful_sync_at: ago(60 * 24 * 6),
      last_sync_status: 'succeeded',
      last_sync_duration_seconds: 96,
      last_sync_records: 1820,
      total_records: 1820,
      next_sync_at: null,
      created_at: ago(60 * 24 * 50),
      updated_at: ago(60 * 24 * 5),
      created_by: userRef('usr_rahul'),
    },
  ]
}

function sfTable(name: string, label: string, rows: number, cols: number, incremental = true): SourceTable {
  return { schema: 'salesforce', name, label, row_count_estimate: rows, columns_count: cols, supports_incremental: incremental, cursor_candidates: incremental ? ['SystemModstamp', 'LastModifiedDate', 'CreatedDate'] : [], primary_key: ['Id'] }
}

function pgTable(schema: string, name: string, rows: number, cols: number, pk: string[], cursors: string[]): SourceTable {
  return { schema, name, label: null, row_count_estimate: rows, columns_count: cols, supports_incremental: cursors.length > 0, cursor_candidates: cursors, primary_key: pk }
}

export const SALESFORCE_TABLES: SourceTable[] = [
  sfTable('Account', 'Accounts', 4820, 64),
  sfTable('Contact', 'Contacts', 11240, 58),
  sfTable('Opportunity', 'Opportunities', 6380, 49),
  sfTable('OpportunityLineItem', 'Opportunity products', 21950, 22),
  sfTable('Product2', 'Products', 612, 24),
  sfTable('Pricebook2', 'Price books', 6, 12),
  sfTable('PricebookEntry', 'Price book entries', 1840, 14),
  sfTable('Lead', 'Leads', 15620, 52),
  sfTable('Case', 'Cases', 3310, 41),
  sfTable('Task', 'Tasks', 88400, 33),
  sfTable('User', 'Users', 48, 120, false),
  sfTable('Campaign', 'Campaigns', 74, 36),
]

export const ERP_TABLES: SourceTable[] = [
  pgTable('public', 'invoices', 58210, 9, ['invoice_id'], ['updated_at', 'invoice_date']),
  pgTable('public', 'invoice_lines', 241600, 8, ['line_id'], ['updated_at']),
  pgTable('public', 'customers', 3105, 7, ['customer_code'], ['created_at']),
  pgTable('public', 'items', 2240, 6, ['item_code'], []),
  pgTable('public', 'payments', 49870, 6, ['payment_id'], ['paid_on']),
  pgTable('public', 'credit_notes', 1420, 8, ['credit_note_id'], ['updated_at']),
  pgTable('public', 'purchase_orders', 9310, 11, ['po_id'], ['updated_at']),
  pgTable('inventory', 'stock_levels', 88400, 5, ['item_code', 'warehouse_code', 'snapshot_date'], ['snapshot_date']),
  pgTable('inventory', 'warehouses', 6, 4, ['warehouse_code'], []),
  pgTable('inventory', 'stock_transfers', 12040, 9, ['transfer_id'], ['transferred_at']),
  pgTable('hr', 'employees', 212, 14, ['employee_id'], ['updated_at']),
]

export const WEB_TABLES: SourceTable[] = [
  pgTable('public', 'orders', 18450, 7, ['order_id'], ['updated_at', 'order_date']),
  pgTable('public', 'order_items', 52300, 5, ['order_item_id'], ['order_id']),
  pgTable('public', 'carts', 120400, 6, ['cart_id'], ['updated_at']),
  pgTable('public', 'customers', 14200, 9, ['customer_id'], ['updated_at']),
]

/** Generic tables returned when discovering a brand new PostgreSQL connection in demo mode. */
export const GENERIC_PG_TABLES: SourceTable[] = [
  pgTable('public', 'customers', 2400, 8, ['id'], ['updated_at']),
  pgTable('public', 'orders', 31800, 10, ['id'], ['updated_at', 'created_at']),
  pgTable('public', 'order_lines', 96500, 7, ['id'], ['updated_at']),
  pgTable('public', 'products', 840, 9, ['id'], ['updated_at']),
  pgTable('public', 'payments', 28100, 6, ['id'], ['created_at']),
  pgTable('reporting', 'monthly_targets', 96, 5, ['month', 'region'], []),
]

export function createSourceTables(): Record<string, SourceTable[]> {
  return {
    src_sf_prod: SALESFORCE_TABLES,
    src_sf_sandbox: SALESFORCE_TABLES,
    src_erp: ERP_TABLES,
    src_web_orders: WEB_TABLES,
  }
}

export function createSourceFailures(): Record<string, RunError> {
  return {
    src_web_orders: {
      stage: 'source_connect',
      code: 'source_auth_failed',
      message: 'Authentication failed for user "graphite_reader".',
      details: 'FATAL: password authentication failed for user "graphite_reader" (SQLSTATE 28P01). Update the password in the connection settings and retry.',
      retryable: true,
    },
  }
}
