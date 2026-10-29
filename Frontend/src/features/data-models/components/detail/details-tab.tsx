import { CheckCircle2, GitCompareArrows } from 'lucide-react'
import { Link } from 'react-router'
import { CopyButton, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { Section } from '@/components/layout/page-header'
import { LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { wsPath } from '@/hooks/use-workspace'
import { formatDateTime } from '@/lib/format'
import type { DataModel } from '@/types'
import { describeSchemaChange, formatSla, MATERIALIZATION_LABEL, qualifiedName, ROLE_LABEL, SCHEMA_CHANGE_LABEL } from '../../lib/labels'
import { useLinkedSource, useLinkedTransformation } from '../../queries'

function LinkedSource({ workspaceId, sourceId }: { workspaceId: string; sourceId: string }) {
  const source = useLinkedSource(sourceId)
  return (
    <Link to={wsPath(workspaceId, 'sources', sourceId)} className="underline-offset-2 hover:underline">
      {source.data?.name ?? sourceId}
    </Link>
  )
}

function LinkedTransformation({ workspaceId, transformationId }: { workspaceId: string; transformationId: string }) {
  const transformation = useLinkedTransformation(transformationId)
  return (
    <Link to={wsPath(workspaceId, 'transformations', transformationId)} className="font-mono text-[13px] underline-offset-2 hover:underline">
      {transformation.data?.unique_id ?? transformationId}
    </Link>
  )
}

const none = <span className="text-subtle-foreground">None</span>

export function DetailsTab({ model, workspaceId }: { model: DataModel; workspaceId: string }) {
  const history = [...model.schema_changes].sort((a, b) => b.detected_at.localeCompare(a.detected_at))
  const fqn = `${model.database}.${qualifiedName(model)}`

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          {model.description ? <p className="text-sm text-muted-foreground">{model.description}</p> : null}
          <KeyValueGrid
            columns={3}
            items={[
              {
                label: 'Fully qualified name',
                value: (
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate font-mono text-[13px]">{fqn}</span>
                    <CopyButton value={fqn} label="Copy fully qualified name" className="size-6" />
                  </span>
                ),
              },
              { label: 'Database', value: model.database, mono: true },
              { label: 'Schema', value: model.schema, mono: true },
              { label: 'Layer', value: <LayerBadge layer={model.layer} /> },
              { label: 'Role', value: ROLE_LABEL[model.role] },
              { label: 'Materialization', value: MATERIALIZATION_LABEL[model.materialization] },
              { label: 'Owner', value: model.owner || none },
              {
                label: 'Tags',
                value: model.tags.length ? (
                  <span className="flex flex-wrap gap-1">
                    {model.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  none
                ),
              },
              model.layer === 'bronze'
                ? { label: 'Loaded from source', value: model.source_id ? <LinkedSource workspaceId={workspaceId} sourceId={model.source_id} /> : none }
                : { label: 'Built by transformation', value: model.transformation_id ? <LinkedTransformation workspaceId={workspaceId} transformationId={model.transformation_id} /> : none },
              {
                label: 'Last refreshed',
                value: model.last_refreshed_at ? (
                  <span>
                    {formatDateTime(model.last_refreshed_at)} <span className="text-muted-foreground">(<TimeAgo value={model.last_refreshed_at} />)</span>
                  </span>
                ) : (
                  'Never'
                ),
              },
              { label: 'Freshness SLA', value: formatSla(model.freshness_sla_minutes) },
              { label: 'Primary key', value: model.primary_key.length ? model.primary_key.join(', ') : none, mono: model.primary_key.length > 0 },
              { label: 'Business keys', value: model.business_keys.length ? model.business_keys.join(', ') : none, mono: model.business_keys.length > 0 },
            ]}
          />
        </CardContent>
      </Card>

      <Section title="Schema change history" description="Column changes detected in the upstream source when this table was loaded.">
        {history.length ? (
          <ol className="divide-y divide-border rounded-lg border border-border bg-background">
            {history.map((change) => (
              <li key={change.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <GitCompareArrows className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{SCHEMA_CHANGE_LABEL[change.change_type]}</span>
                    <span className="text-muted-foreground"> · {describeSchemaChange(change)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Detected <TimeAgo value={change.detected_at} />
                  </p>
                </div>
                {change.acknowledged ? (
                  <Badge variant="outline">
                    <CheckCircle2 aria-hidden />
                    Acknowledged
                  </Badge>
                ) : (
                  <Badge variant="warning">Needs review</Badge>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">No schema changes have been detected for this table.</p>
        )}
      </Section>
    </div>
  )
}
