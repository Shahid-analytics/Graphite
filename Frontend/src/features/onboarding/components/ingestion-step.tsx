import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Database, PlugZap, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { SourceStatusBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { applyFieldErrors } from '@/features/auth/lib/form-errors'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { COMMON_TIMEZONES, describeCron, validateCron } from '@/lib/cron'
import { toastSuccess } from '@/lib/toast'
import { pluralize } from '@/lib/utils'
import { errorMessage, isApiError } from '@/services/api-error'
import type { SelectedTable, SourceTable, SyncFrequency } from '@/types'
import type { CreatedSource, SourceDraft } from '../lib/draft'
import { WIZARD_STEPS } from '../lib/steps'
import { cronForFrequency, SCHEMA_NAME_PATTERN, SYNC_FREQUENCIES } from '../lib/sync-schedule'
import { useCreateSource, useDiscoverTables } from '../queries'
import { InitialRunProgress } from './initial-run-progress'
import { FieldGroup, StepFooter, StepHeader, StepNav, useStepAccess, type StepNavProps } from './step-frame'
import { defaultChoice, TableSelection, tableKey, type TableChoice } from './table-selection'

const STEP = WIZARD_STEPS[2]

const FREQUENCY_VALUES = SYNC_FREQUENCIES.map((f) => f.value) as [SyncFrequency, ...SyncFrequency[]]

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name the source (at least 2 characters).').max(80, 'Keep the name under 80 characters.'),
    destination_schema: z
      .string()
      .trim()
      .min(1, 'Enter the Bronze schema for this source.')
      .max(63, 'PostgreSQL identifiers are limited to 63 characters.')
      .regex(SCHEMA_NAME_PATTERN, 'Use lowercase letters, numbers and underscores, starting with a letter.'),
    frequency: z.enum(FREQUENCY_VALUES),
    cron: z.string(),
    timezone: z.string().min(1, 'Choose a timezone.'),
  })
  .superRefine((values, ctx) => {
    if (values.frequency !== 'custom') return
    const check = validateCron(values.cron, values.timezone)
    if (!check.valid) ctx.addIssue({ code: 'custom', path: ['cron'], message: check.error ?? 'Enter a valid cron expression.' })
    else if (check.minIntervalMinutes !== null && check.minIntervalMinutes < 15) {
      ctx.addIssue({ code: 'custom', path: ['cron'], message: 'Syncs can run at most every 15 minutes.' })
    }
  })

type Values = z.infer<typeof schema>

const FIELD_ALIASES = { 'schedule.cron': 'cron', 'schedule.timezone': 'timezone', 'schedule.frequency': 'frequency' }
const FIELDS = ['name', 'destination_schema', 'frequency', 'cron', 'timezone'] as const

function DiscoverSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border" aria-busy="true" aria-label="Discovering tables">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
          <Skeleton className="size-4 rounded-sm" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-40 md:block" />
        </div>
      ))}
    </div>
  )
}

function IngestionForm({ draft, allowed, nav, onCreated }: { draft: SourceDraft; allowed: boolean; nav: StepNavProps; onCreated: (created: CreatedSource) => Promise<void> }) {
  const { workspace, workspaceId } = useWorkspace()
  const discover = useDiscoverTables(workspaceId, { id: draft.id, connectorType: draft.connector.type, config: draft.config })
  const create = useCreateSource(workspaceId)
  const [choices, setChoices] = useState<Record<string, TableChoice>>({})
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { register, control, handleSubmit, formState, setError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: draft.connector.name,
      destination_schema: `bronze_${draft.connector.type}`,
      frequency: 'daily',
      cron: '0 2 * * *',
      timezone: COMMON_TIMEZONES.includes(workspace.timezone) ? workspace.timezone : 'UTC',
    },
  })
  const frequency = useWatch({ control, name: 'frequency' })
  const cron = useWatch({ control, name: 'cron' })
  const timezone = useWatch({ control, name: 'timezone' })

  const tables = discover.data?.tables ?? []
  const choiceFor = (table: SourceTable) => choices[tableKey(table)] ?? defaultChoice(table)

  const updateChoices = (updates: Record<string, TableChoice>) => {
    setTablesError(null)
    setChoices((prev) => ({ ...prev, ...updates }))
  }

  const schedulePreview = (() => {
    if (frequency === 'manual') return 'Syncs run only when started by hand or by a pipeline.'
    if (frequency === 'custom') {
      const check = validateCron(cron, timezone, 1)
      return check.valid ? `${check.description} (${timezone})` : null
    }
    const presetCron = cronForFrequency(frequency, '')
    return presetCron ? `${describeCron(presetCron)} (${timezone})` : null
  })()

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    const selected: SelectedTable[] = tables
      .filter((t) => choiceFor(t).selected)
      .map((t) => {
        const choice = choiceFor(t)
        return { schema: t.schema, name: t.name, ingestion_mode: choice.mode, cursor_field: choice.mode === 'incremental' ? choice.cursor : null, primary_key: t.primary_key }
      })
    if (!selected.length) {
      setTablesError('Select at least one table to ingest.')
      return
    }
    const missingCursor = selected.find((t) => t.ingestion_mode === 'incremental' && !t.cursor_field)
    if (missingCursor) {
      setTablesError(`Choose a cursor column for ${missingCursor.name}, or switch it to full refresh.`)
      return
    }
    try {
      const response = await create.mutateAsync({
        name: values.name,
        connector_type: draft.connector.type,
        config: draft.config,
        destination_schema: values.destination_schema,
        selected_tables: selected,
        schedule: { frequency: values.frequency, cron: cronForFrequency(values.frequency, values.cron), timezone: values.timezone },
        run_initial_sync: true,
      })
      toastSuccess(`${response.source.name} created`, response.initial_run_id ? 'The initial sync has been queued.' : undefined)
      await onCreated({ source: response.source, runId: response.initial_run_id })
    } catch (error) {
      if (isApiError(error)) {
        const tableError = error.fieldErrors.find((f) => f.field === 'selected_tables' || f.field.startsWith('selected_tables.'))
        if (tableError) setTablesError(tableError.message)
        if (error.status === 409) {
          setError('name', { type: 'server', message: error.message }, { shouldFocus: true })
          return
        }
        if (applyFieldErrors(error, setError, FIELDS, FIELD_ALIASES) || tableError) return
      }
      setFormError(errorMessage(error, 'Could not create the source.'))
    }
  })

  const selectedCount = tables.filter((t) => choiceFor(t).selected).length

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!allowed} className="min-w-0 space-y-5">
        <FieldGroup
          title="Tables to ingest"
          description={`Discovered from your ${draft.connector.name} connection. Each selected table is copied into the Bronze layer.`}
        >
          {discover.isLoading ? (
            <DiscoverSkeleton />
          ) : discover.isError ? (
            <ErrorState compact error={discover.error} title="Could not discover tables" onRetry={() => discover.refetch()} />
          ) : !tables.length ? (
            <EmptyState
              compact
              icon={Database}
              title="No tables were found"
              description="The connection works but the user cannot see any tables. Check the user's grants, then discover again."
              action={
                <Button type="button" variant="outline" onClick={() => discover.refetch()} loading={discover.isFetching}>
                  {discover.isFetching ? null : <RefreshCw className="size-3.5" aria-hidden />}
                  Discover again
                </Button>
              }
            />
          ) : (
            <TableSelection tables={tables} choices={choices} onChange={updateChoices} disabled={!allowed} error={tablesError} />
          )}
        </FieldGroup>

        <FieldGroup title="Source and schedule" description="How this source appears in Graphite and how often it syncs.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Source name" htmlFor="ing-name" required error={formState.errors.name?.message}>
              <Input autoComplete="off" {...register('name')} />
            </FormField>
            <FormField
              label="Destination schema"
              htmlFor="ing-schema"
              required
              error={formState.errors.destination_schema?.message}
              description={
                <span className="inline-flex items-center gap-1">
                  Bronze schema for this source&apos;s raw tables
                  <HelpTip label="About the destination schema">
                    Raw tables land in this schema of the warehouse exactly as read from the source. dbt reads them from here to build
                    Silver and Gold models.
                  </HelpTip>
                </span>
              }
            >
              <Input className="font-mono" autoComplete="off" spellCheck={false} {...register('destination_schema')} />
            </FormField>
            <FormField label="Sync frequency" htmlFor="ing-frequency" required error={formState.errors.frequency?.message}>
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!allowed}>
                    <SelectTrigger id="ing-frequency" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_FREQUENCIES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Timezone" htmlFor="ing-timezone" required error={formState.errors.timezone?.message}>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!allowed || frequency === 'manual'}>
                    <SelectTrigger id="ing-timezone" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {frequency === 'custom' ? (
              <FormField
                label="Cron expression"
                htmlFor="ing-cron"
                required
                error={formState.errors.cron?.message}
                description="Five fields: minute, hour, day of month, month, day of week. For example 30 1 * * * runs daily at 01:30."
                className="sm:col-span-2"
              >
                <Input className="font-mono" autoComplete="off" spellCheck={false} placeholder="0 2 * * *" {...register('cron')} />
              </FormField>
            ) : null}
            {schedulePreview ? <p className="text-xs text-muted-foreground sm:col-span-2">{schedulePreview}</p> : null}
          </div>
        </FieldGroup>

        {formError ? (
          <Notice tone="danger" title="Source not created">
            {formError}
          </Notice>
        ) : null}
      </fieldset>

      <StepFooter start={<StepNav {...nav} />}>
        {tables.length ? (
          <p className="text-xs text-muted-foreground sm:mr-2">
            {pluralize(selectedCount, 'table')} will be loaded by a first sync right away.
          </p>
        ) : null}
        <Button type="submit" loading={formState.isSubmitting} disabled={!allowed || !tables.length}>
          Create source and start sync
          {formState.isSubmitting ? null : <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </StepFooter>
    </form>
  )
}

export function IngestionStep({
  draft,
  created,
  nav,
  onCreated,
  onGoToSource,
}: {
  draft: SourceDraft | null
  created: CreatedSource | null
  nav: StepNavProps
  onCreated: (created: CreatedSource) => Promise<void>
  onGoToSource: () => void
}) {
  const { workspaceId } = useWorkspace()
  const access = useStepAccess(STEP.permission, STEP.action)

  let body: ReactNode
  if (created) {
    const { source } = created
    body = (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{source.name}</p>
              <SourceStatusBadge status={source.status} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pluralize(source.selected_tables.length, 'table')} into <span className="font-mono">{source.destination_schema}</span>
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={wsPath(workspaceId, 'sources', source.id)}>Open source</Link>
          </Button>
        </div>
        {created.runId ? (
          <InitialRunProgress workspaceId={workspaceId} runId={created.runId} />
        ) : (
          <Notice tone="neutral">No initial sync was queued. Start one from the source page when you are ready.</Notice>
        )}
        <Notice tone="neutral" title="Credentials cleared">
          The connection details you entered were sent to the backend and have been removed from this page.
        </Notice>
        <StepFooter start={<StepNav {...nav} />}>
          <Button type="button" onClick={nav.onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </StepFooter>
      </div>
    )
  } else if (draft) {
    body = <IngestionForm draft={draft} allowed={access.allowed} nav={nav} onCreated={onCreated} />
  } else if (nav.done) {
    body = (
      <>
        <Notice
          tone="success"
          title="Initial ingestion is set up"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={wsPath(workspaceId, 'sources')}>View sources</Link>
            </Button>
          }
        >
          Sources, their tables and sync history are on the Data Sources page. To ingest another system, connect it in step 1 first.
        </Notice>
        <StepFooter start={<StepNav {...nav} />}>
          <Button type="button" variant="outline" onClick={onGoToSource}>
            <PlugZap className="size-4" aria-hidden />
            Connect another source
          </Button>
        </StepFooter>
      </>
    )
  } else {
    body = (
      <>
        <EmptyState
          icon={PlugZap}
          title="Connect a source first"
          description="Tables are discovered with the connection you test in step 1. For security, connection details are only kept on this page until the source is created, so re-enter them if you reloaded."
          action={
            <Button type="button" onClick={onGoToSource}>
              <ArrowLeft className="size-4" aria-hidden />
              Go to source connection
            </Button>
          }
        />
        <StepFooter start={<StepNav {...nav} />} />
      </>
    )
  }

  return (
    <>
      <StepHeader stepKey="ingestion" done={nav.done} />
      {created ? null : access.notice}
      {body}
    </>
  )
}
