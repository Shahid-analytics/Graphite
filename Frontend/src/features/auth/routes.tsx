import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

/** Public routes (no session required). */
export const publicAuthRoutes: RouteObject[] = [{ path: '/login', handle: { crumb: 'Sign in' }, lazy: lazyPage(() => import('./pages/login-page')) }]

/** Signed-in routes outside any workspace. */
export const accountRoutes: RouteObject[] = [
  { path: '/workspaces', handle: { crumb: 'Workspaces' }, lazy: lazyPage(() => import('./pages/workspaces-page')) },
  { path: '/workspaces/new', handle: { crumb: 'New workspace' }, lazy: lazyPage(() => import('./pages/create-workspace-page')) },
]
