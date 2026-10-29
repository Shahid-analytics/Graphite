import type { Permission, Role } from '@/types'

/**
 * Role matrix used by the mock API. The production backend is the source of truth
 * for authorization; the frontend only renders what /workspaces/{id} reports.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'workspace:manage',
    'members:manage',
    'sources:write',
    'sources:sync',
    'pipelines:write',
    'pipelines:run',
    'transformations:write',
    'transformations:run',
    'mappings:review',
    'mappings:approve',
    'models:propose',
    'models:approve',
    'schedules:write',
    'reports:write',
    'reports:publish',
    'audit:export',
    'settings:manage',
  ],
  admin: [
    'members:manage',
    'sources:write',
    'sources:sync',
    'pipelines:write',
    'pipelines:run',
    'transformations:write',
    'transformations:run',
    'mappings:review',
    'mappings:approve',
    'models:propose',
    'models:approve',
    'schedules:write',
    'reports:write',
    'reports:publish',
    'audit:export',
    'settings:manage',
  ],
  editor: [
    'sources:sync',
    'pipelines:run',
    'transformations:write',
    'transformations:run',
    'mappings:review',
    'models:propose',
    'schedules:write',
    'reports:write',
  ],
  viewer: [],
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full control of the workspace, billing and membership.',
  admin: 'Manages connections, integrations, members and approvals.',
  editor: 'Builds transformations and reports, runs jobs and proposes changes.',
  viewer: 'Read-only access to dashboards, catalog and run history.',
}
