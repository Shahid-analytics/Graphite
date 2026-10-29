import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'

/**
 * Asks for confirmation before leaving a page with unsaved form changes, both for
 * in-app navigation and for closing or reloading the tab.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname)
  const proceeding = useRef(false)

  useEffect(() => {
    if (!when) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (open) return
        if (proceeding.current) {
          proceeding.current = false
          return
        }
        if (blocker.state === 'blocked') blocker.reset()
      }}
      title="Discard unsaved changes?"
      description="You have changes on this page that have not been saved. Leaving now discards them."
      confirmLabel="Discard and leave"
      destructive
      onConfirm={() => {
        if (blocker.state !== 'blocked') return
        proceeding.current = true
        blocker.proceed()
      }}
    />
  )
}
