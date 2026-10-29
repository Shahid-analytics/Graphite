import type { RouteObject } from 'react-router'
import { lazyPage } from '@/app/lazy-page'

/** Full-screen guided setup, rendered outside the application shell. */
export const onboardingRoutes: RouteObject[] = [{ path: 'onboarding', handle: { crumb: 'Setup' }, lazy: lazyPage(() => import('./pages/onboarding-page')) }]
