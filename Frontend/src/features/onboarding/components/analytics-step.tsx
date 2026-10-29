import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, PlugZap } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { SimulatedBadge } from '@/components/status/simulated'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PasswordInput } from '@/features/auth/components/password-input'
import { applyFieldErrors } from '@/features/auth/lib/form-errors'
import { useWorkspace } from '@/hooks/use-workspace'
import { formatDateTime } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { MetabaseConfig, MetabaseConnectionStatus, MetabaseStatus, UpdateMetabaseConfigRequest } from '@/types'
import { WIZARD_STEPS } from '../lib/steps'
import { useMetabaseConfig, useTestMetabase, useUpdateMetabase } from '../queries'
import { StoredSecret } from './secret-field'
import { FieldGroup, StepFooter, StepHeader, StepNav, useStepAccess, type StepNavProps } from './step-frame'

const STEP = WIZARD_STEPS[4]

export const METABASE_STATUS: Record<MetabaseConnectionStatus, { label: string; variant: NonNullable<BadgeProps['variant']>; tone: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  connected: { label: 'Connected', variant: 'success', tone: 'success' },
  unreachable: { label: 'Unreachable', variant: 'danger', tone: 'danger' },
  auth_failed: { label: 'Authentication failed', variant: 'danger', tone: 'danger' },
  not_configured: { label: 'Not configured', variant: 'outline', tone: 'neutral' },
}

function buildSchema(config: MetabaseConfig) {
  return z
    .object({
      site_url: z
        .string()
        .trim()
        .min(1, 'Enter the Metabase site URL.')
        .regex(/^https:\/\/[^\s/$.?#][^\s]*$/i, 'Enter an https:// URL such as https://metabase.yourcompany.com.'),
      embedding_secret: z.string(),
      replaceEmbedding: z.boolean(),
      api_key: z.string(),
      replaceApiKey: z.boolean(),
      default_collection_id: z
        .string()
        .trim()
        .refine((v) => v === '' || /^\d+$/.test(v), 'Collection id must be a whole number.'),
    })
    .superRefine((values, ctx) => {
      if ((!config.embedding_secret.is_set || values.replaceEmbedding) && !values.embedding_secret) {
        ctx.addIssue({ code: 'custom', path: ['embedding_secret'], message: 'Enter the embedding secret key from Metabase admin settings.' })
      }
      if ((!config.api_key.is_set || values.replaceApiKey) && !values.api_key) {
        ctx.addIssue({ code: 'custom', path: ['api_key'], message: 'Enter a Metabase API key.' })
      }
    })
}

type Values = z.infer<ReturnType<typeof buildSchema>>

const FIELDS = ['site_url', 'embedding_secret', 'api_key', 'default_collection_id'] as const

function toValues(config: MetabaseConfig): Values {
  return {
    site_url: config.site_url,
    embedding_secret: '',
    replaceEmbedding: false,
    api_key: '',
    replaceApiKey: false,
    default_collection_id: config.default_collection_id === null ? '' : String(config.default_collection_id),
  }
}

/** Shows the Metabase status exactly as reported; success only when status is "connected". */
function MetabaseStatusResult({ status }: { status: MetabaseStatus }) {
  const meta = METABASE_STATUS[status.status]
  const connected = status.status === 'connected'
  return (
    <Notice
      tone={meta.tone}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Metabase status
          <Badge variant={meta.variant}>{meta.label}</Badge>
          {status.version ? <span className="text-xs font-normal text-muted-foreground">version {status.version}</span> : null}
          <SimulatedBadge reason="Reported by the in-browser mock API, which cannot reach a Metabase instance." />
        </span>
      }
    >
      <p>{status.message ?? (connected ? 'Graphite can reach Metabase with these credentials.' : 'Graphite could not verify the connection.')}</p>
      {connected ? null : (
        <p className="mt-1">
          Your settings are saved. This step stays pending until the connection is verified; you can skip it and finish later from
          Settings.
        </p>
      )}
      {status.last_checked_at ? <p className="mt-1 text-xs text-subtle-foreground">Checked {formatDateTime(status.last_checked_at)}</p> : null}
    </Notice>
  )
}

function MetabaseForm({ config, allowed, done, nav, markDone }: { config: MetabaseConfig; allowed: boolean; done: boolean; nav: StepNavProps; markDone: () => Promise<boolean> }) {
  const { workspaceId } = useWorkspace()
  const form = useForm<Values>({ resolver: zodResolver(buildSchema(config)), defaultValues: toValues(config) })
  const { register, control, handleSubmit, formState, setValue, setError, reset } = form
  const replaceEmbedding = useWatch({ control, name: 'replaceEmbedding' })
  const replaceApiKey = useWatch({ control, name: 'replaceApiKey' })
  const save = useUpdateMetabase(workspaceId)
  const test = useTestMetabase(workspaceId)
  const [status, setStatus] = useState<MetabaseStatus | null>(null)

  const onSave = handleSubmit(async (values) => {
    setStatus(null)
    const payload: UpdateMetabaseConfigRequest = {
      site_url: values.site_url.replace(/\/+$/, ''),
      default_collection_id: values.default_collection_id ? Number(values.default_collection_id) : null,
      ...(values.embedding_secret && (!config.embedding_secret.is_set || values.replaceEmbedding) ? { embedding_secret: values.embedding_secret } : {}),
      ...(values.api_key && (!config.api_key.is_set || values.replaceApiKey) ? { api_key: values.api_key } : {}),
    }
    let updated: MetabaseConfig
    try {
      updated = await save.mutateAsync(payload)
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) toastError(error, 'Could not save the Metabase settings')
      return
    }
    // Secrets have been sent; clear them from form state.
    reset(toValues(updated))
    try {
      const result = await test.mutateAsync()
      setStatus(result)
      if (result.status === 'connected') {
        toastSuccess('Metabase connected')
        await markDone()
      }
    } catch (error) {
      toastError(error, 'Settings saved, but the connection test could not run')
    }
  })

  const busy = save.isPending || test.isPending

  return (
    <form onSubmit={onSave} noValidate>
      <fieldset disabled={!allowed} className="min-w-0 space-y-5">
        <FieldGroup
          title="Metabase"
          description="Graphite publishes reports to Metabase and requests signed embed URLs from it. Both keys are stored by the backend only."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Site URL" htmlFor="mb-url" required error={formState.errors.site_url?.message} className="sm:col-span-2">
              <Input type="url" inputMode="url" placeholder="https://metabase.yourcompany.com" autoComplete="off" spellCheck={false} {...register('site_url')} />
            </FormField>
            <FormField
              label="Embedding secret key"
              htmlFor="mb-embedding"
              required={!config.embedding_secret.is_set || replaceEmbedding}
              error={formState.errors.embedding_secret?.message}
              description="Admin settings, Embedding, Static embedding. Used by the backend to sign embed URLs."
            >
              <StoredSecret
                state={config.embedding_secret}
                replacing={replaceEmbedding}
                onReplacingChange={(next) => {
                  setValue('replaceEmbedding', next)
                  setValue('embedding_secret', '')
                }}
                disabled={!allowed}
              >
                <PasswordInput id="mb-embedding" autoComplete="new-password" data-1p-ignore {...register('embedding_secret')} />
              </StoredSecret>
            </FormField>
            <FormField
              label="API key"
              htmlFor="mb-api-key"
              required={!config.api_key.is_set || replaceApiKey}
              error={formState.errors.api_key?.message}
              description="Admin settings, Authentication, API keys. Used to publish reports."
            >
              <StoredSecret
                state={config.api_key}
                replacing={replaceApiKey}
                onReplacingChange={(next) => {
                  setValue('replaceApiKey', next)
                  setValue('api_key', '')
                }}
                disabled={!allowed}
              >
                <PasswordInput id="mb-api-key" autoComplete="new-password" data-1p-ignore {...register('api_key')} />
              </StoredSecret>
            </FormField>
            <FormField
              label="Default collection id"
              htmlFor="mb-collection"
              error={formState.errors.default_collection_id?.message}
              description="Optional. Collection where published reports are saved."
            >
              <Input inputMode="numeric" placeholder="7" autoComplete="off" {...register('default_collection_id')} />
            </FormField>
          </div>
        </FieldGroup>
      </fieldset>

      <div className="mt-4" aria-live="polite">
        {test.isPending ? <p className="text-sm text-muted-foreground">Checking the Metabase connection…</p> : null}
        {status ? <MetabaseStatusResult status={status} /> : null}
      </div>

      <StepFooter start={<StepNav {...nav} />}>
        {!done ? (
          <p className="text-xs text-muted-foreground sm:mr-2">Continue unlocks once Metabase reports Connected. You can skip this step for now.</p>
        ) : null}
        <Button type="submit" variant="outline" loading={busy} disabled={!allowed}>
          {busy ? null : <PlugZap className="size-4" aria-hidden />}
          Save and test
        </Button>
        <Button type="button" onClick={nav.onNext} disabled={!done}>
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </StepFooter>
    </form>
  )
}

export function AnalyticsStep({ nav, markDone }: { nav: StepNavProps; markDone: () => Promise<boolean> }) {
  const { workspaceId } = useWorkspace()
  const access = useStepAccess(STEP.permission, STEP.action)
  const config = useMetabaseConfig(workspaceId)
  const current = config.data ? METABASE_STATUS[config.data.status] : null

  return (
    <>
      <StepHeader stepKey="analytics" done={nav.done} actions={current ? <Badge variant={current.variant}>Metabase: {current.label}</Badge> : undefined} />
      {access.notice}
      {config.isLoading ? (
        <Skeleton className="h-72 w-full rounded-lg" aria-busy="true" aria-label="Loading Metabase settings" />
      ) : config.isError ? (
        <>
          <ErrorState error={config.error} title="Could not load the Metabase settings" onRetry={() => config.refetch()} />
          <StepFooter start={<StepNav {...nav} />} />
        </>
      ) : config.data ? (
        <MetabaseForm config={config.data} allowed={access.allowed} done={nav.done} nav={nav} markDone={markDone} />
      ) : null}
    </>
  )
}
