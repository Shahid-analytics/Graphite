import { zodResolver } from '@hookform/resolvers/zod'
import { GitBranch, PlugZap } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip, TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { HealthIndicator } from '@/components/status/status-badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import type { ConnectionTestResponse, DbtProjectConfig, UpdateDbtProjectRequest } from '@/types'
import { FormFooter } from '../components/form-footer'
import { GatedButton } from '../components/gated-button'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SecretField } from '../components/secret-field'
import { SectionSkeleton } from '../components/section-skeleton'
import { SelectField } from '../components/select-field'
import { TestResult } from '../components/test-result'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { PERMISSION_REASON } from '../lib/labels'
import { EMPTY_SECRET, secretDraftSchema, secretError, secretPayload } from '../lib/secrets'
import { useDbtConfig, useTestDbt, useUpdateDbt } from '../queries'

const SSH_REPO = /^(?:ssh:\/\/[\w.-]+@[\w.-]+(?::\d+)?\/[\w./-]+|[\w.-]+@[\w.-]+:[\w./-]+)$/
const DBT_VERSIONS = ['1.8', '1.9', '1.10']

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const schema = z.object({
  repository_url: z
    .string()
    .trim()
    .min(1, 'Enter the Git repository URL of the dbt project.')
    .refine((v) => isHttpsUrl(v) || SSH_REPO.test(v), 'Use an HTTPS URL (https://git.example.com/org/repo.git) or an SSH address (git@git.example.com:org/repo.git).'),
  branch: z
    .string()
    .trim()
    .min(1, 'Enter the branch to deploy, for example main.')
    .regex(/^(?!-)(?!\/)[A-Za-z0-9._/-]+$/, 'Enter a valid Git branch name.')
    .refine((v) => !v.includes('..') && !v.endsWith('/'), 'Enter a valid Git branch name.'),
  project_subdirectory: z
    .string()
    .trim()
    .refine((v) => !v || (/^[\w./-]+$/.test(v) && !v.startsWith('/') && !v.split('/').includes('..')), 'Use a relative path inside the repository, such as dbt.'),
  dbt_version: z.string().min(1, 'Choose a dbt version.'),
  target: z
    .string()
    .trim()
    .min(1, 'Enter the dbt target, for example prod.')
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores, starting with a letter.'),
  threads: z.number({ error: 'Enter a number of threads.' }).int('Threads must be a whole number.').min(1, 'Use between 1 and 16 threads.').max(16, 'Use between 1 and 16 threads.'),
  deploy_key: secretDraftSchema,
})

type FormValues = z.infer<typeof schema>

const FIELDS = ['repository_url', 'branch', 'project_subdirectory', 'dbt_version', 'target', 'threads', 'deploy_key'] as const

const toValues = (d: DbtProjectConfig): FormValues => ({
  repository_url: d.repository_url,
  branch: d.branch,
  project_subdirectory: d.project_subdirectory,
  dbt_version: d.dbt_version,
  target: d.target,
  threads: d.threads,
  deploy_key: EMPTY_SECRET,
})

function toPayload(values: FormValues): UpdateDbtProjectRequest {
  const deployKey = secretPayload(values.deploy_key)
  return {
    repository_url: values.repository_url.trim(),
    branch: values.branch.trim(),
    project_subdirectory: values.project_subdirectory.trim(),
    dbt_version: values.dbt_version,
    target: values.target.trim(),
    threads: values.threads,
    ...(deployKey !== undefined ? { deploy_key: deployKey } : {}),
  }
}

function statusLabel(d: DbtProjectConfig) {
  if (!d.repository_url) return 'Not configured'
  if (d.status === 'healthy') return 'Repository reachable'
  if (d.status === 'unhealthy') return 'Repository check failed'
  return 'Not checked since last change'
}

function DbtForm({ workspaceId, config, canEdit }: { workspaceId: string; config: DbtProjectConfig; canEdit: boolean }) {
  const update = useUpdateDbt(workspaceId)
  const test = useTestDbt(workspaceId)
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(config) })
  const { errors, isDirty } = form.formState
  const [repo, deployKey] = useWatch({ control: form.control, name: ['repository_url', 'deploy_key'] })
  const sshRepo = SSH_REPO.test(repo.trim())
  const versions = DBT_VERSIONS.includes(config.dbt_version) ? DBT_VERSIONS : [...DBT_VERSIONS, config.dbt_version]

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(toPayload(values))
      form.reset(toValues(saved))
      setTestResult(null)
      toastSuccess('dbt project saved', 'Test the repository to confirm Graphite can check it out.')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not save the dbt project')
    }
  })

  const runTest = async () => {
    try {
      setTestResult(await test.mutateAsync())
    } catch (error) {
      toastError(error, 'Could not run the repository check')
    }
  }

  const testBlocked = !canEdit ? PERMISSION_REASON.settings : isDirty ? 'Save your changes before testing' : !config.repository_url ? 'Save a repository URL first' : null

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" aria-hidden />
          Repository
        </CardTitle>
        <CardDescription>The Git repository that contains dbt_project.yml, models and tests.</CardDescription>
        <CardAction className="flex flex-col items-end gap-0.5">
          <HealthIndicator status={config.status} label={statusLabel(config)} />
          {config.last_compiled_at ? (
            <span className="text-xs text-muted-foreground">
              Last compiled <TimeAgo value={config.last_compiled_at} />
            </span>
          ) : null}
        </CardAction>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-6">
            <FormField label="Repository URL" htmlFor="dbt-repo" error={errors.repository_url?.message} required className="sm:col-span-6">
              <Input className="font-mono text-[13px]" placeholder="https://git.example.com/org/analytics-dbt.git" autoComplete="off" spellCheck={false} {...form.register('repository_url')} />
            </FormField>
            <FormField label="Branch" htmlFor="dbt-branch" error={errors.branch?.message} required className="sm:col-span-2">
              <Input className="font-mono text-[13px]" autoComplete="off" spellCheck={false} {...form.register('branch')} />
            </FormField>
            <FormField
              label="Project subdirectory"
              htmlFor="dbt-subdir"
              description="Leave empty when dbt_project.yml is at the repository root."
              error={errors.project_subdirectory?.message}
              className="sm:col-span-4"
            >
              <Input className="font-mono text-[13px]" placeholder="dbt" autoComplete="off" spellCheck={false} {...form.register('project_subdirectory')} />
            </FormField>
            <div className="sm:col-span-2">
              <Controller
                control={form.control}
                name="dbt_version"
                render={({ field }) => (
                  <SelectField
                    id="dbt-version"
                    label="dbt Core version"
                    error={errors.dbt_version?.message}
                    required
                    value={field.value}
                    onValueChange={field.onChange}
                    options={versions.map((v) => ({ value: v, label: `dbt Core ${v}` }))}
                    disabled={!canEdit}
                  />
                )}
              />
            </div>
            <FormField
              label="Target"
              htmlFor="dbt-target"
              description={
                <span className="inline-flex items-center gap-1">
                  The profile target the runner uses.
                  <HelpTip label="About dbt targets">
                    A dbt target selects connection settings from profiles.yml. The backend generates the profile from the warehouse connection, so the target
                    name only labels the environment (for example prod or dev).
                  </HelpTip>
                </span>
              }
              error={errors.target?.message}
              required
              className="sm:col-span-2"
            >
              <Input className="font-mono text-[13px]" autoComplete="off" spellCheck={false} {...form.register('target')} />
            </FormField>
            <FormField
              label="Threads"
              htmlFor="dbt-threads"
              description="Models built in parallel (1-16)."
              error={errors.threads?.message}
              required
              className="sm:col-span-2"
            >
              <Input type="number" inputMode="numeric" min={1} max={16} {...form.register('threads', { valueAsNumber: true })} />
            </FormField>
            <div className="sm:col-span-6">
              <Controller
                control={form.control}
                name="deploy_key"
                render={({ field }) => (
                  <SecretField
                    id="dbt-deploy-key"
                    label="Deploy key"
                    state={config.deploy_key}
                    value={field.value}
                    onChange={field.onChange}
                    error={secretError(errors.deploy_key)}
                    disabled={!canEdit}
                    multiline
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    description={
                      sshRepo
                        ? 'Required for SSH repositories. Paste the private half of a read-only deploy key; add the public half to the repository.'
                        : 'Only needed for SSH repository URLs. HTTPS repositories use the access configured on the backend runner.'
                    }
                  />
                )}
              />
            </div>
            {sshRepo && !config.deploy_key.is_set && !deployKey.value.trim() ? (
              <Notice tone="warning" className="sm:col-span-6">
                SSH repositories need a deploy key. Without one, the backend runner cannot check out the project.
              </Notice>
            ) : null}
            <TestResult result={testResult} className="sm:col-span-6" />
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
              Test repository
            </GatedButton>
          }
        />
      </form>
    </Card>
  )
}

export default function DbtSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const dbt = useDbtConfig(workspaceId)

  return (
    <div className="space-y-6">
      <Section
        title="dbt project"
        description="Graphite runs your dbt project on the backend runner to build Silver and Gold models and execute data quality tests."
      >
        {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
        {dbt.isLoading ? (
          <SectionSkeleton fields={7} />
        ) : dbt.isError ? (
          <ErrorState error={dbt.error} onRetry={() => dbt.refetch()} />
        ) : dbt.data ? (
          <DbtForm key={workspaceId} workspaceId={workspaceId} config={dbt.data} canEdit={canEdit} />
        ) : null}
      </Section>
      <Notice tone="neutral" title="Where dbt runs">
        dbt never runs in the browser. The backend checks out the configured branch, generates the connection profile from the warehouse settings and runs
        models and tests on its own workers. Run history and logs appear on each transformation.
      </Notice>
    </div>
  )
}
