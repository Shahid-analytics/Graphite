import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, KeyRound, PlugZap, RotateCw, Settings, Unplug, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isApiError } from '@/services/api-error'
import { cn } from '@/lib/utils'
import type { EmbedSession, MetabaseConnectionStatus, MetabaseStatus } from '@/types'

const STATUS: Record<MetabaseConnectionStatus, { label: string; variant: NonNullable<BadgeProps['variant']>; icon: LucideIcon }> = {
  connected: { label: 'Connected', variant: 'success', icon: CheckCircle2 },
  not_configured: { label: 'Not configured', variant: 'outline', icon: Unplug },
  unreachable: { label: 'Unreachable', variant: 'warning', icon: PlugZap },
  auth_failed: { label: 'Authentication failed', variant: 'danger', icon: KeyRound },
}

/** Connection state of the workspace's Metabase integration. */
export function MetabaseStatusBadge({ status, className }: { status: MetabaseConnectionStatus | undefined; className?: string }) {
  if (!status) return <Badge variant="outline" className={className}>Unknown</Badge>
  const meta = STATUS[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant} className={cn('gap-1', className)}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  )
}

/** Refresh the signed URL this long before it expires. */
const REFRESH_LEAD_MS = 60_000
const MIN_REFRESH_MS = 10_000

/**
 * Accepts only an absolute http(s) URL on the configured Metabase origin. The
 * URL is always generated and signed by the backend; it is never built here.
 */
function safeEmbedUrl(url: string, siteUrl: string | null): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null
    if (siteUrl && new URL(siteUrl).origin !== parsed.origin) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function Frame({ height, children, className }: { height: number; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-background', className)} style={{ minHeight: height }}>
      {children}
    </div>
  )
}

function FrameSkeleton({ height, label }: { height: number; label: string }) {
  return (
    <Frame height={height} className="p-4">
      <div aria-busy="true" aria-label={label} className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </Frame>
  )
}

/**
 * Embeds a Metabase dashboard through a backend-signed, short-lived URL.
 * Shows the integration state instead whenever Metabase is not connected; it
 * never renders placeholder content in place of a real embed.
 */
export function MetabaseEmbed({
  status,
  statusLoading,
  statusError,
  requestEmbed,
  title,
  settingsHref,
  embedKey,
  onCheckAgain,
  checking = false,
  height = 640,
  className,
}: {
  status: MetabaseStatus | undefined
  statusLoading: boolean
  /** Error from loading the integration status, if any. */
  statusError?: unknown
  /** Asks the backend for a signed embed session. */
  requestEmbed: () => Promise<EmbedSession>
  /** Accessible title of the embedded content. */
  title: string
  /** Settings page for the Metabase integration. */
  settingsHref: string
  /** Query key for the embed session; defaults to a per-instance key. */
  embedKey?: readonly unknown[]
  /** Re-tests the connection ("Check again"). */
  onCheckAgain?: () => void
  checking?: boolean
  height?: number
  className?: string
}) {
  const fallbackKey = useId()
  const connected = status?.status === 'connected'
  const session = useQuery({
    queryKey: embedKey ?? ['analytics', 'embed', fallbackKey],
    queryFn: requestEmbed,
    enabled: connected,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const expires = query.state.data ? Date.parse(query.state.data.expires_at) : NaN
      if (!Number.isFinite(expires)) return false
      return Math.max(MIN_REFRESH_MS, expires - Date.now() - REFRESH_LEAD_MS)
    },
  })

  const settingsLink = (
    <Button asChild variant="outline" size="sm">
      <Link to={settingsHref}>
        <Settings aria-hidden />
        Metabase settings
      </Link>
    </Button>
  )
  const checkAgain = onCheckAgain ? (
    <Button variant="outline" size="sm" onClick={onCheckAgain} loading={checking}>
      <RotateCw aria-hidden />
      Check again
    </Button>
  ) : null

  if (statusLoading) return <FrameSkeleton height={height} label="Checking the Metabase integration" />

  if (!status) {
    return <ErrorState compact className={className} title="Could not check the Metabase integration" error={statusError ?? new Error('The integration status is unavailable.')} onRetry={onCheckAgain} />
  }

  if (status.status === 'not_configured') {
    return (
      <Notice className={className} tone="neutral" icon={Unplug} title="Metabase is not configured" action={settingsLink}>
        {status.message ?? 'Add the Metabase site URL and embedding secret in Settings to view dashboards here.'}
      </Notice>
    )
  }

  if (status.status === 'unreachable' || status.status === 'auth_failed') {
    return (
      <Notice
        className={className}
        tone={status.status === 'auth_failed' ? 'danger' : 'warning'}
        title={status.status === 'auth_failed' ? 'Metabase rejected the credentials' : 'Metabase is unreachable'}
        action={
          <>
            {checkAgain}
            {settingsLink}
          </>
        }
      >
        <p>{status.message ?? 'The dashboard cannot be embedded until the integration is healthy.'}</p>
        <p className="mt-1">Nothing is embedded while the integration is unavailable.</p>
      </Notice>
    )
  }

  if (session.isPending) return <FrameSkeleton height={height} label={`Loading ${title}`} />

  if (session.isError) {
    if (isApiError(session.error) && session.error.status === 409) {
      return (
        <Notice
          className={className}
          tone="warning"
          title="This dashboard cannot be embedded"
          action={
            <Button variant="outline" size="sm" onClick={() => void session.refetch()} loading={session.isFetching}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          }
        >
          {session.error.message}
        </Notice>
      )
    }
    return <ErrorState compact className={className} title="Could not open the embedded dashboard" error={session.error} onRetry={() => void session.refetch()} />
  }

  const src = safeEmbedUrl(session.data.embed_url, status.site_url)
  if (!src) {
    return (
      <Notice className={className} tone="danger" title="Embed refused">
        The backend returned an embed URL that does not match the configured Metabase site, so it was not loaded.
      </Notice>
    )
  }

  return (
    <Frame height={height} className={className}>
      <iframe
        key={src}
        src={src}
        title={title}
        className="block w-full border-0"
        style={{ height }}
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </Frame>
  )
}
