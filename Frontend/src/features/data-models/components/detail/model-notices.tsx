import { Check } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { formatRelative } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { DataModel, SchemaChange } from '@/types'
import { describeSchemaChange, formatSla, SCHEMA_CHANGE_LABEL, unacknowledged } from '../../lib/labels'
import { useAcknowledgeSchemaChange } from '../../queries'
import { PermissionButton } from '../permission-button'

export function ModelNotices({ model, workspaceId, onShowQuality }: { model: DataModel; workspaceId: string; onShowQuality: () => void }) {
  const pending = unacknowledged(model)
  const stale = model.freshness_status === 'stale'
  const failing = model.quality.failed
  if (!pending.length && !stale && !failing) return null

  const upstreamLink = model.transformation_id
    ? { to: wsPath(workspaceId, 'transformations', model.transformation_id), label: 'Open transformation' }
    : model.source_id
      ? { to: wsPath(workspaceId, 'sources', model.source_id), label: 'Open source' }
      : null

  return (
    <div className="space-y-3">
      {pending.map((change) => (
        <SchemaChangeNotice key={change.id} model={model} change={change} />
      ))}
      {failing ? (
        <Notice
          tone="danger"
          title={`${failing} quality check${failing === 1 ? '' : 's'} failing`}
          action={
            <Button variant="outline" size="sm" onClick={onShowQuality}>
              View checks
            </Button>
          }
        >
          Downstream models and dashboards that read this table may show incorrect figures until the checks pass.
        </Notice>
      ) : null}
      {stale ? (
        <Notice
          tone="warning"
          title="Data is stale"
          action={
            upstreamLink ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={upstreamLink.to}>{upstreamLink.label}</Link>
              </Button>
            ) : null
          }
        >
          Last refreshed {model.last_refreshed_at ? formatRelative(model.last_refreshed_at) : 'never'}; the freshness SLA is {formatSla(model.freshness_sla_minutes)}.
          {model.layer === 'bronze' ? ' Check the source connection and its latest sync.' : ' Check the transformation and the runs that feed it.'}
        </Notice>
      ) : null}
    </div>
  )
}

function SchemaChangeNotice({ model, change }: { model: DataModel; change: SchemaChange }) {
  const canApprove = usePermission('models:approve')
  const acknowledge = useAcknowledgeSchemaChange(model.id)
  // mutateAsync rather than per-call callbacks: this notice unmounts as soon as the
  // updated model is cached, and per-call callbacks do not fire after unmount.
  const onAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(change.id)
      toastSuccess('Schema change acknowledged', `${SCHEMA_CHANGE_LABEL[change.change_type]}: ${change.column}`)
    } catch (error) {
      toastError(error, 'Could not acknowledge the schema change')
    }
  }
  return (
    <Notice
      tone="warning"
      title={`Schema change detected: ${SCHEMA_CHANGE_LABEL[change.change_type].toLowerCase()}`}
      action={
        <PermissionButton
          allowed={canApprove}
          reason="Acknowledging schema changes requires the models:approve permission (admin or owner)."
          variant="outline"
          size="sm"
          loading={acknowledge.isPending}
          onClick={onAcknowledge}
        >
          <Check aria-hidden />
          Acknowledge
        </PermissionButton>
      }
    >
      {describeSchemaChange(change)} Detected <TimeAgo value={change.detected_at} />. Review downstream Silver and Gold models before acknowledging.
    </Notice>
  )
}
