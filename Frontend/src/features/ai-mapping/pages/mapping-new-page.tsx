import { zodResolver } from '@hookform/resolvers/zod'
import { Database, ShieldCheck, Sparkles } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { HealthIndicator, LayerBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { AiProviderConfig, Source } from '@/types'
import { DisabledReason } from '../components/disabled-reason'
import { DATA_SHARING_LABEL, PROVIDER_LABEL, providerReady } from '../components/provider-notice'
import { TablePicker } from '../components/table-picker'
import { applyFieldErrors } from '../lib/form-errors'
import { useAiProviderStatus, useCreateMappingSet, useMappingSources } from '../queries'

const MAX_TABLES = 10
const MAX_CONTEXT = 2000

const schema = z.object({
  source_id: z.string().min(1, 'Choose a data source.'),
  source_tables: z.array(z.string()).min(1, 'Select at least one table.').max(MAX_TABLES, `Select at most ${MAX_TABLES} tables.`),
  target_layer: z.enum(['silver', 'gold'], { message: 'Choose a target layer.' }),
  business_context: z.string().max(MAX_CONTEXT, `At most ${MAX_CONTEXT} characters.`),
})

type Values = z.infer<typeof schema>
const FIELDS = ['source_id', 'source_tables', 'target_layer', 'business_context'] as const

const CONTEXT_EXAMPLES = [
  'We want to track how fast distributors pay their invoices (days past due, ageing buckets).',
  'Build a distributor dimension keyed on GSTIN with ISO state codes for regional reporting.',
  'Monthly revenue by item category and warehouse, net of credit notes.',
]

const LAYERS: { value: 'silver' | 'gold'; title: string; body: string }[] = [
  { value: 'silver', title: 'Silver', body: 'Cleaned, typed and renamed staging models (stg_*), one per source table.' },
  { value: 'gold', title: 'Gold', body: 'Business-ready facts and dimensions (fct_*, dim_*) with surrogate keys for dashboards.' },
]

const CONNECTOR_LABEL: Record<string, string> = { salesforce: 'Salesforce', postgres: 'PostgreSQL', mysql: 'MySQL' }

function DataSharingCard({ provider, loading }: { provider: AiProviderConfig | undefined; loading: boolean }) {
  const withSamples = provider?.data_sharing === 'metadata_and_samples'
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          Data sharing
        </CardTitle>
        <CardDescription>
          {isMockMode
            ? 'In demo mode suggestions come from a rule engine running in your browser. Nothing is sent to an AI provider.'
            : 'What the workspace AI provider receives for this request.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <Skeleton className="h-4 w-48" />
        ) : provider ? (
          <p className="text-xs text-muted-foreground">
            Provider: <span className="font-medium text-foreground">{PROVIDER_LABEL[provider.provider]}</span>. Policy:{' '}
            <span className="font-medium text-foreground">{DATA_SHARING_LABEL[provider.data_sharing]}</span>.
          </p>
        ) : null}
        <div>
          <p className="text-xs font-medium">{isMockMode ? 'With a real provider, it would receive' : 'Shared'}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>Table and column names, data types and declared keys</li>
            <li>Profiling statistics such as null share and distinct counts</li>
            <li>The business context you enter below</li>
            {withSamples ? <li>A few sample values per column (policy allows samples)</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium">Never shared</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>Connection credentials or secrets</li>
            {withSamples ? <li>Full table extracts</li> : <li>Row values of any kind</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function NextStepsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What happens next</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Suggestions are generated in a few seconds.</li>
          <li>You accept, edit or reject each field mapping, join, key and model.</li>
          <li>You submit the set; an approver approves or rejects it.</li>
          <li>Approved models become a schema proposal, applied via dbt after its own review.</li>
        </ol>
      </CardContent>
    </Card>
  )
}

function SourceOption({ source }: { source: Source }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{source.name}</span>
      <span className="text-xs text-muted-foreground">{CONNECTOR_LABEL[source.connector_type] ?? source.connector_type}</span>
    </span>
  )
}

export default function MappingNewPage() {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const canReview = usePermission('mappings:review')
  const canAddSource = usePermission('sources:write')
  const sources = useMappingSources(workspaceId)
  const provider = useAiProviderStatus(workspaceId)
  const create = useCreateMappingSet()
  const tablesErrorId = useId()

  const prefillLayer = params.get('layer')
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      source_id: params.get('source') ?? '',
      source_tables: params.get('tables')?.split(',').filter(Boolean).slice(0, MAX_TABLES) ?? [],
      target_layer: prefillLayer === 'silver' || prefillLayer === 'gold' ? prefillLayer : 'gold',
      business_context: '',
    },
  })
  const { control, register, handleSubmit, setValue, formState, setError } = form
  const sourceId = useWatch({ control, name: 'source_id' })
  const context = useWatch({ control, name: 'business_context' })
  const source = sources.data?.find((s) => s.id === sourceId)

  const listPath = wsPath(workspaceId, 'transformations', 'mapping')
  const breadcrumbs = [
    { label: 'Transformations', to: wsPath(workspaceId, 'transformations') },
    { label: 'AI mapping', to: listPath },
    { label: 'New suggestions' },
  ]

  const blockedReason = !canReview
    ? 'Your role does not include the mappings:review permission needed to request suggestions.'
    : !isMockMode && provider.isSuccess && !providerReady(provider.data)
      ? 'No AI provider is configured or enabled for this workspace. Configure one in Settings > AI provider.'
      : null

  const onSubmit = handleSubmit(async (values) => {
    try {
      const set = await create.mutateAsync({
        workspace_id: workspaceId,
        source_id: values.source_id,
        source_tables: values.source_tables,
        target_layer: values.target_layer,
        business_context: values.business_context.trim() || undefined,
      })
      toastSuccess('Generating suggestions', isMockMode ? 'Simulated by the mock service. No AI provider is called.' : undefined)
      navigate(wsPath(workspaceId, 'transformations', 'mapping', set.id))
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) toastError(error, 'Could not request suggestions')
    }
  })

  if (sources.isPending) return <PageSkeleton />

  const header = (
    <PageHeader
      title="New mapping suggestions"
      breadcrumbs={breadcrumbs}
      description="Choose Bronze tables and a target layer. The suggestions are a starting point: you review and approve every item."
    />
  )

  if (sources.isError) {
    return (
      <div>
        {header}
        <ErrorState error={sources.error} title="Could not load data sources" onRetry={() => sources.refetch()} />
      </div>
    )
  }

  if (!sources.data.length) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Database}
          title="Connect a data source first"
          description="Mapping suggestions are based on tables discovered from a connected source and loaded into Bronze."
          action={
            canAddSource ? (
              <Button asChild>
                <Link to={wsPath(workspaceId, 'sources', 'new')}>Add a data source</Link>
              </Button>
            ) : (
              <DisabledReason reason="Your role does not include the sources:write permission. Ask a workspace admin to connect a source.">
                <Button disabled>Add a data source</Button>
              </DisabledReason>
            )
          }
        />
      </div>
    )
  }

  return (
    <div>
      {header}
      {!canReview ? (
        <Notice tone="warning" title="You can explore this form but cannot submit it" className="mb-6">
          Requesting suggestions requires the mappings:review permission (editor role or higher).
        </Notice>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={onSubmit} className="space-y-6 lg:col-span-2" noValidate aria-label="Request mapping suggestions">
          <Card>
            <CardHeader>
              <CardTitle>Source tables</CardTitle>
              <CardDescription>Up to {MAX_TABLES} tables from one source. Related tables give better join and key suggestions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Data source" htmlFor="mapping-source" error={formState.errors.source_id?.message} required>
                <Controller
                  control={control}
                  name="source_id"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        setValue('source_tables', [], { shouldValidate: formState.isSubmitted })
                      }}
                    >
                      <SelectTrigger
                        id="mapping-source"
                        className="w-full sm:w-96"
                        aria-invalid={Boolean(formState.errors.source_id)}
                        aria-describedby={formState.errors.source_id ? 'mapping-source-error' : undefined}
                      >
                        <SelectValue placeholder="Choose a source" />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.data.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <SourceOption source={s} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              {source && (source.health === 'degraded' || source.health === 'unhealthy') ? (
                <Notice tone="warning" title={`${source.name} is ${source.health}`}>
                  {source.health_message ?? 'The last sync had problems.'} Suggestions use the metadata from the most recent successful load.{' '}
                  <Link to={wsPath(workspaceId, 'sources', source.id)} className="font-medium text-foreground underline underline-offset-2">
                    View source
                  </Link>
                </Notice>
              ) : source ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <HealthIndicator status={source.health} className="text-xs" />
                  <span>
                    Loads into <span className="font-mono">{source.destination_schema}</span>
                  </span>
                </p>
              ) : null}

              <div className="grid gap-1.5">
                <Label id={`${tablesErrorId}-label`}>
                  Tables
                  <span aria-hidden="true" className="text-subtle-foreground">
                    *
                  </span>
                </Label>
                {source ? (
                  <Controller
                    control={control}
                    name="source_tables"
                    render={({ field }) => (
                      <TablePicker
                        source={source}
                        value={field.value}
                        onChange={field.onChange}
                        max={MAX_TABLES}
                        invalid={Boolean(formState.errors.source_tables)}
                        labelledBy={`${tablesErrorId}-label`}
                        describedBy={formState.errors.source_tables ? tablesErrorId : undefined}
                      />
                    )}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border-strong bg-surface px-3 py-6 text-center text-sm text-muted-foreground">
                    Choose a data source to list its tables.
                  </p>
                )}
                {formState.errors.source_tables ? (
                  <p id={tablesErrorId} role="alert" className="text-xs text-danger">
                    {formState.errors.source_tables.message}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target and context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <fieldset className="space-y-2">
                <legend className="flex items-center gap-1 text-sm font-medium">
                  Target layer
                  <HelpTip label="About layers">
                    Bronze holds raw loads from dlt. Silver models clean and standardise them. Gold models are the facts and dimensions that dashboards
                    query.
                  </HelpTip>
                </legend>
                <Controller
                  control={control}
                  name="target_layer"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2" aria-label="Target layer">
                      {LAYERS.map((layer) => (
                        <Label
                          key={layer.value}
                          htmlFor={`layer-${layer.value}`}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 font-normal hover:border-border-strong',
                            field.value === layer.value && 'border-primary bg-surface',
                          )}
                        >
                          <RadioGroupItem id={`layer-${layer.value}`} value={layer.value} className="mt-0.5" />
                          <span className="space-y-1">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              {layer.title}
                              <LayerBadge layer={layer.value} />
                            </span>
                            <span className="block text-xs text-muted-foreground">{layer.body}</span>
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  )}
                />
                {formState.errors.target_layer ? (
                  <p role="alert" className="text-xs text-danger">
                    {formState.errors.target_layer.message}
                  </p>
                ) : null}
              </fieldset>

              <FormField
                label="Business context"
                htmlFor="mapping-context"
                error={formState.errors.business_context?.message}
                description={`Optional. Describe the questions the models should answer. ${context.length}/${MAX_CONTEXT}`}
              >
                <Textarea rows={4} maxLength={MAX_CONTEXT} placeholder="e.g. Track collections and days past due per distributor." {...register('business_context')} />
              </FormField>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Examples</p>
                <div className="flex flex-col gap-1.5">
                  {CONTEXT_EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:border-border-strong hover:text-foreground"
                      onClick={() => setValue('business_context', example, { shouldDirty: true, shouldValidate: formState.isSubmitted })}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link to={listPath}>Cancel</Link>
            </Button>
            <DisabledReason reason={blockedReason}>
              <Button type="submit" loading={create.isPending} disabled={Boolean(blockedReason)} className="w-full sm:w-auto">
                <Sparkles aria-hidden />
                Generate suggestions
              </Button>
            </DisabledReason>
          </div>
        </form>

        <aside className="space-y-6" aria-label="About this request">
          <DataSharingCard provider={provider.data} loading={provider.isPending} />
          <NextStepsCard />
        </aside>
      </div>
    </div>
  )
}
