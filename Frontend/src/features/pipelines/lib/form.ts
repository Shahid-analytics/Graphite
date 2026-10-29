import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { z } from 'zod'
import { isApiError } from '@/services/api-error'
import type { Pipeline, StageKey } from '@/types'
import { STAGE_ORDER } from '@/components/runs/labels'

/** dbt node selection: methods (tag:, path:, source:), graph operators (+, @, *) and unions. */
const SELECTOR_PATTERN = /^[A-Za-z0-9_.:/*+@,\- ]+$/

export const pipelineSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80, 'Keep the name under 80 characters.'),
  description: z.string().trim().max(500, 'Keep the description under 500 characters.'),
  source_ids: z.array(z.string()).min(1, 'Select at least one source.'),
  dbt_selector: z
    .string()
    .trim()
    .min(1, 'Enter a dbt selector, for example tag:sales+.')
    .max(200, 'Keep the selector under 200 characters.')
    .regex(SELECTOR_PATTERN, 'Use dbt selection syntax such as tag:finance+, +fct_invoices or path:models/sales.'),
  quality_checks_enabled: z.boolean(),
  metabase_refresh_enabled: z.boolean(),
})

export type PipelineFormValues = z.infer<typeof pipelineSchema>

export const PIPELINE_FIELDS = ['name', 'description', 'source_ids', 'dbt_selector', 'quality_checks_enabled', 'metabase_refresh_enabled'] as const

export const EMPTY_PIPELINE: PipelineFormValues = {
  name: '',
  description: '',
  source_ids: [],
  dbt_selector: '',
  quality_checks_enabled: true,
  metabase_refresh_enabled: true,
}

export function valuesFromPipeline(p: Pipeline): PipelineFormValues {
  return {
    name: p.name,
    description: p.description,
    source_ids: p.source_ids,
    dbt_selector: p.dbt_selector,
    quality_checks_enabled: p.quality_checks_enabled,
    metabase_refresh_enabled: p.metabase_refresh_enabled,
  }
}

/** Stages a pipeline with these settings executes, mirroring the backend rule. */
export function plannedStages(values: Pick<PipelineFormValues, 'quality_checks_enabled' | 'metabase_refresh_enabled'>): StageKey[] {
  return STAGE_ORDER.filter(
    (s) => (s !== 'quality_checks' || values.quality_checks_enabled) && (s !== 'metabase_refresh' || values.metabase_refresh_enabled),
  )
}

/**
 * Copies `ApiError.fieldErrors` (HTTP 422) onto react-hook-form fields. Returns
 * true when at least one error was placed, so callers can skip a generic message.
 */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  if (!isApiError(error) || !error.fieldErrors.length) return false
  let applied = false
  for (const fieldError of error.fieldErrors) {
    if (!fields.includes(fieldError.field)) continue
    setError(fieldError.field as Path<T>, { type: 'server', message: fieldError.message }, { shouldFocus: !applied })
    applied = true
  }
  return applied
}
