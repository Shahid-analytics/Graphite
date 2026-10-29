import { ArrowRight, ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfidenceMeter } from '@/components/status/simulated'
import { EmptyState } from '@/components/feedback/states'
import { DataTable, FilterSelect, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import type { FieldMapping } from '@/types'
import { DECISION_OPTIONS } from '../lib/labels'
import { DecisionControls } from './decision-controls'
import { RationaleText } from './rationale-text'
import type { ReviewHandlers } from './review-context'

export function FieldMappingsTab({ mappings, handlers, onEdit }: { mappings: FieldMapping[]; handlers: ReviewHandlers; onEdit: (mapping: FieldMapping) => void }) {
  const [q, setQ] = useState('')
  const [decision, setDecision] = useState('all')
  const [model, setModel] = useState('all')

  const models = useMemo(() => [...new Set(mappings.map((m) => m.target_model))].sort(), [mappings])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return mappings.filter(
      (m) =>
        (decision === 'all' || m.decision === decision) &&
        (model === 'all' || m.target_model === model) &&
        (!needle || [m.source_table, m.source_field, m.target_model, m.target_field, m.normalization_rule ?? ''].some((v) => v.toLowerCase().includes(needle))),
    )
  }, [mappings, q, decision, model])

  const columns: Column<FieldMapping>[] = [
    {
      id: 'source',
      header: 'Source field',
      sortValue: (m) => `${m.source_table}.${m.source_field}`,
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-mono text-[13px] whitespace-nowrap">
            <span className="text-muted-foreground">{m.source_table}.</span>
            {m.source_field}
          </p>
          <p className="font-mono text-[11px] text-subtle-foreground">{m.source_type}</p>
        </div>
      ),
    },
    {
      id: 'arrow',
      header: <span className="sr-only">maps to</span>,
      headerClassName: 'w-6 px-0',
      className: 'w-6 px-0',
      cell: () => <ArrowRight className="size-3.5 text-subtle-foreground" aria-label="maps to" />,
    },
    {
      id: 'target',
      header: 'Target field',
      sortValue: (m) => `${m.target_model}.${m.target_field}`,
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-mono text-[13px] whitespace-nowrap">
            <span className="text-muted-foreground">{m.target_model}.</span>
            {m.target_field}
          </p>
          <p className="font-mono text-[11px] text-subtle-foreground">{m.target_type}</p>
          <RationaleText text={m.rationale} className="mt-1 md:hidden" />
        </div>
      ),
    },
    {
      id: 'rule',
      header: 'Normalization',
      hideOnMobile: true,
      cell: (m) =>
        m.normalization_rule ? (
          <code className="block max-w-56 rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11.5px] break-words text-foreground">{m.normalization_rule}</code>
        ) : (
          <span className="text-xs text-subtle-foreground">Copied as is</span>
        ),
    },
    { id: 'confidence', header: 'Confidence', sortValue: (m) => m.confidence, cell: (m) => <ConfidenceMeter value={m.confidence} /> },
    { id: 'rationale', header: 'Rationale', hideOnMobile: true, cell: (m) => <RationaleText text={m.rationale} /> },
    {
      id: 'decision',
      header: 'Decision',
      sortValue: (m) => m.decision,
      cell: (m) => {
        const label = `${m.source_table}.${m.source_field} to ${m.target_model}.${m.target_field}`
        return (
          <DecisionControls
            label={label}
            decision={m.decision}
            unsaved={handlers.isUnsaved('field_mapping', m.id)}
            lockedReason={handlers.lockedReason}
            onDecide={(d) => handlers.onDecide('field_mapping', m.id, d)}
            onEdit={() => onEdit(m)}
          />
        )
      },
    },
  ]

  if (!mappings.length) {
    return <EmptyState icon={ListChecks} title="No field mappings" description="The selected tables had no columns that could be mapped. Request new suggestions with different tables." compact />
  }

  return (
    <div>
      <TableToolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search fields or rules" />
        <FilterSelect label="Decisions" value={decision} onChange={setDecision} options={DECISION_OPTIONS} />
        <FilterSelect label="Target models" value={model} onChange={setModel} options={models.map((m) => ({ value: m, label: m }))} className="sm:w-56" />
        <p className="text-xs text-muted-foreground sm:ml-auto" aria-live="polite">
          {rows.length} of {mappings.length} mappings
        </p>
      </TableToolbar>
      <DataTable columns={columns} rows={rows} getRowId={(m) => m.id} pageSize={25} caption="Field mapping suggestions" />
    </div>
  )
}
