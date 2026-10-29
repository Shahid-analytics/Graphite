import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { DisabledReason } from '@/components/runs/disabled-reason'
import { StageFlow } from '@/components/runs/stage-flow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastSuccess } from '@/lib/toast'
import { errorMessage } from '@/services/api-error'
import { PipelineFormFields } from '../components/pipeline-form-fields'
import { applyFieldErrors, EMPTY_PIPELINE, PIPELINE_FIELDS, pipelineSchema, plannedStages, type PipelineFormValues } from '../lib/form'
import { useCreatePipeline, useWorkspaceSources } from '../queries'

export default function NewPipelinePage() {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const canWrite = usePermission('pipelines:write')
  const sources = useWorkspaceSources(workspaceId)
  const create = useCreatePipeline(workspaceId)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PipelineFormValues>({ resolver: zodResolver(pipelineSchema), defaultValues: EMPTY_PIPELINE })
  const [quality, metabase, sourceIds, selector] = useWatch({
    control: form.control,
    name: ['quality_checks_enabled', 'metabase_refresh_enabled', 'source_ids', 'dbt_selector'],
  })
  const stages = plannedStages({ quality_checks_enabled: quality, metabase_refresh_enabled: metabase })
  const selectedSources = (sources.data ?? []).filter((s) => sourceIds.includes(s.id))
  const noSources = sources.isSuccess && sources.data.length === 0

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      const pipeline = await create.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        source_ids: values.source_ids,
        dbt_selector: values.dbt_selector,
        quality_checks_enabled: values.quality_checks_enabled,
        metabase_refresh_enabled: values.metabase_refresh_enabled,
      })
      toastSuccess(`${pipeline.name} created`, 'Run it now or attach a schedule from the pipeline page.')
      navigate(wsPath(workspaceId, 'pipelines', pipeline.id))
    } catch (error) {
      if (applyFieldErrors(error, form.setError, PIPELINE_FIELDS)) return
      setFormError(errorMessage(error, 'Could not create the pipeline.'))
    }
  })

  const blocked = !canWrite ? 'Creating pipelines requires the "pipelines:write" permission (admin or owner).' : noSources ? 'Connect a source first.' : null

  return (
    <div>
      <PageHeader
        title="Create pipeline"
        description="Choose the sources to ingest and the dbt models to build. Quality checks and the Metabase refresh are optional."
        breadcrumbs={[{ label: 'Pipelines & Sync Jobs', to: wsPath(workspaceId, 'pipelines') }, { label: 'New pipeline' }]}
      />

      {!canWrite ? (
        <Notice tone="warning" title="You can view this form but not save it" className="mb-5">
          Your role does not include the pipelines:write permission. Ask a workspace admin or owner to create the pipeline, or to change your role.
        </Notice>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="pt-5">
            <PipelineFormFields form={form} sources={sources} workspaceId={workspaceId} disabled={!canWrite} />
            {formError ? (
              <Notice tone="danger" title="The pipeline was not created" className="mt-5">
                {formError}
              </Notice>
            ) : null}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link to={wsPath(workspaceId, 'pipelines')}>Cancel</Link>
            </Button>
            <DisabledReason reason={blocked}>
              <Button type="submit" loading={form.formState.isSubmitting} disabled={Boolean(blocked)}>
                Create pipeline
              </Button>
            </DisabledReason>
          </CardFooter>
        </Card>

        <Card className="lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Preview
              <HelpTip label="About the preview">Stages each run of this pipeline executes, in order. Excluded stages are shown dashed.</HelpTip>
            </CardTitle>
            <CardDescription>Updates as you change the form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StageFlow planned={stages} size="sm" label="Planned stages" className="lg:hidden" />
            <StageFlow planned={stages} size="sm" orientation="vertical" label="Planned stages" className="hidden lg:flex" />
            <p className="text-xs text-muted-foreground">
              {stages.length} of 7 stages per run.
              {!quality ? ' Without quality checks, untested data reaches dashboards.' : ''}
              {metabase && isMockMode ? ' In demo mode Metabase cannot be reached, so simulated runs skip the refresh.' : ''}
            </p>
            <dl className="grid gap-2 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Sources</dt>
                <dd>{selectedSources.length ? selectedSources.map((s) => s.name).join(', ') : <span className="text-subtle-foreground">None selected</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">dbt selector</dt>
                <dd className="font-mono text-[13px] break-all">{selector?.trim() || <span className="font-sans text-subtle-foreground">Not set</span>}</dd>
              </div>
            </dl>
            {selectedSources.some((s) => s.health === 'unhealthy') ? (
              <Notice tone="warning">At least one selected source is unhealthy; runs will fail at Source connection until it is fixed.</Notice>
            ) : null}
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
