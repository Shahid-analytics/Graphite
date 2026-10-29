import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const modelsRoutes: RouteObject[] = [
  {
    path: 'models',
    handle: { crumb: 'Data Models' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/models-page')) },
      { path: ':modelId', lazy: lazyPage(() => import('./pages/model-detail-page')) },
    ],
  },
]
