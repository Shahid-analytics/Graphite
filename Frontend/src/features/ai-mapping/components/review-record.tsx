import { KeyValueGrid, TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import type { MappingReview } from '@/types'

/** Read-only outcome of an approval or rejection. */
export function ReviewRecord({ review }: { review: MappingReview }) {
  const approved = review.action === 'approved'
  return (
    <Notice tone={approved ? 'success' : 'danger'} title={approved ? `Approved by ${review.reviewed_by.name}` : `Rejected by ${review.reviewed_by.name}`}>
      <KeyValueGrid
        columns={2}
        className="mt-2"
        items={[
          { label: 'Reviewed', value: <TimeAgo value={review.reviewed_at} /> },
          { label: 'Outcome', value: approved ? 'Approved' : 'Rejected' },
        ]}
      />
      <div className="mt-3">
        <p className="text-xs text-muted-foreground">Comment</p>
        <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{review.comment || 'No comment.'}</p>
      </div>
    </Notice>
  )
}
