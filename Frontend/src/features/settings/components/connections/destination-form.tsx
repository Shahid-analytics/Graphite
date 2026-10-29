import { zodResolver } from '@hookform/resolvers/zod'
import { PlugZap } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip, TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { HealthIndicator, LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { toastError, toastSuccess } from '@/lib/toast'
import type { ConnectionTestResponse, DestinationConfig, UpdateDestinationRequest } from '@/types'
import { applyFieldErrors } from '../../lib/form-errors'
import { PERMISSION_REASON } from '../../lib/labels'
import { EMPTY_SECRET, secretDraftSchema, secretError, secretPayload } from '../../lib/secrets'
import { useTestDestination, useUpdateDestination } from '../../queries'
import { FormFooter } from '../form-footer'
import { GatedButton } from '../gated-button'
import { SecretField } from '../secret-field'
import { SelectField } from '../select-field'
import { TestResult } from '../test-result'
import { UnsavedChangesGuard } from '../unsaved-changes-guard'

const schemaName = z
  .string()
  .trim()
  .min(1, 'Enter a schema name.')
  .max(63, 'Schema names are limited to 63 characters.')
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores, starting with a letter.')

const schema = z
  .object({
    host: z
      .string()
      .trim()
      .min(1, 'Enter the warehouse host name or IP address.')
      .regex(/^[A-Za-z0-9.-]+$/, 'Enter a host name such as warehouse.example.com, without a scheme or port.'),
    port: z.number({ error: 'Enter a port number.' }).int('Port must be a whole number.').min(1, 'Port must be between 1 and 65535.').max(65535, 'Port must be between 1 and 65535.'),
    database: z.string().trim().min(1, 'Enter the database name.'),
    username: z.string().trim().min(1, 'Enter the database user Graphite loads data as.'),
    password: secretDraftSchema,
    ssl_mode: z.enum(['disable', 'require', 'verify-full']),
    bronze_schema: schemaName,
    silver_schema: schemaName,
    gold_schema: schemaName,
  })
  .superRefine((values, ctx) => {
    const seen = new Map<string, string>()
    for (const field of ['bronze_schema', 'silver_schema', 'gold_schema'] as const) {
      const name = values[field].trim()
      if (seen.has(name)) ctx.addIssue({ code: 'custom', path: [field], message: `Must differ from the ${seen.get(name)} schema. Each layer needs its own schema.` })
      else seen.set(name, field.replace('_schema', ''))
    }
  })

type FormValues = z.infer<typeof schema>

const FIELDS = ['host', 'port', 'database', 'username', 'password', 'ssl_mode', 'bronze_schema', 'silver_schema', 'gold_schema'] as const

const toValues = (d: DestinationConfig): FormValues => ({
  host: d.host,
  port: d.port,
  database: d.database,
  username: d.username,
  password: EMPTY_SECRET,
  ssl_mode: d.ssl_mode,
  bronze_schema: d.bronze_schema,
  silver_schema: d.silver_schema,
  gold_schema: d.gold_schema,
})

function toPayload(values: FormValues): UpdateDestinationRequest {
  const password = secretPayload(values.password)
  return {
    host: values.host.trim(),
    port: values.port,
    database: values.database.trim(),
    username: values.username.trim(),
    ssl_mode: values.ssl_mode,
    bronze_schema: values.bronze_schema.trim(),
    silver_schema: values.silver_schema.trim(),
    gold_schema: values.gold_schema.trim(),
    ...(password !== undefined ? { password } : {}),
  }
}

const SSL_OPTIONS = [
  { value: 'require', label: 'Require' },
  { value: 'verify-full', label: 'Verify full (recommended)' },
  { value: 'disable', label: 'Disable (not recommended)' },
]

function statusLabel(d: DestinationConfig) {
  if (!d.host) return 'Not configured'
  if (d.status === 'healthy') return 'Connected'
  if (d.status === 'unhealthy') return 'Connection failed'
  return d.last_tested_at ? 'Not tested since last change' : 'Not tested'
}

const LAYERS = [
  { field: 'bronze_schema', layer: 'bronze', label: 'Bronze schema', help: 'Bronze holds raw data exactly as ingested from each source by dlt, one table per source object. It is append-friendly and never edited by hand.' },
  { field: 'silver_schema', layer: 'silver', label: 'Silver schema', help: 'Silver holds cleaned, typed and de-duplicated models built by dbt from Bronze, with consistent keys across sources.' },
  { field: 'gold_schema', layer: 'gold', label: 'Gold schema', help: 'Gold holds business-ready facts and dimensions built by dbt from Silver. Metabase dashboards and reports read from Gold.' },
] as const

export function DestinationForm({ workspaceId, destination, canEdit }: { workspaceId: string; destination: DestinationConfig; canEdit: boolean }) {
  const update = useUpdateDestination(workspaceId)
  const test = useTestDestination(workspaceId)
  const [testResult, setTestResult] = useState<{ result: ConnectionTestResponse; note?: string } | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(destination) })
  const { errors, isDirty } = form.formState
  const schemas = useWatch({ control: form.control, name: ['bronze_schema', 'silver_schema', 'gold_schema'] })
  const configured = Boolean(destination.host)
  const renamingSchemas =
    configured && (schemas[0] !== destination.bronze_schema || schemas[1] !== destination.silver_schema || schemas[2] !== destination.gold_schema)

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(toPayload(values))
      form.reset(toValues(saved))
      setTestResult(null)
      toastSuccess('Warehouse connection saved', 'Run a connection test to confirm the new settings.')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not save the warehouse connection')
    }
  })

  const onTest = form.handleSubmit(async (values) => {
    try {
      const result = await test.mutateAsync(isDirty ? toPayload(values) : undefined)
      setTestResult({ result, note: isDirty ? 'Tested the unsaved values in this form' : undefined })
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not run the connection test')
    }
  })

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2">
          PostgreSQL warehouse
          <Badge variant="outline">PostgreSQL</Badge>
        </CardTitle>
        <CardDescription>Ingestion writes Bronze tables here and dbt builds Silver and Gold models in the same database.</CardDescription>
        <CardAction className="flex flex-col items-end gap-0.5">
          <HealthIndicator status={destination.status} label={statusLabel(destination)} />
          {destination.last_tested_at ? (
            <span className="text-xs text-muted-foreground">
              Tested <TimeAgo value={destination.last_tested_at} />
            </span>
          ) : null}
        </CardAction>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-6">
            <FormField label="Host" htmlFor="dest-host" error={errors.host?.message} required className="sm:col-span-4">
              <Input placeholder="warehouse.example.internal" autoComplete="off" spellCheck={false} {...form.register('host')} />
            </FormField>
            <FormField label="Port" htmlFor="dest-port" error={errors.port?.message} required className="sm:col-span-2">
              <Input type="number" inputMode="numeric" min={1} max={65535} {...form.register('port', { valueAsNumber: true })} />
            </FormField>
            <FormField label="Database" htmlFor="dest-database" error={errors.database?.message} required className="sm:col-span-3">
              <Input placeholder="analytics" autoComplete="off" spellCheck={false} {...form.register('database')} />
            </FormField>
            <FormField
              label="Username"
              htmlFor="dest-username"
              description="Needs CREATE on the database and ownership of the three schemas."
              error={errors.username?.message}
              required
              className="sm:col-span-3"
            >
              <Input placeholder="graphite_loader" autoComplete="off" spellCheck={false} {...form.register('username')} />
            </FormField>
            <div className="sm:col-span-3">
              <Controller
                control={form.control}
                name="password"
                render={({ field }) => (
                  <SecretField
                    id="dest-password"
                    label="Password"
                    state={destination.password}
                    value={field.value}
                    onChange={field.onChange}
                    error={secretError(errors.password)}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>
            <div className="sm:col-span-3">
              <Controller
                control={form.control}
                name="ssl_mode"
                render={({ field }) => (
                  <SelectField
                    id="dest-ssl"
                    label="SSL mode"
                    description="verify-full also checks the server certificate and host name."
                    error={errors.ssl_mode?.message}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={SSL_OPTIONS}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>

            <div className="sm:col-span-6">
              <Separator />
              <div className="mt-4 flex items-center gap-1.5">
                <h3 className="text-sm font-medium">Medallion schemas</h3>
                <HelpTip label="About medallion layers">
                  The medallion architecture organises the warehouse into Bronze (raw), Silver (cleaned) and Gold (business-ready) layers so every report can be
                  traced back to its source data.
                </HelpTip>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">One schema per layer. Names must be lowercase and distinct.</p>
            </div>
            {LAYERS.map((layer) => (
              <FormField
                key={layer.field}
                label={layer.label}
                htmlFor={`dest-${layer.field}`}
                error={errors[layer.field]?.message}
                required
                className="sm:col-span-2"
                description={
                  <span className="inline-flex items-center gap-1.5">
                    <LayerBadge layer={layer.layer} />
                    <HelpTip label={`About the ${layer.layer} layer`}>{layer.help}</HelpTip>
                  </span>
                }
              >
                <Input className="font-mono text-[13px]" autoComplete="off" spellCheck={false} {...form.register(layer.field)} />
              </FormField>
            ))}
            {renamingSchemas ? (
              <Notice tone="warning" className="sm:col-span-6" title="Renaming a schema does not move existing tables">
                Existing Bronze, Silver and Gold tables stay in their current schemas. The backend creates the new schemas on the next run and dbt rebuilds
                models there, so plan a full refresh and update any Metabase questions that reference the old schema.
              </Notice>
            ) : null}
            <TestResult result={testResult?.result ?? null} note={testResult?.note} className="sm:col-span-6" />
          </CardContent>
        </fieldset>
        <FormFooter
          dirty={isDirty}
          saving={update.isPending}
          canEdit={canEdit}
          blockedReason={PERMISSION_REASON.settings}
          onDiscard={() => {
            form.reset(toValues(destination))
            setTestResult(null)
          }}
          extra={
            <GatedButton type="button" variant="outline" size="sm" onClick={onTest} loading={test.isPending} disabled={update.isPending} blockedReason={canEdit ? null : PERMISSION_REASON.settings}>
              <PlugZap aria-hidden />
              Test connection
            </GatedButton>
          }
        />
      </form>
    </Card>
  )
}
