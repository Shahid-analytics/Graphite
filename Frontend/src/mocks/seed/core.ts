import type { ConnectorDefinition, NotificationPreferences, NotificationType, User } from '@/types'
import type { MembershipRecord, WorkspaceRecord, WorkspaceSettings } from '../db'
import { ago } from '../util'

export const WS_ACME = 'ws_acme'
export const WS_NORTHWIND = 'ws_northwind'

export const USERS: User[] = [
  { id: 'usr_ananya', email: 'ananya.rao@acme-distributors.example', name: 'Ananya Rao', avatar_url: null },
  { id: 'usr_rahul', email: 'rahul.mehta@acme-distributors.example', name: 'Rahul Mehta', avatar_url: null },
  { id: 'usr_priya', email: 'priya.nair@acme-distributors.example', name: 'Priya Nair', avatar_url: null },
  { id: 'usr_karan', email: 'karan.shah@acme-distributors.example', name: 'Karan Shah', avatar_url: null },
  { id: 'usr_meera', email: 'meera.iyer@acme-distributors.example', name: 'Meera Iyer', avatar_url: null },
]

export const DEFAULT_USER_ID = 'usr_ananya'

export function userRef(id: string) {
  const user = USERS.find((u) => u.id === id) ?? USERS[0]
  return { id: user.id, name: user.name }
}

export function createWorkspaces(): WorkspaceRecord[] {
  return [
    {
      id: WS_ACME,
      name: 'Acme Distributors',
      slug: 'acme-distributors',
      industry: 'Wholesale distribution',
      region: 'ap-south-1 (Mumbai)',
      timezone: 'Asia/Kolkata',
      plan: 'growth',
      created_at: ago(60 * 24 * 142),
      onboarding: {
        steps: { source: true, destination: true, ingestion: true, transformation: true, analytics: false },
        completed_at: null,
        dismissed: false,
      },
    },
    {
      id: WS_NORTHWIND,
      name: 'Northwind Retail',
      slug: 'northwind-retail',
      industry: 'Retail',
      region: 'ap-south-1 (Mumbai)',
      timezone: 'Asia/Kolkata',
      plan: 'starter',
      created_at: ago(60 * 26),
      onboarding: {
        steps: { source: false, destination: false, ingestion: false, transformation: false, analytics: false },
        completed_at: null,
        dismissed: false,
      },
    },
  ]
}

export function createMemberships(): MembershipRecord[] {
  return [
    { user_id: 'usr_ananya', workspace_id: WS_ACME, role: 'owner', status: 'active', joined_at: ago(60 * 24 * 142), last_active_at: ago(3) },
    { user_id: 'usr_rahul', workspace_id: WS_ACME, role: 'admin', status: 'active', joined_at: ago(60 * 24 * 140), last_active_at: ago(48) },
    { user_id: 'usr_priya', workspace_id: WS_ACME, role: 'editor', status: 'active', joined_at: ago(60 * 24 * 96), last_active_at: ago(60 * 5) },
    { user_id: 'usr_karan', workspace_id: WS_ACME, role: 'viewer', status: 'active', joined_at: ago(60 * 24 * 40), last_active_at: ago(60 * 26) },
    { user_id: 'usr_meera', workspace_id: WS_ACME, role: 'editor', status: 'invited', joined_at: null, last_active_at: null },
    { user_id: 'usr_ananya', workspace_id: WS_NORTHWIND, role: 'owner', status: 'active', joined_at: ago(60 * 26), last_active_at: ago(60 * 25) },
  ]
}

const sfFields: ConnectorDefinition['config_fields'] = [
  { key: 'instance_url', label: 'Instance URL', type: 'url', required: true, secret: false, placeholder: 'https://yourcompany.my.salesforce.com', help: 'Your Salesforce My Domain URL.' },
  { key: 'environment', label: 'Environment', type: 'select', required: true, secret: false, options: [{ value: 'production', label: 'Production' }, { value: 'sandbox', label: 'Sandbox' }], default: 'production' },
  { key: 'username', label: 'Integration user', type: 'text', required: true, secret: false, placeholder: 'integration@yourcompany.com' },
  { key: 'client_id', label: 'Connected app consumer key', type: 'text', required: true, secret: false },
  { key: 'client_secret', label: 'Connected app consumer secret', type: 'password', required: true, secret: true },
  { key: 'security_token', label: 'Security token', type: 'password', required: false, secret: true, help: 'Required only when IP restrictions apply to the integration user.' },
  { key: 'start_date', label: 'Replicate history from', type: 'text', required: false, secret: false, placeholder: '2024-04-01', help: 'Earliest record date for the initial load (YYYY-MM-DD).' },
]

const pgFields: ConnectorDefinition['config_fields'] = [
  { key: 'host', label: 'Host', type: 'text', required: true, secret: false, placeholder: 'db.internal.example.com' },
  { key: 'port', label: 'Port', type: 'number', required: true, secret: false, default: 5432 },
  { key: 'database', label: 'Database', type: 'text', required: true, secret: false },
  { key: 'username', label: 'Username', type: 'text', required: true, secret: false, help: 'A read-only role is recommended.' },
  { key: 'password', label: 'Password', type: 'password', required: true, secret: true },
  { key: 'ssl_mode', label: 'SSL mode', type: 'select', required: true, secret: false, options: [{ value: 'require', label: 'Require' }, { value: 'verify-full', label: 'Verify full' }, { value: 'disable', label: 'Disable (not recommended)' }], default: 'require' },
  { key: 'ssh_tunnel', label: 'Connect through an SSH tunnel', type: 'boolean', required: false, secret: false, default: false },
]

export const CONNECTORS: ConnectorDefinition[] = [
  { type: 'salesforce', name: 'Salesforce', category: 'crm', description: 'Accounts, contacts, opportunities, products and custom objects via the Bulk and REST APIs.', status: 'available', engine: 'dlt', supports_incremental: true, config_fields: sfFields, docs_url: null },
  { type: 'postgres', name: 'PostgreSQL', category: 'database', description: 'Replicate tables from any PostgreSQL 11+ database, including ERP and order systems.', status: 'available', engine: 'dlt', supports_incremental: true, config_fields: pgFields, docs_url: null },
  { type: 'mysql', name: 'MySQL', category: 'database', description: 'Replicate tables from MySQL and MariaDB databases.', status: 'coming_soon', engine: 'dlt', supports_incremental: true, config_fields: [], docs_url: null },
  { type: 'hubspot', name: 'HubSpot', category: 'crm', description: 'Contacts, companies, deals and marketing engagement.', status: 'coming_soon', engine: 'dlt', supports_incremental: true, config_fields: [], docs_url: null },
  { type: 'zoho_crm', name: 'Zoho CRM', category: 'crm', description: 'Leads, accounts, deals and activities from Zoho CRM.', status: 'coming_soon', engine: 'dlt', supports_incremental: true, config_fields: [], docs_url: null },
  { type: 'tally', name: 'Tally Prime', category: 'finance', description: 'Vouchers, ledgers and stock items exported from Tally.', status: 'coming_soon', engine: 'dlt', supports_incremental: false, config_fields: [], docs_url: null },
  { type: 'google_sheets', name: 'Google Sheets', category: 'spreadsheet', description: 'Load budgets, targets and manual mappings from spreadsheets.', status: 'coming_soon', engine: 'dlt', supports_incremental: false, config_fields: [], docs_url: null },
  { type: 'shopify', name: 'Shopify', category: 'ecommerce', description: 'Orders, products, customers and inventory levels.', status: 'coming_soon', engine: 'dlt', supports_incremental: true, config_fields: [], docs_url: null },
  { type: 'razorpay', name: 'Razorpay', category: 'finance', description: 'Payments, settlements and refunds.', status: 'coming_soon', engine: 'dlt', supports_incremental: true, config_fields: [], docs_url: null },
  { type: 'csv_upload', name: 'CSV upload', category: 'file', description: 'Upload CSV files directly into the Bronze layer.', status: 'coming_soon', engine: 'dlt', supports_incremental: false, config_fields: [], docs_url: null },
]

export function createSettings(): Record<string, WorkspaceSettings> {
  const base = (configured: boolean): WorkspaceSettings => ({
    destination: {
      engine: 'postgres',
      host: configured ? 'warehouse.acme-distributors.internal' : '',
      port: 5432,
      database: configured ? 'analytics' : '',
      username: configured ? 'graphite_loader' : '',
      password: { is_set: configured, updated_at: configured ? ago(60 * 24 * 140) : null },
      ssl_mode: 'require',
      bronze_schema: 'bronze',
      silver_schema: 'silver',
      gold_schema: 'gold',
      status: configured ? 'healthy' : 'unknown',
      last_tested_at: configured ? ago(60 * 3) : null,
    },
    dbt: {
      repository_url: configured ? 'https://git.example.com/acme/analytics-dbt.git' : '',
      branch: 'main',
      project_subdirectory: configured ? 'dbt' : '',
      dbt_version: '1.10',
      target: 'prod',
      threads: 4,
      deploy_key: { is_set: configured, updated_at: configured ? ago(60 * 24 * 120) : null },
      status: configured ? 'healthy' : 'unknown',
      last_compiled_at: configured ? ago(38) : null,
    },
    metabase: {
      site_url: configured ? 'https://metabase.acme-distributors.example' : '',
      embedding_secret: { is_set: configured, updated_at: configured ? ago(60 * 24 * 90) : null },
      api_key: { is_set: configured, updated_at: configured ? ago(60 * 24 * 90) : null },
      default_collection_id: configured ? 7 : null,
      status: configured ? 'unreachable' : 'not_configured',
    },
    ai: {
      provider: 'none',
      model: null,
      endpoint_url: null,
      api_key: { is_set: false, updated_at: null },
      data_sharing: 'metadata_only',
      enabled: false,
      status: 'unknown',
    },
    scheduler: {
      default_timezone: 'Asia/Kolkata',
      max_concurrent_runs: 3,
      default_retry_attempts: 2,
      default_backoff_seconds: 300,
      quiet_hours: { enabled: false, start: '22:00', end: '06:00' },
    },
    retention: { retention_days: 365, export_enabled: true, include_ip_addresses: true },
  })
  return { [WS_ACME]: base(true), [WS_NORTHWIND]: base(false) }
}

const ALL_TYPES: NotificationType[] = ['pipeline_failed', 'sync_completed', 'repeated_retries', 'quality_failed', 'schema_changed', 'stale_data']

export function createNotificationPrefs(): Record<string, NotificationPreferences> {
  const prefs: Record<string, NotificationPreferences> = {}
  for (const user of USERS) {
    prefs[user.id] = {
      email_address: user.email,
      digest: 'daily',
      events: Object.fromEntries(
        ALL_TYPES.map((t) => [t, { in_app: true, email: t !== 'sync_completed' }]),
      ) as NotificationPreferences['events'],
    }
  }
  return prefs
}
