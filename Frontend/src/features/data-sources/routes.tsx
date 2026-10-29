import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const sourcesRoutes: RouteObject[] = [
  {
    path: 'sources',
    handle: { crumb: 'Data Sources' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/sources-page')) },
      { path: 'new', lazy: lazyPage(() => import('./pages/new-source-page')) },
      { path: ':sourceId', lazy: lazyPage(() => import('./pages/source-detail-page')) },
    ],
  },
]
