import { Network } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useModelLineage } from '../queries'
import { LineagePanel } from './lineage-panel'

const DEPTHS = [1, 2, 3, 4, 5]

export function ModelLineageTab({
  workspaceId,
  modelId,
  transformationByModel,
}: {
  workspaceId: string
  modelId: string | null
  transformationByModel: Map<string, string>
}) {
  const [depth, setDepth] = useState(3)
  const query = useModelLineage(modelId, depth)

  if (!modelId) {
    return (
      <EmptyState
        icon={Network}
        title="No output relation"
        description="Lineage is tracked for warehouse relations. This model does not build one, so it has no lineage of its own."
      />
    )
  }
  if (query.isPending) return <Skeleton className="h-[420px] w-full rounded-lg" aria-label="Loading lineage" />
  if (query.isError) return <ErrorState error={query.error} title="Could not load lineage" onRetry={() => query.refetch()} />

  return (
    <LineagePanel
      workspaceId={workspaceId}
      graph={query.data}
      transformationByModel={transformationByModel}
      height={480}
      toolbar={
        <div className="flex items-center gap-2">
          <Label htmlFor="lineage-depth" className="text-xs text-muted-foreground">
            Depth
          </Label>
          <Select value={String(depth)} onValueChange={(v) => setDepth(Number(v))}>
            <SelectTrigger id="lineage-depth" size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPTHS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} {d === 1 ? 'hop' : 'hops'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  )
}
