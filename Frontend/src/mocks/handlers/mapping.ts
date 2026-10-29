import type {
  CreateMappingSuggestionRequest,
  FieldMapping,
  JoinCandidate,
  KeyCandidate,
  MappingSuggestionSet,
  MappingSuggestionSetSummary,
  ModelProposal,
  ProposedColumn,
  ReviewDecision,
  ReviewItemDecision,
  ReviewItemType,
  ReviewMappingRequest,
  Source,
} from '@/types'
import { DATA_TYPE_HINT, isSupportedDataType } from '@/lib/data-types'
import { body, httpError, type MockContext, type MockRoute } from '../router'
import { db, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { newId, nowIso, prng } from '../util'

/** Simulated generation time before a new suggestion set becomes ready. */
const GENERATION_MS = 3500
const MAX_TABLES = 10
const MAX_FIELDS_PER_TABLE = 10
const MAX_MODEL_PROPOSALS = 3
const PROVIDER = { name: 'Graphite mock suggestion engine', model: 'simulated', simulated: true }
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/
/** Warehouse column types a schema proposal accepts; edits are held to the same list. */

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function allItems(set: MappingSuggestionSet): { decision: ReviewDecision }[] {
  return [...set.field_mappings, ...set.join_candidates, ...set.key_candidates, ...set.model_proposals]
}

function summaryView(set: MappingSuggestionSet): MappingSuggestionSetSummary {
  const { field_mappings: _fm, join_candidates: _jc, key_candidates: _kc, model_proposals: _mp, ...rest } = set
  const items = allItems(set)
  const count = (d: ReviewDecision) => items.filter((i) => i.decision === d).length
  return {
    ...rest,
    counts: { total: items.length, pending: count('pending'), accepted: count('accepted'), rejected: count('rejected'), modified: count('modified') },
  }
}

/** Completes generation once the simulated delay has elapsed. */
function materialize(set: MappingSuggestionSet) {
  if (set.status !== 'generating') return set
  const readyAt = db.mappingReadyAt[set.id]
  if (readyAt !== undefined && Date.now() < readyAt) return set
  Object.assign(set, generateSuggestions(set))
  set.status = 'ready'
  delete db.mappingReadyAt[set.id]
  return set
}

function findSet(ctx: MockContext) {
  return findOr404(db.mappingSets, ctx.params.suggestionId, 'Mapping suggestion set')
}

// ---------------------------------------------------------------------------
// Deterministic suggestion engine. It reads Bronze column metadata from the
// mock warehouse (or synthesizes plausible columns) and applies naming rules.
// Nothing here calls an AI provider.
// ---------------------------------------------------------------------------

interface ColumnInfo {
  name: string
  type: string
  pk: boolean
}

interface TableInfo {
  /** Qualified source name, e.g. "public.invoices" or "salesforce.Opportunity". */
  qualified: string
  /** snake_case table name, e.g. "opportunity_line_item". */
  snake: string
  rows: number
  pk: string[]
  columns: ColumnInfo[]
  master: boolean
  model: string
  /** Existing model in the target layer that the proposed name avoids, if any. */
  existing: string | null
}

const SYNTHETIC_COLUMNS: Record<string, string[]> = {
  credit_notes: ['credit_note_id bigint pk', 'credit_note_no varchar', 'invoice_id bigint', 'customer_code varchar', 'issued_on date', 'amount numeric', 'reason varchar', 'updated_at timestamptz'],
  purchase_orders: ['po_id bigint pk', 'po_no varchar', 'supplier_code varchar', 'warehouse_code varchar', 'order_date date', 'expected_on date', 'total_amount numeric', 'status varchar', 'updated_at timestamptz'],
  stock_transfers: ['transfer_id bigint pk', 'item_code varchar', 'from_warehouse_code varchar', 'to_warehouse_code varchar', 'quantity numeric', 'transferred_at timestamptz', 'status varchar'],
  employees: ['employee_id bigint pk', 'full_name varchar', 'email varchar', 'department varchar', 'designation varchar', 'joined_on date', 'is_active boolean', 'updated_at timestamptz'],
  carts: ['cart_id bigint pk', 'customer_id bigint', 'item_count integer', 'cart_value numeric', 'created_at timestamptz', 'updated_at timestamptz'],
  customers: ['customer_id bigint pk', 'email varchar', 'full_name varchar', 'phone varchar', 'city varchar', 'state varchar', 'created_at timestamptz', 'updated_at timestamptz'],
  lead: ['id varchar pk', 'first_name varchar', 'last_name varchar', 'company varchar', 'email varchar', 'status varchar', 'lead_source varchar', 'system_modstamp timestamptz'],
  case: ['id varchar pk', 'account_id varchar', 'contact_id varchar', 'status varchar', 'priority varchar', 'origin varchar', 'subject varchar', 'created_date timestamptz', 'system_modstamp timestamptz'],
  task: ['id varchar pk', 'owner_id varchar', 'subject varchar', 'status varchar', 'activity_date date', 'system_modstamp timestamptz'],
  campaign: ['id varchar pk', 'name varchar', 'type varchar', 'status varchar', 'start_date date', 'end_date date', 'budgeted_cost numeric', 'system_modstamp timestamptz'],
  pricebook2: ['id varchar pk', 'name varchar', 'is_active boolean', 'is_standard boolean', 'system_modstamp timestamptz'],
  pricebook_entry: ['id varchar pk', 'pricebook2_id varchar', 'product2_id varchar', 'unit_price numeric', 'is_active boolean', 'system_modstamp timestamptz'],
}

const MASTER_TABLES = new Set(['customers', 'account', 'contact', 'items', 'product2', 'products', 'warehouses', 'user', 'employees', 'campaign', 'pricebook2', 'pricebook_entry', 'suppliers'])

/** Business-friendly model names; anything else falls back to fct_/dim_ + table name. */
const GOLD_NAMES: Record<string, Record<string, string>> = {
  postgres: {
    invoices: 'fct_billing',
    invoice_lines: 'fct_billing_lines',
    payments: 'fct_collections',
    customers: 'dim_distributor',
    items: 'dim_item',
    stock_levels: 'fct_stock_snapshot',
    warehouses: 'dim_warehouse',
    credit_notes: 'fct_credit_notes',
    purchase_orders: 'fct_purchase_orders',
    stock_transfers: 'fct_stock_transfers',
    employees: 'dim_employee',
    orders: 'fct_web_orders',
    order_items: 'fct_web_order_lines',
    carts: 'fct_carts',
  },
  salesforce: {
    opportunity: 'fct_opportunity_pipeline',
    opportunity_line_item: 'fct_opportunity_products',
    account: 'dim_account',
    contact: 'dim_contact',
    product2: 'dim_sf_product',
    user: 'dim_sf_user',
    lead: 'fct_leads',
    case: 'fct_support_cases',
    task: 'fct_sales_activities',
  },
}

const GRAIN: Record<string, string> = {
  payments: 'payment allocated to an invoice',
  invoices: 'invoice',
  invoice_lines: 'invoice line',
  stock_levels: 'item, warehouse and snapshot date',
  opportunity: 'opportunity',
  opportunity_line_item: 'opportunity product line',
  orders: 'web order',
  order_items: 'web order line',
  stock_transfers: 'stock transfer',
  purchase_orders: 'purchase order',
  credit_notes: 'credit note',
}

/** Dimensions whose attributes change over time and benefit from SCD type 2 history. */
const SCD2 = new Set(['customers', 'account', 'items', 'product2', 'products', 'employees'])

function snakeCase(value: string) {
  return value
    .replace(/__c$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
}

function singular(name: string) {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`
  if (name.endsWith('ses') || name.endsWith('xes')) return name.slice(0, -2)
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1)
  return name
}

function plural(name: string) {
  if (name.endsWith('s')) return name
  if (name.endsWith('y')) return `${name.slice(0, -1)}ies`
  return `${name}s`
}

function sourcePrefix(source: Source) {
  return source.destination_schema.replace(/^bronze_/, '').replace('salesforce', 'sf')
}

function parseSpec(spec: string): ColumnInfo {
  const [name, type, ...flags] = spec.split(' ')
  return { name, type, pk: flags.includes('pk') }
}

function bronzeColumns(source: Source, snake: string): ColumnInfo[] | null {
  const bronze = (sourceId: string) => db.models.find((m) => m.layer === 'bronze' && m.source_id === sourceId && m.name === snake)
  // Fall back to a Bronze table of the same connector type (e.g. a sandbox of the same org).
  const model =
    bronze(source.id) ??
    db.sources
      .filter((s) => s.workspace_id === source.workspace_id && s.connector_type === source.connector_type && s.id !== source.id)
      .map((s) => bronze(s.id))
      .find(Boolean)
  const columns = model ? db.columns[model.id] : undefined
  if (!columns?.length) return null
  return columns.map((c) => ({ name: c.name, type: c.data_type, pk: c.is_primary_key }))
}

function synthesizeColumns(snake: string, pk: string[], cursors: string[]): ColumnInfo[] {
  const preset = SYNTHETIC_COLUMNS[snake]
  if (preset) return preset.map(parseSpec)
  const pkCols = pk.map((p) => ({ name: snakeCase(p), type: p === 'Id' ? 'varchar' : 'bigint', pk: true }))
  const cursorCols = cursors.map((c) => snakeCase(c)).filter((c) => !pkCols.some((p) => p.name === c))
  return [
    ...pkCols,
    { name: 'name', type: 'varchar', pk: false },
    ...cursorCols.map((c) => ({ name: c, type: /date|_on$/.test(c) && !c.endsWith('_at') ? 'date' : 'timestamptz', pk: false })),
  ]
}

function modelNameFor(source: Source, snake: string, master: boolean, layer: 'silver' | 'gold', taken: Set<string>): { name: string; existing: string | null } {
  const base =
    layer === 'silver'
      ? `stg_${sourcePrefix(source)}_${plural(snake)}`
      : (GOLD_NAMES[source.connector_type]?.[snake] ?? (master ? `dim_${singular(snake)}` : `fct_${plural(snake)}`))
  // Never propose a name that already exists in the target layer; keep the current model serving.
  let name = base
  let version = 2
  while (taken.has(name)) name = `${base}_v${version++}`
  taken.add(name)
  return { name, existing: name === base ? null : base }
}

function tableInfo(source: Source, qualified: string, layer: 'silver' | 'gold', taken: Set<string>): TableInfo {
  const discovered = db.sourceTables[source.id]?.find((t) => `${t.schema}.${t.name}` === qualified)
  const rawName = qualified.split('.').pop() ?? qualified
  const snake = snakeCase(rawName)
  const pk = (discovered?.primary_key ?? []).map(snakeCase)
  const columns = bronzeColumns(source, snake) ?? synthesizeColumns(snake, discovered?.primary_key ?? [], discovered?.cursor_candidates ?? [])
  const master = MASTER_TABLES.has(snake)
  const { name: model, existing } = modelNameFor(source, snake, master, layer, taken)
  return {
    qualified,
    snake,
    rows: discovered?.row_count_estimate ?? 1000,
    pk: pk.length ? pk : columns.filter((c) => c.pk).map((c) => c.name),
    columns,
    master,
    model,
    existing,
  }
}

type RuleKind =
  | 'record_id'
  | 'identifier'
  | 'code'
  | 'document_number'
  | 'gstin'
  | 'state'
  | 'code_mapping'
  | 'date_key'
  | 'date'
  | 'timestamp'
  | 'currency'
  | 'quantity'
  | 'ratio'
  | 'name'
  | 'email'
  | 'city'
  | 'phone'
  | 'boolean'
  | 'free_text'
  | 'direct'

interface Rule {
  kind: RuleKind
  target: string
  type: string
  rule: string | null
  expression: string
  base: number
  rationale: string
}

const CATEGORICAL = /(^|_)(status|mode|stage|type|channel|category|family|uom|priority|origin|source|department|designation|role|industry)$/
const FREE_TEXT = /(^|_)(subject|reason|description|notes?|comments?|title)$/

function ruleFor(table: TableInfo, column: ColumnInfo, layer: 'silver' | 'gold', isSalesforce: boolean): Rule | null {
  const c = column.name.replace(/__c$/, '')
  const ref = `${table.snake}.${column.name}`
  const entity = singular(table.snake)
  if (column.name.startsWith('_dlt') || c === 'system_modstamp') return null
  if (layer === 'gold' && (c === 'updated_at' || c === 'created_at')) return null

  if (c === 'id' && isSalesforce) {
    return { kind: 'record_id', target: `${entity}_id`, type: 'varchar(18)', rule: null, expression: ref, base: 0.95, rationale: `Salesforce 18-character record id, renamed to ${entity}_id so joins read naturally.` }
  }
  if (c.endsWith('_id') && isSalesforce) {
    return { kind: 'identifier', target: c === 'owner_id' ? 'sales_rep_id' : c, type: 'varchar(18)', rule: null, expression: ref, base: 0.9, rationale: c === 'owner_id' ? 'Owner is the Salesforce user who manages the record; renamed to sales_rep_id.' : 'Salesforce lookup id; kept as the natural join key.' }
  }
  if (c.endsWith('_id')) {
    return { kind: 'identifier', target: c, type: column.type === 'varchar' ? 'varchar(36)' : 'bigint', rule: null, expression: ref, base: 0.94, rationale: column.pk ? 'Primary key of the source table; copied unchanged.' : 'Foreign key used to join related records; copied unchanged.' }
  }
  if (c === 'gstin') {
    return { kind: 'gstin', target: 'gstin', type: 'char(15)', rule: 'upper(trim(gstin)); null when not 15 characters', expression: `case when length(trim(${ref})) = 15 then upper(trim(${ref})) end`, base: 0.86, rationale: 'GSTINs are 15 characters; profiling shows mixed casing, padding and some blanks (unregistered dealers).' }
  }
  if (c.endsWith('_no')) {
    const target = `${c.slice(0, -3)}_number`
    return { kind: 'document_number', target, type: 'varchar(32)', rule: 'trim, upper', expression: `upper(trim(${ref}))`, base: 0.93, rationale: 'Document numbers follow a prefix/series pattern; trimming and upper-casing makes them comparable across systems.' }
  }
  if (c.endsWith('_code') || c === 'sku') {
    return { kind: 'code', target: c, type: 'varchar(20)', rule: 'trim, upper', expression: `upper(trim(${ref}))`, base: 0.92, rationale: 'Short master-data code used as a join key; normalised to avoid case and whitespace mismatches.' }
  }
  if (c === 'state' || c === 'billing_state') {
    return { kind: 'state', target: 'state_code', type: 'char(2)', rule: 'map state name to ISO 3166-2:IN code', expression: `state_code_map(${ref})`, base: 0.68, rationale: 'State values are free text with spelling variants (e.g. "Maharastra", "MH"); a lookup to ISO codes makes regional reporting reliable.' }
  }
  if (c === 'mode') {
    return { kind: 'code_mapping', target: 'payment_mode', type: 'varchar(16)', rule: "map {'neft','Neft','NEFT '} -> 'NEFT'; {'upi','Upi'} -> 'UPI'", expression: `payment_mode_map(${ref})`, base: 0.76, rationale: 'Several spellings of the same payment mode collapse into a small canonical set.' }
  }
  if (c === 'stage_name') {
    return { kind: 'code_mapping', target: 'stage', type: 'varchar(40)', rule: 'map legacy stages to the current sales process', expression: `stage_map(${ref})`, base: 0.78, rationale: 'Two stage vocabularies are in use; mapping keeps funnel reports consistent.' }
  }
  if (CATEGORICAL.test(c)) {
    return { kind: 'code_mapping', target: c, type: 'varchar(32)', rule: 'map source values to canonical codes (upper, trimmed)', expression: `upper(trim(${ref}))`, base: 0.74, rationale: 'Low-cardinality categorical field; canonical codes prevent duplicate groups in dashboards.' }
  }
  if (column.type === 'date') {
    if (layer === 'gold') {
      const stem = c.replace(/_on$/, '_date')
      const target = `${stem.endsWith('_date') ? stem : `${stem}_date`}_key`
      return { kind: 'date_key', target, type: 'integer', rule: `to_char(${c}, 'YYYYMMDD')::integer`, expression: `to_char(${ref}, 'YYYYMMDD')::integer`, base: 0.93, rationale: 'Gold facts and dimensions join to dim_date on an integer YYYYMMDD key.' }
    }
    return { kind: 'date', target: c.replace(/_on$/, '_date'), type: 'date', rule: null, expression: ref, base: 0.9, rationale: 'Calendar date; copied unchanged.' }
  }
  if (column.type === 'timestamptz') {
    return { kind: 'timestamp', target: c, type: 'timestamptz', rule: 'convert to UTC', expression: `${ref} at time zone 'UTC'`, base: 0.88, rationale: 'Timestamps are stored in UTC; dashboards convert to the workspace timezone.' }
  }
  if (column.type === 'numeric' && /(amount|price|rate|limit|revenue|cost|value|mrp)/.test(c)) {
    const target = c === 'amount' && table.snake === 'payments' ? 'amount_collected' : c === 'rate' ? 'unit_rate' : c
    if (c === 'gst_rate') {
      return { kind: 'ratio', target: 'gst_rate_pct', type: 'numeric(5,2)', rule: 'round to 2 decimals', expression: `round(${ref}, 2)`, base: 0.87, rationale: 'GST rate in percent (0, 5, 12, 18 or 28).' }
    }
    return { kind: 'currency', target, type: 'numeric(18,2)', rule: 'round to 2 decimals', expression: `round(${ref}, 2)`, base: 0.94, rationale: 'Currency amount in INR; paise precision is enough for reporting and avoids float drift.' }
  }
  if (c === 'probability') {
    return { kind: 'ratio', target: 'probability_pct', type: 'numeric(5,2)', rule: null, expression: ref, base: 0.85, rationale: 'Stage probability in percent; used for weighted pipeline.' }
  }
  if (column.type === 'numeric' || column.type === 'integer') {
    return { kind: 'quantity', target: c, type: column.type === 'integer' ? 'integer' : 'numeric(18,3)', rule: null, expression: ref, base: 0.89, rationale: 'Measure copied unchanged; three decimals cover fractional units of measure.' }
  }
  if (column.type === 'boolean') {
    return { kind: 'boolean', target: c.startsWith('is_') ? c : `is_${c}`, type: 'boolean', rule: 'coalesce(value, false)', expression: `coalesce(${ref}, false)`, base: 0.89, rationale: 'Flags are never null downstream so filters behave predictably.' }
  }
  if (c === 'email' || c.endsWith('_email')) {
    return { kind: 'email', target: c, type: 'varchar(254)', rule: 'lower(trim())', expression: `lower(trim(${ref}))`, base: 0.9, rationale: 'Email addresses are case-insensitive; lower-casing enables matching across sources.' }
  }
  if (c === 'phone') {
    return { kind: 'phone', target: 'phone', type: 'varchar(16)', rule: 'digits only, +91 prefix', expression: `phone_e164(${ref})`, base: 0.72, rationale: 'Phone numbers mix spaces, dashes and missing country codes.' }
  }
  if (c === 'city' || c === 'billing_city') {
    return { kind: 'city', target: 'city', type: 'varchar(80)', rule: 'initcap(trim())', expression: `initcap(trim(${ref}))`, base: 0.9, rationale: 'City names have mixed casing.' }
  }
  if (c === 'name' || c.endsWith('_name')) {
    const target = c === 'name' ? `${entity}_name` : c === 'customer_name' && table.model === 'dim_distributor' ? 'distributor_name' : c
    return { kind: 'name', target, type: 'varchar(200)', rule: 'trim; collapse repeated spaces', expression: `regexp_replace(trim(${ref}), '\\s+', ' ', 'g')`, base: 0.88, rationale: 'Display name; whitespace cleanup avoids near-duplicate labels.' }
  }
  if (FREE_TEXT.test(c)) {
    return { kind: 'free_text', target: c, type: 'text', rule: 'trim', expression: `trim(${ref})`, base: 0.62, rationale: 'Free text with low analytical value; consider excluding it from Gold.' }
  }
  return { kind: 'direct', target: c, type: column.type === 'varchar' ? 'varchar(255)' : column.type, rule: 'trim', expression: `trim(${ref})`, base: 0.8, rationale: 'No specific pattern detected; copied with whitespace trimmed.' }
}

function clampConfidence(value: number) {
  return Math.round(Math.min(0.97, Math.max(0.55, value)) * 100) / 100
}

interface FieldDraft {
  table: TableInfo
  column: ColumnInfo
  rule: Rule
}

/** `stable` seeds the jitter so the same selection always yields the same numbers. */
function detectJoins(tables: TableInfo[], seed: string, stable: string) {
  const joins: { left: TableInfo; leftField: string; right: TableInfo; rightField: string; cardinality: JoinCandidate['cardinality'] }[] = []
  for (const left of tables) {
    for (const column of left.columns) {
      if (!/_(id|code)$/.test(column.name)) continue
      const leftSolePk = left.pk.length === 1 && left.pk[0] === column.name
      for (const right of tables) {
        if (right === left || right.pk.length !== 1) continue
        const rightPk = right.pk[0]
        const sameName = rightPk === column.name
        const salesforceLookup = rightPk === 'id' && (column.name === `${right.snake}_id` || (column.name === 'owner_id' && right.snake === 'user'))
        if (!sameName && !salesforceLookup) continue
        // Avoid listing a one-to-one pair twice.
        if (leftSolePk && joins.some((j) => j.left === right && j.right === left)) continue
        joins.push({ left, leftField: column.name, right, rightField: rightPk, cardinality: leftSolePk ? 'one_to_one' : 'many_to_one' })
      }
    }
  }
  return joins.map((j, index) => {
    const rand = prng(`${stable}:${j.left.snake}.${j.leftField}`)
    // Story: six payments reference invoices that are missing from the ERP extract.
    const orphans = j.left.snake === 'payments' && j.right.snake === 'invoices' ? 6 : rand() < 0.45 ? 0 : Math.max(1, Math.round(j.left.rows * rand() * 0.012))
    const matchRate = Math.round((1 - orphans / Math.max(1, j.left.rows)) * 1_000_000) / 1_000_000
    const shownRate = (Math.floor(matchRate * 10_000) / 100).toFixed(2)
    const candidate: JoinCandidate = {
      id: `jc_${seed}_${index + 1}`,
      left_table: j.left.qualified,
      left_field: j.leftField,
      right_table: j.right.qualified,
      right_field: j.rightField,
      cardinality: j.cardinality,
      match_rate: matchRate,
      confidence: clampConfidence(0.55 + matchRate * 0.42 - (orphans > 50 ? 0.08 : 0)),
      rationale:
        orphans === 0
          ? `Every row in ${j.left.qualified} references an existing row in ${j.right.qualified} on ${j.leftField}.`
          : `${shownRate}% of rows in ${j.left.qualified} match a row in ${j.right.qualified}; about ${orphans.toLocaleString('en')} orphan row${orphans === 1 ? '' : 's'} need a default member or a data fix.`,
      decision: 'pending',
    }
    return candidate
  })
}

function detectKeys(tables: TableInfo[], layer: 'silver' | 'gold', seed: string): KeyCandidate[] {
  const keys: Omit<KeyCandidate, 'id'>[] = []
  for (const table of tables) {
    if (table.pk.length) {
      // Story: credit notes re-issued in the ERP reuse the original invoice id.
      const duplicates = table.snake === 'invoices' ? 14 : 0
      keys.push({
        table: table.qualified,
        fields: table.pk,
        key_type: 'primary',
        uniqueness: Math.round((1 - duplicates / Math.max(1, table.rows)) * 10_000) / 10_000,
        confidence: duplicates ? 0.74 : table.pk.length > 1 ? 0.93 : 0.98,
        rationale: duplicates
          ? `${duplicates} duplicate ids caused by re-issued credit notes. Consider (invoice_id, invoice_type) or deduplicate before Gold.`
          : table.pk.length > 1
            ? `Composite key; unique per ${table.pk.join(', ')}.`
            : 'Declared primary key; unique and never null in the profiled sample.',
        decision: 'pending',
      })
    }
    for (const column of table.columns) {
      if (table.pk.includes(column.name)) continue
      const isGstin = column.name === 'gstin'
      const stem = column.name.slice(0, -3)
      const initials = table.snake.split('_').map((w) => w[0]).join('')
      // Only the table's own document number (invoice_no on invoices, po_no on purchase_orders).
      const isDocNo = column.name.endsWith('_no') && (table.snake.startsWith(stem) || stem === initials)
      const isMasterCode = table.master && (column.name === 'product_code' || column.name === 'email')
      if (!isGstin && !isDocNo && !isMasterCode) continue
      keys.push({
        table: table.qualified,
        fields: [column.name],
        key_type: 'business',
        uniqueness: isGstin ? 0.991 : isDocNo ? 1 : 0.996,
        confidence: isGstin ? 0.81 : isDocNo ? 0.9 : 0.83,
        rationale: isGstin
          ? 'Business identifier for registered dealers, but 212 rows have no GSTIN and 27 GSTINs are shared by branches of the same firm.'
          : isDocNo
            ? 'Human-readable document number, unique per fiscal year series.'
            : 'Natural identifier used by business users; a handful of duplicates need review.',
        decision: 'pending',
      })
    }
    if (layer === 'gold' && table.master && table.pk.length) {
      const scd2 = SCD2.has(table.snake)
      keys.push({
        table: table.model,
        fields: scd2 ? [...table.pk, 'valid_from'] : table.pk,
        key_type: 'surrogate',
        uniqueness: 1,
        confidence: scd2 ? 0.9 : 0.88,
        rationale: scd2
          ? 'Hash surrogate key over the business key and version start supports SCD type 2 history, so facts keep the attributes valid at the time.'
          : 'Hash surrogate key decouples facts from source identifiers that may be re-used or re-keyed.',
        decision: 'pending',
      })
    }
  }
  return keys.map((k, index) => ({ ...k, id: `kc_${seed}_${index + 1}` }))
}

function skName(dimModel: string) {
  return `${dimModel.replace(/^dim_/, '').replace(/_v\d+$/, '')}_sk`
}

function describeColumn(name: string) {
  if (name.endsWith('_sk')) return `Surrogate key of the ${name.slice(0, -3).replace(/_/g, ' ')} dimension.`
  if (name.endsWith('_date_key')) return `${name.slice(0, -9).replace(/_/g, ' ')} date as an integer key (YYYYMMDD).`.replace(/^./, (m) => m.toUpperCase())
  const words = name.replace(/_/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

function proposeModels(
  tables: TableInfo[],
  fields: FieldMapping[],
  expressions: Record<string, string>,
  joins: JoinCandidate[],
  layer: 'silver' | 'gold',
  seed: string,
): ModelProposal[] {
  // Prefer a mix: facts first, but keep a slot for a dimension when master tables are selected.
  const facts = tables.filter((t) => !t.master)
  const dims = tables.filter((t) => t.master)
  const factSlots = dims.length ? Math.max(MAX_MODEL_PROPOSALS - dims.length, 2) : MAX_MODEL_PROPOSALS
  const picked = [...facts.slice(0, factSlots), ...dims].slice(0, MAX_MODEL_PROPOSALS)
  const ordered = [...picked, ...facts.filter((t) => !picked.includes(t))].slice(0, MAX_MODEL_PROPOSALS)
  const proposed = new Set(ordered.map((t) => t.qualified))
  return ordered.map((table, index) => {
    const mapped = fields.filter((f) => f.source_table === table.qualified)
    const entity = singular(table.snake).replace(/_/g, ' ')
    const columns: ProposedColumn[] = mapped.map((f) => ({
      name: f.target_field,
      data_type: f.target_type,
      expression: expressions[f.id] ?? `${table.snake}.${f.source_field}`,
      description: describeColumn(f.target_field),
    }))
    const scd2 = layer === 'gold' && table.master && SCD2.has(table.snake)
    if (layer === 'gold' && table.master) {
      const keyExpr = scd2 ? `md5(${table.pk.join(" || '|' || ")} || '|' || valid_from)` : `md5(${table.pk.join(" || '|' || ")})`
      columns.unshift({ name: skName(table.model), data_type: 'varchar(32)', expression: keyExpr, description: 'Surrogate key.' })
      if (scd2) {
        columns.push(
          { name: 'valid_from', data_type: 'date', expression: 'dbt snapshot dbt_valid_from', description: 'Version start date.' },
          { name: 'valid_to', data_type: 'date', expression: 'dbt snapshot dbt_valid_to', description: 'Version end date; null for the current version.' },
          { name: 'is_current', data_type: 'boolean', expression: 'dbt_valid_to is null', description: 'True for the current version.' },
        )
      }
    }
    if (layer === 'gold' && !table.master) {
      // Facts reference proposed dimensions through their surrogate keys.
      for (const join of joins.filter((j) => j.left_table === table.qualified && proposed.has(j.right_table))) {
        const dim = tables.find((t) => t.qualified === join.right_table)
        if (!dim?.master) continue
        const sk = skName(dim.model)
        if (!columns.some((c) => c.name === sk)) {
          columns.splice(1, 0, { name: sk, data_type: 'varchar(32)', expression: `${dim.model}.${sk} (lookup on ${join.left_field})`, description: `Surrogate key of ${dim.model}.` })
        }
      }
    }
    const confidence = mapped.length ? clampConfidence(mapped.reduce((sum, f) => sum + f.confidence, 0) / mapped.length - 0.04) : 0.7
    const grain = table.master
      ? scd2
        ? `One row per ${entity} version (SCD type 2)`
        : `One row per ${entity}`
      : `One row per ${GRAIN[table.snake] ?? entity}`
    const rationale = table.master
      ? scd2
        ? `${table.qualified} holds descriptive attributes that change over time (for example credit limit or category); SCD type 2 preserves history for reporting.`
        : `${table.qualified} holds slowly changing descriptive attributes used to slice facts.`
      : `${table.qualified} records business events with measures; a ${layer === 'gold' ? 'fact' : 'cleaned staging'} model at this grain supports trend and drill-down analysis.`
    const existingNote = table.existing
      ? ` ${layer}.${table.existing} already exists, so this is proposed as ${table.model} and the current model keeps serving until you switch over.`
      : ''
    const proposal: ModelProposal = {
      id: `mp_${seed}_${index + 1}`,
      name: table.model,
      model_type: table.master ? 'dimension' : 'fact',
      grain,
      description: table.master
        ? `${entity.charAt(0).toUpperCase()}${entity.slice(1)} master attributes for filtering and grouping.`
        : `${entity.charAt(0).toUpperCase()}${entity.slice(1)} events with measures for analysis at the ${GRAIN[table.snake] ?? entity} grain.`,
      source_tables: [table.qualified],
      columns,
      confidence,
      rationale: `${rationale}${existingNote}`,
      decision: 'pending',
    }
    return proposal
  })
}

function generateSuggestions(set: MappingSuggestionSet) {
  const source = db.sources.find((s) => s.id === set.source_id)
  const seed = set.id.replace(/^map_/, '')
  if (!source) return { field_mappings: [], join_candidates: [], key_candidates: [], model_proposals: [] }
  const taken = new Set(db.models.filter((m) => m.workspace_id === set.workspace_id && m.layer === set.target_layer).map((m) => m.name))
  const tables = set.source_tables.map((t) => tableInfo(source, t, set.target_layer, taken))
  const isSalesforce = source.connector_type === 'salesforce'

  const drafts: FieldDraft[] = []
  for (const table of tables) {
    const rules = table.columns
      .map((column) => ({ table, column, rule: ruleFor(table, column, set.target_layer, isSalesforce) }))
      .filter((d): d is FieldDraft => d.rule !== null)
      .slice(0, MAX_FIELDS_PER_TABLE)
    drafts.push(...rules)
  }
  const field_mappings: FieldMapping[] = drafts.map((d, index) => {
    const rand = prng(`${set.source_id}:${set.target_layer}:${d.table.snake}.${d.column.name}`)
    return {
      id: `fm_${seed}_${index + 1}`,
      source_table: d.table.qualified,
      source_field: d.column.name,
      source_type: d.column.type,
      target_model: d.table.model,
      target_field: d.rule.target,
      target_type: d.rule.type,
      normalization_rule: d.rule.rule,
      confidence: clampConfidence(d.rule.base + (rand() - 0.5) * 0.06),
      rationale: d.rule.rationale,
      decision: 'pending',
    }
  })
  const expressions = Object.fromEntries(field_mappings.map((f, index) => [f.id, drafts[index].rule.expression]))
  const join_candidates = detectJoins(tables, seed, set.source_id)
  const key_candidates = detectKeys(tables, set.target_layer, seed)
  const model_proposals = proposeModels(tables, field_mappings, expressions, join_candidates, set.target_layer, seed)
  return { field_mappings, join_candidates, key_candidates, model_proposals }
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

type ReviewItem = FieldMapping | JoinCandidate | KeyCandidate | ModelProposal

function collectionFor(set: MappingSuggestionSet, type: ReviewItemType): ReviewItem[] | null {
  switch (type) {
    case 'field_mapping':
      return set.field_mappings
    case 'join':
      return set.join_candidates
    case 'key':
      return set.key_candidates
    case 'model':
      return set.model_proposals
    default:
      return null
  }
}

const OVERRIDABLE: Record<ReviewItemType, string[]> = {
  field_mapping: ['target_model', 'target_field', 'target_type', 'normalization_rule'],
  join: ['cardinality'],
  key: ['fields'],
  model: ['name', 'grain', 'description'],
}

const CARDINALITIES: JoinCandidate['cardinality'][] = ['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many']

function validateOverride(type: ReviewItemType, key: string, value: unknown): string | null {
  if (!OVERRIDABLE[type].includes(key)) return `"${key}" cannot be edited for this item. Editable fields: ${OVERRIDABLE[type].join(', ')}.`
  switch (key) {
    case 'target_model':
    case 'target_field':
    case 'name':
      return typeof value === 'string' && IDENTIFIER.test(value) ? null : 'Use a lowercase snake_case identifier (letters, digits and underscores, starting with a letter, at most 63 characters).'
    case 'target_type':
      return typeof value === 'string' && isSupportedDataType(value) ? null : DATA_TYPE_HINT
    case 'normalization_rule':
      return value === null || (typeof value === 'string' && value.length <= 500) ? null : 'Normalization rule must be text of at most 500 characters, or null.'
    case 'grain':
    case 'description':
      return typeof value === 'string' && value.trim().length > 0 && value.length <= 500 ? null : `${key === 'grain' ? 'Grain' : 'Description'} must be between 1 and 500 characters.`
    case 'cardinality':
      return CARDINALITIES.includes(value as JoinCandidate['cardinality']) ? null : `Cardinality must be one of ${CARDINALITIES.join(', ')}.`
    case 'fields':
      return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && IDENTIFIER.test(v)) ? null : 'Key fields must be a non-empty list of snake_case column names.'
    default:
      return null
  }
}

function applyDecisions(set: MappingSuggestionSet, decisions: ReviewItemDecision[]) {
  const errors: { field: string; message: string }[] = []
  const resolved: { item: ReviewItem; decision: ReviewItemDecision }[] = []
  decisions.forEach((d, index) => {
    const path = `decisions[${index}]`
    if (!d || typeof d !== 'object' || typeof d.item_id !== 'string') {
      errors.push({ field: `${path}.item_id`, message: 'Each decision needs an item_id, item_type and decision.' })
      return
    }
    const collection = collectionFor(set, d.item_type)
    if (!collection) {
      errors.push({ field: `${path}.item_type`, message: 'item_type must be one of field_mapping, join, key or model.' })
      return
    }
    const item = collection.find((i) => i.id === d.item_id)
    if (!item) {
      errors.push({ field: `${path}.item_id`, message: `No ${d.item_type.replace('_', ' ')} with id "${d.item_id}" in this suggestion set.` })
      return
    }
    if (!['accepted', 'rejected', 'modified'].includes(d.decision)) {
      errors.push({ field: `${path}.decision`, message: 'decision must be accepted, rejected or modified.' })
      return
    }
    if (d.overrides !== undefined && (d.overrides === null || typeof d.overrides !== 'object' || Array.isArray(d.overrides))) {
      errors.push({ field: `${path}.overrides`, message: 'overrides must be an object of edited values.' })
      return
    }
    if (d.decision === 'modified') {
      const overrides = d.overrides ?? {}
      if (!Object.keys(overrides).length) errors.push({ field: `${path}.overrides`, message: 'A modified decision needs at least one edited value.' })
      for (const [key, value] of Object.entries(overrides)) {
        const message = validateOverride(d.item_type, key, value)
        if (message) errors.push({ field: `${path}.overrides.${key}`, message })
      }
    } else if (d.overrides && Object.keys(d.overrides).length) {
      errors.push({ field: `${path}.overrides`, message: 'Overrides are only allowed with the "modified" decision.' })
    }
    resolved.push({ item, decision: d })
  })
  if (errors.length) throw httpError.validation(errors, 'Some review decisions are invalid.')
  for (const { item, decision } of resolved) {
    item.decision = decision.decision
    if (decision.decision === 'modified' && decision.overrides) {
      const overrides = { ...decision.overrides }
      if (typeof overrides.target_type === 'string') overrides.target_type = overrides.target_type.trim().toLowerCase()
      if (decision.item_type === 'field_mapping') syncFieldMappingEdit(set, item as FieldMapping, overrides)
      if (decision.item_type === 'model') syncModelRename(set, item as ModelProposal, overrides)
      Object.assign(item, overrides)
    }
  }
  return resolved.length
}

/** Keeps proposed model columns consistent with an edited field mapping. */
function syncFieldMappingEdit(set: MappingSuggestionSet, mapping: FieldMapping, overrides: Record<string, unknown>) {
  const next = {
    target_model: (overrides.target_model as string | undefined) ?? mapping.target_model,
    target_field: (overrides.target_field as string | undefined) ?? mapping.target_field,
    target_type: (overrides.target_type as string | undefined) ?? mapping.target_type,
  }
  const from = set.model_proposals.find((m) => m.name === mapping.target_model)
  const index = from?.columns.findIndex((c) => c.name === mapping.target_field) ?? -1
  if (!from || index < 0) return
  const column = from.columns[index]
  if (next.target_model === from.name) {
    from.columns[index] = { ...column, name: next.target_field, data_type: next.target_type }
    return
  }
  from.columns.splice(index, 1)
  const to = set.model_proposals.find((m) => m.name === next.target_model)
  if (to && !to.columns.some((c) => c.name === next.target_field)) {
    to.columns.push({ ...column, name: next.target_field, data_type: next.target_type })
  }
}

/** Renaming a proposed model re-points field mappings and surrogate keys at the new name. */
function syncModelRename(set: MappingSuggestionSet, model: ModelProposal, overrides: Record<string, unknown>) {
  const name = overrides.name as string | undefined
  if (!name || name === model.name) return
  set.field_mappings.filter((f) => f.target_model === model.name).forEach((f) => (f.target_model = name))
  set.key_candidates.filter((k) => k.table === model.name).forEach((k) => (k.table = name))
}

/** Edited field mappings whose target column is already used by another kept mapping. */
function targetClashes(set: MappingSuggestionSet, decisions: ReviewItemDecision[]) {
  const errors: { field: string; message: string }[] = []
  decisions.forEach((d, index) => {
    const retargeted = d.overrides && ('target_model' in d.overrides || 'target_field' in d.overrides)
    if (d.item_type !== 'field_mapping' || d.decision !== 'modified' || !retargeted) return
    const edited = set.field_mappings.find((f) => f.id === d.item_id)
    if (!edited) return
    const other = set.field_mappings.find(
      (f) => f.id !== edited.id && f.decision !== 'rejected' && f.target_model === edited.target_model && f.target_field === edited.target_field,
    )
    if (other) {
      errors.push({
        field: `decisions[${index}].overrides.target_field`,
        message: `${edited.target_model}.${edited.target_field} is already the target of ${other.source_table}.${other.source_field}. Choose another field name or reject that mapping.`,
      })
    }
  })
  return errors
}

function pendingCount(set: MappingSuggestionSet) {
  return allItems(set).filter((i) => i.decision === 'pending').length
}

function decisionCounts(set: MappingSuggestionSet) {
  const { counts } = summaryView(set)
  return { accepted: counts.accepted, modified: counts.modified, rejected: counts.rejected, pending: counts.pending }
}

function setLabel(set: MappingSuggestionSet) {
  return `${set.source_name} to ${set.target_layer === 'gold' ? 'Gold' : 'Silver'} mappings`
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/mapping-suggestions',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      return db.mappingSets
        .filter((s) => s.workspace_id === ctx.params.workspaceId)
        .map(materialize)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(summaryView)
    },
  },
  {
    method: 'POST',
    path: '/ai/mapping-suggestions',
    handler: (ctx) => {
      const input = body<Partial<CreateMappingSuggestionRequest>>(ctx)
      if (!input.workspace_id || typeof input.workspace_id !== 'string') {
        throw httpError.validation([{ field: 'workspace_id', message: 'workspace_id is required.' }])
      }
      const { user } = requirePermission(ctx, input.workspace_id, 'mappings:review')
      const errors: { field: string; message: string }[] = []
      const source = db.sources.find((s) => s.id === input.source_id && s.workspace_id === input.workspace_id)
      if (!input.source_id) errors.push({ field: 'source_id', message: 'Choose a data source.' })
      else if (!source) errors.push({ field: 'source_id', message: 'This source does not exist in the workspace.' })

      const tables = Array.isArray(input.source_tables) ? input.source_tables : []
      if (!tables.length) errors.push({ field: 'source_tables', message: 'Select at least one table.' })
      else if (tables.length > MAX_TABLES) errors.push({ field: 'source_tables', message: `Select at most ${MAX_TABLES} tables per suggestion set.` })
      else if (new Set(tables).size !== tables.length) errors.push({ field: 'source_tables', message: 'Each table can only be selected once.' })
      else if (source) {
        const known = new Set((db.sourceTables[source.id] ?? []).map((t) => `${t.schema}.${t.name}`))
        const unknown = tables.filter((t) => typeof t !== 'string' || !known.has(t))
        if (unknown.length) errors.push({ field: 'source_tables', message: `Unknown table${unknown.length > 1 ? 's' : ''} for ${source.name}: ${unknown.join(', ')}.` })
      }

      if (input.target_layer !== 'silver' && input.target_layer !== 'gold') {
        errors.push({ field: 'target_layer', message: 'Target layer must be silver or gold.' })
      }
      const context = typeof input.business_context === 'string' ? input.business_context.trim() : ''
      if (context.length > 2000) errors.push({ field: 'business_context', message: 'Business context must be at most 2000 characters.' })
      if (errors.length || !source) throw httpError.validation(errors)

      const set: MappingSuggestionSet = {
        id: newId('map'),
        workspace_id: input.workspace_id,
        source_id: source.id,
        source_name: source.name,
        source_tables: tables,
        target_layer: input.target_layer as 'silver' | 'gold',
        business_context: context || null,
        status: 'generating',
        provider: { ...PROVIDER },
        created_at: nowIso(),
        created_by: { id: user.id, name: user.name },
        submitted_at: null,
        field_mappings: [],
        join_candidates: [],
        key_candidates: [],
        model_proposals: [],
        review: null,
      }
      db.mappingSets.unshift(set)
      db.mappingReadyAt[set.id] = Date.now() + GENERATION_MS
      recordAudit({
        workspaceId: set.workspace_id,
        actor: userActor(user),
        action: 'mapping.suggestions_requested',
        resource: { type: 'mapping', id: set.id, name: setLabel(set) },
        metadata: { source_id: source.id, source_tables: tables, target_layer: set.target_layer, provider: PROVIDER.name, simulated: true },
      })
      return set
    },
  },
  {
    method: 'GET',
    path: '/ai/mapping-suggestions/:suggestionId',
    handler: (ctx) => {
      const set = findSet(ctx)
      requireWorkspace(ctx, set.workspace_id)
      return materialize(set)
    },
  },
  {
    method: 'POST',
    path: '/ai/mapping-suggestions/:suggestionId/review',
    handler: (ctx) => {
      const set = materialize(findSet(ctx))
      const input = body<Partial<ReviewMappingRequest>>(ctx)
      const action = input.action
      if (!action || !['save_draft', 'submit', 'approve', 'reject'].includes(action)) {
        throw httpError.validation([{ field: 'action', message: 'action must be save_draft, submit, approve or reject.' }])
      }
      const decisions = Array.isArray(input.decisions) ? input.decisions : []
      if (input.decisions !== undefined && !Array.isArray(input.decisions)) {
        throw httpError.validation([{ field: 'decisions', message: 'decisions must be a list.' }])
      }
      const approverAction = action === 'approve' || action === 'reject'
      // Once submitted, only approvers may change decisions.
      const needsApprover = approverAction || (set.status === 'in_review' && decisions.length > 0)
      const { user } = requirePermission(ctx, set.workspace_id, needsApprover ? 'mappings:approve' : 'mappings:review')

      if (set.status === 'generating') throw httpError.conflict('mapping_not_ready', 'Suggestions are still being generated. Try again in a few seconds.')
      if (set.status === 'failed') throw httpError.conflict('mapping_generation_failed', 'Generation failed for this set. Request new suggestions instead.')
      if (set.status === 'approved' || set.status === 'rejected') {
        throw httpError.conflict('mapping_review_closed', `This suggestion set was already ${set.status}; it is read-only.`, { status: set.status })
      }
      if (action === 'submit' && set.status !== 'ready') {
        throw httpError.conflict('mapping_already_submitted', 'This suggestion set is already in review.', { status: set.status })
      }
      if (approverAction && set.status !== 'in_review') {
        throw httpError.conflict('mapping_not_submitted', 'Only suggestion sets that were submitted for review can be approved or rejected.', { status: set.status })
      }
      const comment = typeof input.comment === 'string' ? input.comment.trim() : ''
      if (comment.length > 2000) throw httpError.validation([{ field: 'comment', message: 'Comment must be at most 2000 characters.' }])
      if (action === 'reject' && !comment) throw httpError.validation([{ field: 'comment', message: 'Explain why the suggestions are rejected so the author can act on it.' }])

      // Validate the transition before mutating anything.
      const before = set.status
      const snapshot = structuredClone(set)
      const applied = applyDecisions(set, decisions)
      const clashes = targetClashes(set, decisions)
      if (clashes.length) {
        Object.assign(set, snapshot)
        throw httpError.validation(clashes, 'Two field mappings cannot write to the same target column.')
      }
      if ((action === 'submit' || action === 'approve') && pendingCount(set) > 0) {
        const pending = pendingCount(set)
        Object.assign(set, snapshot)
        throw httpError.validation(
          [{ field: 'decisions', message: `${pending} suggestion${pending === 1 ? ' is' : 's are'} still pending. Accept, edit or reject every item first.` }],
          `${pending} item${pending === 1 ? '' : 's'} still pending review.`,
        )
      }

      const resource = { type: 'mapping', id: set.id, name: setLabel(set) }
      const counts = decisionCounts(set)
      if (action === 'save_draft') {
        recordAudit({ workspaceId: set.workspace_id, actor: userActor(user), action: 'mapping.draft_saved', resource, metadata: { decisions_applied: applied, ...counts } })
      } else if (action === 'submit') {
        set.status = 'in_review'
        set.submitted_at = nowIso()
        recordAudit({ workspaceId: set.workspace_id, actor: userActor(user), action: 'mapping.submitted_for_review', resource, changes: [{ field: 'status', before, after: set.status }], metadata: { decisions_applied: applied, ...counts } })
      } else {
        set.status = action === 'approve' ? 'approved' : 'rejected'
        set.review = { action: set.status, reviewed_by: { id: user.id, name: user.name }, reviewed_at: nowIso(), comment: comment || null }
        recordAudit({
          workspaceId: set.workspace_id,
          actor: userActor(user),
          action: action === 'approve' ? 'mapping.approved' : 'mapping.rejected',
          resource,
          changes: [{ field: 'status', before, after: set.status }],
          metadata: { decisions_applied: applied, comment: comment || null, ...counts },
        })
      }
      return set
    },
  },
]
