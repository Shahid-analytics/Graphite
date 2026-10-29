import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

export const auditRoutes: RouteObject[] = [{ path: 'audit', handle: { crumb: 'Audit Trail' }, lazy: lazyPage(() => import('./pages/audit-page')) }]
