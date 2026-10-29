import { Link } from 'react-router'
import { LayerBadge } from '@/components/status/status-badge'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { DatasetRef } from '@/types'

/** Link to a dataset in the Data Models catalog, with its medallion layer. */
export function DatasetLink({ workspaceId, dataset, className }: { workspaceId: string; dataset: DatasetRef; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <LayerBadge layer={dataset.layer} />
      <Link
        to={wsPath(workspaceId, 'models', dataset.model_id)}
        onClick={(event) => event.stopPropagation()}
        className="truncate rounded-sm font-mono text-[13px] hover:underline"
      >
        {dataset.model_name}
      </Link>
    </span>
  )
}
