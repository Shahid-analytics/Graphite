import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Pipeline, Run, TriggerPipelineRunRequest } from '@/types'
import { useTriggerPipeline, useUpdatePipeline } from '../queries'
import { statusToggle } from './pipeline-state'

/** Triggers a pipeline run and reports the outcome. Resolves to the queued run, or null on failure. */
export function useRunPipelineAction() {
  const trigger = useTriggerPipeline()
  const run = async (pipeline: Pick<Pipeline, 'id' | 'name'>, payload: TriggerPipelineRunRequest = {}): Promise<Run | null> => {
    try {
      const created = await trigger.mutateAsync({ id: pipeline.id, payload })
      toastSuccess(
        `${pipeline.name} queued`,
        `${isMockMode ? 'Simulated run' : 'Run'} ${created.id}${payload.full_refresh ? ' (full refresh)' : ''} is waiting for a worker.`,
      )
      return created
    } catch (error) {
      toastError(error, `Could not start ${pipeline.name}`)
      return null
    }
  }
  return { run, isPending: trigger.isPending, pendingId: trigger.isPending ? trigger.variables?.id : undefined }
}

/** Pause, resume or activate a pipeline. */
export function useTogglePipelineStatus() {
  const update = useUpdatePipeline()
  const toggle = async (pipeline: Pick<Pipeline, 'id' | 'name' | 'status'>) => {
    const { next, done } = statusToggle(pipeline)
    try {
      await update.mutateAsync({ id: pipeline.id, payload: { status: next } })
      toastSuccess(
        `${pipeline.name} ${done}`,
        next === 'paused' ? 'Scheduled runs are skipped until the pipeline is resumed.' : 'Scheduled and manual runs are enabled.',
      )
    } catch (error) {
      toastError(error, `Could not update ${pipeline.name}`)
    }
  }
  return { toggle, isPending: update.isPending, pendingId: update.isPending ? update.variables?.id : undefined }
}
