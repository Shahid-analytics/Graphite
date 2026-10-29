import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const overviewRoutes: RouteObject[] = [{ index: true, handle: { crumb: 'Overview' }, lazy: lazyPage(() => import('./pages/overview-page')) }]
