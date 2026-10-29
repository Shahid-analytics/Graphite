import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const transformationsRoutes: RouteObject[] = [
  {
    path: 'transformations',
    handle: { crumb: 'Transformations' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/transformations-page')) },
      { path: ':transformationId', lazy: lazyPage(() => import('./pages/transformation-detail-page')) },
    ],
  },
]
