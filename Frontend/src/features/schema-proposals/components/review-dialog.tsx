import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/use-auth'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { ReviewSchemaProposalRequest, SchemaProposal } from '@/types'
import { useReviewProposal } from '../queries'

export type ReviewAction = ReviewSchemaProposalRequest['action']

const COPY: Record<ReviewAction, { title: string; description: string; confirm: string; success: string; placeholder: string }> = {
  approve: {
    title: 'Approve proposal',
    description: 'Approval allows an admin to apply the proposal. Applying runs dbt in the backend to create or alter the models.',
    confirm: 'Approve',
    success: 'Proposal approved',
    placeholder: 'Optional note for the author',
  },
  request_changes: {
    title: 'Request changes',
    description: 'The proposal returns to draft so the author can edit and resubmit it.',
    confirm: 'Request changes',
    success: 'Changes requested',
    placeholder: 'What needs to change before you can approve?',
  },
  reject: {
    title: 'Reject proposal',
    description: 'A rejected proposal cannot be applied. The author can delete it and start a new one.',
    confirm: 'Reject',
    success: 'Proposal rejected',
    placeholder: 'Why is this proposal rejected?',
  },
}

const schema = z.object({ comment: z.string().trim().max(2000, 'Keep the comment under 2000 characters.') })
type Values = z.infer<typeof schema>

export function ReviewDialog({
  proposal,
  action,
  onOpenChange,
}: {
  proposal: SchemaProposal
  /** The dialog is open while an action is set. */
  action: ReviewAction | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">{action ? <ReviewForm key={action} proposal={proposal} action={action} onDone={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  )
}

function ReviewForm({ proposal, action, onDone }: { proposal: SchemaProposal; action: ReviewAction; onDone: () => void }) {
  const copy = COPY[action]
  const { session } = useAuth()
  const review = useReviewProposal(proposal.id)
  const requireComment = action !== 'approve'
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { comment: '' } })
  const selfReview = session?.user.id === proposal.created_by.id

  const onSubmit = form.handleSubmit(async ({ comment }) => {
    if (requireComment && comment.length < 3) {
      form.setError('comment', { type: 'required', message: action === 'reject' ? 'Explain why the proposal is rejected.' : 'Describe the changes you need.' }, { shouldFocus: true })
      return
    }
    try {
      await review.mutateAsync({ action, comment: comment || undefined })
      toastSuccess(copy.success, proposal.title)
      onDone()
    } catch (error) {
      const fieldError = isApiError(error) ? error.fieldErrors.find((f) => f.field === 'comment') : undefined
      if (fieldError) form.setError('comment', { type: 'server', message: fieldError.message }, { shouldFocus: true })
      toastError(error, `Could not ${copy.confirm.toLowerCase()}`, { shownFields: ['comment'] })
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      {selfReview && action === 'approve' ? (
        <Notice tone="warning">You created this proposal. Approving your own change is allowed but recorded as a self-review in the audit trail.</Notice>
      ) : null}
      <FormField label={requireComment ? 'Comment' : 'Comment (optional)'} htmlFor="review-comment" required={requireComment} error={form.formState.errors.comment?.message}>
        <Textarea {...form.register('comment')} rows={4} placeholder={copy.placeholder} autoFocus />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={review.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant={action === 'reject' ? 'destructive' : 'default'} loading={review.isPending}>
          {copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  )
}
