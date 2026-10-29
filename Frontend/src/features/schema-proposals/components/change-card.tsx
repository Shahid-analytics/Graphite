import { ArrowRight, ChevronDown, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ProposedSchemaChange } from '@/types'
import { CHANGE_META } from '../lib/labels'
import { ChangeDdl } from './change-ddl'

function schemaFor(change: ProposedSchemaChange) {
  return change.layer === 'silver' ? 'silver' : change.layer === 'gold' ? 'gold' : change.layer
}

/** Read-only view of one proposed change with its columns, relationship and DDL preview. */
export function ChangeCard({ change, index, defaultOpen }: { change: ProposedSchemaChange; index: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const meta = CHANGE_META[change.change_type]
  const Icon = meta.icon
  const isSurrogate = change.change_type === 'add_surrogate_key'
  const keyColumn = isSurrogate ? change.columns.find((c) => c.is_key) : null
  const sources = isSurrogate ? change.columns.filter((c) => !c.is_key) : []
  const showColumns = !isSurrogate && change.columns.length > 0
  const title = change.change_type === 'create_table' ? `Create ${change.model_role ?? 'table'}` : meta.label

  return (
    <article className="rounded-lg border border-border bg-background shadow-xs" aria-labelledby={`chg-${change.id}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-xs font-medium tabular">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <h3 id={`chg-${change.id}`} className="text-sm font-medium">
              {title}
            </h3>
            <span className="font-mono text-[13px] text-muted-foreground">
              {schemaFor(change)}.{change.model_name}
            </span>
            <LayerBadge layer={change.layer} />
            {change.model_role ? <Badge variant="outline">{change.model_role}</Badge> : null}
          </div>
          {change.summary ? <p className="mt-1 text-sm text-muted-foreground">{change.summary}</p> : null}
        </div>
      </header>

      <div className="space-y-3 border-t border-border px-4 py-3">
        {showColumns ? (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {change.columns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-mono text-[13px]">
                      <span className="inline-flex items-center gap-1.5">
                        {c.name}
                        {c.is_key ? <KeyRound className="size-3 text-muted-foreground" aria-label="Key column" /> : null}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[13px] text-muted-foreground">{c.data_type}</TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">{c.description || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {change.relationship ? (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2 font-mono text-[13px]">
            <span>
              {change.model_name}.{change.relationship.from_column}
            </span>
            <ArrowRight className="size-3.5 text-subtle-foreground" aria-label="references" />
            <span>
              {change.relationship.to_model}.{change.relationship.to_column}
            </span>
          </p>
        ) : null}

        {isSurrogate ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Key column</dt>
              <dd className="font-mono text-[13px]">
                {keyColumn ? `${keyColumn.name} ${keyColumn.data_type}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Generated from</dt>
              <dd className="font-mono text-[13px]">{sources.length ? sources.map((s) => s.name).join(', ') : 'Not recorded'}</dd>
            </div>
          </dl>
        ) : null}

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none">
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} aria-hidden />
            {change.change_type === 'add_relationship' ? 'dbt test preview' : 'DDL preview'}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ChangeDdl change={change} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </article>
  )
}
