import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toastSuccess } from '@/lib/toast'
import { errorMessage } from '@/services/api-error'
import type { Pipeline, UpdatePipelineRequest } from '@/types'
import { applyFieldErrors, PIPELINE_FIELDS, pipelineSchema, valuesFromPipeline, type PipelineFormValues } from '../lib/form'
import { useUpdatePipeline, useWorkspaceSources } from '../queries'
import { PipelineFormFields } from './pipeline-form-fields'

/** Edits a pipeline's configuration. Only changed fields are sent. Mount it only while open. */
export function EditPipelineDialog({ pipeline, onOpenChange }: { pipeline: Pipeline; onOpenChange: (open: boolean) => void }) {
  const sources = useWorkspaceSources(pipeline.workspace_id)
  const update = useUpdatePipeline()
  const [formError, setFormError] = useState<string | null>(null)
  const initial = valuesFromPipeline(pipeline)
  const form = useForm<PipelineFormValues>({ resolver: zodResolver(pipelineSchema), defaultValues: initial })

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    const payload: UpdatePipelineRequest = {}
    for (const key of PIPELINE_FIELDS) {
      if (JSON.stringify(values[key]) !== JSON.stringify(initial[key])) Object.assign(payload, { [key]: values[key] })
    }
    if (!Object.keys(payload).length) {
      onOpenChange(false)
      return
    }
    try {
      const saved = await update.mutateAsync({ id: pipeline.id, payload })
      toastSuccess(`${saved.name} saved`, 'Changes apply from the next run. Runs in progress keep their original configuration.')
      onOpenChange(false)
    } catch (error) {
      if (applyFieldErrors(error, form.setError, PIPELINE_FIELDS)) return
      setFormError(errorMessage(error, 'Could not save the pipeline.'))
    }
  })

  return (
    <Dialog open onOpenChange={(open) => !form.formState.isSubmitting && onOpenChange(open)}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Edit pipeline</DialogTitle>
            <DialogDescription>Changes are recorded in the audit trail and apply from the next run.</DialogDescription>
          </DialogHeader>
          <PipelineFormFields form={form} sources={sources} workspaceId={pipeline.workspace_id} />
          {formError ? (
            <Notice tone="danger" title="Changes were not saved">
              {formError}
            </Notice>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
