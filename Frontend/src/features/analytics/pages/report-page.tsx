import { ExternalLink, FileChartColumn, Send, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { KeyValueGrid, TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { MetabaseStatusBadge } from '@/components/metabase/metabase-embed'
import { ConfidenceMeter, SimulatedBadge } from '@/components/status/simulated'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDateTime } from '@/lib/format'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { Report } from '@/types'
import { OriginBadge, ReportStatusBadge } from '../components/badges'
import { FavoriteToggle } from '../components/favorite-toggle'
import { ReportDefinition } from '../components/report-definition'
import { WithReason } from '../components/with-reason'
import { areaLabel } from '../lib/labels'
import { useFavoriteReport, useMetabaseStatus, usePublishReport, useReport, useTestMetabase } from '../queries'

function Provenance({ report }: { report: Report }) {
  if (report.origin !== 'ai_suggestion') {
    return <p className="text-sm text-muted-foreground">Defined manually.</p>
  }
  const s = report.suggestion
  if (!s) {
    return <p className="text-sm text-muted-foreground">Created from an AI recommendation. Details of the original suggestion are not available for this report.</p>
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {s.provider.name} <span className="text-muted-foreground">({s.provider.model})</span>
        </span>
        {s.provider.simulated ? <SimulatedBadge always reason="Suggested by the mock suggestion engine. No AI provider was called." /> : null}
      </div>
      <blockquote className="border-l-2 border-border-strong pl-3 text-muted-foreground">{s.prompt}</blockquote>
      <KeyValueGrid
        columns={1}
        items={[
          { label: 'Confidence at suggestion time', value: <ConfidenceMeter value={s.confidence} /> },
          { label: 'Suggested', value: formatDateTime(s.suggested_at) },
          { label: 'Suggestion id', value: s.suggestion_id, mono: true },
        ]}
      />
      <p className="text-xs text-muted-foreground">The recommendation was reviewed and saved as a draft by its owner before any publishing.</p>
    </div>
  )
}

export default function ReportPage() {
  const { reportId = '' } = useParams()
  const { workspaceId } = useWorkspace()
  const canPublish = usePermission('reports:publish')
  const report = useReport(reportId)
  const metabase = useMetabaseStatus(workspaceId)
  const testMetabase = useTestMetabase(workspaceId)
  const favorite = useFavoriteReport(workspaceId)
  const publish = usePublishReport(workspaceId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [publishBlocked, setPublishBlocked] = useState<string | null>(null)

  const catalogHref = `${wsPath(workspaceId, 'analytics')}?tab=reports`
  const settingsHref = wsPath(workspaceId, 'settings', 'metabase')
  const crumbs = [{ label: 'Analytics & Reports', to: catalogHref }]

  if (report.isPending) return <PageSkeleton />
  if (report.isError || report.data.workspace_id !== workspaceId) {
    const notFound = !report.isError || (isApiError(report.error) && report.error.status === 404)
    return (
      <div>
        <PageHeader title={notFound ? 'Report not found' : 'Report'} breadcrumbs={[...crumbs, { label: notFound ? 'Not found' : 'Report' }]} />
        {notFound ? (
          <EmptyState
            icon={FileChartColumn}
            title="This report does not exist"
            description="It may have been deleted or belong to another workspace."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={catalogHref}>Back to reports</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={report.error} onRetry={() => void report.refetch()} />
        )}
      </div>
    )
  }

  const r = report.data
  const published = r.status === 'published'
  // Only link out when the backend reports Metabase as connected; an unreachable instance would be a dead link.
  const siteUrl = metabase.data?.status === 'connected' ? (metabase.data.site_url ?? null) : null
  const questionHref = published && siteUrl && r.metabase_question_id !== null ? `${siteUrl.replace(/\/$/, '')}/question/${r.metabase_question_id}` : null

  const runPublish = async () => {
    setPublishBlocked(null)
    try {
      await publish.mutateAsync(r.id)
      toastSuccess('Report published', 'The report is now available as a Metabase question.')
    } catch (error) {
      if (isApiError(error) && error.code === 'integration_unavailable') {
        setPublishBlocked(error.message)
        return
      }
      if (isApiError(error) && error.code === 'already_published') {
        toastInfo('Already published', error.message)
        void report.refetch()
        return
      }
      toastError(error, 'Could not publish the report')
      throw error
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[...crumbs, { label: r.name }]}
        title={r.name}
        meta={
          <>
            <ReportStatusBadge status={r.status} />
            <OriginBadge origin={r.origin} />
          </>
        }
        description={r.description || undefined}
        actions={
          <>
            <FavoriteToggle
              size="icon"
              className="border border-input"
              name={r.name}
              isFavorite={r.is_favorite}
              pending={favorite.isPending}
              onToggle={(next) => favorite.mutate({ id: r.id, isFavorite: next }, { onError: (error) => toastError(error, 'Could not update favorites') })}
            />
            {published ? (
              <WithReason
                reason={
                  questionHref
                    ? null
                    : r.metabase_question_id === null
                      ? 'The backend has not recorded a Metabase question id for this report.'
                      : metabase.isPending
                        ? 'Checking the Metabase integration.'
                        : metabase.isError
                          ? 'The Metabase integration status could not be loaded, so the site URL is unknown.'
                          : metabase.data?.site_url
                            ? 'Metabase is not connected, so this report cannot be opened there. Check the integration in Metabase settings.'
                            : 'The Metabase site URL is not configured for this workspace.'
                }
              >
                {questionHref ? (
                  <Button asChild variant="outline">
                    <a href={questionHref} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      Open in Metabase
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    <ExternalLink aria-hidden />
                    Open in Metabase
                  </Button>
                )}
              </WithReason>
            ) : (
              <WithReason reason={canPublish ? null : 'Your role does not include the reports:publish permission. Ask a workspace admin to publish this draft.'}>
                <Button onClick={() => setConfirmOpen(true)} disabled={!canPublish} loading={publish.isPending}>
                  <Send aria-hidden />
                  Publish to Metabase
                </Button>
              </WithReason>
            )}
          </>
        }
      />

      {publishBlocked ? (
        <Notice
          tone="warning"
          className="mb-6"
          title="Not published"
          action={
            <>
              <Button
                variant="outline"
                size="sm"
                loading={testMetabase.isPending}
                onClick={() => testMetabase.mutate(undefined, { onError: (error) => toastError(error, 'Connection test failed') })}
              >
                Test connection
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={settingsHref}>
                  <Settings aria-hidden />
                  Metabase settings
                </Link>
              </Button>
            </>
          }
        >
          {publishBlocked}
          {metabase.data?.message ? <span className="mt-1 block">{metabase.data.message}</span> : null}
        </Notice>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Definition" description="What the report queries and how it is shown. Metabase runs the query once the report is published.">
            <Card>
              <CardContent className="py-4">
                <ReportDefinition workspaceId={workspaceId} dataset={r.dataset} visualization={r.visualization} dimensions={r.dimensions} measures={r.measures} filters={r.filters} />
              </CardContent>
            </Card>
          </Section>
          {!published ? (
            <Notice tone="neutral" title={r.status === 'in_review' ? 'In review' : 'Draft'}>
              {r.status === 'in_review' ? 'Reports in review are' : 'Drafts are'} visible only in Graphite. Publishing creates a Metabase question from this
              definition{canPublish ? '' : ' and requires the reports:publish permission'}.
            </Notice>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Section title="Details">
            <KeyValueGrid
              columns={1}
              items={[
                { label: 'Business area', value: <Badge variant="outline">{areaLabel(r.business_area)}</Badge> },
                { label: 'Owner', value: r.owner },
                { label: 'Updated', value: <TimeAgo value={r.updated_at} /> },
                { label: 'Last viewed', value: <TimeAgo value={r.last_viewed_at} /> },
                { label: 'Metabase question id', value: r.metabase_question_id ?? 'Not published', mono: r.metabase_question_id !== null },
                { label: 'Metabase integration', value: metabase.isError ? 'Status unavailable' : <MetabaseStatusBadge status={metabase.data?.status} /> },
              ]}
            />
          </Section>
          <Section title="Origin">
            <Provenance report={r} />
          </Section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish to Metabase?"
        description={`"${r.name}" will be created as a Metabase question in the workspace's default collection, visible to everyone with access to that collection.`}
        confirmLabel="Publish"
        onConfirm={runPublish}
      />
    </div>
  )
}
