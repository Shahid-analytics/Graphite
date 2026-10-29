import { zodResolver } from '@hookform/resolvers/zod'
import { PlugZap, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { HealthIndicator } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import type { MetabaseConfig, MetabaseConnectionStatus, MetabaseStatus, UpdateMetabaseConfigRequest } from '@/types'
import { FormFooter } from '../components/form-footer'
import { GatedButton } from '../components/gated-button'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SecretField } from '../components/secret-field'
import { SectionSkeleton } from '../components/section-skeleton'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { PERMISSION_REASON } from '../lib/labels'
import { EMPTY_SECRET, secretDraftSchema, secretError, secretPayload } from '../lib/secrets'
import { useMetabaseConfig, useMetabaseStatus, useTestMetabase, useUpdateMetabase } from '../queries'

const STATUS_LABELS: Record<MetabaseConnectionStatus, string> = {
  not_configured: 'Not configured',
  connected: 'Connected',
  unreachable: 'Unreachable',
  auth_failed: 'Authentication failed',
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname)
  } catch {
    return false
  }
}

const schema = z.object({
  site_url: z
    .string()
    .trim()
    .refine((v) => !v || isHttpsUrl(v), 'Enter an https:// URL, for example https://metabase.example.com.'),
  embedding_secret: secretDraftSchema,
  api_key: secretDraftSchema,
  default_collection_id: z.number().int('Collection id must be a whole number.').positive('Collection id must be a positive number.').nullable(),
})

type FormValues = z.infer<typeof schema>

const FIELDS = ['site_url', 'embedding_secret', 'api_key', 'default_collection_id'] as const

const toValues = (c: MetabaseConfig): FormValues => ({
  site_url: c.site_url,
  embedding_secret: EMPTY_SECRET,
  api_key: EMPTY_SECRET,
  default_collection_id: c.default_collection_id,
})

function toPayload(values: FormValues): UpdateMetabaseConfigRequest {
  const embeddingSecret = secretPayload(values.embedding_secret)
  const apiKey = secretPayload(values.api_key)
  return {
    site_url: values.site_url.trim().replace(/\/+$/, ''),
    default_collection_id: values.default_collection_id,
    ...(embeddingSecret !== undefined ? { embedding_secret: embeddingSecret } : {}),
    ...(apiKey !== undefined ? { api_key: apiKey } : {}),
  }
}

function StatusCard({ workspaceId, canTest, configured, dirty }: { workspaceId: string; canTest: boolean; configured: boolean; dirty: boolean }) {
  const status = useMetabaseStatus(workspaceId)
  const test = useTestMetabase(workspaceId)

  const runTest = async () => {
    try {
      const result: MetabaseStatus = await test.mutateAsync()
      if (result.status === 'connected') toastSuccess('Metabase is reachable')
      else toastInfo(`Metabase status: ${STATUS_LABELS[result.status]}`, result.message ?? undefined)
    } catch (error) {
      toastError(error, 'Could not test the Metabase connection')
    }
  }

  const blocked = !canTest ? PERMISSION_REASON.settings : dirty ? 'Save your changes before testing' : !configured ? 'Save a site URL first' : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Connection status
          {isMockMode ? <SimulatedBadge reason="The mock API cannot reach Metabase. It reports the integration as unreachable instead of simulating a connection." /> : null}
        </CardTitle>
        <CardDescription>Reported by the backend, which is the only component that talks to Metabase.</CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => status.refetch()} disabled={status.isFetching} aria-label="Refresh status">
            <RefreshCw className={status.isFetching ? 'animate-spin' : undefined} aria-hidden />
          </Button>
          <GatedButton variant="outline" size="sm" onClick={runTest} loading={test.isPending} blockedReason={blocked}>
            <PlugZap aria-hidden />
            Test
          </GatedButton>
        </CardAction>
      </CardHeader>
      <CardContent aria-live="polite">
        {status.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading status">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : status.isError ? (
          <ErrorState error={status.error} title="Could not load the Metabase status" onRetry={() => status.refetch()} compact />
        ) : status.data ? (
          <div className="space-y-4">
            <KeyValueGrid
              columns={4}
              items={[
                { label: 'Status', value: <HealthIndicator status={status.data.health} label={STATUS_LABELS[status.data.status]} /> },
                { label: 'Site', value: status.data.site_url ?? '—', mono: Boolean(status.data.site_url) },
                { label: 'Signed embedding', value: status.data.embedding_enabled ? 'Secret stored' : 'Not set up' },
                { label: 'Last checked', value: status.data.last_checked_at ? <TimeAgo value={status.data.last_checked_at} /> : 'Never' },
              ]}
            />
            {status.data.message ? (
              <Notice tone={status.data.status === 'connected' ? 'success' : status.data.status === 'not_configured' ? 'neutral' : 'warning'}>{status.data.message}</Notice>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MetabaseForm({ workspaceId, config, canEdit, onDirtyChange }: { workspaceId: string; config: MetabaseConfig; canEdit: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const update = useUpdateMetabase(workspaceId)
  const [confirmDisconnect, setConfirmDisconnect] = useState<FormValues | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(config) })
  const { errors, isDirty } = form.formState

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const save = async (values: FormValues) => {
    try {
      const saved = await update.mutateAsync(toPayload(values))
      form.reset(toValues(saved))
      toastSuccess(saved.site_url ? 'Metabase settings saved' : 'Metabase disconnected')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not save the Metabase settings')
      throw error
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (config.site_url && !values.site_url.trim()) {
      setConfirmDisconnect(values)
      return
    }
    await save(values).catch(() => undefined)
  })

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
            <FormField
              label="Site URL"
              htmlFor="mb-site-url"
              description="The https address of your Metabase instance. Leave empty to disconnect."
              error={errors.site_url?.message}
              className="sm:col-span-2"
            >
              <Input className="font-mono text-[13px]" placeholder="https://metabase.example.com" autoComplete="off" spellCheck={false} {...form.register('site_url')} />
            </FormField>
            <Controller
              control={form.control}
              name="embedding_secret"
              render={({ field }) => (
                <SecretField
                  id="mb-embedding-secret"
                  label="Embedding secret key"
                  state={config.embedding_secret}
                  value={field.value}
                  onChange={field.onChange}
                  error={secretError(errors.embedding_secret)}
                  disabled={!canEdit}
                  description="From Metabase Admin > Embedding > Static embedding. Used only by the backend to sign embed URLs."
                />
              )}
            />
            <Controller
              control={form.control}
              name="api_key"
              render={({ field }) => (
                <SecretField
                  id="mb-api-key"
                  label="API key"
                  state={config.api_key}
                  value={field.value}
                  onChange={field.onChange}
                  error={secretError(errors.api_key)}
                  disabled={!canEdit}
                  description="Lets the backend list dashboards and publish reviewed reports."
                />
              )}
            />
            <FormField
              label="Default collection ID"
              htmlFor="mb-collection"
              description={
                <span className="inline-flex items-center gap-1">
                  Where published reports are saved.
                  <HelpTip label="Finding the collection ID">Open the collection in Metabase; the number in the URL after /collection/ is its ID.</HelpTip>
                </span>
              }
              error={errors.default_collection_id?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Optional"
                {...form.register('default_collection_id', { setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v)) })}
              />
            </FormField>
          </CardContent>
        </fieldset>
        <FormFooter
          dirty={isDirty}
          saving={update.isPending}
          canEdit={canEdit}
          blockedReason={PERMISSION_REASON.settings}
          onDiscard={() => form.reset(toValues(config))}
        />
      </form>
      <ConfirmDialog
        open={Boolean(confirmDisconnect)}
        onOpenChange={(open) => {
          if (!open) setConfirmDisconnect(null)
        }}
        title="Disconnect Metabase?"
        description="Embedded dashboards stop loading and reports cannot be published until a site URL is saved again. Stored secrets are kept unless you clear them."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => (confirmDisconnect ? save(confirmDisconnect) : undefined)}
      />
    </Card>
  )
}

export default function MetabaseSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const config = useMetabaseConfig(workspaceId)
  const [dirty, setDirty] = useState(false)

  return (
    <div className="space-y-8">
      <Section title="Metabase" description="Dashboards and reports are served by your Metabase instance and embedded in Graphite.">
        {config.isLoading ? (
          <SectionSkeleton fields={2} />
        ) : config.isError ? (
          <ErrorState error={config.error} onRetry={() => config.refetch()} />
        ) : (
          <StatusCard key={workspaceId} workspaceId={workspaceId} canTest={canEdit} configured={Boolean(config.data?.site_url)} dirty={dirty} />
        )}
      </Section>

      <Section title="Connection settings" description="Secrets are write-only: they are sent once, stored by the backend and never shown again.">
        {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
        {config.isLoading ? (
          <SectionSkeleton fields={4} />
        ) : config.isError ? (
          <ErrorState error={config.error} onRetry={() => config.refetch()} />
        ) : config.data ? (
          <MetabaseForm key={workspaceId} workspaceId={workspaceId} config={config.data} canEdit={canEdit} onDirtyChange={setDirty} />
        ) : null}
      </Section>

      <Notice tone="neutral" title="How signed embedding works">
        When someone opens a dashboard, the browser asks the Graphite backend for an embed session. The backend signs a short-lived URL with the embedding
        secret and returns it; Metabase verifies the signature and renders the dashboard. The secret never reaches the browser, and Graphite never builds embed
        URLs on the client.
      </Notice>
    </div>
  )
}
