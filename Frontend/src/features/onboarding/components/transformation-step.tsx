import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Boxes, Check, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { ErrorState } from '@/components/feedback/states'
import { HealthIndicator } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { applyFieldErrors } from '@/features/auth/lib/form-errors'
import { useWorkspace } from '@/hooks/use-workspace'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { ConnectionTestResponse, DbtProjectConfig, UpdateDbtProjectRequest } from '@/types'
import { WIZARD_STEPS } from '../lib/steps'
import { useDbtProject, useTestDbt, useUpdateDbt } from '../queries'
import { SecretTextarea, StoredSecret } from './secret-field'
import { FieldGroup, StepFooter, StepHeader, StepNav, useStepAccess, type StepNavProps } from './step-frame'
import { SimpleTestResult } from './test-result'

const STEP = WIZARD_STEPS[3]

const DBT_VERSIONS = ['1.10', '1.9', '1.8']

/** Settings for the Graphite starter dbt project template. */
const STARTER = {
  repository_url: 'https://git.example.com/graphite/starter-dbt-project.git',
  branch: 'main',
  project_subdirectory: '',
  dbt_version: '1.10',
  target: 'prod',
  threads: '4',
}

const REPO_PATTERN = /^(https:\/\/[^\s]+|git@[^\s:]+:[^\s]+)$/

const schema = z.object({
  repository_url: z
    .string()
    .trim()
    .min(1, 'Enter the Git repository URL.')
    .regex(REPO_PATTERN, 'Use an https:// URL or an SSH address such as git@github.com:company/analytics.git.'),
  branch: z.string().trim().min(1, 'Enter the branch to deploy.').regex(/^[^\s]+$/, 'Branch names cannot contain spaces.'),
  project_subdirectory: z
    .string()
    .trim()
    .refine((v) => v === '' || (!v.startsWith('/') && !v.split('/').includes('..') && /^[\w./-]+$/.test(v)), 'Use a relative path inside the repository, such as dbt or analytics/dbt.'),
  dbt_version: z.string().min(1, 'Choose a dbt version.'),
  target: z
    .string()
    .trim()
    .min(1, 'Enter the dbt target name.')
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores, starting with a letter.'),
  threads: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Threads must be a whole number.')
    .refine((v) => Number(v) >= 1 && Number(v) <= 16, 'Use between 1 and 16 threads.'),
  deploy_key: z.string(),
  replaceKey: z.boolean(),
})

type Values = z.infer<typeof schema>

const FIELDS = ['repository_url', 'branch', 'project_subdirectory', 'dbt_version', 'target', 'threads', 'deploy_key'] as const

function toValues(dbt: DbtProjectConfig): Values {
  return {
    repository_url: dbt.repository_url,
    branch: dbt.branch || 'main',
    project_subdirectory: dbt.project_subdirectory,
    dbt_version: dbt.dbt_version || DBT_VERSIONS[0],
    target: dbt.target || 'prod',
    threads: String(dbt.threads || 4),
    deploy_key: '',
    replaceKey: false,
  }
}

function DbtForm({ dbt, allowed, done, nav, markDone }: { dbt: DbtProjectConfig; allowed: boolean; done: boolean; nav: StepNavProps; markDone: () => Promise<boolean> }) {
  const { workspaceId } = useWorkspace()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(dbt) })
  const { register, control, handleSubmit, formState, setValue, setError, reset, getValues } = form
  const replaceKey = useWatch({ control, name: 'replaceKey' })
  const save = useUpdateDbt(workspaceId)
  const test = useTestDbt(workspaceId)
  const [savedThisSession, setSavedThisSession] = useState(false)
  const [starterApplied, setStarterApplied] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResponse | null>(null)
  const versions = useMemo(() => (DBT_VERSIONS.includes(dbt.dbt_version) || !dbt.dbt_version ? DBT_VERSIONS : [dbt.dbt_version, ...DBT_VERSIONS]), [dbt.dbt_version])

  const applyStarter = () => {
    const current = getValues()
    reset({ ...current, ...STARTER }, { keepDefaultValues: true })
    setStarterApplied(true)
    toastInfo('Starter project settings filled in', 'Review them, then save.')
  }

  const onSave = handleSubmit(async (values) => {
    setTestResult(null)
    const payload: UpdateDbtProjectRequest = {
      repository_url: values.repository_url,
      branch: values.branch,
      project_subdirectory: values.project_subdirectory,
      dbt_version: values.dbt_version,
      target: values.target,
      threads: Number(values.threads),
      ...(values.deploy_key && (!dbt.deploy_key.is_set || values.replaceKey) ? { deploy_key: values.deploy_key } : {}),
    }
    try {
      const updated = await save.mutateAsync(payload)
      // The deploy key has been sent; remove it from form state immediately.
      reset(toValues(updated))
      setSavedThisSession(true)
      toastSuccess('dbt project settings saved')
    } catch (error) {
      if (!applyFieldErrors(error, setError, FIELDS)) toastError(error, 'Could not save the dbt project')
      return
    }
    try {
      const result = await test.mutateAsync()
      setTestResult(result)
      // The step only counts as done once the backend can check out and read the project.
      if (result.success) await markDone()
    } catch (error) {
      toastError(error, 'Settings saved, but the dbt project test could not run')
    }
  })

  const canContinue = (savedThisSession || done) && !formState.isDirty
  const hint = !allowed
    ? null
    : formState.isDirty || (!savedThisSession && !done)
      ? 'Save the project settings to continue.'
      : !done
        ? 'Saved. This step stays pending until the project test passes.'
        : null

  return (
    <form onSubmit={onSave} noValidate>
      <fieldset disabled={!allowed} className="min-w-0 space-y-5">
        <button
          type="button"
          onClick={applyStarter}
          className={cn(
            'flex w-full flex-col gap-3 rounded-lg border bg-background p-4 text-left transition-colors outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-row sm:items-center',
            starterApplied ? 'border-primary' : 'border-border',
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <Boxes className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Start from the Graphite starter project</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Pre-fills settings for a template project with staging, Silver and Gold model folders. Fork it into your own Git provider
              and replace the repository URL before running it in production.
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium">
            {starterApplied ? (
              <>
                <Check className="size-4" aria-hidden />
                Applied
              </>
            ) : (
              'Use starter settings'
            )}
          </span>
        </button>

        <FieldGroup title="dbt project" description="Graphite runs dbt from this repository to build Silver and Gold models in the warehouse.">
          <div className="grid gap-4 sm:grid-cols-6">
            <FormField label="Repository URL" htmlFor="dbt-repo" required error={formState.errors.repository_url?.message} className="sm:col-span-6">
              <Input className="font-mono text-[13px]" placeholder="git@github.com:company/analytics-dbt.git" autoComplete="off" spellCheck={false} {...register('repository_url')} />
            </FormField>
            <FormField label="Branch" htmlFor="dbt-branch" required error={formState.errors.branch?.message} className="sm:col-span-3">
              <Input className="font-mono text-[13px]" autoComplete="off" spellCheck={false} {...register('branch')} />
            </FormField>
            <FormField
              label="Project subdirectory"
              htmlFor="dbt-subdir"
              error={formState.errors.project_subdirectory?.message}
              description="Folder containing dbt_project.yml. Leave empty for the repository root."
              className="sm:col-span-3"
            >
              <Input className="font-mono text-[13px]" placeholder="dbt" autoComplete="off" spellCheck={false} {...register('project_subdirectory')} />
            </FormField>
            <FormField label="dbt version" htmlFor="dbt-version" required error={formState.errors.dbt_version?.message} className="sm:col-span-2">
              <Controller
                control={control}
                name="dbt_version"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!allowed}>
                    <SelectTrigger id="dbt-version" onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((version) => (
                        <SelectItem key={version} value={version}>
                          dbt Core {version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label="Target"
              htmlFor="dbt-target"
              required
              error={formState.errors.target?.message}
              className="sm:col-span-2"
              description={
                <span className="inline-flex items-center gap-1">
                  Profile target to run
                  <HelpTip label="About dbt targets">A dbt target selects connection settings from profiles.yml, for example dev or prod. Graphite generates the profile for the warehouse configured in step 2.</HelpTip>
                </span>
              }
            >
              <Input className="font-mono text-[13px]" autoComplete="off" spellCheck={false} {...register('target')} />
            </FormField>
            <FormField label="Threads" htmlFor="dbt-threads" required error={formState.errors.threads?.message} description="Models built in parallel." className="sm:col-span-2">
              <Input inputMode="numeric" autoComplete="off" {...register('threads')} />
            </FormField>
            <FormField
              label="Deploy key"
              htmlFor="dbt-deploy-key"
              error={formState.errors.deploy_key?.message}
              className="sm:col-span-6"
              description={
                dbt.deploy_key.is_set && !replaceKey
                  ? 'A deploy key is stored. It is never shown.'
                  : 'Read-only SSH private key for private repositories. Write-only: sent once and never shown again. Leave empty for public repositories.'
              }
            >
              <StoredSecret
                state={dbt.deploy_key}
                replacing={replaceKey}
                onReplacingChange={(next) => {
                  setValue('replaceKey', next)
                  setValue('deploy_key', '')
                }}
                disabled={!allowed}
              >
                <SecretTextarea id="dbt-deploy-key" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" {...register('deploy_key')} />
              </StoredSecret>
            </FormField>
          </div>
        </FieldGroup>
      </fieldset>

      <div className="mt-4" aria-live="polite">
        {test.isPending ? <p className="text-sm text-muted-foreground">Testing repository access and compiling the project…</p> : null}
        {testResult ? <SimpleTestResult result={testResult} subject="dbt project" /> : null}
      </div>

      <StepFooter start={<StepNav {...nav} />}>
        {hint ? <p className="text-xs text-muted-foreground sm:mr-2">{hint}</p> : null}
        <Button type="submit" variant="outline" loading={save.isPending || test.isPending} disabled={!allowed}>
          {save.isPending || test.isPending ? null : <Save className="size-4" aria-hidden />}
          Save and test
        </Button>
        <Button type="button" onClick={nav.onNext} disabled={!canContinue}>
          Continue
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </StepFooter>
    </form>
  )
}

export function TransformationStep({ nav, markDone }: { nav: StepNavProps; markDone: () => Promise<boolean> }) {
  const { workspaceId } = useWorkspace()
  const access = useStepAccess(STEP.permission, STEP.action)
  const dbt = useDbtProject(workspaceId)

  return (
    <>
      <StepHeader
        stepKey="transformation"
        done={nav.done}
        actions={dbt.data && dbt.data.status !== 'unknown' ? <HealthIndicator status={dbt.data.status} label={`dbt project ${dbt.data.status}`} /> : undefined}
      />
      {access.notice}
      {dbt.isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading dbt settings">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      ) : dbt.isError ? (
        <>
          <ErrorState error={dbt.error} title="Could not load the dbt project settings" onRetry={() => dbt.refetch()} />
          <StepFooter start={<StepNav {...nav} />} />
        </>
      ) : dbt.data ? (
        <DbtForm dbt={dbt.data} allowed={access.allowed} done={nav.done} nav={nav} markDone={markDone} />
      ) : null}
    </>
  )
}
