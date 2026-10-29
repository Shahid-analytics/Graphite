import type { Pipeline, PipelineStatus } from '@/types'
import { isTerminal } from '@/types'

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  draft: 'Draft',
}

export function hasActiveRun(pipeline: Pick<Pipeline, 'last_run'>) {
  return Boolean(pipeline.last_run && !isTerminal(pipeline.last_run.status))
}

/** Why "Run now" is unavailable, or null when the pipeline can run. */
export function runBlockedReason(pipeline: Pick<Pipeline, 'status' | 'last_run'>, canRun: boolean): string | null {
  if (!canRun) return 'Your role does not include the "pipelines:run" permission.'
  if (pipeline.status === 'draft') return 'Draft pipelines cannot run. Activate the pipeline first.'
  if (pipeline.status === 'paused') return 'This pipeline is paused. Resume it to run.'
  if (hasActiveRun(pipeline)) return 'A run is already in progress for this pipeline.'
  return null
}

/** The status transition offered by the Pause / Resume / Activate control. */
export function statusToggle(pipeline: Pick<Pipeline, 'status'>): { next: PipelineStatus; label: string; done: string } {
  if (pipeline.status === 'active') return { next: 'paused', label: 'Pause', done: 'paused' }
  if (pipeline.status === 'draft') return { next: 'active', label: 'Activate', done: 'activated' }
  return { next: 'active', label: 'Resume', done: 'resumed' }
}
