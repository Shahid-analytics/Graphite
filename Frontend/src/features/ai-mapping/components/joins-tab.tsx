import { GitMerge } from 'lucide-react'
import { HelpTip } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { ConfidenceMeter } from '@/components/status/simulated'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { JoinCandidate } from '@/types'
import { CARDINALITY_LABEL } from '../lib/labels'
import { DecisionControls } from './decision-controls'
import { RationaleText } from './rationale-text'
import type { ReviewHandlers } from './review-context'

export function JoinsTab({ joins, handlers }: { joins: JoinCandidate[]; handlers: ReviewHandlers }) {
  if (!joins.length) {
    return (
      <EmptyState
        icon={GitMerge}
        title="No join candidates"
        description="No matching key columns were found across the selected tables. Select two or more related tables to get join and relationship suggestions."
        compact
      />
    )
  }
  const columns: Column<JoinCandidate>[] = [
    {
      id: 'join',
      header: 'Join',
      sortValue: (j) => j.left_table,
      cell: (j) => (
        <div className="font-mono text-[13px]">
          <p className="whitespace-nowrap">
            <span className="text-muted-foreground">{j.left_table}.</span>
            {j.left_field}
          </p>
          <p className="whitespace-nowrap">
            <span className="text-subtle-foreground">= </span>
            <span className="text-muted-foreground">{j.right_table}.</span>
            {j.right_field}
          </p>
          <RationaleText text={j.rationale} className="mt-1 font-sans md:hidden" />
        </div>
      ),
    },
    {
      id: 'cardinality',
      header: (
        <span className="inline-flex items-center gap-1">
          Cardinality
          <HelpTip label="About cardinality">Many to one means many rows on the left match a single row on the right, for example many invoices per customer.</HelpTip>
        </span>
      ),
      cell: (j) => <Badge variant="outline">{CARDINALITY_LABEL[j.cardinality]}</Badge>,
    },
    {
      id: 'match',
      header: 'Match rate',
      headerHelp: <HelpTip label="About match rate">Share of rows on the left whose key finds a row on the right. Below 100% means orphan rows.</HelpTip>,
      sortValue: (j) => j.match_rate,
      cell: (j) => <span className={cn('text-sm tabular', j.match_rate < 0.95 && 'text-warning')}>{formatPercent(j.match_rate, 2)}</span>,
    },
    { id: 'confidence', header: 'Confidence', sortValue: (j) => j.confidence, cell: (j) => <ConfidenceMeter value={j.confidence} /> },
    { id: 'rationale', header: 'Rationale', hideOnMobile: true, cell: (j) => <RationaleText text={j.rationale} /> },
    {
      id: 'decision',
      header: 'Decision',
      sortValue: (j) => j.decision,
      cell: (j) => (
        <DecisionControls
          label={`join ${j.left_table}.${j.left_field} to ${j.right_table}.${j.right_field}`}
          decision={j.decision}
          unsaved={handlers.isUnsaved('join', j.id)}
          lockedReason={handlers.lockedReason}
          onDecide={(d) => handlers.onDecide('join', j.id, d)}
        />
      ),
    },
  ]
  return <DataTable columns={columns} rows={joins} getRowId={(j) => j.id} pageSize={25} caption="Join and relationship suggestions" />
}
