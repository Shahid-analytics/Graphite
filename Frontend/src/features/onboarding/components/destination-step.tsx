import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, PlugZap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { HealthIndicator } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PasswordInput } from '@/features/auth/components/password-input'
import { applyFieldErrors } from '@/features/auth/lib/form-errors'
import { useWorkspace } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import type { ConnectionTestResponse, DestinationConfig, UpdateDestinationRequest } from '@/types'
import { SCHEMA_NAME_PATTERN } from '../lib/sync-schedule'
import { WIZARD_STEPS } from '../lib/steps'
import { useDestination, useTestDestination, useUpdateDestination } from '../queries'
import { StoredSecret } from './secret-field'
import { FieldGroup, StepFooter, StepHeader, StepNav, useStepAccess, type StepNavProps } from './step-frame'
import { SimpleTestResult } from './test-result'

const STEP = WIZARD_STEPS[1]

const SSL_MODES: { value: DestinationConfig['ssl_mode']; label: string }[] = [
  { value: 'require', label: 'Require' },
  { value: 'verify-full', label: 'Verify full (recommended)' },
  { value: 'disable', label: 'Disable (not recommended)' },
]

const schemaName = (layer: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${layer} schema name.`)
    .max(63, 'PostgreSQL identifiers are limited to 63 characters.')
    .regex(SCHEMA_NAME_PATTERN, 'Use lowercase letters, numbers and underscores, starting with a letter.')

function buildSchema(passwordStored: boolean) {
  return z
    .object({
      host: z.string().trim().min(1, 'Enter the warehouse host.'),
      port: z
        .string()
        .trim()
        .regex(/^\d+$/, 'Port must be a whole number.')
        .refine((v) => Number(v) >= 1 && Number(v) <= 65535, 'Enter a port between 1 and 65535.'),
      database: z.string().trim().min(1, 'Enter the database name.'),
      username: z.string().trim().min(1, 'Enter the username Graphite connects as.'),
      password: z.string(),
      replacePassword: z.boolean(),
      ssl_mode: z.enum(['disable', 'require', 'verify-full']),
      bronze_schema: schemaName('Bronze'),
      silver_schema: schemaName('Silver'),
      gold_schema: schemaName('Gold'),
    })
    .superRefine((values, ctx) => {
      if ((!passwordStored || values.replacePassword) && !values.password) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Enter the warehouse password.' })
      }
      const layers = [values.bronze_schema, values.silver_schema, values.gold_schema]
      if (new Set(layers).size !== layers.length) {
        ctx.addIssue({ code: 'custom', path: ['gold_schema'], message: 'Bronze, Silver and Gold must use different schemas.' })
      }
    })
}

type Values = z.infer<ReturnType<typeof buildSchema>>

const FIELDS = ['host', 'port', 'database', 'username', 'password', 'ssl_mode', 'bronze_schema', 'silver_schema', 'gold_schema'] as const

function toValues(destination: DestinationConfig): Values {
  return {
    host: destination.host,
    port: String(destination.port || 5432),
    database: destination.database,
    username: destination.username,
    password: '',
    replacePassword: false,
    ssl_mode: destination.ssl_mode,
    bronze_schema: destination.bronze_schema || 'bronze',
    silver_schema: destination.silver_schema || 'silver',
    gold_schema: destination.gold_schema || 'gold',
  }
}

function DestinationForm({
  destination,
  allowed,
  nav,
  onSaved,
}: {
  destination: DestinationConfig
  allowed: boolean
  nav: StepNavProps
  onSaved: () => Promise<void>
}) {
  const { workspaceId } = useWorkspace()
  const stored = destination.password.is_set
  const schema = useMemo(() => buildSchema(stored), [stored])
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(destination) })
  const { register, control, formState, handleSubmit, setValue, setError, reset } = form
  const replacePassword = useWatch({ control, name: 'replacePassword' })
  const sslMode = useWatch({ control, name: 'ssl_mode' })
  const test = useTestDestination(workspaceId)
  const save = useUpdateDestination(workspaceId)
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null)
  const [continuing, setContinuing] = useState(false)

  const toPayload = (values: Values): UpdateDestinationRequest => ({
    host: values.host,
    port: Number(values.port),
    database: values.database,
    username: values.username,
    ...(!stored || values.replacePassword ? { password: values.password } : {}),
    ssl_mode: values.ssl_mode,
    bronze_schema: values.bronze_schema,
    silver_schema: values.silver_schema,
    gold_schema: values.gold_schema,
  })

  const onTest = handleSubmit(async (values) => {
    setTestResult(null)
    try {
      setTestResult(await test.mutateAsync(toPayload(values)))
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) toastError(error, 'Connection test could not run')
    }
  })

  const onSave = handleSubmit(async (values) => {
    try {
      const updated = await save.mutateAsync(toPayload(values))
      // Drop the password from form state as soon as it has been sent.
      reset(toValues(updated))
      toastSuccess('Warehouse settings saved')
      setContinuing(true)
      await onSaved()
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) toastError(error, 'Could not save the warehouse settings')
    } finally {
      setContinuing(false)
    }
  })

  const errors = formState.errors

  return (
    <form onSubmit={onSave} noValidate>
      <fieldset disabled={!allowed} className="min-w-0 space-y-5">
        <FieldGroup
          title="PostgreSQL connection"
          description="Graphite loads raw data and builds models in this database. Use a role that can create schemas and tables."
        >
          <div className="grid gap-4 sm:grid-cols-6">
            <FormField label="Host" htmlFor="dest-host" required error={errors.host?.message} className="sm:col-span-4">
              <Input placeholder="warehouse.internal.example.com" autoComplete="off" spellCheck={false} {...register('host')} />
            </FormField>
            <FormField label="Port" htmlFor="dest-port" required error={errors.port?.message} className="sm:col-span-2">
              <Input inputMode="numeric" autoComplete="off" {...register('port')} />
            </FormField>
            <FormField label="Database" htmlFor="dest-database" required error={errors.database?.message} className="sm:col-span-3">
              <Input placeholder="analytics" autoComplete="off" spellCheck={false} {...register('database')} />
            </FormField>
            <FormField label="Username" htmlFor="dest-username" required error={errors.username?.message} className="sm:col-span-3">
              <Input placeholder="graphite_loader" autoComplete="off" spellCheck={false} {...register('username')} />
            </FormField>
            <FormField
              label="Password"
              htmlFor="dest-password"
              required={!stored || replacePassword}
              error={errors.password?.message}
              className="sm:col-span-3"
              description={stored && !replacePassword ? 'A password is stored. It is never shown.' : 'Write-only. Sent once and never shown again.'}
            >
              <StoredSecret
                state={destination.password}
                replacing={replacePassword}
                onReplacingChange={(next) => {
                  setValue('replacePassword', next)
                  setValue('password', '')
                }}
                disabled={!allowed}
              >
                <PasswordInput id="dest-password" autoComplete="new-password" data-1p-ignore {...register('password')} />
              </StoredSecret>
            </FormField>
            <FormField label="SSL mode" htmlFor="dest-ssl" required error={errors.ssl_mode?.message} className="sm:col-span-3">
              <Controller
                control={control}
                name="ssl_mode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!allowed}>
                    <SelectTrigger id="dest-ssl" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SSL_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            {sslMode === 'disable' ? (
              <Notice tone="warning" className="sm:col-span-6">
                Without SSL, credentials and business data travel unencrypted. Only disable it for a database on a private network.
              </Notice>
            ) : null}
          </div>
        </FieldGroup>

        <FieldGroup
          title="Medallion layers"
          description="Schemas inside the warehouse database for each stage of the data flow."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              label="Bronze schema"
              htmlFor="dest-bronze"
              required
              error={errors.bronze_schema?.message}
              description={
                <span className="inline-flex items-center gap-1">
                  Raw copies from sources
                  <HelpTip label="What is Bronze?">Bronze holds raw tables exactly as ingested by dlt. Each source writes to its own bronze_ schema.</HelpTip>
                </span>
              }
            >
              <Input className="font-mono" autoComplete="off" spellCheck={false} {...register('bronze_schema')} />
            </FormField>
            <FormField
              label="Silver schema"
              htmlFor="dest-silver"
              required
              error={errors.silver_schema?.message}
              description={
                <span className="inline-flex items-center gap-1">
                  Cleaned, conformed tables
                  <HelpTip label="What is Silver?">Silver tables are cleaned, deduplicated and typed by dbt, with consistent keys across sources.</HelpTip>
                </span>
              }
            >
              <Input className="font-mono" autoComplete="off" spellCheck={false} {...register('silver_schema')} />
            </FormField>
            <FormField
              label="Gold schema"
              htmlFor="dest-gold"
              required
              error={errors.gold_schema?.message}
              description={
                <span className="inline-flex items-center gap-1">
                  Business-ready models
                  <HelpTip label="What is Gold?">Gold holds facts and dimensions modelled for reporting. Metabase dashboards read from here.</HelpTip>
                </span>
              }
            >
              <Input className="font-mono" autoComplete="off" spellCheck={false} {...register('gold_schema')} />
            </FormField>
          </div>
        </FieldGroup>
      </fieldset>

      <div className="mt-4" aria-live="polite">
        {testResult ? <SimpleTestResult result={testResult} subject="Warehouse" /> : null}
      </div>

      <StepFooter start={<StepNav {...nav} />}>
        <Button type="button" variant="outline" onClick={onTest} loading={test.isPending} disabled={!allowed || save.isPending}>
          {test.isPending ? null : <PlugZap className="size-4" aria-hidden />}
          Test connection
        </Button>
        <Button type="submit" loading={save.isPending || continuing} disabled={!allowed || test.isPending}>
          Save and continue
          {save.isPending || continuing ? null : <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </StepFooter>
    </form>
  )
}

export function DestinationStep({ nav, onSaved }: { nav: StepNavProps; onSaved: () => Promise<void> }) {
  const { workspaceId } = useWorkspace()
  const access = useStepAccess(STEP.permission, STEP.action)
  const destination = useDestination(workspaceId)

  return (
    <>
      <StepHeader
        stepKey="destination"
        done={nav.done}
        actions={destination.data && destination.data.status !== 'unknown' ? <HealthIndicator status={destination.data.status} label={`Warehouse ${destination.data.status}`} /> : undefined}
      />
      {access.notice}
      {destination.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading warehouse settings">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : destination.isError ? (
        <>
          <ErrorState error={destination.error} title="Could not load the warehouse settings" onRetry={() => destination.refetch()} />
          <StepFooter start={<StepNav {...nav} />} />
        </>
      ) : destination.data ? (
        <DestinationForm destination={destination.data} allowed={access.allowed} nav={nav} onSaved={onSaved} />
      ) : null}
    </>
  )
}
