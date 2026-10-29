import type {
  ColumnProfile,
  DataModel,
  DbtProject,
  QualityCheck,
  Relationship,
  SchemaChange,
  Transformation,
  TransformationColumn,
} from '@/types'
import { ago, prng } from '../util'
import { WS_ACME } from './core'
import { CUSTOM_SQL, MODEL_SPECS, type ModelSpec } from './warehouse-spec'

const SCHEMA_PREFIX: Record<string, string> = {
  bronze_salesforce: 'bsf',
  bronze_erp: 'berp',
  bronze_web: 'bweb',
  silver: 's',
  gold: 'g',
}

export function modelId(schema: string, name: string) {
  return `mdl_${SCHEMA_PREFIX[schema] ?? schema}_${name}`
}

export function transformationId(name: string) {
  return `trf_${name}`
}

interface ParsedColumn {
  name: string
  type: string
  pk: boolean
  bk: boolean
  sk: boolean
  nullable: boolean
  fk: { model: string; column: string } | null
}

function parseColumn(spec: string): ParsedColumn {
  const [name, type, ...flags] = spec.split(' ')
  const fkFlag = flags.find((f) => f.startsWith('fk='))
  const [fkModel, fkColumn] = fkFlag ? fkFlag.slice(3).split('.') : [null, null]
  return {
    name,
    type,
    pk: flags.includes('pk'),
    bk: flags.includes('bk'),
    sk: flags.includes('sk'),
    nullable: flags.includes('null'),
    fk: fkModel && fkColumn ? { model: fkModel, column: fkColumn } : null,
  }
}

const DESCRIPTIONS: Record<string, string> = {
  id: 'Salesforce record identifier.',
  system_modstamp: 'Last modification timestamp in Salesforce; used as the incremental cursor.',
  _dlt_load_id: 'Identifier of the dlt load that wrote this row.',
  updated_at: 'Last update timestamp in the source system.',
  gstin: 'Goods and Services Tax Identification Number.',
  hsn_code: 'Harmonised System of Nomenclature code used for GST.',
  customer_sk: 'Surrogate key of the customer dimension.',
  product_sk: 'Surrogate key of the product dimension.',
  sales_rep_sk: 'Surrogate key of the sales representative dimension.',
  date_key: 'Calendar date as an integer (YYYYMMDD).',
  net_amount: 'Gross amount excluding tax.',
  outstanding_amount: 'Net amount not yet collected.',
  weighted_amount: 'Opportunity amount multiplied by stage probability.',
  customer_key: 'Business key of the conformed customer (ERP- or SF- prefixed).',
  match_method: 'How the Salesforce account and ERP customer were matched.',
  days_to_pay: 'Days between invoice date and payment date.',
  bucket: 'Ageing bucket: 0-30, 31-60, 61-90 or 90+ days.',
  fiscal_year: 'Indian fiscal year label, e.g. FY2026-27.',
  segment: 'Customer segment derived from annual revenue and order volume.',
}

function describe(column: string) {
  if (DESCRIPTIONS[column]) return DESCRIPTIONS[column]
  const words = column.replace(/__c$/, '').replace(/_/g, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

function byName(name: string) {
  return MODEL_SPECS.find((m) => m.name === name && m.layer !== 'bronze') ?? MODEL_SPECS.find((m) => m.name === name)
}

function specId(spec: ModelSpec) {
  return modelId(spec.schema, spec.name)
}

function resolveUpstream(spec: ModelSpec): string[] {
  return spec.upstream.map((u) => {
    if (u.startsWith('source:')) return u.slice('source:'.length).split('/')[0]
    const target = spec.layer === 'silver' && spec.role === 'staging' ? MODEL_SPECS.find((m) => m.name === u && m.layer === 'bronze') : byName(u)
    return target ? specId(target) : u
  })
}

function sqlFor(spec: ModelSpec, cols: ParsedColumn[]) {
  if (CUSTOM_SQL[spec.name]) return CUSTOM_SQL[spec.name]
  const config = `{{ config(materialized='${spec.transformation?.materialization ?? 'view'}') }}\n\n`
  if (spec.role === 'staging') {
    const bronze = MODEL_SPECS.find((m) => m.name === spec.upstream[0] && m.layer === 'bronze')
    const sourceName = bronze?.schema.replace('bronze_', '') ?? 'source'
    const select = cols.map((c) => `        ${c.name}`).join(',\n')
    return `${config}with source as (\n    select * from {{ source('${sourceName}', '${spec.upstream[0]}') }}\n),\n\nrenamed as (\n    select\n${select}\n    from source\n)\n\nselect * from renamed\n`
  }
  if (spec.upstream.length === 0) {
    return `${config}{{ dbt_date.get_date_dimension('2016-04-01', '2027-03-31') }}\n`
  }
  const [first, ...rest] = spec.upstream
  const joins = rest.map((r, i) => `left join {{ ref('${r}') }} as t${i + 1}\n    using (/* join keys */)`).join('\n')
  const select = cols.map((c) => `    ${c.name}`).join(',\n')
  return `${config}select\n${select}\nfrom {{ ref('${first}') }} as t0\n${joins}${joins ? '\n' : ''}`
}

const SCHEMA_CHANGES: Record<string, SchemaChange[]> = {
  [modelId('bronze_salesforce', 'opportunity')]: [
    { id: 'sc_opp_discount', detected_at: ago(60 * 9), change_type: 'column_added', column: 'discount_approval__c', from_type: null, to_type: 'boolean', acknowledged: false },
  ],
  [modelId('bronze_erp', 'items')]: [
    { id: 'sc_items_hsn', detected_at: ago(60 * 30), change_type: 'type_changed', column: 'hsn_code', from_type: 'integer', to_type: 'varchar', acknowledged: false },
  ],
  [modelId('bronze_erp', 'customers')]: [
    { id: 'sc_cust_region', detected_at: ago(60 * 24 * 12), change_type: 'column_removed', column: 'region_code', from_type: 'varchar', to_type: null, acknowledged: true },
  ],
}

interface CheckOverride {
  status: QualityCheck['status']
  failing_rows: number
  message: string
  severity?: QualityCheck['severity']
}

const CHECK_OVERRIDES: Record<string, CheckOverride> = {
  'fct_invoices.invoice_id.unique': { status: 'failed', failing_rows: 14, message: '14 duplicate invoice_id values. Credit notes re-issued in the ERP reuse the original invoice id.' },
  'fct_payments.invoice_id.relationships': { status: 'warning', failing_rows: 6, message: '6 payments reference invoices that do not exist in fct_invoices.', severity: 'warn' },
  'agg_receivables_aging.freshness': { status: 'failed', failing_rows: 0, message: 'Last refreshed 31 hours ago; SLA is 24 hours. Downstream of the failed Finance pipeline run.' },
  'orders.freshness': { status: 'failed', failing_rows: 0, message: 'Last refreshed 3 days ago; SLA is 24 hours. Web Orders DB authentication is failing.' },
  'order_items.freshness': { status: 'failed', failing_rows: 0, message: 'Last refreshed 3 days ago; SLA is 24 hours.' },
}

export interface WarehouseSeed {
  models: DataModel[]
  columns: Record<string, ColumnProfile[]>
  transformations: Transformation[]
  qualityChecks: QualityCheck[]
  relationships: Relationship[]
  lineage: Record<string, string[]>
  dbtProjects: DbtProject[]
}

export function createWarehouse(): WarehouseSeed {
  const models: DataModel[] = []
  const columns: Record<string, ColumnProfile[]> = {}
  const transformations: Transformation[] = []
  const qualityChecks: QualityCheck[] = []
  const relationships: Relationship[] = []
  const lineage: Record<string, string[]> = {}

  for (const spec of MODEL_SPECS) {
    const id = specId(spec)
    const parsed = spec.columns.map(parseColumn)
    const rand = prng(id)
    const refreshedAt = ago(spec.refreshed)
    const stale = spec.sla !== null && spec.refreshed > spec.sla

    // Checks
    const checks: QualityCheck[] = []
    const addCheck = (name: string, column: string | null, type: QualityCheck['check_type'], key: string) => {
      const override = CHECK_OVERRIDES[`${spec.name}.${key}`]
      checks.push({
        id: `qc_${id.slice(4)}_${checks.length + 1}`,
        model_id: id,
        model_name: `${spec.schema}.${spec.name}`,
        layer: spec.layer,
        name,
        column,
        check_type: type,
        severity: override?.severity ?? (type === 'relationships' ? 'warn' : 'error'),
        status: override?.status ?? 'passed',
        failing_rows: override?.failing_rows ?? 0,
        message: override?.message ?? null,
        last_run_at: refreshedAt,
        run_id: null,
      })
    }
    const pkCols = parsed.filter((c) => c.pk)
    if (pkCols.length === 1) {
      addCheck(`unique_${spec.name}_${pkCols[0].name}`, pkCols[0].name, 'unique', `${pkCols[0].name}.unique`)
      addCheck(`not_null_${spec.name}_${pkCols[0].name}`, pkCols[0].name, 'not_null', `${pkCols[0].name}.not_null`)
    } else if (pkCols.length > 1) {
      addCheck(`unique_combination_${spec.name}`, null, 'unique', 'combination.unique')
    }
    for (const col of parsed.filter((c) => c.fk)) {
      addCheck(`relationships_${spec.name}_${col.name}`, col.name, 'relationships', `${col.name}.relationships`)
    }
    if (spec.name === 'stg_erp_customers') {
      checks.push({ id: `qc_${id.slice(4)}_gstin`, model_id: id, model_name: `${spec.schema}.${spec.name}`, layer: spec.layer, name: 'not_null_stg_erp_customers_gstin', column: 'gstin', check_type: 'not_null', severity: 'warn', status: 'warning', failing_rows: 212, message: '212 customers have no GSTIN (unregistered dealers).', last_run_at: refreshedAt, run_id: null })
    }
    if (spec.name === 'fct_sales_pipeline') {
      checks.push({ id: `qc_${id.slice(4)}_stage`, model_id: id, model_name: `${spec.schema}.${spec.name}`, layer: spec.layer, name: 'accepted_values_fct_sales_pipeline_stage', column: 'stage', check_type: 'accepted_values', severity: 'warn', status: 'warning', failing_rows: 3, message: "3 opportunities use the retired stage 'Negotiation/Review'.", last_run_at: refreshedAt, run_id: null })
    }
    if (spec.sla !== null && spec.layer !== 'silver') {
      addCheck(`freshness_${spec.name}`, null, 'freshness', 'freshness')
    }
    if (spec.layer === 'bronze' && spec.schema === 'bronze_web') {
      // Bronze checks on a stale source have not run since the last successful load.
      checks.forEach((c) => {
        if (c.check_type !== 'freshness') c.status = 'not_run'
      })
    }
    qualityChecks.push(...checks)

    // Columns
    const duplicateRows = spec.name === 'fct_invoices' ? 14 : 0
    columns[id] = parsed.map((c) => {
      const fkTarget = c.fk ? byName(c.fk.model) : undefined
      const distinct = c.pk && pkCols.length === 1 ? spec.rows - duplicateRows : Math.max(2, Math.round(spec.rows * (0.02 + rand() * 0.5)))
      return {
        name: c.name,
        data_type: c.type,
        nullable: c.nullable,
        description: describe(c.name),
        is_primary_key: c.pk,
        is_business_key: c.bk,
        is_surrogate_key: c.sk,
        references: c.fk && fkTarget ? { model_id: specId(fkTarget), model_name: fkTarget.name, column: c.fk.column } : null,
        null_fraction: c.nullable ? Math.round(rand() * 120) / 1000 : 0,
        distinct_count: distinct,
        duplicate_count: c.pk && pkCols.length === 1 ? duplicateRows : null,
      }
    })
    if (spec.name === 'stg_erp_customers') {
      const gstin = columns[id].find((c) => c.name === 'gstin')
      if (gstin) gstin.null_fraction = 0.068
    }

    for (const c of parsed.filter((col) => col.fk)) {
      const target = byName(c.fk!.model)
      if (!target) continue
      relationships.push({
        from_model_id: id,
        from_model: spec.name,
        from_column: c.name,
        to_model_id: specId(target),
        to_model: target.name,
        to_column: c.fk!.column,
        cardinality: 'many_to_one',
      })
    }

    lineage[id] = resolveUpstream(spec)

    const quality = {
      passed: checks.filter((c) => c.status === 'passed').length,
      failed: checks.filter((c) => c.status === 'failed').length,
      warned: checks.filter((c) => c.status === 'warning').length,
    }

    models.push({
      id,
      workspace_id: WS_ACME,
      database: 'analytics',
      schema: spec.schema,
      name: spec.name,
      layer: spec.layer,
      role: spec.role,
      materialization: spec.materialization,
      description: spec.description,
      row_count: spec.rows,
      size_bytes: Math.round(spec.rows * (180 + rand() * 260)),
      columns_count: parsed.length,
      primary_key: pkCols.map((c) => c.name),
      business_keys: parsed.filter((c) => c.bk).map((c) => c.name),
      last_refreshed_at: refreshedAt,
      freshness_sla_minutes: spec.sla,
      freshness_status: spec.sla === null ? 'unknown' : stale ? 'stale' : 'fresh',
      quality,
      null_issue_columns: columns[id].filter((c) => (c.null_fraction ?? 0) > 0.05).length,
      duplicate_rows: duplicateRows,
      schema_changes: SCHEMA_CHANGES[id] ?? [],
      source_id: spec.layer === 'bronze' ? lineage[id][0] : null,
      transformation_id: spec.transformation ? transformationId(spec.name) : null,
      tags: spec.tags,
      owner: spec.owner,
    })

    if (spec.transformation) {
      const tColumns: TransformationColumn[] = parsed.map((c) => ({
        name: c.name,
        data_type: c.type,
        description: describe(c.name),
        tests: [
          ...(c.pk && pkCols.length === 1 ? ['unique', 'not_null'] : []),
          ...(c.fk ? [`relationships(${c.fk.model}.${c.fk.column})`] : []),
        ],
      }))
      const failed = quality.failed > 0
      transformations.push({
        id: transformationId(spec.name),
        project_id: 'dbt_acme',
        name: spec.name,
        unique_id: `model.acme_analytics.${spec.name}`,
        type: spec.transformation.type,
        materialization: spec.transformation.materialization,
        schema: spec.schema,
        description: spec.description,
        sql: sqlFor(spec, parsed),
        tags: spec.tags,
        depends_on: spec.upstream.map((u) => {
          const up = spec.role === 'staging' ? MODEL_SPECS.find((m) => m.name === u && m.layer === 'bronze') : byName(u)
          if (!up) return u
          return up.transformation ? transformationId(up.name) : specId(up)
        }),
        output_model_id: id,
        columns: tColumns,
        last_run_status: spec.name === 'agg_receivables_aging' ? 'skipped' : failed ? 'failed' : 'succeeded',
        last_run_at: refreshedAt,
        last_run_duration_seconds: Math.round(4 + rand() * (spec.layer === 'gold' ? 140 : 40)),
        tests: { total: checks.length, passed: quality.passed, failed: quality.failed, warned: quality.warned },
        owner: spec.owner,
        updated_at: ago(60 * 24 * Math.round(2 + rand() * 40)),
      })
    }
  }

  const dbtProjects: DbtProject[] = [
    {
      id: 'dbt_acme',
      workspace_id: WS_ACME,
      name: 'acme_analytics',
      repository_url: 'https://git.example.com/acme/analytics-dbt.git',
      branch: 'main',
      dbt_version: '1.10',
      target: 'prod',
      threads: 4,
      last_compiled_at: ago(38),
      models_count: transformations.length,
      tests_count: qualityChecks.filter((c) => c.layer !== 'bronze').length,
    },
  ]

  return { models, columns, transformations, qualityChecks, relationships, lineage, dbtProjects }
}
