import { CheckCircle2, XCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/textarea'
import { isApiError } from '@/services/api-error'
import type { MappingSuggestionSet } from '@/types'
import { DisabledReason } from './disabled-reason'

const MAX_COMMENT = 2000

/** Approve or reject a submitted suggestion set (requires mappings:approve). */
export function ReviewerPanel({
  set,
  pendingCount,
  unsavedCount,
  canApprove,
  onAction,
}: {
  set: MappingSuggestionSet
  pendingCount: number
  unsavedCount: number
  canApprove: boolean
  /** Sends the review action with any unsaved decisions. Rejects on failure. */
  onAction: (action: 'approve' | 'reject', comment: string) => Promise<unknown>
}) {
  const commentId = useId()
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null)

  const permissionReason = canApprove ? null : 'Your role does not include the mappings:approve permission. Ask a workspace admin to review this set.'
  const approveReason =
    permissionReason ?? (pendingCount > 0 ? `${pendingCount} suggestion${pendingCount === 1 ? ' is' : 's are'} still pending. Decide every item before approving.` : null)

  const run = async (action: 'approve' | 'reject') => {
    try {
      await onAction(action, comment.trim())
      setComment('')
    } catch (err) {
      const field = isApiError(err) ? err.fieldErrors.find((f) => f.field === 'comment') : undefined
      if (field) setError(field.message)
      throw err
    }
  }

  const requestReject = () => {
    if (!comment.trim()) {
      setError('Explain why the suggestions are rejected so the author can act on it.')
      document.getElementById(commentId)?.focus()
      return
    }
    setConfirm('reject')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval</CardTitle>
        <CardDescription>
          Requested by {set.created_by.name}, submitted <TimeAgo value={set.submitted_at} />. Approving does not change the warehouse; it unlocks creating a schema proposal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormField
          label="Review comment"
          htmlFor={commentId}
          error={error ?? undefined}
          description={`Required when rejecting. ${comment.length}/${MAX_COMMENT}`}
        >
          <Textarea
            rows={3}
            value={comment}
            maxLength={MAX_COMMENT}
            disabled={!canApprove}
            placeholder="e.g. Agreed with finance. Keep GSTIN nullable for unregistered dealers."
            onChange={(e) => {
              setComment(e.target.value)
              if (error) setError(null)
            }}
          />
        </FormField>
        {unsavedCount && canApprove ? (
          <p className="text-xs text-muted-foreground">Your {unsavedCount} unsaved decision {unsavedCount === 1 ? 'change is' : 'changes are'} saved together with the review.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <DisabledReason reason={approveReason}>
            <Button onClick={() => setConfirm('approve')} disabled={Boolean(approveReason)}>
              <CheckCircle2 aria-hidden />
              Approve
            </Button>
          </DisabledReason>
          <DisabledReason reason={permissionReason}>
            <Button variant="outline" onClick={requestReject} disabled={Boolean(permissionReason)}>
              <XCircle aria-hidden />
              Reject
            </Button>
          </DisabledReason>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirm === 'approve'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Approve these mapping suggestions?"
        description="The set becomes read-only. Nothing is applied to the warehouse until a schema proposal is created, approved and applied via dbt."
        confirmLabel="Approve"
        onConfirm={() => run('approve')}
      />
      <ConfirmDialog
        open={confirm === 'reject'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Reject these mapping suggestions?"
        description="The set becomes read-only and cannot be used for a schema proposal. The author can request new suggestions."
        confirmLabel="Reject"
        destructive
        onConfirm={() => run('reject')}
      />
    </Card>
  )
}
