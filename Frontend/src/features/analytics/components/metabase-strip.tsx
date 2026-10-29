import { RotateCw, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { HelpTip, TimeAgo } from '@/components/data/display'
import { MetabaseStatusBadge } from '@/components/metabase/metabase-embed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/services/api-error'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import type { MetabaseStatus } from '@/types'
import { useMetabaseStatus, useTestMetabase } from '../queries'

function resultToast(status: MetabaseStatus) {
  if (status.status === 'connected') toastSuccess('Metabase is connected', status.version ? `Metabase ${status.version}` : undefined)
  else toastInfo(status.status === 'not_configured' ? 'Metabase is not configured' : 'Metabase connection failed', status.message ?? undefined)
}

/** Integration summary shown above the analytics catalog. */
export function MetabaseStrip({ workspaceId, settingsHref }: { workspaceId: string; settingsHref: string }) {
  const status = useMetabaseStatus(workspaceId)
  const test = useTestMetabase(workspaceId)
  const data = status.data

  return (
    <section aria-labelledby="metabase-strip-title" className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <h2 id="metabase-strip-title" className="font-medium">
              Metabase
            </h2>
            <HelpTip label="About the Metabase integration">
              Dashboards and reports are served by Metabase. Graphite embeds them with short-lived URLs signed by the backend, and publishes reviewed report drafts as Metabase questions.
            </HelpTip>
          </span>
          {status.isPending ? (
            <Skeleton className="h-5 w-40" />
          ) : status.isError ? (
            <span className="text-danger">Status unavailable: {errorMessage(status.error)}</span>
          ) : (
            <>
              <span aria-live="polite">
                <MetabaseStatusBadge status={data?.status} />
              </span>
              {data?.site_url ? (
                <span className="min-w-0 truncate font-mono text-[13px] text-muted-foreground" title={data.site_url}>
                  {data.site_url}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Last checked {data?.last_checked_at ? <TimeAgo value={data.last_checked_at} /> : 'never'}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={test.isPending}
            onClick={() => test.mutate(undefined, { onSuccess: resultToast, onError: (error) => toastError(error, 'Connection test failed') })}
          >
            <RotateCw aria-hidden />
            Test connection
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={settingsHref}>
              <Settings aria-hidden />
              Settings
            </Link>
          </Button>
        </div>
      </div>
      {data && data.status !== 'connected' && data.message ? <p className="mt-2 text-xs text-muted-foreground">{data.message}</p> : null}
      {status.isError ? (
        <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => void status.refetch()}>
          Retry
        </Button>
      ) : null}
    </section>
  )
}
