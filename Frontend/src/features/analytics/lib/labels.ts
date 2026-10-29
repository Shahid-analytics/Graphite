import {
  ChartArea,
  ChartColumn,
  ChartLine,
  ChartPie,
  Grid3x3,
  Hash,
  Table2,
  type LucideIcon,
} from 'lucide-react'
import type { BusinessArea, ReportFilter, ReportMeasure, ReportRequest, VisualizationType } from '@/types'

export const BUSINESS_AREAS: { value: BusinessArea; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'operations', label: 'Operations' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'customer', label: 'Customer' },
  { value: 'inventory', label: 'Inventory' },
]

export function areaLabel(area: BusinessArea) {
  return BUSINESS_AREAS.find((a) => a.value === area)?.label ?? area
}

export const VISUALIZATIONS: { value: VisualizationType; label: string; icon: LucideIcon }[] = [
  { value: 'bar', label: 'Bar chart', icon: ChartColumn },
  { value: 'line', label: 'Line chart', icon: ChartLine },
  { value: 'area', label: 'Area chart', icon: ChartArea },
  { value: 'table', label: 'Table', icon: Table2 },
  { value: 'pivot', label: 'Pivot table', icon: Grid3x3 },
  { value: 'kpi', label: 'Single number', icon: Hash },
  { value: 'pie', label: 'Pie chart', icon: ChartPie },
]

export function visualizationMeta(value: VisualizationType) {
  return VISUALIZATIONS.find((v) => v.value === value) ?? VISUALIZATIONS[0]
}

export const AGGREGATIONS: { value: ReportMeasure['aggregation']; label: string }[] = [
  { value: 'sum', label: 'Sum' },
  { value: 'count', label: 'Count' },
  { value: 'count_distinct', label: 'Distinct count' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
]

export function aggregationLabel(value: ReportMeasure['aggregation']) {
  return AGGREGATIONS.find((a) => a.value === value)?.label ?? value
}

export const OPERATORS: { value: ReportFilter['operator']; label: string; symbol: string }[] = [
  { value: 'eq', label: 'equals', symbol: '=' },
  { value: 'neq', label: 'does not equal', symbol: '!=' },
  { value: 'in', label: 'is one of', symbol: 'in' },
  { value: 'gt', label: 'greater than', symbol: '>' },
  { value: 'gte', label: 'at least', symbol: '>=' },
  { value: 'lt', label: 'less than', symbol: '<' },
  { value: 'lte', label: 'at most', symbol: '<=' },
  { value: 'between', label: 'between', symbol: 'between' },
  { value: 'last_n_days', label: 'in the last N days', symbol: 'last N days' },
]

export function describeFilter(filter: ReportFilter) {
  if (filter.operator === 'last_n_days') return `${filter.field} in the last ${filter.value} day${filter.value === '1' ? '' : 's'}`
  if (filter.operator === 'between') return `${filter.field} between ${filter.value.split(',').map((v) => v.trim()).join(' and ')}`
  if (filter.operator === 'in') return `${filter.field} in (${filter.value.split(',').map((v) => v.trim()).join(', ')})`
  const op = OPERATORS.find((o) => o.value === filter.operator)
  return `${filter.field} ${op?.symbol ?? filter.operator} ${filter.value}`
}

export const PRIORITIES: { value: ReportRequest['priority']; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

export const REQUEST_STATUS: Record<ReportRequest['status'], { label: string; variant: 'default' | 'outline' | 'success' | 'running' | 'warning' }> = {
  submitted: { label: 'Submitted', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'running' },
  delivered: { label: 'Delivered', variant: 'success' },
  declined: { label: 'Declined', variant: 'outline' },
}

/** Best guess of a business area from the dataset a recommendation reads, used as an editable default. */
export function areaForModel(modelName: string): BusinessArea {
  if (/pipeline|sales_rep/.test(modelName)) return 'sales'
  if (/inventory|product/.test(modelName)) return 'inventory'
  if (/^dim_customer$/.test(modelName)) return 'customer'
  return 'finance'
}
