import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm, type FieldErrors } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import type { BusinessArea, ReportFilter, ReportMeasure, ReportRecommendation, VisualizationType } from '@/types'
import { placeFieldErrors } from '../lib/form-errors'
import { AGGREGATIONS, BUSINESS_AREAS, OPERATORS, VISUALIZATIONS } from '../lib/labels'
import { useCreateReport, useModelColumns } from '../queries'
import { DatasetLink } from './dataset-link'
import { OptionSelect } from './option-select'

const IDENT = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i
const IDENT_MESSAGE = 'Use a column name or model.column, e.g. net_amount or dim_customer.segment.'

const AREA_VALUES = BUSINESS_AREAS.map((a) => a.value) as [BusinessArea, ...BusinessArea[]]
const VIS_VALUES = VISUALIZATIONS.map((v) => v.value) as [VisualizationType, ...VisualizationType[]]
const AGG_VALUES = AGGREGATIONS.map((a) => a.value) as [ReportMeasure['aggregation'], ...ReportMeasure['aggregation'][]]
const OP_VALUES = OPERATORS.map((o) => o.value) as [ReportFilter['operator'], ...ReportFilter['operator'][]]

const schema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters.').max(120, 'Name must be 120 characters or fewer.'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer.'),
  business_area: z.enum(AREA_VALUES, { error: 'Choose a business area.' }),
  visualization: z.enum(VIS_VALUES, { error: 'Choose a visualization.' }),
  dimensions: z.array(z.object({ value: z.string().trim().regex(IDENT, IDENT_MESSAGE) })).max(6, 'Use at most 6 dimensions.'),
  measures: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Name the measure.'),
        aggregation: z.enum(AGG_VALUES, { error: 'Choose an aggregation.' }),
        expression: z.string().trim().min(1, 'Enter a column or expression.'),
      }),
    )
    .min(1, 'Add at least one measure.')
    .max(8, 'Use at most 8 measures.'),
  filters: z
    .array(
      z
        .object({
          field: z.string().trim().regex(IDENT, IDENT_MESSAGE),
          operator: z.enum(OP_VALUES, { error: 'Choose an operator.' }),
          value: z.string().trim().min(1, 'Enter a value.'),
        })
        .superRefine((filter, ctx) => {
          if (filter.operator === 'last_n_days' && !/^[1-9]\d{0,3}$/.test(filter.value)) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a whole number of days.' })
          }
          if (filter.operator === 'between' && filter.value.split(',').filter((v) => v.trim()).length !== 2) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter two values separated by a comma.' })
          }
        }),
    )
    .max(10, 'Use at most 10 filters.'),
})

type FormValues = z.input<typeof schema>

/** Maps backend field paths (e.g. "dimensions.0") onto form paths. */
function resolveField(field: string): string | null {
  if (['name', 'description', 'business_area', 'visualization'].includes(field)) return field
  if (/^dimensions\.\d+$/.test(field)) return `${field}.value`
  if (['dimensions', 'measures', 'filters'].includes(field)) return `${field}.root`
  if (/^(measures|filters)\.\d+\.(name|aggregation|expression|field|operator|value)$/.test(field)) return field
  return null
}

function arrayError(errors: FieldErrors<FormValues>, key: 'dimensions' | 'measures' | 'filters') {
  const value = errors[key]
  return value?.message ?? value?.root?.message
}

/** Review step for an AI recommendation: every field is editable before the draft is saved. */
export function SaveDraftDialog({
  workspaceId,
  suggestionId,
  recommendation,
  defaultArea,
  open,
  onOpenChange,
}: {
  workspaceId: string
  suggestionId: string
  recommendation: ReportRecommendation
  defaultArea: BusinessArea
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const create = useCreateReport(workspaceId)
  const columns = useModelColumns(recommendation.dataset.model_id)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: recommendation.title,
      description: recommendation.description,
      business_area: defaultArea,
      visualization: recommendation.visualization,
      dimensions: recommendation.dimensions.map((value) => ({ value })),
      measures: recommendation.measures.map((m) => ({ ...m })),
      filters: recommendation.filters.map((f) => ({ ...f })),
    },
  })
  const { errors } = form.formState
  const dimensions = useFieldArray({ control: form.control, name: 'dimensions' })
  const measures = useFieldArray({ control: form.control, name: 'measures' })
  const filters = useFieldArray({ control: form.control, name: 'filters' })

  const listId = `columns-${recommendation.id}`
  const columnOptions = useMemo(() => {
    const names = new Set<string>((columns.data ?? []).map((c) => c.name))
    recommendation.dimensions.forEach((d) => names.add(d))
    recommendation.filters.forEach((f) => names.add(f.field))
    recommendation.measures.forEach((m) => names.add(m.expression))
    return [...names].sort()
  }, [columns.data, recommendation])

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const parsed = schema.parse(values)
    try {
      const report = await create.mutateAsync({
        name: parsed.name,
        description: parsed.description,
        business_area: parsed.business_area,
        visualization: parsed.visualization,
        dataset_model_id: recommendation.dataset.model_id,
        dimensions: parsed.dimensions.map((d) => d.value),
        measures: parsed.measures,
        filters: parsed.filters,
        suggestion_id: suggestionId,
        recommendation_id: recommendation.id,
      })
      toastSuccess('Draft saved', 'Review the definition and publish it when Metabase is connected.')
      onOpenChange(false)
      navigate(wsPath(workspaceId, 'analytics', 'reports', report.id))
    } catch (error) {
      const { placed, unplaced } = placeFieldErrors(error, form.setError, resolveField)
      if (unplaced.length) setFormError(unplaced.join(' '))
      else if (!placed) toastError(error, 'Could not save the draft')
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review and save as draft</DialogTitle>
          <DialogDescription>Check every part of the suggested definition. Saving creates a draft; nothing is published to Metabase.</DialogDescription>
        </DialogHeader>

        <form id="save-draft-form" onSubmit={submit} noValidate className="grid gap-5">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <datalist id={listId}>
            {columnOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" htmlFor="draft-name" error={errors.name?.message} required className="sm:col-span-2">
              <Input autoComplete="off" {...form.register('name')} />
            </FormField>
            <FormField label="Description" htmlFor="draft-description" error={errors.description?.message} className="sm:col-span-2">
              <Textarea rows={2} {...form.register('description')} />
            </FormField>
            <FormField label="Business area" htmlFor="draft-area" error={errors.business_area?.message} required>
              <Controller
                control={form.control}
                name="business_area"
                render={({ field }) => <OptionSelect id="draft-area" value={field.value} onChange={field.onChange} options={BUSINESS_AREAS} placeholder="Choose an area" />}
              />
            </FormField>
            <FormField label="Visualization" htmlFor="draft-visualization" error={errors.visualization?.message} required>
              <Controller
                control={form.control}
                name="visualization"
                render={({ field }) => <OptionSelect id="draft-visualization" value={field.value} onChange={field.onChange} options={VISUALIZATIONS} />}
              />
            </FormField>
            <div className="grid gap-1.5 sm:col-span-2">
              <p className="text-sm font-medium">Dataset</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <DatasetLink workspaceId={workspaceId} dataset={recommendation.dataset} />
                <span className="text-xs text-muted-foreground">Fixed by the recommendation. Generate a new suggestion to use a different model.</span>
              </div>
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Dimensions</legend>
            <p className="-mt-1 text-xs text-muted-foreground">Columns to group by. Use model.column for related models.</p>
            {dimensions.fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="grid flex-1 gap-1">
                  <Input
                    list={listId}
                    aria-label={`Dimension ${i + 1}`}
                    aria-invalid={Boolean(errors.dimensions?.[i]?.value) || undefined}
                    className="font-mono text-[13px]"
                    {...form.register(`dimensions.${i}.value`)}
                  />
                  {errors.dimensions?.[i]?.value ? <p role="alert" className="text-xs text-danger">{errors.dimensions[i]?.value?.message}</p> : null}
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove dimension ${i + 1}`} onClick={() => dimensions.remove(i)}>
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            {arrayError(errors, 'dimensions') ? <p role="alert" className="text-xs text-danger">{arrayError(errors, 'dimensions')}</p> : null}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => dimensions.append({ value: '' })} disabled={dimensions.fields.length >= 6}>
                <Plus aria-hidden />
                Add dimension
              </Button>
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Measures</legend>
            {measures.fields.map((field, i) => {
              const e = errors.measures?.[i]
              return (
                <div key={field.id} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0">
                  <div className="grid gap-1">
                    <Input aria-label={`Measure ${i + 1} name`} placeholder="Name" aria-invalid={Boolean(e?.name) || undefined} {...form.register(`measures.${i}.name`)} />
                    {e?.name ? <p role="alert" className="text-xs text-danger">{e.name.message}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <Controller
                      control={form.control}
                      name={`measures.${i}.aggregation`}
                      render={({ field: f }) => <OptionSelect value={f.value} onChange={f.onChange} options={AGGREGATIONS} ariaLabel={`Measure ${i + 1} aggregation`} invalid={Boolean(e?.aggregation)} />}
                    />
                    {e?.aggregation ? <p role="alert" className="text-xs text-danger">{e.aggregation.message}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <Input
                      list={listId}
                      aria-label={`Measure ${i + 1} column or expression`}
                      placeholder="Column"
                      className="font-mono text-[13px]"
                      aria-invalid={Boolean(e?.expression) || undefined}
                      {...form.register(`measures.${i}.expression`)}
                    />
                    {e?.expression ? <p role="alert" className="text-xs text-danger">{e.expression.message}</p> : null}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove measure ${i + 1}`} onClick={() => measures.remove(i)} className="justify-self-end">
                    <X aria-hidden />
                  </Button>
                </div>
              )
            })}
            {arrayError(errors, 'measures') ? <p role="alert" className="text-xs text-danger">{arrayError(errors, 'measures')}</p> : null}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => measures.append({ name: '', aggregation: 'sum', expression: '' })} disabled={measures.fields.length >= 8}>
                <Plus aria-hidden />
                Add measure
              </Button>
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Filters</legend>
            {filters.fields.length === 0 ? <p className="text-xs text-muted-foreground">No filters. The report covers all rows in the dataset.</p> : null}
            {filters.fields.map((field, i) => {
              const e = errors.filters?.[i]
              return (
                <div key={field.id} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0">
                  <div className="grid gap-1">
                    <Input
                      list={listId}
                      aria-label={`Filter ${i + 1} field`}
                      placeholder="Field"
                      className="font-mono text-[13px]"
                      aria-invalid={Boolean(e?.field) || undefined}
                      {...form.register(`filters.${i}.field`)}
                    />
                    {e?.field ? <p role="alert" className="text-xs text-danger">{e.field.message}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <Controller
                      control={form.control}
                      name={`filters.${i}.operator`}
                      render={({ field: f }) => <OptionSelect value={f.value} onChange={f.onChange} options={OPERATORS} ariaLabel={`Filter ${i + 1} operator`} invalid={Boolean(e?.operator)} />}
                    />
                    {e?.operator ? <p role="alert" className="text-xs text-danger">{e.operator.message}</p> : null}
                  </div>
                  <div className="grid gap-1">
                    <Input aria-label={`Filter ${i + 1} value`} placeholder="Value" aria-invalid={Boolean(e?.value) || undefined} {...form.register(`filters.${i}.value`)} />
                    {e?.value ? <p role="alert" className="text-xs text-danger">{e.value.message}</p> : null}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove filter ${i + 1}`} onClick={() => filters.remove(i)} className="justify-self-end">
                    <X aria-hidden />
                  </Button>
                </div>
              )
            })}
            {arrayError(errors, 'filters') ? <p role="alert" className="text-xs text-danger">{arrayError(errors, 'filters')}</p> : null}
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => filters.append({ field: '', operator: 'eq', value: '' })} disabled={filters.fields.length >= 10}>
                <Plus aria-hidden />
                Add filter
              </Button>
            </div>
          </fieldset>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="save-draft-form" loading={create.isPending}>
            Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
