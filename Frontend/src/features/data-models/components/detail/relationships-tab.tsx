import { ArrowRight, Link2 } from 'lucide-react'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { Section } from '@/components/layout/page-header'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { wsPath } from '@/hooks/use-workspace'
import type { DataModel, Relationship } from '@/types'
import { CARDINALITY_LABEL } from '../../lib/labels'
import { useModelRelationships } from '../../queries'

function Endpoint({ workspaceId, modelId, model, column, current }: { workspaceId: string; modelId: string; model: string; column: string; current: boolean }) {
  const label = (
    <>
      <span className={current ? 'text-muted-foreground' : 'font-medium'}>{model}</span>
      <span className="text-muted-foreground">.</span>
      <span>{column}</span>
    </>
  )
  if (current) return <span className="font-mono text-xs">{label}</span>
  return (
    <Link to={wsPath(workspaceId, 'models', modelId)} className="font-mono text-xs underline-offset-2 hover:underline">
      {label}
    </Link>
  )
}

function buildColumns(workspaceId: string, modelId: string): Column<Relationship>[] {
  return [
    {
      id: 'from',
      header: 'From',
      sortValue: (r) => `${r.from_model}.${r.from_column}`,
      cell: (r) => <Endpoint workspaceId={workspaceId} modelId={r.from_model_id} model={r.from_model} column={r.from_column} current={r.from_model_id === modelId} />,
    },
    { id: 'arrow', header: <span className="sr-only">Direction</span>, cell: () => <ArrowRight className="size-3.5 text-subtle-foreground" aria-label="references" />, className: 'w-8' },
    {
      id: 'to',
      header: 'To',
      sortValue: (r) => `${r.to_model}.${r.to_column}`,
      cell: (r) => <Endpoint workspaceId={workspaceId} modelId={r.to_model_id} model={r.to_model} column={r.to_column} current={r.to_model_id === modelId} />,
    },
    { id: 'cardinality', header: 'Cardinality', sortValue: (r) => r.cardinality, cell: (r) => <Badge variant="outline">{CARDINALITY_LABEL[r.cardinality]}</Badge>, hideOnMobile: true },
  ]
}

export function RelationshipsTab({ model, workspaceId }: { model: DataModel; workspaceId: string }) {
  const query = useModelRelationships(model.id)
  if (query.isPending) return <TableSkeleton rows={4} columns={4} />
  if (query.isError) return <ErrorState error={query.error} title="Could not load relationships" onRetry={() => query.refetch()} />
  if (!query.data.length) {
    return (
      <EmptyState
        compact
        icon={Link2}
        title="No relationships"
        description={
          model.layer === 'bronze'
            ? 'Bronze tables are stored as loaded. Relationships are declared on the Silver and Gold models built from them.'
            : 'No foreign keys reference this model and it does not reference other models. Relationships can be added through a schema proposal.'
        }
      />
    )
  }

  const columns = buildColumns(workspaceId, model.id)
  const outgoing = query.data.filter((r) => r.from_model_id === model.id)
  const incoming = query.data.filter((r) => r.to_model_id === model.id && r.from_model_id !== model.id)

  return (
    <div className="space-y-6">
      <Section
        title={`References (${outgoing.length})`}
        description={
          <span className="inline-flex items-center gap-1">
            Columns in this model that point at another model.
            <HelpTip label="About relationships">
              A relationship is a foreign key: each value in the "from" column should exist in the "to" column. Many to one means many rows here share one row there, as with facts pointing at dimensions.
            </HelpTip>
          </span>
        }
      >
        {outgoing.length ? (
          <DataTable columns={columns} rows={outgoing} getRowId={(r) => `${r.from_model_id}.${r.from_column}->${r.to_model_id}.${r.to_column}`} caption="Outgoing relationships" />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">This model does not reference other models.</p>
        )}
      </Section>
      <Section title={`Referenced by (${incoming.length})`} description="Models with a foreign key pointing at this model.">
        {incoming.length ? (
          <DataTable columns={columns} rows={incoming} getRowId={(r) => `${r.from_model_id}.${r.from_column}->${r.to_model_id}.${r.to_column}`} caption="Incoming relationships" />
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">No other model references this one.</p>
        )}
      </Section>
    </div>
  )
}
