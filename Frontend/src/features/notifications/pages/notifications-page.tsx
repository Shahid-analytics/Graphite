import { isToday, isYesterday, parseISO } from 'date-fns'
import { BellOff, CheckCheck, Inbox, MailCheck, SearchX, SlidersHorizontal } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { NOTIFICATION_TYPE_LABELS } from '@/components/status/notification-icon'
import { SimulatedBadge } from '@/components/status/simulated'
import { FilterSelect, Pagination } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDate } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Notification, NotificationType } from '@/types'
import { NotificationItem } from '../components/notification-item'
import {
  useMarkAllNotificationsRead,
  useNotificationCounts,
  useNotificationList,
  useSetNotificationRead,
  type NotificationTab,
} from '../queries'

const TABS: { value: NotificationTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
]

const TYPE_OPTIONS = (Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((value) => ({ value, label: NOTIFICATION_TYPE_LABELS[value] }))

function readTab(value: string | null): NotificationTab {
  return value === 'unread' || value === 'read' ? value : 'all'
}

function readType(value: string | null): NotificationType | undefined {
  return value && value in NOTIFICATION_TYPE_LABELS ? (value as NotificationType) : undefined
}

function dayLabel(iso: string) {
  const date = parseISO(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return formatDate(date)
}

/** Groups an already sorted page of notifications under day headings. */
function groupByDay(items: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = []
  for (const item of items) {
    const label = dayLabel(item.created_at)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border rounded-lg border border-border" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3.5">
          <Skeleton className="ml-5 size-7 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CountPill({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return <span className="rounded-sm bg-surface-2 px-1.5 text-[11px] leading-4 font-medium tabular text-muted-foreground">{value}</span>
}

export default function NotificationsPage() {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = readTab(params.get('tab'))
  const type = readType(params.get('type'))
  const page = Math.max(1, Number(params.get('page')) || 1)

  const list = useNotificationList(workspaceId, tab, type, page)
  const counts = useNotificationCounts(workspaceId, type)
  const setRead = useSetNotificationRead()
  const markAll = useMarkAllNotificationsRead(workspaceId)

  const updateParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (resetPage) next.delete('page')
        return next
      })
    },
    [setParams],
  )

  const setTab = (value: string) => updateParams({ tab: value === 'all' ? null : value })
  const setType = (value: string) => updateParams({ type: value === 'all' ? null : value })
  const setPage = (value: number) => updateParams({ page: value > 1 ? String(value) : null }, false)

  const toggleRead = (item: Notification) => {
    const read = !item.read_at
    setRead.mutate(
      { id: item.id, read },
      { onError: (error) => toastError(error, read ? 'Could not mark as read' : 'Could not mark as unread') },
    )
  }

  const openItem = (item: Notification) => {
    if (!item.read_at) {
      setRead.mutate({ id: item.id, read: true }, { onError: (error) => toastError(error, 'Could not mark as read') })
    }
    const path = item.resource ? resourcePath(workspaceId, item.resource.type, item.resource.id) : null
    if (path) navigate(path)
  }

  // Unread for the current type filter (all types when none is selected); list and counts report the same value.
  const unreadInView = counts.unread ?? list.data?.unread_count ?? 0

  const markAllRead = () =>
    markAll.mutate(type, {
      onSuccess: ({ updated }) =>
        updated ? toastSuccess(`Marked ${updated} notification${updated === 1 ? '' : 's'} as read`) : toastSuccess('Everything is already read'),
      onError: (error) => toastError(error, 'Could not mark notifications as read'),
    })

  const groups = useMemo(() => groupByDay(list.data?.items ?? []), [list.data])
  const typeLabel = type ? NOTIFICATION_TYPE_LABELS[type].toLowerCase() : null
  const pendingId = setRead.isPending ? setRead.variables?.id : undefined

  const emptyState = () => {
    if (type) {
      return (
        <EmptyState
          icon={SearchX}
          title={`No ${tab === 'all' ? '' : `${tab} `}${typeLabel} notifications`}
          description="Try another notification type or tab."
          action={
            <Button variant="outline" size="sm" onClick={() => setType('all')}>
              Show all types
            </Button>
          }
        />
      )
    }
    if (tab === 'unread') {
      return (
        <EmptyState
          icon={MailCheck}
          title="You are all caught up"
          description="New pipeline failures, quality alerts and schema changes will appear here."
          action={
            <Button variant="outline" size="sm" onClick={() => setTab('all')}>
              View all notifications
            </Button>
          }
        />
      )
    }
    if (tab === 'read') {
      return (
        <EmptyState
          icon={Inbox}
          title="No read notifications"
          description="Notifications move here once you open them or mark them as read."
          action={
            unreadInView ? (
              <Button variant="outline" size="sm" onClick={() => setTab('unread')}>
                View unread
              </Button>
            ) : null
          }
        />
      )
    }
    return (
      <EmptyState
        icon={BellOff}
        title="No notifications yet"
        description="You will be notified about pipeline failures, completed syncs, repeated retries, data quality failures, schema changes and stale data."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={wsPath(workspaceId, 'settings', 'notifications')}>Configure notifications</Link>
          </Button>
        }
      />
    )
  }

  const renderList = () => {
    if (list.isLoading) return <ListSkeleton />
    if (list.isError && !list.data) return <ErrorState error={list.error} title="Could not load notifications" onRetry={() => list.refetch()} />
    const data = list.data
    if (!data) return null
    if (!data.items.length && data.total > 0) {
      return (
        <EmptyState
          icon={SearchX}
          title="This page is past the end of the list"
          action={
            <Button variant="outline" size="sm" onClick={() => setPage(1)}>
              Go to first page
            </Button>
          }
        />
      )
    }
    if (!data.items.length) return emptyState()
    return (
      <div className={list.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
        {list.isError ? <ErrorState compact className="mb-3" error={list.error} title="Could not refresh notifications" onRetry={() => list.refetch()} /> : null}
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="border-b border-border bg-surface px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
              <ul className="divide-y divide-border border-b border-border last:border-b-0">
                {group.items.map((item) => (
                  <NotificationItem
                    key={item.id}
                    notification={item}
                    workspaceId={workspaceId}
                    pending={pendingId === item.id}
                    onOpen={openItem}
                    onToggleRead={toggleRead}
                  />
                ))}
              </ul>
            </section>
          ))}
          {data.total > data.page_size ? (
            <Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.total / data.page_size))} total={data.total} pageSize={data.page_size} onPageChange={setPage} />
          ) : null}
        </div>
      </div>
    )
  }

  const countFor = (value: NotificationTab) => (value === 'all' ? counts.all : value === 'unread' ? counts.unread : counts.read)

  return (
    <div>
      <PageHeader
        title="Notifications"
        meta={<SimulatedBadge label="Demo data" reason="Notifications in demo mode come from the in-browser mock API and describe simulated runs." />}
        description="Alerts about pipeline failures, completed syncs, repeated retries, data quality, schema changes and stale data in this workspace."
        actions={
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button asChild variant="outline">
              <Link to={wsPath(workspaceId, 'settings', 'notifications')}>
                <SlidersHorizontal aria-hidden />
                Preferences
              </Link>
            </Button>
            {unreadInView ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={markAllRead} loading={markAll.isPending}>
                    {markAll.isPending ? null : <CheckCheck aria-hidden />}
                    Mark all as read
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {typeLabel
                    ? `Marks the ${unreadInView} unread ${typeLabel} notifications in this workspace as read. Other types stay unread.`
                    : `Marks all ${unreadInView} unread notifications in this workspace as read.`}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex rounded-md">
                    <Button disabled>
                      <CheckCheck aria-hidden />
                      Mark all as read
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{typeLabel ? `There are no unread ${typeLabel} notifications.` : 'There are no unread notifications.'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <TabsList className="sm:w-auto sm:flex-1" aria-label="Filter by read state">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                <CountPill value={countFor(item.value)} />
              </TabsTrigger>
            ))}
          </TabsList>
          <FilterSelect label="Types" value={type ?? 'all'} onChange={setType} options={TYPE_OPTIONS} className="sm:mb-1 sm:w-48" />
        </div>
        <p className="sr-only" aria-live="polite">
          {counts.unread !== undefined ? `${counts.unread} unread${typeLabel ? ` ${typeLabel}` : ''} notifications` : ''}
        </p>
        {TABS.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            {renderList()}
          </TabsContent>
        ))}
      </Tabs>

      <p className="mt-4 text-xs text-muted-foreground">
        Choose which events notify you in-app or by email in{' '}
        <Link to={wsPath(workspaceId, 'settings', 'notifications')} className="font-medium text-foreground underline-offset-4 hover:underline">
          Settings &gt; Notifications
        </Link>
        .
      </p>
    </div>
  )
}
