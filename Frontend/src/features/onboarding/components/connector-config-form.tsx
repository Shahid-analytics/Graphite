import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, PlugZap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PasswordInput } from '@/features/auth/components/password-input'
import { applyFieldErrors } from '@/features/auth/lib/form-errors'
import { errorMessage } from '@/services/api-error'
import type { ConfigValue, ConnectorDefinition, ConnectorField, TestConnectionResult } from '@/types'
import { configSignature, connectorDefaults, connectorSchema, toConnectorConfig, type ConnectorFormValues } from '../lib/connector-form'
import { useTestNewConnection } from '../queries'
import { FieldGroup, StepFooter } from './step-frame'
import { SecretTextarea } from './secret-field'
import { ConnectionChecks } from './test-result'

function ConfigFieldControl({ field, form, disabled }: { field: ConnectorField; form: UseFormReturn<ConnectorFormValues>; disabled?: boolean }) {
  const id = `cfg-${field.key}`
  const error = form.formState.errors[field.key]?.message as string | undefined
  const description = [field.help, field.secret ? 'Write-only: sent once to test and create the source, never shown again.' : null].filter(Boolean).join(' ')

  if (field.type === 'boolean') {
    return (
      <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {field.label}
          </label>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
        </div>
        <Controller
          control={form.control}
          name={field.key}
          render={({ field: f }) => <Switch id={id} checked={f.value === true} onCheckedChange={f.onChange} disabled={disabled} />}
        />
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <FormField label={field.label} htmlFor={id} required={field.required} description={description || undefined} error={error}>
        <Controller
          control={form.control}
          name={field.key}
          render={({ field: f }) => (
            <Select value={String(f.value ?? '')} onValueChange={f.onChange} disabled={disabled}>
              <SelectTrigger id={id} onBlur={f.onBlur} aria-invalid={Boolean(error)}>
                <SelectValue placeholder={field.placeholder ?? 'Select an option'} />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </FormField>
    )
  }

  const common = { placeholder: field.placeholder, disabled, ...form.register(field.key) }
  let control: ReactNode
  if (field.type === 'password' || field.secret) {
    control = field.type === 'textarea' ? <SecretTextarea {...common} /> : <PasswordInput autoComplete="new-password" data-1p-ignore {...common} />
  } else if (field.type === 'textarea') {
    control = <Textarea {...common} />
  } else {
    control = (
      <Input
        type={field.type === 'url' ? 'url' : 'text'}
        inputMode={field.type === 'number' ? 'numeric' : field.type === 'url' ? 'url' : undefined}
        autoComplete="off"
        spellCheck={false}
        {...common}
      />
    )
  }
  return (
    <FormField
      label={field.label}
      htmlFor={id}
      required={field.required}
      description={description || undefined}
      error={error}
      className={field.type === 'textarea' || field.type === 'url' ? 'sm:col-span-2' : undefined}
    >
      {control}
    </FormField>
  )
}

/**
 * Dynamic configuration form built from `connector.config_fields`. Continue is only
 * enabled after a successful test of the exact values currently in the form.
 */
export function ConnectorConfigForm({
  workspaceId,
  connector,
  initialConfig,
  initialTest,
  disabled,
  footerStart,
  onContinue,
}: {
  workspaceId: string
  connector: ConnectorDefinition
  initialConfig?: Record<string, ConfigValue>
  initialTest?: TestConnectionResult
  disabled?: boolean
  footerStart?: ReactNode
  onContinue: (config: Record<string, ConfigValue>, test: TestConnectionResult) => void
}) {
  const fields = connector.config_fields
  const schema = useMemo(() => connectorSchema(fields), [fields])
  const form = useForm<ConnectorFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<ConnectorFormValues>,
    defaultValues: connectorDefaults(fields, initialConfig),
  })
  const test = useTestNewConnection(workspaceId)
  const [lastTest, setLastTest] = useState<{ signature: string; result: TestConnectionResult } | null>(
    initialTest && initialConfig ? { signature: configSignature(initialConfig), result: initialTest } : null,
  )

  const values = useWatch({ control: form.control }) as ConnectorFormValues
  const currentConfig = toConnectorConfig(fields, values)
  const testIsCurrent = lastTest !== null && lastTest.signature === configSignature(currentConfig)
  const canContinue = testIsCurrent && lastTest.result.success

  const aliases = Object.fromEntries(fields.map((f) => [`config.${f.key}`, f.key]))

  const runTest = form.handleSubmit(async (formValues) => {
    const config = toConnectorConfig(fields, formValues)
    try {
      const result = await test.mutateAsync({ connector_type: connector.type, config })
      setLastTest({ signature: configSignature(config), result })
    } catch (error) {
      setLastTest(null)
      applyFieldErrors(error, form.setError, fields.map((f) => f.key), aliases)
    }
  })

  const testError = test.isError ? test.error : null

  return (
    <form onSubmit={runTest} noValidate>
      <FieldGroup title={`${connector.name} connection`} description="Values are checked by the ingestion service before anything is saved.">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <ConfigFieldControl key={field.key} field={field} form={form} disabled={disabled} />
          ))}
        </div>
      </FieldGroup>

      <div className="mt-4 space-y-3" aria-live="polite">
        {testError ? (
          <Notice tone="danger" title="Connection test could not run">
            {errorMessage(testError)}
          </Notice>
        ) : null}
        {lastTest ? <ConnectionChecks result={lastTest.result} /> : null}
        {lastTest && !testIsCurrent ? (
          <p className="text-xs text-muted-foreground">The connection details changed since the last test. Test again to continue.</p>
        ) : null}
      </div>

      <StepFooter start={footerStart}>
        {!canContinue && !disabled ? <p className="text-xs text-muted-foreground sm:mr-2">A successful connection test is required to continue.</p> : null}
        <Button type="submit" variant="outline" loading={test.isPending} disabled={disabled}>
          {test.isPending ? null : <PlugZap className="size-4" aria-hidden />}
          Test connection
        </Button>
        <Button type="button" disabled={!canContinue || disabled} onClick={() => lastTest && onContinue(currentConfig, lastTest.result)}>
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </StepFooter>
    </form>
  )
}
