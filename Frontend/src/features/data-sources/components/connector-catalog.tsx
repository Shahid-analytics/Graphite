import { ArrowRight, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { FilterSelect, SearchInput, TableToolbar } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { ConnectorCategory, ConnectorDefinition } from '@/types'
import { CATEGORY_LABELS, INCREMENTAL_HELP } from '../lib/labels'
import { useConnectors } from '../queries'
import { ConnectorIcon, GatedButton, permissionReason } from './primitives'

function ConnectorCard({ connector, canWrite }: { connector: ConnectorDefinition; canWrite: boolean }) {
  const { workspaceId } = useWorkspace()
  const available = connector.status === 'available'
  return (
    <li
      className={cn(
        'flex flex-col rounded-lg border bg-background p-4 shadow-xs',
        available ? 'border-border' : 'border-dashed border-border-strong bg-surface shadow-none',
      )}
      aria-label={`${connector.name} connector${available ? '' : ', not yet available'}`}
    >
      <div className="flex items-start gap-3">
        <ConnectorIcon category={connector.category} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className={cn('text-sm font-semibold', !available && 'text-muted-foreground')}>{connector.name}</h3>
            {!available ? (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                Coming soon
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[connector.category]}</p>
        </div>
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground">{connector.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="font-mono">
          {connector.engine}
        </Badge>
        <Badge variant="default">{connector.supports_incremental ? 'Incremental sync' : 'Full load only'}</Badge>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        {available ? (
          canWrite ? (
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link to={`${wsPath(workspaceId, 'sources', 'new')}?connector=${connector.type}`}>
                Connect
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          ) : (
            <GatedButton size="sm" variant="outline" className="w-full" reason={permissionReason('sources:write')}>
              Connect
            </GatedButton>
          )
        ) : (
          <p className="text-xs text-muted-foreground">Not yet available. Ask your administrator if you need this connector.</p>
        )}
      </div>
    </li>
  )
}

/** Grid of available and upcoming connectors. */
export function ConnectorCatalog() {
  const canWrite = usePermission('sources:write')
  const { data, isLoading, error, refetch } = useConnectors()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? [])
      .filter((c) => category === 'all' || c.category === category)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'available' ? -1 : 1))
  }, [data, query, category])

  const categories = useMemo(
    () => [...new Set((data ?? []).map((c) => c.category))].map((value) => ({ value, label: CATEGORY_LABELS[value as ConnectorCategory] })),
    [data],
  )

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading connectors">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (error) return <ErrorState error={error} title="Could not load the connector catalog" onRetry={() => void refetch()} />
  if (!data?.length) return <EmptyState title="No connectors available" description="The backend did not return any connectors. Contact your administrator." />

  return (
    <div>
      <TableToolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search connectors" />
        <FilterSelect value={category} onChange={setCategory} options={categories} label="Categories" />
        <p className="flex items-center gap-1 text-xs text-muted-foreground sm:ml-auto">
          All connectors load into the Bronze layer with dlt.
          <HelpTip label="About incremental sync">{INCREMENTAL_HELP}</HelpTip>
        </p>
      </TableToolbar>
      {filtered.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((connector) => (
            <ConnectorCard key={connector.type} connector={connector} canWrite={canWrite} />
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          title="No connectors match"
          description="Try a different search or category."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                setCategory('all')
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}
    </div>
  )
}
