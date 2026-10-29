import { Code2, Network, Plug } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { LineageGraph } from '@/components/lineage/lineage-graph'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { wsPath } from '@/hooks/use-workspace'
import { resourcePath } from '@/lib/resource-links'
import type { DataModel, LineageNode } from '@/types'
import { useModelLineage } from '../../queries'

const DEPTHS = [1, 2, 3, 4]

export function LineageTab({ model, workspaceId }: { model: DataModel; workspaceId: string }) {
  const [depth, setDepth] = useState(2)
  const query = useModelLineage(model.id, depth)
  const navigate = useNavigate()

  const onNodeClick = (node: LineageNode) => {
    if (node.ref_type === 'model' && node.ref_id === model.id) return
    const path = resourcePath(workspaceId, node.ref_type, node.ref_id)
    if (path) navigate(path)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor="lineage-depth" className="text-sm font-normal text-muted-foreground">
            Hops up and downstream
          </Label>
          <Select value={String(depth)} onValueChange={(v) => setDepth(Number(v))}>
            <SelectTrigger id="lineage-depth" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTHS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <HelpTip label="About lineage">
            Lineage follows data from sources through Bronze, Silver and Gold to the dashboards that read it. Select a node to open that resource.
          </HelpTip>
        </div>
        <div className="flex flex-wrap gap-2">
          {model.transformation_id ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={wsPath(workspaceId, 'transformations', model.transformation_id)}>
                <Code2 aria-hidden />
                Open transformation
              </Link>
            </Button>
          ) : null}
          {model.source_id ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={wsPath(workspaceId, 'sources', model.source_id)}>
                <Plug aria-hidden />
                Open source
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {query.isPending ? (
        <Skeleton className="h-72 w-full rounded-lg" aria-busy="true" aria-label="Loading lineage" />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Could not load lineage" onRetry={() => query.refetch()} />
      ) : query.data.nodes.length <= 1 ? (
        <EmptyState compact icon={Network} title="No upstream or downstream dependencies" description="This table is not connected to any source, model or dashboard yet." />
      ) : (
        <div className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <LineageGraph graph={query.data} onNodeClick={onNodeClick} height={520} />
          <p className="mt-2 text-xs text-muted-foreground">
            {query.data.nodes.length} nodes, {query.data.edges.length} edges. The highlighted node is {model.schema}.{model.name}.
          </p>
        </div>
      )}
    </div>
  )
}
