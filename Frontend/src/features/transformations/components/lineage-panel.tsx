import { Network } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { EmptyState } from '@/components/feedback/states'
import { LineageGraph } from '@/components/lineage/lineage-graph'
import { StatusDot } from '@/components/status/status-badge'
import type { LineageGraph as LineageGraphData } from '@/types'
import { lineageNodePath } from '../lib/lineage-links'

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Lineage legend">
      <li className="flex items-center gap-1.5">
        <StatusDot tone="success" /> Healthy
      </li>
      <li className="flex items-center gap-1.5">
        <StatusDot tone="warning" /> Stale, warnings or schema changes
      </li>
      <li className="flex items-center gap-1.5">
        <StatusDot tone="danger" /> Failing tests or source errors
      </li>
      <li>Select a node to open it.</li>
    </ul>
  )
}

/** Lineage graph whose model nodes open the dbt transformation that builds them. */
export function LineagePanel({
  workspaceId,
  graph,
  transformationByModel,
  toolbar,
  height = 560,
}: {
  workspaceId: string
  graph: LineageGraphData
  transformationByModel: Map<string, string>
  toolbar?: ReactNode
  height?: number
}) {
  const navigate = useNavigate()
  if (!graph.nodes.length) {
    return (
      <EmptyState
        icon={Network}
        title="No lineage to show"
        description="Lineage appears once sources have loaded Bronze tables and dbt models have been built from them."
      />
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Legend />
        {toolbar}
      </div>
      <LineageGraph
        graph={graph}
        height={height}
        onNodeClick={(node) => {
          const path = lineageNodePath(workspaceId, node, transformationByModel)
          if (path) navigate(path)
        }}
      />
    </div>
  )
}
