import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const pipelinesRoutes: RouteObject[] = [
  {
    path: 'pipelines',
    handle: { crumb: 'Pipelines & Sync Jobs' },
    children: [
      { index: true, lazy: lazyPage(() => import('./pages/pipelines-page')) },
      { path: 'new', lazy: lazyPage(() => import('./pages/new-pipeline-page')) },
      { path: ':pipelineId', lazy: lazyPage(() => import('./pages/pipeline-detail-page')) },
    ],
  },
  // Run detail is shared by every run kind (syncs, pipeline runs, dbt runs and tests, schema applies).
  { path: 'runs/:runId', handle: { crumb: 'Pipelines & Sync Jobs' }, lazy: lazyPage(() => import('./pages/run-detail-page')) },
]
