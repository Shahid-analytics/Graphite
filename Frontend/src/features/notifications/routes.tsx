import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const notificationsRoutes: RouteObject[] = [
  { path: 'notifications', handle: { crumb: 'Notifications' }, lazy: lazyPage(() => import('./pages/notifications-page')) },
]
