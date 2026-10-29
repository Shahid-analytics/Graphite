import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const previewRoutes: RouteObject[] = [{ path: 'preview', handle: { crumb: 'Data Preview' }, lazy: lazyPage(() => import('./pages/preview-page')) }]
