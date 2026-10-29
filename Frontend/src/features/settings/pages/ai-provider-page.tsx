import { zodResolver } from '@hookform/resolvers/zod'
import { PlugZap, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { HealthIndicator } from '@/components/status/status-badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import type { AiProviderConfig, AiProviderName, ConnectionTestResponse, SecretState, UpdateAiProviderRequest } from '@/types'
import { FormFooter } from '../components/form-footer'
import { GatedButton } from '../components/gated-button'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SecretField } from '../components/secret-field'
import { SectionSkeleton } from '../components/section-skeleton'
import { SelectField } from '../components/select-field'
import { TestResult } from '../components/test-result'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { AI_PROVIDER_OPTIONS, PERMISSION_REASON } from '../lib/labels'
import { EMPTY_SECRET, secretDraftSchema, secretError, secretPayload } from '../lib/secrets'
import { useAiProvider, useTestAiProvider, useUpdateAiProvider } from '../queries'

const NEEDS_ENDPOINT: AiProviderName[] = ['azure_openai', 'self_hosted']

function urlWithProtocol(value: string, protocols: string[]) {
  try {
    const url = new URL(value)
    return protocols.includes(url.protocol) && Boolean(url.hostname)
  } catch {
    return false
  }
}

const schema = z
  .object({
    provider: z.enum(['none', 'openai', 'anthropic', 'azure_openai', 'self_hosted']),
    model: z.string().trim().max(120, 'The model name is too long.'),
    endpoint_url: z.string().trim(),
    api_key: secretDraftSchema,
    data_sharing: z.enum(['metadata_only', 'metadata_and_samples']),
    enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.provider !== 'none' && !v.model) ctx.addIssue({ code: 'custom', path: ['model'], message: 'Enter the model or deployment name to use.' })
    if (v.provider === 'azure_openai') {
      if (!v.endpoint_url) ctx.addIssue({ code: 'custom', path: ['endpoint_url'], message: 'Enter the Azure OpenAI resource endpoint.' })
      else if (!urlWithProtocol(v.endpoint_url, ['https:'])) ctx.addIssue({ code: 'custom', path: ['endpoint_url'], message: 'Enter an https:// endpoint.' })
    }
    if (v.provider === 'self_hosted') {
      if (!v.endpoint_url) ctx.addIssue({ code: 'custom', path: ['endpoint_url'], message: 'Enter the base URL of the model server.' })
      else if (!urlWithProtocol(v.endpoint_url, ['https:', 'http:'])) ctx.addIssue({ code: 'custom', path: ['endpoint_url'], message: 'Enter an http:// or https:// URL.' })
    }
  })

type FormValues = z.infer<typeof schema>

const FIELDS = ['provider', 'model', 'endpoint_url', 'api_key', 'data_sharing', 'enabled'] as const

const toValues = (c: AiProviderConfig): FormValues => ({
  provider: c.provider,
  model: c.model ?? '',
  endpoint_url: c.endpoint_url ?? '',
  api_key: EMPTY_SECRET,
  data_sharing: c.data_sharing,
  enabled: c.enabled,
})

function toPayload(v: FormValues): UpdateAiProviderRequest {
  if (v.provider === 'none') return { provider: 'none', model: null, endpoint_url: null, data_sharing: v.data_sharing, enabled: false }
  const apiKey = secretPayload(v.api_key)
  return {
    provider: v.provider,
    model: v.model.trim(),
    endpoint_url: NEEDS_ENDPOINT.includes(v.provider) ? v.endpoint_url.trim() : null,
    data_sharing: v.data_sharing,
    enabled: v.enabled,
    ...(apiKey !== undefined ? { api_key: apiKey } : {}),
  }
}

function statusLabel(c: AiProviderConfig) {
  if (c.provider === 'none') return 'Not configured'
  if (!c.enabled) return 'Disabled'
  if (c.status === 'healthy') return 'Enabled'
  return 'Enabled, not verified'
}

const SHARING_OPTIONS = [
  {
    value: 'metadata_only',
    label: 'Metadata only (recommended)',
    description: 'Table and column names, data types, descriptions and aggregate profiling statistics such as null rates. No row values leave your warehouse.',
  },
  {
    value: 'metadata_and_samples',
    label: 'Metadata and sample rows',
    description:
      'Also sends a small number of sample rows per table to improve mapping accuracy. Samples can contain personal or financial data; enable only if your agreement with the provider covers it.',
  },
] as const

const NO_KEY: SecretState = { is_set: false, updated_at: null }

function AiProviderForm({ workspaceId, config, canEdit }: { workspaceId: string; config: AiProviderConfig; canEdit: boolean }) {
  const update = useUpdateAiProvider(workspaceId)
  const test = useTestAiProvider(workspaceId)
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(config) })
  const { errors, isDirty } = form.formState
  const provider = useWatch({ control: form.control, name: 'provider' })
  const providerMeta = AI_PROVIDER_OPTIONS.find((p) => p.value === provider)
  const providerChanged = provider !== config.provider
  const keyState = providerChanged ? NO_KEY : config.api_key

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(toPayload(values))
      form.reset(toValues(saved))
      setTestResult(null)
      toastSuccess('AI provider settings saved', saved.provider === 'none' ? 'AI-assisted features are turned off.' : undefined)
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not save the AI provider settings')
    }
  })

  const runTest = async () => {
    try {
      setTestResult(await test.mutateAsync())
    } catch (error) {
      toastError(error, 'Could not test the AI provider')
    }
  }

  const testBlocked = !canEdit
    ? PERMISSION_REASON.settings
    : isDirty
      ? 'Save your changes before testing'
      : config.provider === 'none'
        ? 'Choose and save a provider first'
        : null

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <CardHeader className="border-b border-border">
        <CardTitle>Provider</CardTitle>
        <CardDescription>Powers AI-assisted mapping, schema proposals and report suggestions.</CardDescription>
        <CardAction>
          <HealthIndicator status={config.status} label={statusLabel(config)} />
        </CardAction>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="provider"
              render={({ field }) => (
                <SelectField
                  id="ai-provider"
                  label="Provider"
                  error={errors.provider?.message}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    form.setValue('api_key', EMPTY_SECRET, { shouldDirty: true })
                    if (value === 'none') form.setValue('enabled', false, { shouldDirty: true })
                  }}
                  options={AI_PROVIDER_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                  disabled={!canEdit}
                />
              )}
            />
            {provider !== 'none' ? (
              <FormField
                label={provider === 'azure_openai' ? 'Deployment name' : 'Model'}
                htmlFor="ai-model"
                error={errors.model?.message}
                required
              >
                <Input className="font-mono text-[13px]" placeholder={providerMeta?.modelPlaceholder} autoComplete="off" spellCheck={false} {...form.register('model')} />
              </FormField>
            ) : (
              <div className="hidden sm:block" />
            )}
            {NEEDS_ENDPOINT.includes(provider) ? (
              <FormField
                label="Endpoint URL"
                htmlFor="ai-endpoint"
                description={provider === 'azure_openai' ? 'Your Azure OpenAI resource endpoint.' : 'Base URL of an OpenAI-compatible server you operate.'}
                error={errors.endpoint_url?.message}
                required
                className="sm:col-span-2"
              >
                <Input
                  className="font-mono text-[13px]"
                  placeholder={provider === 'azure_openai' ? 'https://your-resource.openai.azure.com' : 'https://llm.internal.example.com/v1'}
                  autoComplete="off"
                  spellCheck={false}
                  {...form.register('endpoint_url')}
                />
              </FormField>
            ) : null}
            {provider !== 'none' ? (
              <div className="sm:col-span-2">
                <Controller
                  control={form.control}
                  name="api_key"
                  render={({ field }) => (
                    <SecretField
                      id="ai-api-key"
                      label="API key"
                      state={keyState}
                      value={field.value}
                      onChange={field.onChange}
                      error={secretError(errors.api_key)}
                      disabled={!canEdit}
                      description={provider === 'self_hosted' ? 'Optional for self-hosted servers that do not require a key.' : undefined}
                    />
                  )}
                />
              </div>
            ) : null}
            {providerChanged && config.api_key.is_set ? (
              <Notice tone="warning" className="sm:col-span-2">
                Switching provider discards the stored API key, because a key from one provider is never valid for another. Enter the key for the new provider.
              </Notice>
            ) : null}

            <div className="sm:col-span-2">
              <Separator className="mb-5" />
              <Controller
                control={form.control}
                name="data_sharing"
                render={({ field }) => (
                  <fieldset>
                    <legend className="flex items-center gap-1.5 text-sm font-medium">
                      Data shared with the provider
                      <HelpTip label="About data sharing">
                        Applies to every AI request from this workspace. The backend enforces it before any request leaves your environment.
                      </HelpTip>
                    </legend>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="mt-3 gap-2" disabled={!canEdit} aria-label="Data shared with the provider">
                      {SHARING_OPTIONS.map((option) => (
                        <Label
                          key={option.value}
                          htmlFor={`ai-sharing-${option.value}`}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-surface"
                        >
                          <RadioGroupItem id={`ai-sharing-${option.value}`} value={option.value} className="mt-0.5" />
                          <span className="grid gap-0.5">
                            <span className="text-sm font-medium">{option.label}</span>
                            <span className="text-xs leading-snug text-muted-foreground">{option.description}</span>
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  </fieldset>
                )}
              />
            </div>

            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <div className="flex items-start justify-between gap-4 rounded-md border border-border px-3 py-3">
                    <div className="grid gap-0.5">
                      <Label htmlFor="ai-enabled">Enable AI assistance</Label>
                      <p id="ai-enabled-description" className="text-xs text-muted-foreground">
                        {provider === 'none' ? 'Choose a provider first.' : 'When off, AI features are hidden and no requests are sent to the provider.'}
                      </p>
                    </div>
                    <Switch
                      id="ai-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={!canEdit || provider === 'none'}
                      aria-describedby="ai-enabled-description"
                    />
                  </div>
                )}
              />
              {errors.enabled ? (
                <p role="alert" className="mt-1.5 text-xs text-danger">
                  {errors.enabled.message}
                </p>
              ) : null}
            </div>
            <TestResult result={testResult} inconclusive={testResult ? !testResult.success : false} className="sm:col-span-2" />
          </CardContent>
        </fieldset>
        <FormFooter
          dirty={isDirty}
          saving={update.isPending}
          canEdit={canEdit}
          blockedReason={PERMISSION_REASON.settings}
          onDiscard={() => {
            form.reset(toValues(config))
            setTestResult(null)
          }}
          extra={
            <GatedButton type="button" variant="outline" size="sm" onClick={runTest} loading={test.isPending} blockedReason={testBlocked}>
              <PlugZap aria-hidden />
              Test key
            </GatedButton>
          }
        />
      </form>
    </Card>
  )
}

export default function AiProviderSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const ai = useAiProvider(workspaceId)

  return (
    <div className="space-y-6">
      <Section title="AI provider" description="Choose the model provider used for AI-assisted features, and what data it may see.">
        <Notice tone="neutral" icon={ShieldCheck} title="AI suggestions always require human review">
          Mappings, schema proposals and report suggestions from the AI provider are drafts. Nothing is applied to the warehouse or published until a member with
          the right permission reviews and approves it.
        </Notice>
        {isMockMode ? (
          <Notice tone="neutral">
            Demo mode never calls an AI provider. Suggestions shown in the demo are generated by the mock API and labelled Simulated, whatever is configured here.
          </Notice>
        ) : null}
        {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
        {ai.isLoading ? (
          <SectionSkeleton fields={6} />
        ) : ai.isError ? (
          <ErrorState error={ai.error} onRetry={() => ai.refetch()} />
        ) : ai.data ? (
          <AiProviderForm key={workspaceId} workspaceId={workspaceId} config={ai.data} canEdit={canEdit} />
        ) : null}
      </Section>
    </div>
  )
}
