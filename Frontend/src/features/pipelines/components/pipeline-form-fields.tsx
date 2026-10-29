import { Plus } from 'lucide-react'
import { useId } from 'react'
import { Controller, type UseFormReturn } from 'react-hook-form'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { HealthIndicator, SourceStatusBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { Source } from '@/types'
import type { PipelineFormValues } from '../lib/form'

const CONNECTOR_LABELS: Record<string, string> = {
  salesforce: 'Salesforce',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  hubspot: 'HubSpot',
  zoho_crm: 'Zoho CRM',
  google_sheets: 'Google Sheets',
  shopify: 'Shopify',
  tally: 'Tally',
  razorpay: 'Razorpay',
  csv_upload: 'CSV upload',
}

const SELECTOR_EXAMPLES: { value: string; hint: string }[] = [
  { value: 'tag:sales+', hint: 'Models tagged sales and everything downstream' },
  { value: '+fct_invoices', hint: 'fct_invoices and everything it depends on' },
  { value: 'path:models/finance', hint: 'Every model under models/finance' },
  { value: 'tag:finance+ tag:inventory+', hint: 'Union of two selections' },
]

interface SourcesState {
  data: Source[] | undefined
  isPending: boolean
  error: unknown
  refetch: () => unknown
}

export function PipelineFormFields({
  form,
  sources,
  workspaceId,
  disabled = false,
}: {
  form: UseFormReturn<PipelineFormValues>
  sources: SourcesState
  workspaceId: string
  disabled?: boolean
}) {
  const id = useId()
  const { register, control, formState, setValue } = form
  const errors = formState.errors

  return (
    <div className="grid gap-5">
      <FormField label="Name" htmlFor={`${id}-name`} required error={errors.name?.message} description="Shown in run history, notifications and schedules.">
        <Input placeholder="Sales Analytics" autoComplete="off" disabled={disabled} {...register('name')} />
      </FormField>

      <FormField label="Description" htmlFor={`${id}-description`} error={errors.description?.message} description="What this pipeline produces and who relies on it.">
        <Textarea rows={2} placeholder="Salesforce opportunities into the sales pipeline and rep performance models." disabled={disabled} {...register('description')} />
      </FormField>

      <Controller
        control={control}
        name="source_ids"
        render={({ field }) => (
          <SourcePicker
            id={`${id}-sources`}
            value={field.value}
            onChange={field.onChange}
            sources={sources}
            workspaceId={workspaceId}
            error={errors.source_ids?.message}
            disabled={disabled}
          />
        )}
      />

      <FormField
        label="dbt selector"
        htmlFor={`${id}-selector`}
        required
        error={errors.dbt_selector?.message}
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Which dbt models run after ingestion.
            <HelpTip label="About dbt selectors">
              A dbt node selector, the same syntax as <code>dbt build --select</code>. A trailing + includes downstream models; a leading + includes
              upstream models. Separate several selections with spaces to combine them.
            </HelpTip>
          </span>
        }
      >
        <Input className="font-mono text-[13px]" placeholder="tag:sales+" autoComplete="off" spellCheck={false} disabled={disabled} {...register('dbt_selector')} />
      </FormField>
      <div className="-mt-3 flex flex-wrap items-center gap-1.5" aria-label="Selector examples">
        <span className="text-xs text-muted-foreground">Examples:</span>
        {SELECTOR_EXAMPLES.map((example) => (
          <button
            key={example.value}
            type="button"
            title={example.hint}
            disabled={disabled}
            onClick={() => setValue('dbt_selector', example.value, { shouldValidate: true, shouldDirty: true })}
            className="rounded-sm border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-border-strong hover:text-foreground disabled:opacity-50"
          >
            {example.value}
            <span className="sr-only">: {example.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-4">
        <Controller
          control={control}
          name="quality_checks_enabled"
          render={({ field }) => (
            <ToggleRow
              id={`${id}-quality`}
              label="Run data quality checks"
              description="Runs dbt tests and freshness checks after the Silver and Gold models are built. A failing error-severity test stops the run before dashboards refresh."
              help="Quality checks protect dashboards from bad data: when a test such as unique or not_null fails, Metabase keeps showing the last good data."
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
        <div className="h-px bg-border" aria-hidden />
        <Controller
          control={control}
          name="metabase_refresh_enabled"
          render={({ field }) => (
            <ToggleRow
              id={`${id}-metabase`}
              label="Refresh Metabase afterwards"
              description="Requests a Metabase metadata sync and dashboard cache refresh once the data passes its checks. Requires the Metabase integration in Settings."
              help="Without a refresh, Metabase may serve cached results until its own cache expires."
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
      </div>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  description,
  help,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: string
  description: string
  help: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={`${id}-desc`} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id}>{label}</Label>
          <HelpTip label={`About: ${label}`}>{help}</HelpTip>
        </div>
        <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function SourcePicker({
  id,
  value,
  onChange,
  sources,
  workspaceId,
  error,
  disabled,
}: {
  id: string
  value: string[]
  onChange: (value: string[]) => void
  sources: SourcesState
  workspaceId: string
  error?: string
  disabled?: boolean
}) {
  const toggle = (sourceId: string, checked: boolean) => onChange(checked ? [...value, sourceId] : value.filter((v) => v !== sourceId))
  const errorId = `${id}-error`

  return (
    <fieldset className="grid gap-1.5" aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
        Sources
        <span aria-hidden className="text-subtle-foreground">
          *
        </span>
      </legend>
      <p className="-mt-1 mb-1 text-xs text-muted-foreground">Each selected source is synced into Bronze before dbt runs.</p>
      {sources.isPending ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading sources">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : sources.error ? (
        <ErrorState compact error={sources.error} title="Could not load sources" onRetry={() => void sources.refetch()} />
      ) : !sources.data?.length ? (
        <EmptyState
          compact
          title="No data sources yet"
          description="A pipeline starts from at least one connected source. Connect Salesforce, PostgreSQL or another source first."
          action={
            <Button asChild size="sm">
              <Link to={wsPath(workspaceId, 'sources', 'new')}>
                <Plus aria-hidden />
                Connect a source
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className={cn('divide-y divide-border rounded-lg border', error ? 'border-danger' : 'border-border')}>
          {sources.data.map((source) => {
            const checked = value.includes(source.id)
            const inputId = `${id}-${source.id}`
            return (
              <li key={source.id} className={cn('flex items-start gap-3 px-3 py-2.5', checked && 'bg-surface')}>
                <Checkbox id={inputId} checked={checked} onCheckedChange={(c) => toggle(source.id, c === true)} disabled={disabled} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Label htmlFor={inputId} className="cursor-pointer">
                      {source.name}
                    </Label>
                    <span className="text-xs text-muted-foreground">{CONNECTOR_LABELS[source.connector_type] ?? source.connector_type}</span>
                    {source.status !== 'active' ? <SourceStatusBadge status={source.status} /> : null}
                  </div>
                  {source.health_message ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{source.health_message}</p> : null}
                  {source.health === 'unhealthy' && checked ? (
                    <p className="mt-0.5 text-xs text-danger">Runs will fail at Source connection until this source is fixed.</p>
                  ) : null}
                </div>
                <HealthIndicator status={source.health} className="shrink-0 text-xs" />
              </li>
            )
          })}
        </ul>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
