import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, PlugZap, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch, type Path, type Resolver } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import type { ConnectorDefinition, DiscoverResponse, SelectedTable, Source } from '@/types'
import { buildConfigSchema, defaultConfigValues, toConfigPayload, type ConfigFormValues } from '../../lib/config-form'
import { BRONZE_HELP, SCHEMA_PATTERN, suggestSchema } from '../../lib/labels'
import { useCreateSource, useDiscover, useTestNewConnection } from '../../queries'
import { ConfigFields } from '../config-fields'
import { ConnectionTestResult } from '../connection-test-result'
import { ConnectorIcon } from '../primitives'
import { ScheduleEditor, scheduleSchema, toScheduleConfig, type ScheduleFormValue } from '../schedule-editor'
import { TableSelector } from '../table-selector'
import { ReviewStep } from './review-step'

export interface WizardValues {
  name: string
  destination_schema: string
  config: ConfigFormValues
  schedule: ScheduleFormValue
  run_initial_sync: boolean
}

const STEP_FIELDS: Record<number, Path<WizardValues>[]> = {
  1: ['name', 'destination_schema', 'config'],
  // The schedule is one controlled value: name its leaves, or react-hook-form drops the nested errors.
  3: ['schedule.cron', 'schedule.timezone'],
}

function buildSchema(connector: ConnectorDefinition, existing: Source[]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(80, 'Name must be 80 characters or fewer.')
      .refine((name) => !existing.some((s) => s.name.toLowerCase() === name.toLowerCase()), 'A source with this name already exists.'),
    destination_schema: z
      .string()
      .regex(SCHEMA_PATTERN, 'Use 2 to 63 lowercase letters, digits or underscores, starting with a letter.')
      .refine((schema) => !existing.some((s) => s.destination_schema === schema), 'Another source already loads into this schema.'),
    config: buildConfigSchema(connector),
    schedule: scheduleSchema,
    run_initial_sync: z.boolean(),
  })
}

/** Signature of the non-secret connection settings; discovery is repeated when it changes. */
function settingsSignature(connector: ConnectorDefinition, config: ConfigFormValues) {
  return JSON.stringify(connector.config_fields.filter((f) => !f.secret).map((f) => config[f.key]))
}

/** Steps 2 to 5 of the create-source wizard for one connector. */
export function SourceWizardForm({
  connector,
  existing,
  step,
  onStepChange,
  onChangeConnector,
}: {
  connector: ConnectorDefinition
  existing: Source[]
  step: number
  onStepChange: (step: number) => void
  onChangeConnector: () => void
}) {
  const { workspace, workspaceId } = useWorkspace()
  const navigate = useNavigate()
  // Built once per mount; the form is keyed by connector type.
  const [schema] = useState(() => buildSchema(connector, existing))
  const form = useForm<WizardValues>({
    resolver: zodResolver(schema) as Resolver<WizardValues>,
    mode: 'onTouched',
    defaultValues: {
      name: '',
      destination_schema: '',
      config: defaultConfigValues(connector),
      schedule: { frequency: 'daily', cron: '', timezone: workspace.timezone || 'Asia/Kolkata' },
      run_initial_sync: true,
    },
  })
  const { control, register, setValue, getValues, trigger, setError, formState } = form
  const [schemaTouched, setSchemaTouched] = useState(false)
  const [tables, setTables] = useState<SelectedTable[]>([])
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [discovery, setDiscovery] = useState<{ signature: string; result: DiscoverResponse } | null>(null)
  const [stepError, setStepError] = useState<unknown>(null)
  const discover = useDiscover(workspaceId)
  const test = useTestNewConnection(workspaceId)
  const create = useCreateSource(workspaceId)
  const schedule = useWatch({ control, name: 'schedule' })
  const config = useWatch({ control, name: 'config' })
  const signature = settingsSignature(connector, config)
  const [testedSignature, setTestedSignature] = useState<string | null>(null)
  const testIsStale = Boolean(test.data) && testedSignature !== signature

  const nameField = register('name', {
    onChange: (event) => {
      if (!schemaTouched) setValue('destination_schema', suggestSchema(event.target.value), { shouldValidate: formState.isSubmitted })
    },
  })
  const schemaField = register('destination_schema', { onChange: () => setSchemaTouched(true) })

  const configPayload = () => toConfigPayload(connector, getValues('config'))

  /** Places API field errors on the form and returns the earliest step that has one. */
  const applyApiErrors = (error: unknown): number | null => {
    if (!isApiError(error) || !error.fieldErrors.length) return null
    let earliest: number | null = null
    const note = (s: number) => (earliest = earliest === null ? s : Math.min(earliest, s))
    for (const fe of error.fieldErrors) {
      if (fe.field === 'name' || fe.field === 'destination_schema' || fe.field.startsWith('config.')) {
        setError(fe.field as Path<WizardValues>, { type: 'server', message: fe.message })
        note(1)
      } else if (fe.field.startsWith('selected_tables')) {
        setTablesError(fe.message)
        note(2)
      } else if (fe.field.startsWith('schedule.')) {
        setError(fe.field as Path<WizardValues>, { type: 'server', message: fe.message })
        note(3)
      }
    }
    return earliest
  }

  const runTest = async () => {
    setStepError(null)
    const valid = await trigger('config')
    if (!valid) return
    setTestedSignature(signature)
    test.mutate(
      { connector_type: connector.type, config: configPayload() },
      { onError: (error) => (applyApiErrors(error) === null ? setStepError(error) : undefined) },
    )
  }

  const next = async () => {
    setStepError(null)
    if (step === 1) {
      if (!(await trigger(STEP_FIELDS[1]))) return
      if (discovery?.signature === signature) return onStepChange(2)
      try {
        const result = await discover.mutateAsync({ connector_type: connector.type, config: configPayload() })
        setDiscovery({ signature, result })
        // Keep only selections that still exist after re-discovery.
        setTables((prev) => prev.filter((t) => result.tables.some((r) => r.schema === t.schema && r.name === t.name)))
        onStepChange(2)
      } catch (error) {
        if (applyApiErrors(error) === null) setStepError(error)
      }
      return
    }
    if (step === 2) {
      if (!tables.length) return setTablesError('Select at least one table to replicate.')
      const missingCursor = tables.find((t) => t.ingestion_mode === 'incremental' && !t.cursor_field)
      if (missingCursor) return setTablesError(`Choose a cursor field for ${missingCursor.schema}.${missingCursor.name}.`)
      setTablesError(null)
      return onStepChange(3)
    }
    if (step === 3) {
      if (await trigger(STEP_FIELDS[3])) onStepChange(4)
    }
  }

  /** Drops every in-memory copy of the secret values (form state and mutation variables). */
  const clearSecrets = () => {
    for (const field of connector.config_fields.filter((f) => f.secret)) setValue(`config.${field.key}` as Path<WizardValues>, '')
    test.reset()
    discover.reset()
    create.reset()
  }

  const submit = form.handleSubmit(
    async (values) => {
      setStepError(null)
      try {
        const response = await create.mutateAsync({
          name: values.name.trim(),
          connector_type: connector.type,
          config: toConfigPayload(connector, values.config),
          destination_schema: values.destination_schema,
          selected_tables: tables,
          schedule: toScheduleConfig(values.schedule),
          run_initial_sync: values.run_initial_sync,
        })
        clearSecrets()
        toastSuccess(`${response.source.name} created`, response.initial_run_id ? 'The initial sync has been queued.' : 'Run a sync when you are ready.')
        navigate(wsPath(workspaceId, 'sources', response.source.id), { state: { runId: response.initial_run_id }, replace: true })
      } catch (error) {
        const target = applyApiErrors(error)
        if (target !== null) {
          onStepChange(target)
          toastError(error, 'Some settings need attention')
        } else {
          setStepError(error)
          toastError(error, 'Could not create the source')
        }
      }
    },
    (errors) => {
      // A field from an earlier step is invalid: jump back to it.
      if (errors.name || errors.destination_schema || errors.config) onStepChange(1)
      else if (errors.schedule) onStepChange(3)
    },
  )

  const title = ['', 'Configure the connection', 'Choose tables', 'Set a sync schedule', 'Review and create'][step]
  const description = [
    '',
    `Enter the ${connector.name} connection details. Credentials are sent once over TLS and stored by the backend, never in your browser.`,
    'Pick the tables to replicate into Bronze and how each one is loaded.',
    'Decide when Graphite syncs this source automatically.',
    'Check the configuration. Nothing is saved until you create the source.',
  ][step]

  return (
    <form
      noValidate
      onSubmit={(event) => {
        if (step === 4) return void submit(event)
        event.preventDefault()
        void next()
      }}
    >
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <ConnectorIcon category={connector.category} className="size-6 border-0 bg-transparent" />
              <span className="text-sm font-medium">{connector.name}</span>
              <Button type="button" variant="link" size="sm" className="text-xs" onClick={onChangeConnector}>
                Change
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          {stepError ? (
            <Notice tone="danger" title={step === 1 ? 'Could not connect to the source' : 'Something went wrong'}>
              {errorMessage(stepError)}
              {isApiError(stepError) ? <span className="ml-1 font-mono text-xs">({stepError.code})</span> : null}
            </Notice>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Source name" htmlFor="src-name" required error={formState.errors.name?.message} description="Shown across Graphite, for example Salesforce Production.">
                  <Input {...nameField} placeholder={`${connector.name} Production`} autoComplete="off" />
                </FormField>
                <FormField
                  label="Destination schema"
                  htmlFor="src-schema"
                  required
                  error={formState.errors.destination_schema?.message}
                  description={
                    <span className="inline-flex items-center gap-1">
                      Bronze schema in your warehouse that receives the raw tables.
                      <HelpTip label="What is Bronze?">{BRONZE_HELP}</HelpTip>
                    </span>
                  }
                >
                  <Input {...schemaField} placeholder="bronze_salesforce" className="font-mono" autoComplete="off" spellCheck={false} />
                </FormField>
              </div>
              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-semibold">Connection</h3>
                <ConfigFields connector={connector} control={control} idPrefix="new" />
              </div>
              <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Check network access, credentials, permissions and limits before continuing.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void runTest()} loading={test.isPending}>
                    <PlugZap className="size-3.5" aria-hidden />
                    Test connection
                  </Button>
                </div>
                {test.data ? <ConnectionTestResult result={test.data} className="bg-background" /> : null}
                {testIsStale ? <p className="text-xs text-muted-foreground">Connection settings changed since this test. Test again to confirm.</p> : null}
              </div>
            </>
          ) : null}

          {step === 2 && discovery ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  Found {discovery.result.tables.length} tables in {discovery.result.schemas.length} schema{discovery.result.schemas.length === 1 ? '' : 's'}.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={discover.isPending}
                  onClick={() =>
                    discover.mutate(
                      { connector_type: connector.type, config: configPayload() },
                      { onSuccess: (result) => setDiscovery({ signature, result }), onError: (e) => toastError(e, 'Discovery failed') },
                    )
                  }
                >
                  <RefreshCw className="size-3.5" aria-hidden />
                  Refresh
                </Button>
              </div>
              <TableSelector
                tables={discovery.result.tables}
                value={tables}
                onChange={(value) => {
                  setTables(value)
                  if (value.length) setTablesError(null)
                }}
                incrementalSupported={connector.supports_incremental}
                error={tablesError ?? undefined}
              />
            </>
          ) : null}

          {step === 3 ? (
            <Controller
              control={control}
              name="schedule"
              render={({ field }) => (
                <ScheduleEditor
                  value={field.value}
                  onChange={field.onChange}
                  errors={{ cron: formState.errors.schedule?.cron?.message, timezone: formState.errors.schedule?.timezone?.message }}
                />
              )}
            />
          ) : null}

          {step === 4 ? (
            <>
              <ReviewStep connector={connector} values={getValues()} tables={tables} schedule={schedule} onEdit={onStepChange} />
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Controller
                  control={control}
                  name="run_initial_sync"
                  render={({ field }) => <Checkbox id="initial-sync" className="mt-0.5" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="initial-sync">Run an initial sync after creating</Label>
                  <p className="text-xs text-muted-foreground">
                    Loads the selected tables into <span className="font-mono">{getValues('destination_schema')}</span> right away.
                    {isMockMode ? ' In demo mode the sync is simulated and no data is extracted.' : ''}
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </CardContent>

        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={() => (step === 1 ? onChangeConnector() : onStepChange(step - 1))}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          {step < 4 ? (
            <Button type="submit" loading={step === 1 && discover.isPending}>
              {step === 1 ? 'Discover tables' : 'Continue'}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" loading={create.isPending}>
              Create source
            </Button>
          )}
        </CardFooter>
      </Card>
    </form>
  )
}
