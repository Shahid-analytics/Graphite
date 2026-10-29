import { KeyRound } from 'lucide-react'
import { HelpTip } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { ConfidenceMeter } from '@/components/status/simulated'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { KeyCandidate } from '@/types'
import { KEY_TYPE_LABEL } from '../lib/labels'
import { DecisionControls } from './decision-controls'
import { RationaleText } from './rationale-text'
import type { ReviewHandlers } from './review-context'

export function KeysTab({ keys, handlers }: { keys: KeyCandidate[]; handlers: ReviewHandlers }) {
  if (!keys.length) {
    return <EmptyState icon={KeyRound} title="No key candidates" description="No primary, business or surrogate keys were identified for the selected tables." compact />
  }
  const columns: Column<KeyCandidate>[] = [
    { id: 'table', header: 'Table or model', sortValue: (k) => k.table, cell: (k) => <span className="font-mono text-[13px] whitespace-nowrap">{k.table}</span> },
    {
      id: 'fields',
      header: 'Fields',
      cell: (k) => (
        <div>
          <div className="flex flex-wrap gap-1">
            {k.fields.map((f) => (
              <code key={f} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11.5px]">
                {f}
              </code>
            ))}
          </div>
          <RationaleText text={k.rationale} className="mt-1 md:hidden" />
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Key type',
      headerHelp: (
        <HelpTip label="About key types">
          Primary: the source system&apos;s unique id. Business: an identifier people recognise, such as an invoice number or GSTIN. Surrogate: a
          warehouse-generated key for a dimension, which keeps history (SCD type 2) and decouples facts from source ids.
        </HelpTip>
      ),
      sortValue: (k) => k.key_type,
      cell: (k) => <Badge variant={k.key_type === 'primary' ? 'solid' : 'outline'}>{KEY_TYPE_LABEL[k.key_type]}</Badge>,
    },
    {
      id: 'uniqueness',
      header: 'Uniqueness',
      sortValue: (k) => k.uniqueness,
      cell: (k) => <span className={cn('text-sm tabular', k.uniqueness < 1 && 'text-warning')}>{formatPercent(k.uniqueness, 2)}</span>,
    },
    { id: 'confidence', header: 'Confidence', sortValue: (k) => k.confidence, cell: (k) => <ConfidenceMeter value={k.confidence} /> },
    { id: 'rationale', header: 'Rationale', hideOnMobile: true, cell: (k) => <RationaleText text={k.rationale} /> },
    {
      id: 'decision',
      header: 'Decision',
      sortValue: (k) => k.decision,
      cell: (k) => (
        <DecisionControls
          label={`${KEY_TYPE_LABEL[k.key_type].toLowerCase()} key ${k.table} (${k.fields.join(', ')})`}
          decision={k.decision}
          unsaved={handlers.isUnsaved('key', k.id)}
          lockedReason={handlers.lockedReason}
          onDecide={(d) => handlers.onDecide('key', k.id, d)}
        />
      ),
    },
  ]
  return <DataTable columns={columns} rows={keys} getRowId={(k) => k.id} pageSize={25} caption="Key suggestions" />
}
