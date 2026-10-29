import type { ResourceType } from '@/types'

/**
 * Canonical in-app routes for every resource type. Notifications, search results,
 * lineage nodes and audit events link through this map.
 */
export function resourcePath(workspaceId: string, type: ResourceType | string, id: string): string | null {
  const base = `/w/${workspaceId}`
  switch (type) {
    case 'source':
      return `${base}/sources/${id}`
    case 'pipeline':
      return `${base}/pipelines/${id}`
    case 'run':
      return `${base}/runs/${id}`
    case 'transformation':
      return `${base}/transformations/${id}`
    case 'model':
      return `${base}/models/${id}`
    case 'schedule':
      return `${base}/schedules/${id}`
    case 'dashboard':
      return `${base}/analytics/dashboards/${id}`
    case 'report':
      return `${base}/analytics/reports/${id}`
    case 'mapping':
      return `${base}/transformations/mapping/${id}`
    case 'proposal':
      return `${base}/models/proposals/${id}`
    default:
      return null
  }
}
