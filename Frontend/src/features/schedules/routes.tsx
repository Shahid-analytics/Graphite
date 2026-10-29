import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const schedulesRoutes: RouteObject[] = [
  {
    path: 'schedules',
    handle: { crumb: 'Schedules' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/schedules-page')) },
      { path: 'new', handle: { crumb: 'New schedule' }, lazy: lazyPage(() => import('./pages/schedule-new-page')) },
      {
        path: ':scheduleId',
        handle: { crumb: 'Schedule' },
        children: [
          { index: true, lazy: lazyPage(() => import('./pages/schedule-detail-page')) },
          { path: 'edit', handle: { crumb: 'Edit' }, lazy: lazyPage(() => import('./pages/schedule-edit-page')) },
        ],
      },
    ],
  },
]
