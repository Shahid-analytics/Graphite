import { resourcePath } from '@/lib/resource-links'
import type { LineageNode } from '@/types'

/**
 * Lineage nodes reference models; a model built by a dbt transformation opens that
 * transformation, any other node opens its canonical resource page.
 */
export function lineageNodePath(workspaceId: string, node: LineageNode, transformationByModel: Map<string, string>) {
  if (node.ref_type === 'model') {
    const transformationId = transformationByModel.get(node.ref_id)
    if (transformationId) return resourcePath(workspaceId, 'transformation', transformationId)
  }
  return resourcePath(workspaceId, node.ref_type, node.ref_id)
}
