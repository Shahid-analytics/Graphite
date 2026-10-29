import { ArrowUpRight, Pencil } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CopyButton, HelpTip, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { Section } from '@/components/layout/page-header'
import { LayerBadge, RunStatusBadge } from '@/components/status/status-badge'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import type { DataModel, DbtProject, Transformation, TransformationSummary } from '@/types'
import { MATERIALIZATION_HELP, TYPE_LABELS } from '../lib/labels'
import { useTransformations, useWorkspaceModels } from '../queries'
import { EditDescriptionDialog } from './edit-description-dialog'
import { GatedButton, PERMISSION_REASONS } from './gated-button'

interface Ref {
  id: string
  label: string
  to: string | null
  badge: string | null
}

function resolveRef(workspaceId: string, id: string, transformations: Map<string, TransformationSummary>, models: Map<string, DataModel>): Ref {
  const t = transformations.get(id)
  if (t) return { id, label: t.name, to: wsPath(workspaceId, 'transformations', t.id), badge: t.type }
  const m = models.get(id)
  if (m) return { id, label: `${m.schema}.${m.name}`, to: wsPath(workspaceId, 'models', m.id), badge: m.layer }
  if (id.startsWith('mdl_')) return { id, label: id, to: resourcePath(workspaceId, 'model', id), badge: null }
  if (id.startsWith('src_')) return { id, label: id, to: resourcePath(workspaceId, 'source', id), badge: 'source' }
  return { id, label: id, to: null, badge: null }
}

function RefList({ refs, empty }: { refs: Ref[]; empty: string }) {
  if (!refs.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {refs.map((ref) => (
        <li key={ref.id} className="flex items-center gap-2 px-3 py-2">
          {ref.badge ? <LayerBadge layer={ref.badge} /> : null}
          {ref.to ? (
            <Link to={ref.to} className="min-w-0 truncate font-mono text-[13px] hover:underline">
              {ref.label}
            </Link>
          ) : (
            <span className="min-w-0 truncate font-mono text-[13px]">{ref.label}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

function Labelled({ children, help }: { children: ReactNode; help: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <HelpTip>{help}</HelpTip>
    </span>
  )
}

export function DetailsTab({
  workspaceId,
  transformation: t,
  project,
}: {
  workspaceId: string
  transformation: Transformation
  project: DbtProject | undefined
}) {
  const canWrite = usePermission('transformations:write')
  const [editing, setEditing] = useState(false)
  const transformations = useTransformations(workspaceId)
  const models = useWorkspaceModels(workspaceId)

  const byId = useMemo(() => new Map((transformations.data ?? []).map((x) => [x.id, x])), [transformations.data])
  const modelsById = useMemo(() => new Map((models.data ?? []).map((m) => [m.id, m])), [models.data])
  const dependsOn = t.depends_on.map((id) => resolveRef(workspaceId, id, byId, modelsById))
  const referencedBy = (transformations.data ?? [])
    .filter((x) => x.depends_on.includes(t.id))
    .map((x) => resolveRef(workspaceId, x.id, byId, modelsById))
  const output = t.output_model_id ? modelsById.get(t.output_model_id) : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Section
          title="Description"
          action={
            <GatedButton allowed={canWrite} reason={PERMISSION_REASONS.write} variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </GatedButton>
          }
        >
          <p className="text-sm text-muted-foreground">{t.description || 'No description yet.'}</p>
        </Section>

        <Section title="Model">
          <KeyValueGrid
            items={[
              {
                label: 'dbt unique ID',
                value: (
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate font-mono text-[13px]">{t.unique_id}</span>
                    <CopyButton value={t.unique_id} label="Copy unique ID" className="size-6" />
                  </span>
                ),
              },
              { label: 'Project', value: project?.name ?? t.project_id, mono: true },
              { label: 'Schema', value: t.schema, mono: true },
              { label: 'Type', value: TYPE_LABELS[t.type] },
              { label: <Labelled help={MATERIALIZATION_HELP[t.materialization]}>Materialization</Labelled>, value: t.materialization },
              { label: 'Owner', value: t.owner },
              { label: 'Last changed', value: <TimeAgo value={t.updated_at} /> },
              {
                label: 'Last run',
                value: (
                  <span className="inline-flex items-center gap-2">
                    <RunStatusBadge status={t.last_run_status} />
                    <TimeAgo value={t.last_run_at} className="text-muted-foreground" />
                  </span>
                ),
              },
              { label: 'Last run duration', value: formatDuration(t.last_run_duration_seconds) },
              { label: 'Tags', value: t.tags.length ? t.tags.join(', ') : 'None' },
            ]}
          />
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Output model" description="Warehouse relation built by this model.">
          {t.output_model_id ? (
            <Link
              to={wsPath(workspaceId, 'models', t.output_model_id)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-surface"
            >
              {output ? <LayerBadge layer={output.layer} /> : null}
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{output ? `${output.schema}.${output.name}` : `${t.schema}.${t.name}`}</span>
              <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">This model is ephemeral and does not build a relation.</p>
          )}
        </Section>
        <Section title="Depends on" description="Upstream models and Bronze tables read with ref() or source().">
          <RefList refs={dependsOn} empty="No upstream dependencies." />
        </Section>
        <Section title="Referenced by" description="Downstream dbt models that read from this one.">
          <RefList refs={referencedBy} empty="No downstream models in this project." />
        </Section>
      </div>

      <EditDescriptionDialog transformation={t} open={editing} onOpenChange={setEditing} />
    </div>
  )
}
