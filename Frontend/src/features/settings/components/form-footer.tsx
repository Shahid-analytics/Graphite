import { Check, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { StatusDot } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { CardFooter } from '@/components/ui/card'
import { GatedButton } from './gated-button'

/**
 * Footer for settings forms: unsaved-change indicator, discard and save. Saving is
 * disabled with an explanation when the user lacks the required permission.
 */
export function FormFooter({
  dirty,
  saving,
  canEdit,
  blockedReason,
  onDiscard,
  saveLabel = 'Save changes',
  extra,
}: {
  dirty: boolean
  saving: boolean
  canEdit: boolean
  blockedReason: string
  onDiscard: () => void
  saveLabel?: string
  /** Additional actions shown before Discard (for example Test connection). */
  extra?: ReactNode
}) {
  return (
    <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
        {!canEdit ? (
          <>
            <Lock className="size-3.5" aria-hidden />
            Read-only
          </>
        ) : dirty ? (
          <>
            <StatusDot tone="warning" />
            Unsaved changes
          </>
        ) : (
          <>
            <Check className="size-3.5" aria-hidden />
            All changes saved
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {extra}
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard} disabled={!dirty || saving}>
            Discard
          </Button>
        ) : null}
        <GatedButton type="submit" size="sm" loading={saving} disabled={!dirty} blockedReason={canEdit ? null : blockedReason}>
          {saveLabel}
        </GatedButton>
      </div>
    </CardFooter>
  )
}
