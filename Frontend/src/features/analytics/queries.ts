import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { modelsService } from '@/services/models.service'
import { reportsService } from '@/services/reports.service'
import type {
  AnalyticsListQuery,
  BusinessArea,
  CreateReportRequest,
  CreateReportRequestRequest,
  Dashboard,
  Report,
  ReportSuggestion,
} from '@/types'

export const analyticsKeys = {
  all: ['analytics'] as const,
  workspace: (workspaceId: string) => ['analytics', workspaceId] as const,
  dashboards: (workspaceId: string, query?: AnalyticsListQuery) =>
    query ? (['analytics', workspaceId, 'dashboards', query] as const) : (['analytics', workspaceId, 'dashboards'] as const),
  dashboard: (dashboardId: string) => ['analytics', 'dashboard', dashboardId] as const,
  embed: (dashboardId: string) => ['analytics', 'dashboard', dashboardId, 'embed'] as const,
  reports: (workspaceId: string, query?: AnalyticsListQuery) =>
    query ? (['analytics', workspaceId, 'reports', query] as const) : (['analytics', workspaceId, 'reports'] as const),
  report: (reportId: string) => ['analytics', 'report', reportId] as const,
  requests: (workspaceId: string) => ['analytics', workspaceId, 'requests'] as const,
  metabase: (workspaceId: string) => ['analytics', workspaceId, 'metabase-status'] as const,
  lastSuggestion: (workspaceId: string) => ['analytics', workspaceId, 'assistant', 'last'] as const,
}

// Dashboards ------------------------------------------------------------------

export function useDashboards(workspaceId: string, query: AnalyticsListQuery = {}) {
  return useQuery({
    queryKey: analyticsKeys.dashboards(workspaceId, query),
    queryFn: () => reportsService.dashboards(workspaceId, query),
    placeholderData: keepPreviousData,
  })
}

export function useDashboard(dashboardId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: analyticsKeys.dashboard(dashboardId),
    queryFn: async () => {
      const dashboard = await reportsService.dashboard(dashboardId)
      // Opening a dashboard updates last_viewed_at, which feeds "Favorites and recent".
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.dashboards(dashboard.workspace_id) })
      return dashboard
    },
  })
}

export function useFavoriteDashboard(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) => reportsService.favoriteDashboard(id, isFavorite),
    onSuccess: (dashboard) => {
      queryClient.setQueryData<Dashboard>(analyticsKeys.dashboard(dashboard.id), dashboard)
      return invalidate(queryClient, [analyticsKeys.dashboards(workspaceId), ['audit']])
    },
  })
}

// Reports ---------------------------------------------------------------------

export function useReports(workspaceId: string, query: AnalyticsListQuery = {}) {
  return useQuery({
    queryKey: analyticsKeys.reports(workspaceId, query),
    queryFn: () => reportsService.reports(workspaceId, query),
    placeholderData: keepPreviousData,
  })
}

export function useReport(reportId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: analyticsKeys.report(reportId),
    queryFn: async () => {
      const report = await reportsService.report(reportId)
      // Opening a report updates last_viewed_at, which feeds "Favorites and recent".
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.reports(report.workspace_id) })
      return report
    },
  })
}

export function useFavoriteReport(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) => reportsService.favoriteReport(id, isFavorite),
    onSuccess: (report) => {
      queryClient.setQueryData<Report>(analyticsKeys.report(report.id), report)
      return invalidate(queryClient, [analyticsKeys.reports(workspaceId), ['audit']])
    },
  })
}

export function useCreateReport(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateReportRequest) => reportsService.createReport(workspaceId, payload),
    onSuccess: (report) => {
      queryClient.setQueryData(analyticsKeys.report(report.id), report)
      return invalidate(queryClient, [analyticsKeys.reports(workspaceId), ['audit'], ['overview']])
    },
  })
}

export function usePublishReport(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reportId: string) => reportsService.publishReport(reportId),
    onSuccess: (report) => {
      queryClient.setQueryData(analyticsKeys.report(report.id), report)
      return invalidate(queryClient, [analyticsKeys.reports(workspaceId), ['audit'], ['overview']])
    },
    // A refused publish is still recorded in the audit trail.
    onError: () => invalidate(queryClient, [['audit']]),
  })
}

// Requests --------------------------------------------------------------------

export function useReportRequests(workspaceId: string) {
  return useQuery({ queryKey: analyticsKeys.requests(workspaceId), queryFn: () => reportsService.reportRequests(workspaceId) })
}

export function useCreateReportRequest(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateReportRequestRequest) => reportsService.createReportRequest(workspaceId, payload),
    onSuccess: () => invalidate(queryClient, [analyticsKeys.requests(workspaceId), ['audit']]),
  })
}

// Metabase --------------------------------------------------------------------

export function useMetabaseStatus(workspaceId: string) {
  return useQuery({ queryKey: analyticsKeys.metabase(workspaceId), queryFn: () => reportsService.metabaseStatus(workspaceId), staleTime: 60_000 })
}

export function useTestMetabase(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reportsService.testMetabase(workspaceId),
    onSuccess: (status) => {
      queryClient.setQueryData(analyticsKeys.metabase(workspaceId), status)
      // Settings shows the same integration state (integrations list, system health).
      return invalidate(queryClient, [['settings', workspaceId], ['audit']])
    },
  })
}

// AI report assistant ---------------------------------------------------------

export interface LastSuggestion {
  suggestion: ReportSuggestion
  businessArea: BusinessArea | null
}

/**
 * The most recent suggestion for the workspace, kept in the query cache only so
 * it is still visible after navigating to a report and back. Never persisted.
 */
export function useLastSuggestion(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = analyticsKeys.lastSuggestion(workspaceId)
  return useQuery({
    queryKey: key,
    queryFn: () => queryClient.getQueryData<LastSuggestion | null>(key) ?? null,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })
}

export function useSuggestReports(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ prompt, businessArea }: { prompt: string; businessArea: BusinessArea | null }) =>
      reportsService.suggest({ workspace_id: workspaceId, prompt, business_area: businessArea ?? undefined }),
    onSuccess: (suggestion, { businessArea }) => {
      const last: LastSuggestion = { suggestion, businessArea }
      queryClient.setQueryData(analyticsKeys.lastSuggestion(workspaceId), last)
    },
  })
}

export function clearLastSuggestion(queryClient: QueryClient, workspaceId: string) {
  queryClient.setQueryData(analyticsKeys.lastSuggestion(workspaceId), null)
}

// Models (read-only, for dataset context) ----------------------------------------

export function useModelColumns(modelId: string | null | undefined) {
  return useQuery({
    queryKey: ['models', modelId ?? '', 'columns'],
    queryFn: () => modelsService.columns(modelId!),
    enabled: Boolean(modelId),
    staleTime: 5 * 60_000,
  })
}

function invalidate(queryClient: QueryClient, keys: readonly (readonly unknown[])[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}
