import { Navigate, type RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    handle: { crumb: 'Settings' },
    lazy: lazyPage(() => import('./pages/settings-layout')),
    children: [
      { index: true, element: <Navigate to="workspace" replace /> },
      { path: 'workspace', handle: { crumb: 'Workspace' }, lazy: lazyPage(() => import('./pages/workspace-page')) },
      { path: 'members', handle: { crumb: 'Members & roles' }, lazy: lazyPage(() => import('./pages/members-page')) },
      { path: 'connections', handle: { crumb: 'Connections' }, lazy: lazyPage(() => import('./pages/connections-page')) },
      { path: 'dbt', handle: { crumb: 'dbt project' }, lazy: lazyPage(() => import('./pages/dbt-page')) },
      { path: 'metabase', handle: { crumb: 'Metabase' }, lazy: lazyPage(() => import('./pages/metabase-page')) },
      { path: 'ai', handle: { crumb: 'AI provider' }, lazy: lazyPage(() => import('./pages/ai-provider-page')) },
      { path: 'scheduler', handle: { crumb: 'Scheduler' }, lazy: lazyPage(() => import('./pages/scheduler-page')) },
      { path: 'notifications', handle: { crumb: 'Notifications' }, lazy: lazyPage(() => import('./pages/notification-preferences-page')) },
      { path: 'integrations', handle: { crumb: 'Integrations' }, lazy: lazyPage(() => import('./pages/integrations-page')) },
      { path: 'audit-retention', handle: { crumb: 'Audit retention' }, lazy: lazyPage(() => import('./pages/audit-retention-page')) },
      { path: 'system-health', handle: { crumb: 'System health' }, lazy: lazyPage(() => import('./pages/system-health-page')) },
    ],
  },
]
