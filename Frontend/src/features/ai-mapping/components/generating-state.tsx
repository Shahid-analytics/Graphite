import { Loader2, Table2 } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { Card, CardContent } from '@/components/ui/card'
import { isMockMode } from '@/lib/config'
import type { MappingSuggestionSet } from '@/types'

/** Calm placeholder while suggestions are generated; the page polls in the background. */
export function GeneratingState({ set }: { set: MappingSuggestionSet }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <span className="mb-4 flex size-10 items-center justify-center rounded-full border border-border bg-surface">
          <Loader2 className="size-5 animate-spin text-running" aria-hidden />
        </span>
        <div role="status" aria-live="polite">
          <p className="text-sm font-medium">Generating suggestions</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {isMockMode
              ? `The mock suggestion engine is reading column metadata for ${set.source_tables.length} ${set.source_tables.length === 1 ? 'table' : 'tables'}. No AI provider is called.`
              : `The AI provider is analysing column metadata for ${set.source_tables.length} ${set.source_tables.length === 1 ? 'table' : 'tables'}.`}{' '}
            This page updates automatically.
          </p>
        </div>
        <ul className="mt-5 flex max-w-lg flex-wrap justify-center gap-1.5" aria-label="Tables being analysed">
          {set.source_tables.map((table) => (
            <li key={table} className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[11.5px] text-muted-foreground">
              <Table2 className="size-3" aria-hidden />
              {table}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-subtle-foreground">
          Requested <TimeAgo value={set.created_at} /> by {set.created_by.name}
        </p>
      </CardContent>
    </Card>
  )
}
