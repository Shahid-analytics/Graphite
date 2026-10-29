import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const mappingRoutes: RouteObject[] = [
  {
    path: 'transformations/mapping',
    handle: { crumb: 'Transformations' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/mapping-list-page')) },
      { path: 'new', lazy: lazyPage(() => import('./pages/mapping-new-page')) },
      { path: ':setId', lazy: lazyPage(() => import('./pages/mapping-set-page')) },
    ],
  },
]
