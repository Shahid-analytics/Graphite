import type {
  BusinessArea,
  CreateReportRequest,
  CreateReportRequestRequest,
  Dashboard,
  DataModel,
  DatasetRef,
  FavoriteRequest,
  FieldError,
  Report,
  ReportFilter,
  ReportMeasure,
  ReportRecommendation,
  ReportRequest,
  ReportSuggestion,
  ReportSuggestionProvenance,
  ReportSuggestionRequest,
  VisualizationType,
} from '@/types'
import type { DashboardRecord, FavoriteSet, ReportRecord } from '../db'
import { metabaseStatus } from '../engine/integrations'
import { body, httpError, matchesText, qBool, qString, type MockContext, type MockRoute } from '../router'
import { db, diffChanges, findOr404, recordAudit, requirePermission, requireWorkspace, userActor } from '../store'
import { newId, nowIso } from '../util'

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

const AREAS: BusinessArea[] = ['sales', 'finance', 'operations', 'marketing', 'customer', 'inventory']
const VISUALIZATIONS: VisualizationType[] = ['line', 'bar', 'area', 'table', 'kpi', 'pie', 'pivot']
const AGGREGATIONS: ReportMeasure['aggregation'][] = ['sum', 'count', 'count_distinct', 'avg', 'min', 'max']
const OPERATORS: ReportFilter['operator'][] = ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'last_n_days']
const PRIORITIES: ReportRequest['priority'][] = ['low', 'normal', 'high']
const DASHBOARD_STATUSES: Dashboard['status'][] = ['published', 'draft']
const REPORT_STATUSES: Report['status'][] = ['draft', 'in_review', 'published']

const PROVIDER = { name: 'Graphite mock suggestion engine', model: 'simulated', simulated: true }
const PROMPT_MIN = 10
const PROMPT_MAX = 1000
const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function datasetRef(model: DataModel): DatasetRef {
  return { model_id: model.id, model_name: model.name, layer: model.layer }
}

function workspaceModels(workspaceId: string) {
  return db.models.filter((m) => m.workspace_id === workspaceId)
}

/** Validates the optional list filters shared by dashboards and reports. */
function listQuery(ctx: MockContext, statuses: string[]) {
  const q = qString(ctx, 'q')?.trim() || undefined
  const area = qString(ctx, 'business_area') || undefined
  const status = qString(ctx, 'status') || undefined
  const favorite = qBool(ctx, 'favorite')
  const errors: FieldError[] = []
  if (area && !AREAS.includes(area as BusinessArea)) errors.push({ field: 'business_area', message: `Unknown business area "${area}". Use one of: ${AREAS.join(', ')}.` })
  if (status && !statuses.includes(status)) errors.push({ field: 'status', message: `Unknown status "${status}". Use one of: ${statuses.join(', ')}.` })
  if (errors.length) throw httpError.validation(errors, 'Invalid list filters.')
  return { q, area, status, favorite }
}

function byUpdatedDesc<T extends { updated_at: string }>(a: T, b: T) {
  return b.updated_at.localeCompare(a.updated_at)
}

function dashboardOr404(ctx: MockContext) {
  const dashboard = findOr404(db.dashboards, ctx.params.dashboardId, 'Dashboard')
  return { dashboard, access: requireWorkspace(ctx, dashboard.workspace_id) }
}

function reportOr404(ctx: MockContext) {
  const report = findOr404(db.reports, ctx.params.reportId, 'Report')
  return { report, access: requireWorkspace(ctx, report.workspace_id) }
}

// Favorites are personal: stored per user and workspace, never on the shared record.
type FavoriteKind = keyof FavoriteSet

function favoriteIds(userId: string, workspaceId: string, kind: FavoriteKind): string[] {
  return db.favorites[`${userId}:${workspaceId}`]?.[kind] ?? []
}

/** Adds or removes one favorite. Returns false when nothing changed. */
function setFavorite(userId: string, workspaceId: string, kind: FavoriteKind, id: string, isFavorite: boolean) {
  const key = `${userId}:${workspaceId}`
  const set = (db.favorites[key] ??= { dashboard_ids: [], report_ids: [] })
  if (set[kind].includes(id) === isFavorite) return false
  set[kind] = isFavorite ? [...set[kind], id] : set[kind].filter((x) => x !== id)
  return true
}

function dashboardView(dashboard: DashboardRecord, userId: string): Dashboard {
  return { ...dashboard, is_favorite: favoriteIds(userId, dashboard.workspace_id, 'dashboard_ids').includes(dashboard.id) }
}

function reportView(report: ReportRecord, userId: string): Report {
  return { ...report, is_favorite: favoriteIds(userId, report.workspace_id, 'report_ids').includes(report.id), suggestion: report.suggestion ?? null }
}

function readFavorite(ctx: MockContext) {
  const input = body<Partial<FavoriteRequest>>(ctx)
  if (typeof input.is_favorite !== 'boolean') throw httpError.validation([{ field: 'is_favorite', message: 'is_favorite must be true or false.' }])
  return input.is_favorite
}

/** Refuses Metabase-dependent actions unless the integration is connected. */
function requireMetabase(workspaceId: string, message?: string) {
  const status = metabaseStatus(db, workspaceId)
  if (status.status !== 'connected') {
    throw httpError.conflict('integration_unavailable', message ?? status.message ?? 'Metabase is not connected.', {
      integration: 'metabase',
      integration_status: status.status,
      integration_message: status.message,
    })
  }
  return status
}

function workspaceIdFrom(value: unknown) {
  if (!isString(value) || !value) throw httpError.validation([{ field: 'workspace_id', message: 'workspace_id is required.' }])
  return value
}

// ---------------------------------------------------------------------------
// Report definition validation
// ---------------------------------------------------------------------------

/** Resolves "column" against the dataset or "model.column" against a model in the workspace. */
function checkFieldRef(workspaceId: string, dataset: DataModel, ref: string): string | null {
  if (!IDENT.test(ref)) return `"${ref}" is not a valid column reference. Use column or model.column.`
  const [first, second] = ref.split('.')
  const model = second ? workspaceModels(workspaceId).find((m) => m.name === first && m.layer !== 'bronze') : dataset
  const column = second ?? first
  if (!model) return `Model "${first}" was not found in the Silver or Gold layer.`
  const columns = db.columns[model.id]
  if (columns && !columns.some((c) => c.name === column)) return `Column "${column}" does not exist in ${model.name}.`
  return null
}

function validateDefinition(workspaceId: string, input: Partial<CreateReportRequest>, errors: FieldError[]) {
  let dataset: DataModel | undefined
  if (!isString(input.dataset_model_id) || !input.dataset_model_id) {
    errors.push({ field: 'dataset_model_id', message: 'Choose the dataset the report reads from.' })
  } else {
    dataset = workspaceModels(workspaceId).find((m) => m.id === input.dataset_model_id)
    if (!dataset) errors.push({ field: 'dataset_model_id', message: `Model "${input.dataset_model_id}" does not exist in this workspace.` })
    else if (dataset.layer === 'bronze') errors.push({ field: 'dataset_model_id', message: 'Reports must read from a Silver or Gold model, not raw Bronze tables.' })
  }

  const dimensions = Array.isArray(input.dimensions) ? input.dimensions : null
  if (!dimensions) errors.push({ field: 'dimensions', message: 'dimensions must be a list of column references.' })
  else if (dimensions.length > 6) errors.push({ field: 'dimensions', message: 'Use at most 6 dimensions.' })
  else {
    const seen = new Set<string>()
    dimensions.forEach((dimension, i) => {
      if (!isString(dimension) || !dimension.trim()) return errors.push({ field: `dimensions.${i}`, message: 'Dimension cannot be empty.' })
      if (seen.has(dimension)) return errors.push({ field: `dimensions.${i}`, message: `"${dimension}" is listed twice.` })
      seen.add(dimension)
      const problem = dataset ? checkFieldRef(workspaceId, dataset, dimension.trim()) : null
      if (problem) errors.push({ field: `dimensions.${i}`, message: problem })
    })
  }

  const measures = Array.isArray(input.measures) ? input.measures : null
  if (!measures || measures.length === 0) errors.push({ field: 'measures', message: 'Add at least one measure.' })
  else if (measures.length > 8) errors.push({ field: 'measures', message: 'Use at most 8 measures.' })
  else {
    measures.forEach((measure, i) => {
      const m = (measure ?? {}) as Partial<ReportMeasure>
      if (!isString(m.name) || !m.name.trim()) errors.push({ field: `measures.${i}.name`, message: 'Measure name is required.' })
      if (!isString(m.expression) || !m.expression.trim()) errors.push({ field: `measures.${i}.expression`, message: 'Measure expression is required.' })
      else if (dataset && m.expression.trim() !== '*' && IDENT.test(m.expression.trim())) {
        const problem = checkFieldRef(workspaceId, dataset, m.expression.trim())
        if (problem) errors.push({ field: `measures.${i}.expression`, message: problem })
      }
      if (!m.aggregation || !AGGREGATIONS.includes(m.aggregation)) {
        errors.push({ field: `measures.${i}.aggregation`, message: `Aggregation must be one of: ${AGGREGATIONS.join(', ')}.` })
      }
    })
  }

  const filters = input.filters === undefined ? [] : Array.isArray(input.filters) ? input.filters : null
  if (!filters) errors.push({ field: 'filters', message: 'filters must be a list.' })
  else if (filters.length > 10) errors.push({ field: 'filters', message: 'Use at most 10 filters.' })
  else {
    filters.forEach((filter, i) => {
      const f = (filter ?? {}) as Partial<ReportFilter>
      if (!isString(f.field) || !f.field.trim()) errors.push({ field: `filters.${i}.field`, message: 'Filter field is required.' })
      else if (dataset) {
        const problem = checkFieldRef(workspaceId, dataset, f.field.trim())
        if (problem) errors.push({ field: `filters.${i}.field`, message: problem })
      }
      if (!f.operator || !OPERATORS.includes(f.operator)) errors.push({ field: `filters.${i}.operator`, message: `Operator must be one of: ${OPERATORS.join(', ')}.` })
      const value = isString(f.value) ? f.value.trim() : ''
      if (!value) errors.push({ field: `filters.${i}.value`, message: 'Filter value is required.' })
      else if (f.operator === 'last_n_days' && !/^[1-9]\d{0,3}$/.test(value)) errors.push({ field: `filters.${i}.value`, message: 'Enter a whole number of days between 1 and 9999.' })
      else if (f.operator === 'between' && value.split(',').filter((v) => v.trim()).length !== 2) errors.push({ field: `filters.${i}.value`, message: 'Enter two values separated by a comma, e.g. 2026-04-01,2026-09-30.' })
    })
  }

  return {
    dataset,
    dimensions: (dimensions ?? []).filter(isString).map((d) => d.trim()),
    measures: (measures ?? []).map((m) => ({ name: String(m?.name ?? '').trim(), expression: String(m?.expression ?? '').trim(), aggregation: m?.aggregation })),
    filters: (filters ?? []).map((f) => ({ field: String(f?.field ?? '').trim(), operator: f?.operator, value: String(f?.value ?? '').trim() })),
  }
}

// ---------------------------------------------------------------------------
// Report suggestion engine (deterministic keyword routing over Gold models)
// ---------------------------------------------------------------------------

interface Template {
  title: string
  description: string
  model: string
  dimensions: string[]
  measures: ReportMeasure[]
  filters?: ReportFilter[]
  visualization: VisualizationType
  confidence: number
  rationale: string
  /** Column holding the Indian fiscal year label, when the dataset can filter on it. */
  fiscalField?: string
  /** Date column used for relative time filters. */
  dateField?: string
  /** Prompt words that move this template up within its topic. */
  boost?: RegExp
}

interface Topic {
  key: string
  area: BusinessArea
  /** Words naming what is measured; they weigh three times more than context words. */
  keywords: RegExp
  /** Words naming a breakdown or context, e.g. "segment" or "warehouse". */
  context?: RegExp
  templates: Template[]
}

const sum = (name: string, expression: string): ReportMeasure => ({ name, expression, aggregation: 'sum' })

const TOPICS: Topic[] = [
  {
    key: 'revenue',
    area: 'finance',
    keywords: /\b(revenue|sales|invoice[sd]?|invoicing|billing|turnover|top ?line|income)\b/gi,
    context: /\b(category|categories|products?)\b/gi,
    templates: [
      { boost: /\b(monthly|month|trend|segments?)\b/gi, title: 'Monthly net revenue by customer segment', description: 'Net and gross revenue per month, split by customer segment.', model: 'agg_monthly_revenue', dimensions: ['month', 'segment'], measures: [sum('Net revenue', 'net_revenue'), sum('Gross revenue', 'gross_revenue')], visualization: 'bar', confidence: 0.92, rationale: 'agg_monthly_revenue is pre-aggregated by month and segment, so the report stays fast and matches the Executive Revenue Overview dashboard.', dateField: 'month' },
      { boost: /\b(category|categories|products?)\b/gi, title: 'Net revenue by product category', description: 'Invoice line revenue grouped by product category.', model: 'fct_invoice_lines', dimensions: ['dim_product.category'], measures: [sum('Net revenue', 'line_amount'), sum('Quantity', 'quantity')], visualization: 'bar', confidence: 0.84, rationale: 'fct_invoice_lines joins to dim_product through product_sk, which gives category-level revenue at line grain.', fiscalField: 'dim_date.fiscal_year' },
      { boost: /\b(top|rank|largest|biggest|customers?|distributors?)\b/gi, title: 'Top customers by net revenue', description: 'Customers ranked by net invoiced amount, with invoice counts.', model: 'fct_invoices', dimensions: ['dim_customer.customer_name', 'dim_customer.segment'], measures: [sum('Net revenue', 'net_amount'), { name: 'Invoices', expression: 'invoice_id', aggregation: 'count_distinct' }], visualization: 'table', confidence: 0.81, rationale: 'fct_invoices carries one row per invoice and references dim_customer through customer_sk.', fiscalField: 'dim_date.fiscal_year' },
    ],
  },
  {
    key: 'collections',
    area: 'finance',
    keywords: /\b(collections?|collected|payments?|paid|pay|receivables?|overdue|outstanding|dso|age?ing|debtors?|dues?)\b/gi,
    context: /\b(credit|late|slow)\b/gi,
    templates: [
      { boost: /\b(slow|late|which|who|customers?|distributors?|overdue)\b/gi, title: 'Customers with receivables over 60 days', description: 'Outstanding amount per customer in the 61-90 and 90+ ageing buckets.', model: 'agg_receivables_aging', dimensions: ['dim_customer.customer_name', 'bucket'], measures: [sum('Outstanding', 'outstanding_amount'), sum('Invoices', 'invoice_count')], filters: [{ field: 'bucket', operator: 'in', value: '61-90,90+' }], visualization: 'table', confidence: 0.9, rationale: 'agg_receivables_aging already buckets outstanding balances per customer, so slow payers can be listed without recomputing ageing.' },
      { boost: /\b(days|dso|trend|monthly|speed)\b/gi, title: 'Average days to pay by month', description: 'Mean number of days between invoice and payment, per payment month.', model: 'fct_payments', dimensions: ['dim_date.month'], measures: [{ name: 'Average days to pay', expression: 'days_to_pay', aggregation: 'avg' }, sum('Collected', 'amount')], visualization: 'line', confidence: 0.85, rationale: 'fct_payments stores days_to_pay per payment and links to dim_date on the paid date, which shows whether collections are speeding up or slowing down.', fiscalField: 'dim_date.fiscal_year', dateField: 'dim_date.date' },
      { boost: /\b(age?ing|buckets?|outstanding)\b/gi, title: 'Outstanding receivables by ageing bucket', description: 'Total outstanding balance in each ageing bucket.', model: 'agg_receivables_aging', dimensions: ['bucket'], measures: [sum('Outstanding', 'outstanding_amount')], visualization: 'bar', confidence: 0.83, rationale: 'A single bar per bucket (0-30, 31-60, 61-90, 90+) is the standard view for credit control reviews.' },
      { boost: /\b(mode|upi|neft|rtgs|cheque|cash)\b/gi, title: 'Collections by payment mode', description: 'Collected amount by NEFT, RTGS, UPI, cheque and cash.', model: 'fct_payments', dimensions: ['payment_mode'], measures: [sum('Collected', 'amount')], visualization: 'bar', confidence: 0.72, rationale: 'payment_mode is standardised in Silver, so the split is reliable across ERP versions.', fiscalField: 'dim_date.fiscal_year', dateField: 'dim_date.date' },
    ],
  },
  {
    key: 'pipeline',
    area: 'sales',
    keywords: /\b(pipeline|opportunit(y|ies)|win|wins|won|win rate|deals?|forecast|quota)\b/gi,
    context: /\b(reps?|salesperson|sales team|stages?)\b/gi,
    templates: [
      { title: 'Open pipeline by stage', description: 'Total and probability-weighted opportunity value per stage.', model: 'fct_sales_pipeline', dimensions: ['stage'], measures: [sum('Pipeline', 'amount'), sum('Weighted pipeline', 'weighted_amount')], visualization: 'bar', confidence: 0.9, rationale: 'fct_sales_pipeline holds one row per Salesforce opportunity with weighted_amount already calculated from stage probability.' },
      { boost: /\b(win rate|reps?|salesperson|representatives?)\b/gi, title: 'Win rate by sales representative', description: 'Share of opportunities won and deal count per representative.', model: 'fct_sales_pipeline', dimensions: ['dim_sales_rep.full_name'], measures: [{ name: 'Win rate', expression: 'is_won', aggregation: 'avg' }, { name: 'Opportunities', expression: 'opportunity_id', aggregation: 'count' }], visualization: 'bar', confidence: 0.83, rationale: 'Averaging the is_won flag gives the win rate; dim_sales_rep resolves the Salesforce owner to a name.', fiscalField: 'dim_date.fiscal_year', dateField: 'dim_date.date' },
      { boost: /\b(forecast|month|monthly|close)\b/gi, title: 'Weighted pipeline by expected close month', description: 'Weighted opportunity value grouped by expected close month.', model: 'fct_sales_pipeline', dimensions: ['dim_date.month'], measures: [sum('Weighted pipeline', 'weighted_amount')], visualization: 'line', confidence: 0.78, rationale: 'close_date_key links to dim_date, so the forecast follows the fiscal calendar.', fiscalField: 'dim_date.fiscal_year' },
    ],
  },
  {
    key: 'inventory',
    area: 'inventory',
    keywords: /\b(inventory|stocks?|slow[- ]?movers?|slow[- ]?moving|dead stock|on hand|availability|reorder)\b/gi,
    context: /\b(warehouses?|skus?|items?)\b/gi,
    templates: [
      { boost: /\b(warehouses?|value)\b/gi, title: 'Stock value by warehouse', description: 'Current stock value and available quantity per warehouse.', model: 'fct_inventory_snapshot', dimensions: ['warehouse_code'], measures: [sum('Stock value', 'stock_value'), sum('Available', 'available')], filters: [{ field: 'dim_date.date', operator: 'last_n_days', value: '1' }], visualization: 'bar', confidence: 0.9, rationale: 'fct_inventory_snapshot is a daily snapshot; filtering to the latest day avoids summing stock across days.' },
      { boost: /\b(category|categories)\b/gi, title: 'Stock value by product category', description: 'Stock value and units on hand grouped by category.', model: 'fct_inventory_snapshot', dimensions: ['dim_product.category'], measures: [sum('Stock value', 'stock_value'), sum('On hand', 'on_hand')], filters: [{ field: 'dim_date.date', operator: 'last_n_days', value: '1' }], visualization: 'bar', confidence: 0.84, rationale: 'dim_product provides the category for each SKU in the snapshot.' },
      { boost: /\b(slow|dead|low|zero|out of stock|shortage)\b/gi, title: 'Items with low availability', description: 'Products and warehouses where available stock is zero or below.', model: 'fct_inventory_snapshot', dimensions: ['dim_product.product_name', 'warehouse_code'], measures: [sum('Available', 'available'), sum('Reserved', 'reserved')], filters: [{ field: 'available', operator: 'lte', value: '0' }, { field: 'dim_date.date', operator: 'last_n_days', value: '1' }], visualization: 'table', confidence: 0.74, rationale: 'Stock movement history is not modelled in Gold yet, so slow movers cannot be measured directly; availability from the latest snapshot is the closest proxy.' },
    ],
  },
  {
    key: 'customers',
    area: 'customer',
    keywords: /\b(churn|retention|repeat|customer count|number of customers|new customers|customer base)\b/gi,
    context: /\b(customers?|segments?|segmentation|accounts?|clients?|states?|regions?)\b/gi,
    templates: [
      { title: 'Active customers by segment', description: 'Number of current customers in each segment.', model: 'dim_customer', dimensions: ['segment'], measures: [{ name: 'Customers', expression: 'customer_sk', aggregation: 'count_distinct' }], filters: [{ field: 'is_current', operator: 'eq', value: 'true' }], visualization: 'bar', confidence: 0.87, rationale: 'dim_customer is an SCD type 2 dimension; filtering on is_current counts each customer once.' },
      { boost: /\b(revenue|trend|churn|over time)\b/gi, title: 'Revenue by segment over time', description: 'Monthly net revenue per customer segment.', model: 'agg_monthly_revenue', dimensions: ['month', 'segment'], measures: [sum('Net revenue', 'net_revenue')], visualization: 'area', confidence: 0.82, rationale: 'A stacked area of agg_monthly_revenue shows how the segment mix shifts month to month. Churn is not modelled directly, so a shrinking segment is the nearest signal.', dateField: 'month' },
      { boost: /\b(states?|regions?|geograph\w*)\b/gi, title: 'Customers by state', description: 'Current customers per state, with total credit limit.', model: 'dim_customer', dimensions: ['state'], measures: [{ name: 'Customers', expression: 'customer_sk', aggregation: 'count_distinct' }, sum('Credit limit', 'credit_limit')], filters: [{ field: 'is_current', operator: 'eq', value: 'true' }], visualization: 'table', confidence: 0.75, rationale: 'Geographic spread of the customer base from dim_customer.' },
    ],
  },
  {
    key: 'gst',
    area: 'finance',
    keywords: /\b(gst|gstr|tax|taxes|hsn|cgst|sgst|igst)\b/gi,
    context: /\b(returns?|filing)\b/gi,
    templates: [
      { title: 'GST collected by month', description: 'GST amount on invoice lines per month for filing reconciliation.', model: 'fct_invoice_lines', dimensions: ['dim_date.month'], measures: [sum('GST amount', 'gst_amount'), sum('Taxable value', 'line_amount')], visualization: 'bar', confidence: 0.89, rationale: 'fct_invoice_lines carries gst_amount at line level, which is the grain used for GST returns.', fiscalField: 'dim_date.fiscal_year' },
      { boost: /\b(states?|igst|place of supply)\b/gi, title: 'Tax amount by customer state', description: 'Invoice tax amount grouped by the customer state (place of supply).', model: 'fct_invoices', dimensions: ['dim_customer.state'], measures: [sum('Tax amount', 'tax_amount')], visualization: 'table', confidence: 0.8, rationale: 'Customer state approximates place of supply, which decides IGST versus CGST and SGST.', fiscalField: 'dim_date.fiscal_year' },
    ],
  },
]

const GENERIC: Template[] = [
  { title: 'Monthly revenue and collections', description: 'Net revenue and collected amount per month.', model: 'agg_monthly_revenue', dimensions: ['month'], measures: [sum('Net revenue', 'net_revenue'), sum('Collected', 'collected')], visualization: 'line', confidence: 0.56, rationale: 'The request was ambiguous: it did not mention a recognisable topic such as revenue, collections, pipeline, inventory, customers or GST. This general trend is a starting point; describe the measure and breakdown you need for a closer match.' },
  { title: 'Open pipeline by stage', description: 'Total and probability-weighted opportunity value per stage.', model: 'fct_sales_pipeline', dimensions: ['stage'], measures: [sum('Pipeline', 'amount'), sum('Weighted pipeline', 'weighted_amount')], visualization: 'bar', confidence: 0.48, rationale: 'The request was ambiguous, so this is a commonly used sales view rather than a direct match. Mention the measure (for example revenue or stock value) and the breakdown you want.' },
]

function currentFiscalYear(now = new Date()) {
  const start = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return { label: `FY${start}-${String(start + 1).slice(2)}`, start: `${start}-04-01` }
}

/** Time window mentioned in the prompt, if any. */
function timeIntent(prompt: string) {
  const text = prompt.toLowerCase()
  if (/\b(fiscal year|financial year|this fy|current fy|ytd|year to date|this year)\b/.test(text)) return { kind: 'fiscal' as const }
  const days = /\b(?:last|past)\s+(\d{1,3})\s+days?\b/.exec(text)
  if (days) return { kind: 'days' as const, days: Number(days[1]) }
  if (/\b(last|past|this) (quarter|90 days)\b/.test(text)) return { kind: 'days' as const, days: 90 }
  if (/\b(last|past|this) month\b/.test(text)) return { kind: 'days' as const, days: 30 }
  return null
}

function rankTopics(prompt: string, hint: BusinessArea | undefined) {
  return TOPICS.map((topic, order) => {
    const strong = [...prompt.matchAll(topic.keywords)]
    const weak = topic.context ? [...prompt.matchAll(topic.context)] : []
    const first = Math.min(strong[0]?.index ?? Infinity, weak[0]?.index ?? Infinity)
    return { topic, hits: strong.length * 3 + weak.length, first, order }
  })
    .filter((t, _, all) => t.hits >= 3 || (t.hits > 0 && all.every((other) => other.hits < 3)))
    .sort((a, b) => {
      const hintA = hint && a.topic.area === hint ? 1 : 0
      const hintB = hint && b.topic.area === hint ? 1 : 0
      return hintB - hintA || b.hits - a.hits || a.first - b.first || a.order - b.order
    })
    .map((t) => t.topic)
}

/** Turns a template into a recommendation, or null when the workspace lacks the Gold model or columns. */
function buildRecommendation(workspaceId: string, template: Template, prompt: string, adjust = 0, prefix = ''): ReportRecommendation | null {
  const model = workspaceModels(workspaceId).find((m) => m.layer === 'gold' && m.name === template.model)
  if (!model) return null
  const filters = [...(template.filters ?? [])]
  const notes: string[] = []
  const time = timeIntent(prompt)
  if (time?.kind === 'fiscal') {
    const fy = currentFiscalYear()
    if (template.fiscalField) filters.push({ field: template.fiscalField, operator: 'eq', value: fy.label })
    else if (template.dateField) filters.push({ field: template.dateField, operator: 'gte', value: fy.start })
    if (template.fiscalField || template.dateField) notes.push(`Filtered to ${fy.label} because the request mentions the fiscal year.`)
  } else if (time?.kind === 'days' && template.dateField && !filters.some((f) => f.field === template.dateField)) {
    filters.push({ field: template.dateField, operator: 'last_n_days', value: String(time.days) })
    notes.push(`Limited to the last ${time.days} days as requested.`)
  }
  const refs = [...template.dimensions, ...filters.map((f) => f.field), ...template.measures.map((m) => m.expression)]
  if (refs.some((ref) => checkFieldRef(workspaceId, model, ref))) return null

  let confidence = template.confidence + adjust
  const failing = db.qualityChecks.find((c) => c.model_id === model.id && c.status === 'failed')
  if (failing) {
    confidence -= 0.08
    const impact = failing.check_type === 'unique' ? 'totals may be overstated until it passes' : failing.check_type === 'freshness' ? 'recent activity may be missing' : 'review the check before relying on the numbers'
    notes.push(`Caution: ${model.name} fails the ${failing.name} quality check${failing.message ? ` (${failing.message.replace(/\.$/, '')})` : ''}; ${impact}.`)
  } else if (model.freshness_status === 'stale') {
    confidence -= 0.05
    notes.push(`Caution: ${model.name} is stale and has missed its freshness SLA.`)
  }
  return {
    id: newId('rec'),
    title: template.title,
    description: template.description,
    dataset: datasetRef(model),
    dimensions: [...template.dimensions],
    measures: template.measures.map((m) => ({ ...m })),
    filters,
    visualization: template.visualization,
    confidence: Math.round(Math.min(0.97, Math.max(0.3, confidence)) * 100) / 100,
    rationale: [prefix, template.rationale, ...notes].filter(Boolean).join(' '),
  }
}

/** Stable sort: templates whose boost words appear in the prompt come first. */
function orderTemplates(templates: Template[], prompt: string) {
  const score = (t: Template) => (t.boost ? [...prompt.matchAll(t.boost)].length : 0)
  return templates.map((t, i) => ({ t, i, s: score(t) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.t)
}

function suggest(workspaceId: string, prompt: string, hint: BusinessArea | undefined): ReportRecommendation[] {
  const topics = rankTopics(prompt, hint)
  const results: ReportRecommendation[] = []
  const take = (templates: Template[], limit: number, adjust = 0, prefix = '') => {
    for (const template of templates) {
      if (results.length >= limit) break
      if (results.some((r) => r.title === template.title)) continue
      const rec = buildRecommendation(workspaceId, template, prompt, adjust, prefix)
      if (rec) results.push(rec)
    }
  }

  if (topics.length) {
    // The best-matching topic leads; secondary topics contribute their strongest template.
    const ordered = topics.map((t) => orderTemplates(t.templates, prompt))
    take(ordered[0], topics.length > 1 ? 3 : 4)
    for (const templates of ordered.slice(1)) take(templates.slice(0, 1), 4, -0.04)
    if (results.length < 2) take(ordered.flat(), 2)
  }
  if (!results.length && hint) {
    const areaTopics = TOPICS.filter((t) => t.area === hint)
    take(areaTopics.flatMap((t) => t.templates), 2, -0.18, `The request did not name a specific measure, so this is based on the selected business area (${hint}).`)
  }
  if (!results.length) take(GENERIC, 2)
  return results
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const routes: MockRoute[] = [
  // Dashboards ---------------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/dashboards',
    handler: (ctx) => {
      const { user } = requireWorkspace(ctx, ctx.params.workspaceId)
      const { q, area, status, favorite } = listQuery(ctx, DASHBOARD_STATUSES)
      return db.dashboards
        .filter((d) => d.workspace_id === ctx.params.workspaceId)
        .map((d) => dashboardView(d, user.id))
        .filter((d) => !area || d.business_area === area)
        .filter((d) => !status || d.status === status)
        .filter((d) => favorite === undefined || d.is_favorite === favorite)
        .filter((d) => matchesText(q, d.name, d.description, d.owner, ...d.datasets.map((s) => s.model_name)))
        .sort(byUpdatedDesc)
    },
  },
  {
    method: 'GET',
    path: '/dashboards/:dashboardId',
    handler: (ctx) => {
      const { dashboard, access } = dashboardOr404(ctx)
      dashboard.last_viewed_at = nowIso()
      dashboard.view_count_30d += 1
      return dashboardView(dashboard, access.user.id)
    },
  },
  {
    method: 'POST',
    path: '/dashboards/:dashboardId/favorite',
    handler: (ctx) => {
      const { dashboard, access } = dashboardOr404(ctx)
      const isFavorite = readFavorite(ctx)
      if (setFavorite(access.user.id, dashboard.workspace_id, 'dashboard_ids', dashboard.id, isFavorite)) {
        recordAudit({ workspaceId: dashboard.workspace_id, actor: userActor(access.user), action: isFavorite ? 'dashboard.favorited' : 'dashboard.unfavorited', resource: { type: 'dashboard', id: dashboard.id, name: dashboard.name } })
      }
      return dashboardView(dashboard, access.user.id)
    },
  },
  {
    method: 'POST',
    path: '/dashboards/:dashboardId/embed-session',
    handler: (ctx) => {
      const { dashboard } = dashboardOr404(ctx)
      requireMetabase(dashboard.workspace_id)
      if (dashboard.status !== 'published' || dashboard.metabase_dashboard_id === null) {
        throw httpError.conflict('dashboard_not_published', 'This dashboard is a draft and has no published Metabase dashboard to embed.')
      }
      // Reached only with a live, connected Metabase. The signed URL must come from the backend.
      throw httpError.conflict('integration_unavailable', 'Embed URLs are signed by the backend and cannot be generated in demo mode.')
    },
  },

  // Reports ------------------------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/reports',
    handler: (ctx) => {
      const { user } = requireWorkspace(ctx, ctx.params.workspaceId)
      const { q, area, status, favorite } = listQuery(ctx, REPORT_STATUSES)
      return db.reports
        .filter((r) => r.workspace_id === ctx.params.workspaceId)
        .map((r) => reportView(r, user.id))
        .filter((r) => !area || r.business_area === area)
        .filter((r) => !status || r.status === status)
        .filter((r) => favorite === undefined || r.is_favorite === favorite)
        .filter((r) => matchesText(q, r.name, r.description, r.owner, r.dataset.model_name))
        .sort(byUpdatedDesc)
    },
  },
  {
    method: 'GET',
    path: '/reports/:reportId',
    handler: (ctx) => {
      const { report, access } = reportOr404(ctx)
      report.last_viewed_at = nowIso()
      return reportView(report, access.user.id)
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/reports',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user } = requirePermission(ctx, workspaceId, 'reports:write')
      const input = body<Partial<CreateReportRequest>>(ctx)
      const errors: FieldError[] = []

      const name = isString(input.name) ? input.name.trim() : ''
      if (name.length < 3) errors.push({ field: 'name', message: 'Report name must be at least 3 characters.' })
      else if (name.length > 120) errors.push({ field: 'name', message: 'Report name must be 120 characters or fewer.' })
      else if (db.reports.some((r) => r.workspace_id === workspaceId && r.name.toLowerCase() === name.toLowerCase())) {
        errors.push({ field: 'name', message: 'A report with this name already exists in this workspace.' })
      }
      const description = isString(input.description) ? input.description.trim() : ''
      if (description.length > 500) errors.push({ field: 'description', message: 'Description must be 500 characters or fewer.' })
      if (!input.business_area || !AREAS.includes(input.business_area)) errors.push({ field: 'business_area', message: 'Choose a business area.' })
      if (!input.visualization || !VISUALIZATIONS.includes(input.visualization)) errors.push({ field: 'visualization', message: 'Choose a visualization.' })

      const definition = validateDefinition(workspaceId, input, errors)

      let provenance: ReportSuggestionProvenance | null = null
      if (input.suggestion_id !== undefined || input.recommendation_id !== undefined) {
        const suggestion = db.reportSuggestions.find((s) => s.id === input.suggestion_id)
        const recommendation = suggestion?.recommendations.find((r) => r.id === input.recommendation_id)
        if (!suggestion) errors.push({ field: 'suggestion_id', message: 'The suggestion this draft came from was not found. Generate new recommendations and try again.' })
        else if (!recommendation) errors.push({ field: 'recommendation_id', message: 'The recommendation was not found in that suggestion.' })
        else if (!workspaceModels(workspaceId).some((m) => m.id === recommendation.dataset.model_id)) {
          errors.push({ field: 'suggestion_id', message: 'The suggestion belongs to a different workspace.' })
        } else {
          provenance = { suggestion_id: suggestion.id, recommendation_id: recommendation.id, prompt: suggestion.prompt, provider: suggestion.provider, confidence: recommendation.confidence, suggested_at: suggestion.created_at }
        }
      }
      if (errors.length) throw httpError.validation(errors)

      const report: ReportRecord = {
        id: newId('rpt'),
        workspace_id: workspaceId,
        name,
        description,
        business_area: input.business_area!,
        status: 'draft',
        origin: provenance ? 'ai_suggestion' : 'manual',
        visualization: input.visualization!,
        dataset: datasetRef(definition.dataset!),
        dimensions: definition.dimensions,
        measures: definition.measures,
        filters: definition.filters,
        metabase_question_id: null,
        owner: user.name,
        updated_at: nowIso(),
        last_viewed_at: null,
        suggestion: provenance,
      }
      db.reports.unshift(report)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'report.created',
        resource: { type: 'report', id: report.id, name: report.name },
        changes: diffChanges({}, { name: report.name, status: report.status, dataset: report.dataset.model_name, visualization: report.visualization }),
        metadata: provenance ? { origin: 'ai_suggestion', suggestion_id: provenance.suggestion_id, recommendation_id: provenance.recommendation_id, simulated_provider: provenance.provider.simulated } : { origin: 'manual' },
      })
      return reportView(report, user.id)
    },
  },
  {
    method: 'POST',
    path: '/reports/:reportId/favorite',
    handler: (ctx) => {
      const { report, access } = reportOr404(ctx)
      const isFavorite = readFavorite(ctx)
      if (setFavorite(access.user.id, report.workspace_id, 'report_ids', report.id, isFavorite)) {
        recordAudit({ workspaceId: report.workspace_id, actor: userActor(access.user), action: isFavorite ? 'report.favorited' : 'report.unfavorited', resource: { type: 'report', id: report.id, name: report.name } })
      }
      return reportView(report, access.user.id)
    },
  },
  {
    method: 'POST',
    path: '/reports/:reportId/publish',
    handler: (ctx) => {
      const report = findOr404(db.reports, ctx.params.reportId, 'Report')
      const { user } = requirePermission(ctx, report.workspace_id, 'reports:publish')
      if (report.status === 'published') {
        throw httpError.conflict('already_published', `"${report.name}" is already published to Metabase.`, { metabase_question_id: report.metabase_question_id })
      }
      try {
        requireMetabase(report.workspace_id, 'The report is saved as a draft. Publishing requires a connected Metabase instance.')
      } catch (error) {
        recordAudit({ workspaceId: report.workspace_id, actor: userActor(user), action: 'report.publish', resource: { type: 'report', id: report.id, name: report.name }, status: 'failure', metadata: { reason: 'integration_unavailable', integration: 'metabase' } })
        throw error
      }
      // Unreachable in demo mode: publishing needs the backend to create the Metabase question.
      throw httpError.conflict('integration_unavailable', 'The report is saved as a draft. Publishing requires a connected Metabase instance.')
    },
  },

  // AI report assistant ------------------------------------------------------
  {
    method: 'POST',
    path: '/ai/report-suggestions',
    handler: (ctx) => {
      const input = body<Partial<ReportSuggestionRequest>>(ctx)
      const workspaceId = workspaceIdFrom(input.workspace_id)
      requireWorkspace(ctx, workspaceId)
      const prompt = isString(input.prompt) ? input.prompt.trim().replace(/\s+/g, ' ') : ''
      const errors: FieldError[] = []
      if (prompt.length < PROMPT_MIN) errors.push({ field: 'prompt', message: `Describe the report in at least ${PROMPT_MIN} characters.` })
      else if (prompt.length > PROMPT_MAX) errors.push({ field: 'prompt', message: `Keep the description under ${PROMPT_MAX} characters.` })
      if (input.business_area !== undefined && !AREAS.includes(input.business_area)) errors.push({ field: 'business_area', message: 'Unknown business area.' })
      if (errors.length) throw httpError.validation(errors)

      if (!workspaceModels(workspaceId).some((m) => m.layer === 'gold')) {
        throw httpError.conflict('no_gold_models', 'This workspace has no Gold models yet. Report suggestions are built from Gold models; connect a source and build Gold models first.')
      }
      const suggestion: ReportSuggestion = {
        id: newId('sug'),
        prompt,
        provider: PROVIDER,
        created_at: nowIso(),
        recommendations: suggest(workspaceId, prompt, input.business_area),
      }
      db.reportSuggestions.unshift(suggestion)
      db.reportSuggestions.splice(50)
      return suggestion
    },
  },

  // Custom report requests ---------------------------------------------------
  {
    method: 'GET',
    path: '/workspaces/:workspaceId/report-requests',
    handler: (ctx) => {
      requireWorkspace(ctx, ctx.params.workspaceId)
      return db.reportRequests.filter((r) => r.workspace_id === ctx.params.workspaceId).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
  },
  {
    method: 'POST',
    path: '/workspaces/:workspaceId/report-requests',
    handler: (ctx) => {
      const workspaceId = ctx.params.workspaceId
      const { user } = requireWorkspace(ctx, workspaceId)
      const input = body<Partial<CreateReportRequestRequest>>(ctx)
      const errors: FieldError[] = []
      const title = isString(input.title) ? input.title.trim() : ''
      const description = isString(input.description) ? input.description.trim() : ''
      if (title.length < 3) errors.push({ field: 'title', message: 'Title must be at least 3 characters.' })
      else if (title.length > 120) errors.push({ field: 'title', message: 'Title must be 120 characters or fewer.' })
      if (description.length < 20) errors.push({ field: 'description', message: 'Describe what you need in at least 20 characters: the question, measures and breakdowns.' })
      else if (description.length > 2000) errors.push({ field: 'description', message: 'Description must be 2000 characters or fewer.' })
      if (!input.business_area || !AREAS.includes(input.business_area)) errors.push({ field: 'business_area', message: 'Choose a business area.' })
      if (!input.priority || !PRIORITIES.includes(input.priority)) errors.push({ field: 'priority', message: 'Choose a priority.' })
      const neededBy = input.needed_by || null
      if (neededBy !== null) {
        if (!isString(neededBy) || !/^\d{4}-\d{2}-\d{2}$/.test(neededBy) || Number.isNaN(Date.parse(neededBy))) {
          errors.push({ field: 'needed_by', message: 'Use a date in YYYY-MM-DD format.' })
        } else if (neededBy < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
          // One day of slack: the browser validates against the user's local date, which can trail UTC.
          errors.push({ field: 'needed_by', message: 'The needed-by date cannot be in the past.' })
        }
      }
      if (errors.length) throw httpError.validation(errors)

      const request: ReportRequest = {
        id: newId('rr'),
        workspace_id: workspaceId,
        title,
        description,
        business_area: input.business_area!,
        priority: input.priority!,
        needed_by: neededBy,
        status: 'submitted',
        requested_by: { id: user.id, name: user.name },
        created_at: nowIso(),
      }
      db.reportRequests.unshift(request)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'report_request.submitted',
        resource: { type: 'report_request', id: request.id, name: request.title },
        changes: diffChanges({}, { title, business_area: request.business_area, priority: request.priority, needed_by: neededBy }),
      })
      return request
    },
  },

  // Metabase integration -----------------------------------------------------
  {
    method: 'GET',
    path: '/integrations/metabase/status',
    handler: (ctx) => {
      const workspaceId = workspaceIdFrom(qString(ctx, 'workspace_id'))
      requireWorkspace(ctx, workspaceId)
      return metabaseStatus(db, workspaceId)
    },
  },
  {
    method: 'POST',
    path: '/integrations/metabase/test-connection',
    handler: (ctx) => {
      const workspaceId = workspaceIdFrom(body<{ workspace_id?: string }>(ctx).workspace_id)
      const { user } = requireWorkspace(ctx, workspaceId)
      // The check time and result are stored per workspace and reported as last_checked_at by every status endpoint.
      db.metabaseChecks[workspaceId] = { checked_at: nowIso(), status: metabaseStatus(db, workspaceId).status }
      const status = metabaseStatus(db, workspaceId)
      recordAudit({
        workspaceId,
        actor: userActor(user),
        action: 'integration.metabase_tested',
        resource: { type: 'integration', id: 'metabase', name: 'Metabase' },
        status: status.status === 'connected' ? 'success' : 'failure',
        metadata: { result: status.status, simulated: true },
      })
      return status
    },
  },
]
