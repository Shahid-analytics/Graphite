import type { DataLayer, Materialization, ModelRole, TransformationType } from '@/types'

/**
 * Compact specification of the demo warehouse. Column syntax:
 *   "name type [pk] [bk] [sk] [null] [fk=model.column]"
 */
export interface ModelSpec {
  name: string
  schema: string
  layer: DataLayer
  role: ModelRole
  materialization: 'table' | 'view' | 'incremental'
  description: string
  columns: string[]
  rows: number
  /** Minutes since last refresh. */
  refreshed: number
  sla: number | null
  tags: string[]
  /** Upstream model names (Silver/Gold) or "source:<id>/<table>" for Bronze. */
  upstream: string[]
  transformation?: { type: TransformationType; materialization: Materialization }
  owner: string
}

const SF = 'source:src_sf_prod'
const ERP = 'source:src_erp'
const WEB = 'source:src_web_orders'

export const MODEL_SPECS: ModelSpec[] = [
  // Bronze - Salesforce
  { name: 'account', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce Account records loaded by dlt.', columns: ['id varchar pk', 'name varchar', 'industry varchar null', 'billing_city varchar null', 'billing_state varchar null', 'owner_id varchar', 'annual_revenue numeric null', 'system_modstamp timestamptz', '_dlt_load_id varchar'], rows: 4820, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/Account`], owner: 'Rahul Mehta' },
  { name: 'contact', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce Contact records.', columns: ['id varchar pk', 'account_id varchar', 'first_name varchar null', 'last_name varchar', 'email varchar null', 'phone varchar null', 'title varchar null', 'system_modstamp timestamptz'], rows: 11240, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/Contact`], owner: 'Rahul Mehta' },
  { name: 'opportunity', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce Opportunity records.', columns: ['id varchar pk', 'account_id varchar', 'owner_id varchar', 'name varchar', 'stage_name varchar', 'amount numeric null', 'probability numeric', 'close_date date', 'is_won boolean', 'discount_approval__c boolean null', 'system_modstamp timestamptz'], rows: 6380, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/Opportunity`], owner: 'Rahul Mehta' },
  { name: 'opportunity_line_item', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce OpportunityLineItem records.', columns: ['id varchar pk', 'opportunity_id varchar', 'product2_id varchar', 'quantity numeric', 'unit_price numeric', 'total_price numeric', 'system_modstamp timestamptz'], rows: 21950, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/OpportunityLineItem`], owner: 'Rahul Mehta' },
  { name: 'product2', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce Product2 records.', columns: ['id varchar pk', 'name varchar', 'product_code varchar', 'family varchar null', 'is_active boolean', 'system_modstamp timestamptz'], rows: 612, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/Product2`], owner: 'Rahul Mehta' },
  { name: 'user', schema: 'bronze_salesforce', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Raw Salesforce User records (sales representatives).', columns: ['id varchar pk', 'name varchar', 'email varchar', 'user_role varchar null', 'is_active boolean'], rows: 48, refreshed: 18, sla: 120, tags: ['salesforce'], upstream: [`${SF}/User`], owner: 'Rahul Mehta' },

  // Bronze - ERP
  { name: 'invoices', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Sales invoices replicated from the ERP database.', columns: ['invoice_id bigint pk', 'invoice_no varchar bk', 'customer_code varchar', 'invoice_date date', 'due_date date', 'gross_amount numeric', 'tax_amount numeric', 'status varchar', 'updated_at timestamptz'], rows: 58210, refreshed: 132, sla: 480, tags: ['erp', 'finance'], upstream: [`${ERP}/public.invoices`], owner: 'Rahul Mehta' },
  { name: 'invoice_lines', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Invoice line items from the ERP database.', columns: ['line_id bigint pk', 'invoice_id bigint', 'item_code varchar', 'quantity numeric', 'rate numeric', 'amount numeric', 'gst_rate numeric'], rows: 241600, refreshed: 132, sla: 480, tags: ['erp', 'finance'], upstream: [`${ERP}/public.invoice_lines`], owner: 'Rahul Mehta' },
  { name: 'customers', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Customer master from the ERP database.', columns: ['customer_code varchar pk', 'customer_name varchar', 'gstin varchar null', 'city varchar', 'state varchar', 'credit_limit numeric', 'created_at timestamptz'], rows: 3105, refreshed: 132, sla: 480, tags: ['erp'], upstream: [`${ERP}/public.customers`], owner: 'Rahul Mehta' },
  { name: 'items', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Item master from the ERP database.', columns: ['item_code varchar pk', 'item_name varchar', 'category varchar', 'uom varchar', 'hsn_code varchar', 'mrp numeric'], rows: 2240, refreshed: 132, sla: 480, tags: ['erp', 'inventory'], upstream: [`${ERP}/public.items`], owner: 'Rahul Mehta' },
  { name: 'payments', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Customer payments and receipts.', columns: ['payment_id bigint pk', 'invoice_id bigint', 'paid_on date', 'amount numeric', 'mode varchar', 'reference_no varchar null'], rows: 49870, refreshed: 132, sla: 480, tags: ['erp', 'finance'], upstream: [`${ERP}/public.payments`], owner: 'Rahul Mehta' },
  { name: 'stock_levels', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Daily stock snapshots by item and warehouse.', columns: ['item_code varchar pk', 'warehouse_code varchar pk', 'snapshot_date date pk', 'on_hand numeric', 'reserved numeric'], rows: 88400, refreshed: 1385, sla: 1500, tags: ['erp', 'inventory'], upstream: [`${ERP}/inventory.stock_levels`], owner: 'Rahul Mehta' },
  { name: 'warehouses', schema: 'bronze_erp', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Warehouse master data.', columns: ['warehouse_code varchar pk', 'warehouse_name varchar', 'city varchar', 'capacity_units integer'], rows: 6, refreshed: 1385, sla: 1500, tags: ['erp', 'inventory'], upstream: [`${ERP}/inventory.warehouses`], owner: 'Rahul Mehta' },

  // Bronze - Web orders (stale: source is failing)
  { name: 'orders', schema: 'bronze_web', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Online orders from the web storefront database.', columns: ['order_id bigint pk', 'customer_email varchar', 'order_date timestamptz', 'channel varchar', 'total_amount numeric', 'status varchar', 'updated_at timestamptz'], rows: 18450, refreshed: 60 * 74, sla: 1440, tags: ['web'], upstream: [`${WEB}/public.orders`], owner: 'Priya Nair' },
  { name: 'order_items', schema: 'bronze_web', layer: 'bronze', role: 'raw', materialization: 'table', description: 'Online order line items.', columns: ['order_item_id bigint pk', 'order_id bigint', 'sku varchar', 'quantity integer', 'price numeric'], rows: 52300, refreshed: 60 * 74, sla: 1440, tags: ['web'], upstream: [`${WEB}/public.order_items`], owner: 'Priya Nair' },

  // Silver - staging
  { name: 'stg_sf_accounts', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Cleaned Salesforce accounts with standardised names and locations.', columns: ['account_id varchar pk', 'account_name varchar', 'industry varchar null', 'city varchar null', 'state varchar null', 'owner_id varchar fk=stg_sf_users.user_id', 'annual_revenue numeric null', 'updated_at timestamptz'], rows: 4820, refreshed: 15, sla: 120, tags: ['sales', 'salesforce'], upstream: ['account'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_sf_opportunities', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Cleaned Salesforce opportunities.', columns: ['opportunity_id varchar pk', 'account_id varchar fk=stg_sf_accounts.account_id', 'owner_id varchar fk=stg_sf_users.user_id', 'opportunity_name varchar', 'stage varchar', 'amount numeric null', 'probability numeric', 'close_date date', 'is_won boolean'], rows: 6380, refreshed: 15, sla: 120, tags: ['sales', 'salesforce'], upstream: ['opportunity'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_sf_opportunity_lines', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Cleaned opportunity line items.', columns: ['line_id varchar pk', 'opportunity_id varchar fk=stg_sf_opportunities.opportunity_id', 'product_id varchar fk=stg_sf_products.product_id', 'quantity numeric', 'unit_price numeric', 'line_amount numeric'], rows: 21950, refreshed: 15, sla: 120, tags: ['sales', 'salesforce'], upstream: ['opportunity_line_item'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_sf_products', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Cleaned Salesforce products.', columns: ['product_id varchar pk', 'product_name varchar', 'product_code varchar bk', 'family varchar null', 'is_active boolean'], rows: 612, refreshed: 15, sla: 120, tags: ['sales', 'salesforce'], upstream: ['product2'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_sf_users', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Salesforce users acting as sales representatives.', columns: ['user_id varchar pk', 'full_name varchar', 'email varchar', 'role varchar null', 'is_active boolean'], rows: 48, refreshed: 15, sla: 120, tags: ['sales', 'salesforce'], upstream: ['user'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_invoices', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'ERP invoices with net amount derived.', columns: ['invoice_id bigint pk', 'invoice_no varchar bk', 'customer_code varchar fk=stg_erp_customers.customer_code', 'invoice_date date', 'due_date date', 'gross_amount numeric', 'tax_amount numeric', 'net_amount numeric', 'status varchar'], rows: 58210, refreshed: 128, sla: 480, tags: ['finance', 'erp'], upstream: ['invoices'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_invoice_lines', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'ERP invoice lines.', columns: ['line_id bigint pk', 'invoice_id bigint fk=stg_erp_invoices.invoice_id', 'item_code varchar fk=stg_erp_items.item_code', 'quantity numeric', 'rate numeric', 'line_amount numeric', 'gst_rate numeric'], rows: 241600, refreshed: 128, sla: 480, tags: ['finance', 'erp'], upstream: ['invoice_lines'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_customers', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'ERP customer master with trimmed and upper-cased GSTIN.', columns: ['customer_code varchar pk', 'customer_name varchar', 'gstin varchar null', 'city varchar', 'state varchar', 'credit_limit numeric'], rows: 3105, refreshed: 128, sla: 480, tags: ['finance', 'erp'], upstream: ['customers'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_items', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'ERP item master.', columns: ['item_code varchar pk', 'item_name varchar', 'category varchar', 'uom varchar', 'hsn_code varchar'], rows: 2240, refreshed: 128, sla: 480, tags: ['inventory', 'erp'], upstream: ['items'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_payments', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'ERP payments with standardised payment modes.', columns: ['payment_id bigint pk', 'invoice_id bigint fk=stg_erp_invoices.invoice_id', 'paid_on date', 'amount numeric', 'payment_mode varchar'], rows: 49870, refreshed: 128, sla: 480, tags: ['finance', 'erp'], upstream: ['payments'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },
  { name: 'stg_erp_stock_levels', schema: 'silver', layer: 'silver', role: 'staging', materialization: 'view', description: 'Stock snapshots enriched with warehouse names.', columns: ['item_code varchar pk', 'warehouse_code varchar pk', 'snapshot_date date pk', 'warehouse_name varchar', 'on_hand numeric', 'reserved numeric', 'available numeric'], rows: 88400, refreshed: 1380, sla: 1500, tags: ['inventory', 'erp'], upstream: ['stock_levels', 'warehouses'], transformation: { type: 'staging', materialization: 'view' }, owner: 'Priya Nair' },

  // Silver - intermediate and conformed
  { name: 'int_customers_unified', schema: 'silver', layer: 'silver', role: 'intermediate', materialization: 'table', description: 'Customers matched across Salesforce and the ERP by GSTIN, then by normalised name and city.', columns: ['customer_key varchar pk', 'customer_code varchar bk null', 'sf_account_id varchar null', 'customer_name varchar', 'gstin varchar null', 'city varchar', 'state varchar', 'match_method varchar'], rows: 3412, refreshed: 125, sla: 480, tags: ['customer'], upstream: ['stg_sf_accounts', 'stg_erp_customers'], transformation: { type: 'intermediate', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'int_invoice_lines_enriched', schema: 'silver', layer: 'silver', role: 'intermediate', materialization: 'table', description: 'Invoice lines joined with invoice headers and item attributes.', columns: ['line_id bigint pk', 'invoice_id bigint', 'invoice_date date', 'customer_code varchar', 'item_code varchar', 'category varchar', 'quantity numeric', 'line_amount numeric', 'gst_amount numeric'], rows: 241600, refreshed: 125, sla: 480, tags: ['finance'], upstream: ['stg_erp_invoice_lines', 'stg_erp_invoices', 'stg_erp_items'], transformation: { type: 'intermediate', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'customers', schema: 'silver', layer: 'silver', role: 'dimension', materialization: 'table', description: 'Conformed customer entity used by all Gold models.', columns: ['customer_key varchar pk', 'customer_code varchar bk', 'customer_name varchar', 'segment varchar', 'city varchar', 'state varchar', 'credit_limit numeric'], rows: 3412, refreshed: 124, sla: 480, tags: ['customer'], upstream: ['int_customers_unified'], transformation: { type: 'silver', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'products', schema: 'silver', layer: 'silver', role: 'dimension', materialization: 'table', description: 'Conformed product entity combining ERP items and Salesforce products.', columns: ['product_key varchar pk', 'item_code varchar bk', 'product_name varchar', 'category varchar', 'uom varchar', 'is_active boolean'], rows: 2251, refreshed: 124, sla: 480, tags: ['inventory'], upstream: ['stg_erp_items', 'stg_sf_products'], transformation: { type: 'silver', materialization: 'table' }, owner: 'Priya Nair' },

  // Gold
  { name: 'dim_customer', schema: 'gold', layer: 'gold', role: 'dimension', materialization: 'table', description: 'Customer dimension (SCD type 2) with surrogate key.', columns: ['customer_sk bigint pk sk', 'customer_key varchar bk', 'customer_name varchar', 'segment varchar', 'city varchar', 'state varchar', 'credit_limit numeric', 'valid_from date', 'is_current boolean'], rows: 3588, refreshed: 122, sla: 480, tags: ['customer', 'finance', 'sales'], upstream: ['customers'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'dim_product', schema: 'gold', layer: 'gold', role: 'dimension', materialization: 'table', description: 'Product dimension with surrogate key.', columns: ['product_sk bigint pk sk', 'item_code varchar bk', 'product_name varchar', 'category varchar', 'uom varchar'], rows: 2251, refreshed: 122, sla: 480, tags: ['inventory', 'sales'], upstream: ['products'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'dim_date', schema: 'gold', layer: 'gold', role: 'dimension', materialization: 'table', description: 'Calendar dimension with Indian fiscal year (April to March).', columns: ['date_key integer pk', 'date date', 'month varchar', 'quarter varchar', 'fiscal_year varchar', 'is_weekend boolean'], rows: 4018, refreshed: 1320, sla: null, tags: ['shared'], upstream: [], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'dim_sales_rep', schema: 'gold', layer: 'gold', role: 'dimension', materialization: 'table', description: 'Sales representative dimension.', columns: ['sales_rep_sk bigint pk sk', 'user_id varchar bk', 'full_name varchar', 'email varchar', 'is_active boolean'], rows: 48, refreshed: 14, sla: 120, tags: ['sales'], upstream: ['stg_sf_users'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'fct_invoices', schema: 'gold', layer: 'gold', role: 'fact', materialization: 'incremental', description: 'One row per sales invoice with amounts and outstanding balance.', columns: ['invoice_id bigint pk', 'invoice_no varchar bk', 'customer_sk bigint fk=dim_customer.customer_sk', 'invoice_date_key integer fk=dim_date.date_key', 'gross_amount numeric', 'tax_amount numeric', 'net_amount numeric', 'outstanding_amount numeric', 'status varchar'], rows: 58224, refreshed: 121, sla: 480, tags: ['finance'], upstream: ['stg_erp_invoices', 'dim_customer', 'dim_date'], transformation: { type: 'gold', materialization: 'incremental' }, owner: 'Priya Nair' },
  { name: 'fct_invoice_lines', schema: 'gold', layer: 'gold', role: 'fact', materialization: 'incremental', description: 'One row per invoice line with product and GST amounts.', columns: ['line_id bigint pk', 'invoice_id bigint fk=fct_invoices.invoice_id', 'product_sk bigint fk=dim_product.product_sk', 'quantity numeric', 'line_amount numeric', 'gst_amount numeric'], rows: 241600, refreshed: 121, sla: 480, tags: ['finance', 'sales'], upstream: ['int_invoice_lines_enriched', 'dim_product', 'fct_invoices'], transformation: { type: 'gold', materialization: 'incremental' }, owner: 'Priya Nair' },
  { name: 'fct_payments', schema: 'gold', layer: 'gold', role: 'fact', materialization: 'incremental', description: 'One row per customer payment with days-to-pay.', columns: ['payment_id bigint pk', 'invoice_id bigint fk=fct_invoices.invoice_id', 'paid_date_key integer fk=dim_date.date_key', 'amount numeric', 'payment_mode varchar', 'days_to_pay integer'], rows: 49870, refreshed: 121, sla: 480, tags: ['finance'], upstream: ['stg_erp_payments', 'fct_invoices', 'dim_date'], transformation: { type: 'gold', materialization: 'incremental' }, owner: 'Priya Nair' },
  { name: 'fct_sales_pipeline', schema: 'gold', layer: 'gold', role: 'fact', materialization: 'table', description: 'Open and closed opportunities with weighted pipeline value.', columns: ['opportunity_id varchar pk', 'customer_sk bigint fk=dim_customer.customer_sk', 'sales_rep_sk bigint fk=dim_sales_rep.sales_rep_sk', 'stage varchar', 'amount numeric', 'weighted_amount numeric', 'close_date_key integer fk=dim_date.date_key', 'is_won boolean'], rows: 6380, refreshed: 14, sla: 120, tags: ['sales'], upstream: ['stg_sf_opportunities', 'stg_sf_opportunity_lines', 'dim_customer', 'dim_sales_rep'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'fct_inventory_snapshot', schema: 'gold', layer: 'gold', role: 'fact', materialization: 'incremental', description: 'Daily stock position and value by product and warehouse.', columns: ['product_sk bigint pk fk=dim_product.product_sk', 'warehouse_code varchar pk', 'snapshot_date_key integer pk fk=dim_date.date_key', 'on_hand numeric', 'reserved numeric', 'available numeric', 'stock_value numeric'], rows: 88400, refreshed: 1375, sla: 1500, tags: ['inventory'], upstream: ['stg_erp_stock_levels', 'dim_product', 'dim_date'], transformation: { type: 'gold', materialization: 'incremental' }, owner: 'Priya Nair' },
  { name: 'agg_monthly_revenue', schema: 'gold', layer: 'gold', role: 'aggregate', materialization: 'table', description: 'Monthly gross and net revenue and collections by customer segment.', columns: ['month date pk', 'segment varchar pk', 'invoice_count integer', 'gross_revenue numeric', 'net_revenue numeric', 'collected numeric'], rows: 168, refreshed: 120, sla: 480, tags: ['finance'], upstream: ['fct_invoices', 'fct_payments', 'dim_customer'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
  { name: 'agg_receivables_aging', schema: 'gold', layer: 'gold', role: 'aggregate', materialization: 'table', description: 'Outstanding receivables by customer and ageing bucket.', columns: ['customer_sk bigint pk fk=dim_customer.customer_sk', 'bucket varchar pk', 'outstanding_amount numeric', 'invoice_count integer'], rows: 4920, refreshed: 60 * 31, sla: 1440, tags: ['finance'], upstream: ['fct_invoices', 'fct_payments'], transformation: { type: 'gold', materialization: 'table' }, owner: 'Priya Nair' },
]

/** Hand-written SQL for showcase models; others are generated from the spec. */
export const CUSTOM_SQL: Record<string, string> = {
  fct_invoices: `{{
  config(
    materialized='incremental',
    unique_key='invoice_id',
    on_schema_change='append_new_columns'
  )
}}

with invoices as (
    select * from {{ ref('stg_erp_invoices') }}
    {% if is_incremental() %}
    where invoice_date >= (select max(d.date) - interval '7 days'
                           from {{ this }} f
                           join {{ ref('dim_date') }} d on d.date_key = f.invoice_date_key)
    {% endif %}
),

payments as (
    select invoice_id, sum(amount) as paid_amount
    from {{ ref('stg_erp_payments') }}
    group by 1
),

customers as (
    select customer_sk, customer_key
    from {{ ref('dim_customer') }}
    where is_current
)

select
    i.invoice_id,
    i.invoice_no,
    c.customer_sk,
    to_char(i.invoice_date, 'YYYYMMDD')::integer      as invoice_date_key,
    i.gross_amount,
    i.tax_amount,
    i.net_amount,
    i.net_amount - coalesce(p.paid_amount, 0)         as outstanding_amount,
    i.status
from invoices i
left join customers c on c.customer_key = 'ERP-' || i.customer_code
left join payments p on p.invoice_id = i.invoice_id
`,
  dim_customer: `{{ config(materialized='table') }}

with customers as (
    select * from {{ ref('customers') }}
)

select
    {{ dbt_utils.generate_surrogate_key(['customer_key', 'valid_from']) }} as customer_sk,
    customer_key,
    customer_name,
    segment,
    city,
    state,
    credit_limit,
    current_date                                   as valid_from,
    true                                           as is_current
from customers
`,
  int_customers_unified: `with erp as (
    select
        customer_code,
        customer_name,
        upper(trim(gstin))                         as gstin,
        initcap(city)                              as city,
        state
    from {{ ref('stg_erp_customers') }}
),

sf as (
    select account_id, account_name, city, state
    from {{ ref('stg_sf_accounts') }}
),

matched as (
    select
        coalesce('ERP-' || erp.customer_code, 'SF-' || sf.account_id) as customer_key,
        erp.customer_code,
        sf.account_id                              as sf_account_id,
        coalesce(erp.customer_name, sf.account_name) as customer_name,
        erp.gstin,
        coalesce(erp.city, sf.city)                as city,
        coalesce(erp.state, sf.state)              as state,
        case
            when erp.customer_code is not null and sf.account_id is not null then 'name_and_city'
            when erp.customer_code is not null then 'erp_only'
            else 'salesforce_only'
        end                                        as match_method
    from erp
    full outer join sf
      on lower(regexp_replace(erp.customer_name, '[^a-zA-Z0-9]', '', 'g'))
       = lower(regexp_replace(sf.account_name, '[^a-zA-Z0-9]', '', 'g'))
     and lower(erp.city) = lower(sf.city)
)

select * from matched
`,
  agg_monthly_revenue: `{{ config(materialized='table') }}

select
    date_trunc('month', d.date)::date              as month,
    c.segment,
    count(distinct f.invoice_id)                   as invoice_count,
    sum(f.gross_amount)                            as gross_revenue,
    sum(f.net_amount)                              as net_revenue,
    sum(f.net_amount - f.outstanding_amount)       as collected
from {{ ref('fct_invoices') }} f
join {{ ref('dim_date') }} d on d.date_key = f.invoice_date_key
join {{ ref('dim_customer') }} c on c.customer_sk = f.customer_sk
group by 1, 2
`,
}
