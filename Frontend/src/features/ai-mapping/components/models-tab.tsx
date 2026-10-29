import { Boxes } from 'lucide-react'
import { HelpTip } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { ConfidenceMeter } from '@/components/status/simulated'
import { LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ModelProposal } from '@/types'
import { DecisionControls } from './decision-controls'
import type { ReviewHandlers } from './review-context'

function ModelCard({ model, layer, handlers }: { model: ModelProposal; layer: 'silver' | 'gold'; handlers: ReviewHandlers }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="font-mono text-[14px] break-all">{model.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{model.model_type === 'fact' ? 'Fact' : 'Dimension'}</Badge>
              <LayerBadge layer={layer} />
              <ConfidenceMeter value={model.confidence} />
            </div>
          </div>
          <DecisionControls
            label={`model ${model.name}`}
            decision={model.decision}
            unsaved={handlers.isUnsaved('model', model.id)}
            lockedReason={handlers.lockedReason}
            onDecide={(d) => handlers.onDecide('model', model.id, d)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              Grain
              <HelpTip label="About grain">What one row represents. Every measure in the model must be valid at this grain.</HelpTip>
            </dt>
            <dd className="mt-0.5">{model.grain}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Built from</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">
              {model.source_tables.map((t) => (
                <code key={t} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11.5px]">
                  {t}
                </code>
              ))}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Description</dt>
            <dd className="mt-0.5 text-muted-foreground">{model.description}</dd>
          </div>
        </dl>
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <caption className="sr-only">Columns of {model.name}</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Column</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Expression</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.columns.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="font-mono text-[12.5px] whitespace-nowrap" title={c.description}>
                    {c.name}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">{c.data_type}</TableCell>
                  <TableCell className="hidden max-w-72 font-mono text-[11.5px] break-words text-muted-foreground md:table-cell">{c.expression}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rationale</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{model.rationale}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function ModelsTab({ models, layer, handlers }: { models: ModelProposal[]; layer: 'silver' | 'gold'; handlers: ReviewHandlers }) {
  if (!models.length) {
    return <EmptyState icon={Boxes} title="No model proposals" description="This set contains field-level suggestions only. Models can still be proposed manually from Data models." compact />
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {models.map((model) => (
        <ModelCard key={model.id} model={model} layer={layer} handlers={handlers} />
      ))}
    </div>
  )
}
