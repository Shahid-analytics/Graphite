import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Confirmation for destructive or consequential operations. `onConfirm` may be
 * async; the dialog stays open with a loading state until it settles and closes
 * only on success (errors are expected to be surfaced by the caller via toast).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  confirmText,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** When set, the user must type this text to enable the confirm button. */
  confirmText?: string
  onConfirm: () => unknown | Promise<unknown>
  children?: ReactNode
}) {
  const [pending, setPending] = useState(false)
  const [typed, setTyped] = useState('')
  const blocked = Boolean(confirmText) && typed !== confirmText

  const handleOpenChange = (next: boolean) => {
    if (pending) return
    if (!next) setTyped('')
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {confirmText ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text" className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{confirmText}</span> to confirm
            </Label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={pending}
            disabled={blocked}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                setTyped('')
                onOpenChange(false)
              } catch {
                // Caller reports the error; keep the dialog open for another attempt.
              } finally {
                setPending(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
