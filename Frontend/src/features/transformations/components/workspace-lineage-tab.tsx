import { ErrorState } from '@/components/feedback/states'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspaceLineage } from '../queries'
import { LineagePanel } from './lineage-panel'

export function WorkspaceLineageTab({ workspaceId, transformationByModel }: { workspaceId: string; transformationByModel: Map<string, string> }) {
  const query = useWorkspaceLineage(workspaceId)
  if (query.isPending) return <Skeleton className="h-[480px] w-full rounded-lg" aria-label="Loading lineage" />
  if (query.isError) return <ErrorState error={query.error} title="Could not load lineage" onRetry={() => query.refetch()} />
  return <LineagePanel workspaceId={workspaceId} graph={query.data} transformationByModel={transformationByModel} />
}
