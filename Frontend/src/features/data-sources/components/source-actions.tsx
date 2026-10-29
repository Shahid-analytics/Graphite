import { PlugZap, RotateCw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import type { IngestionMode, Run, Source } from '@/types'
import { useDeleteSource, useSyncSource, useTestSourceConnection, useUpdateSource } from '../queries'
import { ConnectionTestResult } from './connection-test-result'
import { permissionReason } from './primitives'

export interface SourceActionState {
  syncReason: string | null
  writeReason: string | null
  testReason: string | null
}

/** Why each action is unavailable for this source and role (null when allowed). */
export function useSourceActionState(source: Source | undefined): SourceActionState {
  const canSync = usePermission('sources:sync')
  const canWrite = usePermission('sources:write')
  let syncReason: string | null = null
  if (!canSync) syncReason = permissionReason('sources:sync')
  else if (source?.status === 'paused') syncReason = 'This source is paused. Resume it to sync.'
  else if (source?.status === 'draft') syncReason = 'Finish configuring this draft source before syncing.'
  return {
    syncReason,
    writeReason: canWrite ? null : permissionReason('sources:write'),
    testReason: canSync ? null : permissionReason('sources:sync'),
  }
}

/**
 * Shared source actions with their dialogs. Render `dialogs` once in the page.
 */
export function useSourceActions(options: { onSyncStarted?: (run: Run, source: Source) => void; onDeleted?: (source: Source) => void } = {}) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const sync = useSyncSource()
  const update = useUpdateSource()
  const remove = useDeleteSource()
  const test = useTestSourceConnection()
  const [testing, setTesting] = useState<Source | null>(null)
  const [deleting, setDeleting] = useState<Source | null>(null)
  const [deleteError, setDeleteError] = useState<unknown>(null)

  const startSync = (source: Source, mode?: IngestionMode) =>
    sync.mutate(
      { sourceId: source.id, payload: mode ? { mode } : {} },
      {
        onSuccess: (run) => {
          toastSuccess(mode === 'full' ? 'Full refresh queued' : 'Sync queued', `${source.name}: run ${run.id}. Live progress is shown on this page.`)
          options.onSyncStarted?.(run, source)
        },
        onError: (error) => toastError(error, `Could not start a sync for ${source.name}`),
      },
    )

  const togglePause = (source: Source) => {
    const next = source.status === 'paused' ? 'active' : 'paused'
    update.mutate(
      { sourceId: source.id, payload: { status: next } },
      {
        onSuccess: (updated) =>
          toastSuccess(
            next === 'paused' ? `${source.name} paused` : `${source.name} resumed`,
            next === 'paused' ? 'Scheduled syncs are suspended until you resume.' : updated.next_sync_at ? 'Scheduled syncs will run again.' : undefined,
          ),
        onError: (error) => toastError(error, next === 'paused' ? 'Could not pause the source' : 'Could not resume the source'),
      },
    )
  }

  const openTest = (source: Source) => {
    setTesting(source)
    test.reset()
    test.mutate({ sourceId: source.id })
  }

  const openDelete = (source: Source) => {
    setDeleteError(null)
    setDeleting(source)
  }

  const inUse = isApiError(deleteError) && deleteError.code === 'source_in_use'
  const pipelines = inUse ? ((deleteError.details?.pipelines as { id: string; name: string }[] | undefined) ?? []) : []
  const authFailed = test.data && !test.data.success && test.data.error?.code === 'source_auth_failed'

  const dialogs = (
    <>
      <Dialog
        open={Boolean(testing)}
        onOpenChange={(open) => {
          if (!open) setTesting(null)
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Test connection</DialogTitle>
            <DialogDescription>Checks network reachability, authentication, permissions and limits for {testing?.name} using the stored credentials.</DialogDescription>
          </DialogHeader>
          {test.isPending ? (
            <div className="space-y-2" aria-busy="true" aria-label="Testing connection">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : test.error ? (
            <Notice tone="danger" title="The test could not be run">
              {errorMessage(test.error)}
            </Notice>
          ) : test.data ? (
            <ConnectionTestResult result={test.data} />
          ) : null}
          {authFailed ? (
            <Notice tone="warning" title="Credentials need attention">
              Replace the stored password or secret in the source settings, then test again.
            </Notice>
          ) : null}
          <DialogFooter>
            {authFailed && testing ? (
              <Button
                variant="outline"
                onClick={() => {
                  const target = testing
                  setTesting(null)
                  navigate(`${wsPath(workspaceId, 'sources', target.id)}?tab=settings`)
                }}
              >
                Update credentials
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => testing && test.mutate({ sourceId: testing.id })} loading={test.isPending}>
              <RotateCw className="size-3.5" aria-hidden />
              Test again
            </Button>
            <Button onClick={() => setTesting(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? 'source'}?`}
        description="The connection, its credentials and its sync schedule are removed. Data already loaded into Bronze stays in the warehouse; dependent models stop receiving new data."
        confirmLabel="Delete source"
        destructive
        confirmText={deleting?.name}
        onConfirm={async () => {
          if (!deleting) return
          const source = deleting
          try {
            await remove.mutateAsync(source.id)
            toastSuccess(`${source.name} deleted`, 'Its schedule was removed. Bronze data was retained.')
            options.onDeleted?.(source)
          } catch (error) {
            setDeleteError(error)
            toastError(error, 'Could not delete the source')
            throw error
          }
        }}
      >
        {inUse ? (
          <Notice tone="danger" title="This source is used by pipelines" icon={PlugZap}>
            <p>Remove it from these pipelines first:</p>
            <ul className="mt-1 list-disc pl-4">
              {pipelines.map((p) => (
                <li key={p.id}>
                  <Link className="underline underline-offset-2 hover:text-foreground" to={wsPath(workspaceId, 'pipelines', p.id)}>
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Notice>
        ) : deleteError ? (
          <Notice tone="danger">{errorMessage(deleteError)}</Notice>
        ) : null}
      </ConfirmDialog>
    </>
  )

  return {
    startSync,
    togglePause,
    openTest,
    openDelete,
    dialogs,
    syncPending: sync.isPending,
    updatePending: update.isPending,
  }
}
