import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const analyticsRoutes: RouteObject[] = [
  {
    path: 'analytics',
    handle: { crumb: 'Analytics & Reports' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/analytics-page')) },
      { path: 'dashboards/:dashboardId', lazy: lazyPage(() => import('./pages/dashboard-page')) },
      { path: 'reports/:reportId', lazy: lazyPage(() => import('./pages/report-page')) },
      { path: 'assistant', lazy: lazyPage(() => import('./pages/assistant-page')) },
    ],
  },
]
