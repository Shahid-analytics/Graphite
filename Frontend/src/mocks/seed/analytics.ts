import type { DataLayer, ReportRequest } from '@/types'
import type { DashboardRecord, FavoriteSet, ReportRecord } from '../db'
import { ago } from '../util'
import { WS_ACME, userRef } from './core'
import { modelId } from './warehouse'

const ds = (schema: string, name: string, layer: DataLayer = 'gold') => ({ model_id: modelId(schema, name), model_name: name, layer })

const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']

export function createDashboards(): DashboardRecord[] {
  const base = { workspace_id: WS_ACME, status: 'published' as const }
  return [
    { ...base, id: 'dsh_exec_revenue', name: 'Executive Revenue Overview', description: 'Monthly revenue, collections and margin trend for leadership reviews.', business_area: 'finance', metabase_dashboard_id: 12, cards_count: 9, datasets: [ds('gold', 'agg_monthly_revenue'), ds('gold', 'fct_invoices'), ds('gold', 'dim_customer')], owner: 'Ananya Rao', updated_at: ago(60 * 24 * 3), last_viewed_at: ago(42), view_count_30d: 118, preview: { kpis: [{ label: 'Net revenue (MTD)', value: 'INR 4.82 Cr', delta: 0.064 }, { label: 'Collected (MTD)', value: 'INR 3.95 Cr', delta: 0.021 }, { label: 'Active customers', value: '1,284', delta: -0.012 }], series: months.map((label, i) => ({ label, value: [3.9, 4.1, 4.4, 4.2, 4.6, 4.82][i] })), series_label: 'Net revenue, INR Cr' } },
    { ...base, id: 'dsh_sales_pipeline', name: 'Sales Pipeline Health', description: 'Open pipeline by stage, rep and expected close month, with win rates.', business_area: 'sales', metabase_dashboard_id: 15, cards_count: 11, datasets: [ds('gold', 'fct_sales_pipeline'), ds('gold', 'dim_sales_rep'), ds('gold', 'dim_customer')], owner: 'Priya Nair', updated_at: ago(60 * 24 * 1), last_viewed_at: ago(60 * 3), view_count_30d: 204, preview: { kpis: [{ label: 'Open pipeline', value: 'INR 11.4 Cr', delta: 0.083 }, { label: 'Weighted', value: 'INR 5.1 Cr', delta: 0.041 }, { label: 'Win rate (90d)', value: '31.6%', delta: 0.018 }], series: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed won'].map((label, i) => ({ label, value: [3.2, 2.9, 2.4, 1.6, 1.3][i] })), series_label: 'Pipeline by stage, INR Cr' } },
    { ...base, id: 'dsh_receivables', name: 'Receivables and Collections', description: 'Outstanding receivables by ageing bucket and customer, with collection efficiency.', business_area: 'finance', metabase_dashboard_id: 18, cards_count: 7, datasets: [ds('gold', 'agg_receivables_aging'), ds('gold', 'fct_payments'), ds('gold', 'fct_invoices')], owner: 'Rahul Mehta', updated_at: ago(60 * 24 * 8), last_viewed_at: ago(60 * 20), view_count_30d: 76, preview: { kpis: [{ label: 'Outstanding', value: 'INR 2.37 Cr', delta: 0.054 }, { label: 'Over 90 days', value: 'INR 41.2 L', delta: 0.112 }, { label: 'DSO', value: '47 days', delta: 0.031 }], series: ['0-30', '31-60', '61-90', '90+'].map((label, i) => ({ label, value: [1.12, 0.52, 0.32, 0.41][i] })), series_label: 'Outstanding by age, INR Cr' } },
    { ...base, id: 'dsh_inventory', name: 'Inventory Position', description: 'Stock on hand, availability and valuation by warehouse and category.', business_area: 'inventory', metabase_dashboard_id: 21, cards_count: 8, datasets: [ds('gold', 'fct_inventory_snapshot'), ds('gold', 'dim_product')], owner: 'Rahul Mehta', updated_at: ago(60 * 24 * 12), last_viewed_at: ago(60 * 26), view_count_30d: 54, preview: { kpis: [{ label: 'Stock value', value: 'INR 6.9 Cr', delta: -0.024 }, { label: 'SKUs below reorder', value: '86', delta: 0.09 }, { label: 'Fill rate', value: '96.2%', delta: 0.004 }], series: ['Pune', 'Mumbai', 'Nashik', 'Surat', 'Indore', 'Nagpur'].map((label, i) => ({ label, value: [2.1, 1.7, 0.9, 0.8, 0.7, 0.7][i] })), series_label: 'Stock value by warehouse, INR Cr' } },
    { ...base, id: 'dsh_fulfilment', name: 'Order Fulfilment', description: 'Web order volume, fulfilment time and cancellations by channel.', business_area: 'operations', metabase_dashboard_id: 24, cards_count: 6, datasets: [ds('bronze_web', 'orders', 'bronze')], owner: 'Priya Nair', updated_at: ago(60 * 24 * 20), last_viewed_at: ago(60 * 24 * 4), view_count_30d: 19, preview: null },
    { ...base, id: 'dsh_customer_segments', name: 'Customer Segments', description: 'Segment mix, revenue concentration and repeat purchase behaviour. Draft pending the Customer 360 pipeline.', business_area: 'customer', status: 'draft', metabase_dashboard_id: null, cards_count: 4, datasets: [ds('gold', 'dim_customer'), ds('gold', 'agg_monthly_revenue')], owner: 'Priya Nair', updated_at: ago(60 * 24 * 2), last_viewed_at: null, view_count_30d: 3, preview: null },
  ]
}

export function createReports(): ReportRecord[] {
  const base = { workspace_id: WS_ACME, status: 'published' as const, origin: 'manual' as const, filters: [] }
  return [
    { ...base, id: 'rpt_top_customers', name: 'Top 50 customers by net revenue', description: 'Ranked customers for the current fiscal year with year-on-year change.', business_area: 'customer', visualization: 'table', dataset: ds('gold', 'fct_invoices'), dimensions: ['dim_customer.customer_name', 'dim_customer.segment'], measures: [{ name: 'Net revenue', expression: 'net_amount', aggregation: 'sum' }], filters: [{ field: 'dim_date.fiscal_year', operator: 'eq', value: 'FY2026-27' }], metabase_question_id: 141, owner: 'Ananya Rao', updated_at: ago(60 * 24 * 5), last_viewed_at: ago(60 * 2) },
    { ...base, id: 'rpt_gst_summary', name: 'GST collected by rate', description: 'Monthly GST collected by tax slab for filing reconciliation.', business_area: 'finance', visualization: 'pivot', dataset: ds('gold', 'fct_invoice_lines'), dimensions: ['dim_date.month', 'gst_rate'], measures: [{ name: 'GST amount', expression: 'gst_amount', aggregation: 'sum' }], metabase_question_id: 152, owner: 'Rahul Mehta', updated_at: ago(60 * 24 * 9), last_viewed_at: ago(60 * 30) },
    { ...base, id: 'rpt_overdue', name: 'Invoices overdue more than 60 days', description: 'Collection follow-up list with customer contact owner.', business_area: 'finance', visualization: 'table', dataset: ds('gold', 'fct_invoices'), dimensions: ['invoice_no', 'dim_customer.customer_name'], measures: [{ name: 'Outstanding', expression: 'outstanding_amount', aggregation: 'sum' }], filters: [{ field: 'days_overdue', operator: 'gt', value: '60' }], metabase_question_id: 158, owner: 'Rahul Mehta', updated_at: ago(60 * 24 * 2), last_viewed_at: ago(60 * 5) },
    { ...base, id: 'rpt_rep_performance', name: 'Sales rep quarterly performance', description: 'Won amount, win rate and average deal size per representative.', business_area: 'sales', visualization: 'bar', dataset: ds('gold', 'fct_sales_pipeline'), dimensions: ['dim_sales_rep.full_name', 'dim_date.quarter'], measures: [{ name: 'Won amount', expression: 'amount', aggregation: 'sum' }, { name: 'Deals', expression: 'opportunity_id', aggregation: 'count' }], metabase_question_id: 163, owner: 'Priya Nair', updated_at: ago(60 * 24 * 1), last_viewed_at: ago(60 * 7) },
    { ...base, id: 'rpt_slow_movers', name: 'Slow-moving inventory', description: 'SKUs with no movement in 90 days and their stock value.', business_area: 'inventory', visualization: 'table', dataset: ds('gold', 'fct_inventory_snapshot'), dimensions: ['dim_product.product_name', 'warehouse_code'], measures: [{ name: 'Stock value', expression: 'stock_value', aggregation: 'sum' }], metabase_question_id: 170, owner: 'Rahul Mehta', updated_at: ago(60 * 24 * 15), last_viewed_at: ago(60 * 24 * 3) },
    { ...base, id: 'rpt_category_margin', name: 'Category revenue trend', description: 'Monthly net revenue by product category.', business_area: 'sales', visualization: 'line', dataset: ds('gold', 'fct_invoice_lines'), dimensions: ['dim_date.month', 'dim_product.category'], measures: [{ name: 'Net revenue', expression: 'line_amount', aggregation: 'sum' }], metabase_question_id: 174, owner: 'Priya Nair', updated_at: ago(60 * 24 * 4), last_viewed_at: ago(60 * 24 * 1) },
    { ...base, id: 'rpt_payment_modes', name: 'Collections by payment mode', description: 'Share of collections by NEFT, RTGS, UPI, cheque and cash.', business_area: 'finance', status: 'draft', origin: 'ai_suggestion', visualization: 'pie', dataset: ds('gold', 'fct_payments'), dimensions: ['payment_mode'], measures: [{ name: 'Collected', expression: 'amount', aggregation: 'sum' }], metabase_question_id: null, owner: 'Priya Nair', updated_at: ago(60 * 26), last_viewed_at: null },
  ]
}

/** Favorites are personal: each member keeps their own list per workspace ("userId:workspaceId"). */
export function createFavorites(): Record<string, FavoriteSet> {
  return {
    [`usr_ananya:${WS_ACME}`]: { dashboard_ids: ['dsh_exec_revenue', 'dsh_sales_pipeline'], report_ids: ['rpt_top_customers', 'rpt_overdue'] },
    [`usr_rahul:${WS_ACME}`]: { dashboard_ids: ['dsh_receivables'], report_ids: ['rpt_overdue', 'rpt_gst_summary'] },
    [`usr_priya:${WS_ACME}`]: { dashboard_ids: ['dsh_sales_pipeline', 'dsh_customer_segments'], report_ids: ['rpt_rep_performance'] },
    [`usr_karan:${WS_ACME}`]: { dashboard_ids: ['dsh_inventory'], report_ids: ['rpt_slow_movers'] },
  }
}

export function createReportRequests(): ReportRequest[] {
  return [
    { id: 'rr_001', workspace_id: WS_ACME, title: 'Distributor scheme payout tracker', description: 'Track quarterly scheme eligibility and payouts per distributor based on purchase slabs.', business_area: 'sales', priority: 'high', needed_by: ago(-60 * 24 * 10).slice(0, 10), status: 'in_progress', requested_by: userRef('usr_karan'), created_at: ago(60 * 24 * 6) },
    { id: 'rr_002', workspace_id: WS_ACME, title: 'Warehouse-wise dead stock', description: 'Items with zero outward movement for 180 days, per warehouse, with value.', business_area: 'inventory', priority: 'normal', needed_by: null, status: 'submitted', requested_by: userRef('usr_priya'), created_at: ago(60 * 24 * 2) },
    { id: 'rr_003', workspace_id: WS_ACME, title: 'Monthly MIS pack', description: 'P&L style monthly summary for the board, combining revenue, collections and stock value.', business_area: 'finance', priority: 'high', needed_by: null, status: 'delivered', requested_by: userRef('usr_ananya'), created_at: ago(60 * 24 * 30) },
  ]
}
