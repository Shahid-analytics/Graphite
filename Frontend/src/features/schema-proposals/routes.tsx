import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const proposalsRoutes: RouteObject[] = [
  {
    path: 'models/proposals',
    handle: { crumb: 'Data Models' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/proposals-page')) },
      { path: 'new', lazy: lazyPage(() => import('./pages/new-proposal-page')) },
      { path: ':proposalId', lazy: lazyPage(() => import('./pages/proposal-detail-page')) },
    ],
  },
]
