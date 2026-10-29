import type { DataLayer, DataModel, FreshnessStatus, ModelRole, QualityCheck, Relationship, SchemaChange } from '@/types'
import { formatDuration } from '@/lib/format'

export const LAYERS: DataLayer[] = ['bronze', 'silver', 'gold']

export const LAYER_LABEL: Record<DataLayer, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }

export const ROLE_LABEL: Record<ModelRole, string> = {
  raw: 'Raw',
  staging: 'Staging',
  intermediate: 'Intermediate',
  fact: 'Fact',
  dimension: 'Dimension',
  aggregate: 'Aggregate',
}

export const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as ModelRole[]).map((value) => ({ value, label: ROLE_LABEL[value] }))

export const FRESHNESS_OPTIONS: { value: FreshnessStatus; label: string }[] = [
  { value: 'fresh', label: 'Fresh' },
  { value: 'stale', label: 'Stale' },
  { value: 'unknown', label: 'No SLA' },
]

export const MATERIALIZATION_LABEL: Record<DataModel['materialization'], string> = {
  table: 'Table',
  view: 'View',
  incremental: 'Incremental',
}

export const MEDALLION_HELP =
  'Medallion layers: Bronze holds raw tables exactly as ingested by dlt. Silver holds cleaned, typed and conformed models built by dbt. Gold holds business-ready facts, dimensions and aggregates that Metabase dashboards read.'

export const CHECK_TYPE_LABEL: Record<QualityCheck['check_type'], string> = {
  not_null: 'Not null',
  unique: 'Unique',
  accepted_values: 'Accepted values',
  relationships: 'Relationships',
  freshness: 'Freshness',
  row_count: 'Row count',
  custom_sql: 'Custom SQL',
}

export const CARDINALITY_LABEL: Record<Relationship['cardinality'], string> = {
  one_to_one: 'One to one',
  one_to_many: 'One to many',
  many_to_one: 'Many to one',
}

export function qualifiedName(model: Pick<DataModel, 'schema' | 'name'>) {
  return `${model.schema}.${model.name}`
}

export function unacknowledged(model: Pick<DataModel, 'schema_changes'>) {
  return model.schema_changes.filter((c) => !c.acknowledged)
}

export function describeSchemaChange(change: SchemaChange) {
  switch (change.change_type) {
    case 'column_added':
      return `Column ${change.column} was added${change.to_type ? ` (${change.to_type})` : ''}.`
    case 'column_removed':
      return `Column ${change.column} was removed${change.from_type ? ` (was ${change.from_type})` : ''}.`
    case 'type_changed':
      return `Column ${change.column} changed type from ${change.from_type ?? 'unknown'} to ${change.to_type ?? 'unknown'}.`
  }
}

export const SCHEMA_CHANGE_LABEL: Record<SchemaChange['change_type'], string> = {
  column_added: 'Column added',
  column_removed: 'Column removed',
  type_changed: 'Type changed',
}

/** Freshness SLA in minutes rendered as "2h 00m"; null means no SLA is configured. */
export function formatSla(minutes: number | null) {
  return minutes === null ? 'No SLA' : formatDuration(minutes * 60)
}
