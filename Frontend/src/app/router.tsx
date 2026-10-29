import { createBrowserRouter } from 'react-router'
import { mappingRoutes } from '@/features/ai-mapping/routes'
import { analyticsRoutes } from '@/features/analytics/routes'
import { auditRoutes } from '@/features/audit/routes'
import { accountRoutes, publicAuthRoutes } from '@/features/auth/routes'
import { modelsRoutes } from '@/features/data-models/routes'
import { previewRoutes } from '@/features/data-preview/routes'
import { sourcesRoutes } from '@/features/data-sources/routes'
import { notificationsRoutes } from '@/features/notifications/routes'
import { onboardingRoutes } from '@/features/onboarding/routes'
import { overviewRoutes } from '@/features/overview/routes'
import { pipelinesRoutes } from '@/features/pipelines/routes'
import { proposalsRoutes } from '@/features/schema-proposals/routes'
import { schedulesRoutes } from '@/features/schedules/routes'
import { settingsRoutes } from '@/features/settings/routes'
import { transformationsRoutes } from '@/features/transformations/routes'
import { AppShell } from './layouts/app-shell'
import { NotFoundPage, RouteErrorPage } from './layouts/error-pages'
import { RequireAuth, RootRedirect, WorkspaceGate } from './layouts/guards'

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <RootRedirect /> },
      ...publicAuthRoutes,
      {
        element: <RequireAuth />,
        children: [
          ...accountRoutes,
          {
            path: '/w/:workspaceId',
            element: <WorkspaceGate />,
            children: [
              // Full-screen flows without the application shell.
              ...onboardingRoutes,
              {
                element: <AppShell />,
                errorElement: <RouteErrorPage />,
                children: [
                  ...overviewRoutes,
                  ...sourcesRoutes,
                  ...pipelinesRoutes,
                  ...mappingRoutes,
                  ...transformationsRoutes,
                  ...proposalsRoutes,
                  ...modelsRoutes,
                  ...previewRoutes,
                  ...schedulesRoutes,
                  ...analyticsRoutes,
                  ...auditRoutes,
                  ...notificationsRoutes,
                  ...settingsRoutes,
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
