import { Link } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { StatusDot } from '@/components/status/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { HealthStatus, Pipeline, RunStatus, ScheduleTargetType, Source, TransformationSummary } from '@/types'
import { TARGET_META } from '../lib/schedule-utils'
import { useScheduleTargets } from '../queries'

type Tone = 'success' | 'warning' | 'danger' | 'running' | 'neutral'

interface TargetOption {
  id: string
  name: string
  tone: Tone
  status: string
  meta: string
  /** Shown as a warning notice when this target is selected. */
  warning: string | null
}

function runTone(status: RunStatus | null | undefined): Tone {
  if (status === 'succeeded') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running' || status === 'queued') return 'running'
  return 'neutral'
}

const HEALTH_TONE: Record<HealthStatus, Tone> = { healthy: 'success', degraded: 'warning', unhealthy: 'danger', paused: 'neutral', unknown: 'neutral' }

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

function fromPipeline(p: Pipeline): TargetOption {
  const inactive = p.status !== 'active'
  return {
    id: p.id,
    name: p.name,
    tone: inactive ? 'neutral' : runTone(p.last_run?.status),
    status: inactive ? capitalise(p.status) : p.last_run ? `Last run ${p.last_run.status}` : 'Never run',
    meta: `${p.source_ids.length} ${p.source_ids.length === 1 ? 'source' : 'sources'} · dbt selector ${p.dbt_selector}`,
    warning: inactive
      ? `This pipeline is ${p.status}. The backend scheduler skips runs for inactive pipelines, and Run now is unavailable until it is activated.`
      : p.last_run?.status === 'failed' && p.last_run.error_message
        ? `The last run failed: ${p.last_run.error_message} Scheduled runs will fail the same way until the cause is fixed.`
        : null,
  }
}

function fromSource(s: Source): TargetOption {
  const inactive = s.status === 'paused' || s.status === 'draft'
  return {
    id: s.id,
    name: s.name,
    tone: inactive ? 'neutral' : HEALTH_TONE[s.health],
    status: inactive ? capitalise(s.status) : capitalise(s.health),
    meta: `${capitalise(s.connector_type)} · ${s.selected_tables.length} ${s.selected_tables.length === 1 ? 'table' : 'tables'} into ${s.destination_schema}`,
    warning: inactive
      ? `This source is ${s.status}. The backend scheduler skips syncs for it until it is resumed.`
      : s.health !== 'healthy' && s.health_message
        ? `${capitalise(s.health)}: ${s.health_message}`
        : null,
  }
}

function fromTransformation(t: TransformationSummary): TargetOption {
  return {
    id: t.id,
    name: t.name,
    tone: runTone(t.last_run_status),
    status: t.last_run_status ? `Last run ${t.last_run_status}` : 'Never run',
    meta: `${capitalise(t.type)} · ${t.materialization} · ${t.schema}`,
    warning: t.last_run_status === 'failed' ? 'The last dbt run of this model failed. Scheduled runs will fail until the model is fixed.' : null,
  }
}

const CREATE_LINK: Record<ScheduleTargetType, { path: string[]; label: string }> = {
  pipeline: { path: ['pipelines', 'new'], label: 'Create a pipeline' },
  source_sync: { path: ['sources', 'new'], label: 'Connect a source' },
  transformation: { path: ['transformations'], label: 'Open transformations' },
}

export function TargetPicker({
  type,
  value,
  onChange,
  id,
  invalid,
  describedBy,
}: {
  type: ScheduleTargetType
  value: string
  onChange: (value: string) => void
  id: string
  invalid?: boolean
  describedBy?: string
}) {
  const { workspaceId } = useWorkspace()
  const { pipelines, sources, transformations } = useScheduleTargets(workspaceId, type)
  const query = type === 'pipeline' ? pipelines : type === 'source_sync' ? sources : transformations
  const meta = TARGET_META[type]

  const options: TargetOption[] =
    type === 'pipeline'
      ? (pipelines.data ?? []).map(fromPipeline)
      : type === 'source_sync'
        ? (sources.data ?? []).map(fromSource)
        : (transformations.data ?? []).map(fromTransformation)

  if (query.isLoading) return <Skeleton className="h-9 w-full" aria-label={`Loading ${meta.noun}s`} />
  if (query.isError) {
    return <ErrorState compact error={query.error} title={`Could not load ${meta.noun}s`} onRetry={() => void query.refetch()} />
  }
  if (!options.length) {
    const create = CREATE_LINK[type]
    return (
      <Notice
        tone="neutral"
        title={`No ${meta.noun}s in this workspace`}
        action={
          <Link to={wsPath(workspaceId, ...create.path)} className="text-sm font-medium underline-offset-4 hover:underline">
            {create.label}
          </Link>
        }
      >
        Create one first, then come back to schedule it.
      </Notice>
    )
  }

  const selected = options.find((o) => o.id === value)
  // A target that no longer exists still shows as the current value when editing.
  const missing = Boolean(value) && !selected

  return (
    <div className="space-y-2">
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid || undefined} aria-describedby={describedBy}>
          <SelectValue placeholder={`Select a ${meta.noun}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              <StatusDot tone={option.tone} />
              <span className="truncate">{option.name}</span>
              <span className="text-xs text-muted-foreground">{option.status}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? <p className="text-xs text-muted-foreground">{selected.meta}</p> : null}
      {selected?.warning ? <Notice tone="warning">{selected.warning}</Notice> : null}
      {missing ? (
        <Notice tone="danger">
          The current target ({value}) no longer exists in this workspace. Choose a new {meta.noun} to keep this schedule working.
        </Notice>
      ) : null}
    </div>
  )
}
