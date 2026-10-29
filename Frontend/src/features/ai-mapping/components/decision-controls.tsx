import { Check, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ReviewDecision } from '@/types'
import { DecisionBadge } from './status-badges'

/**
 * Accept / Reject / Edit controls for one suggestion. When `lockedReason` is set the
 * decision is shown read-only with the reason in a tooltip.
 */
export function DecisionControls({
  label,
  decision,
  unsaved,
  lockedReason,
  onDecide,
  onEdit,
  className,
}: {
  /** Accessible name of the item, e.g. "invoices.invoice_no to fct_billing.invoice_number". */
  label: string
  decision: ReviewDecision
  unsaved?: boolean
  lockedReason?: string | null
  onDecide: (decision: 'accepted' | 'rejected') => void
  onEdit?: () => void
  className?: string
}) {
  if (lockedReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className={cn('inline-flex', className)}>
            <DecisionBadge decision={decision} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{lockedReason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label={`Decision for ${label}`} onClick={(e) => e.stopPropagation()}>
      <DecisionBadge decision={decision} unsaved={unsaved} className="mr-0.5" />
      <Button
        type="button"
        size="icon-sm"
        variant={decision === 'accepted' ? 'default' : 'outline'}
        className="size-7"
        aria-pressed={decision === 'accepted'}
        aria-label={`Accept ${label}`}
        title="Accept"
        onClick={() => onDecide('accepted')}
      >
        <Check className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={decision === 'rejected' ? 'destructive' : 'outline'}
        className="size-7"
        aria-pressed={decision === 'rejected'}
        aria-label={`Reject ${label}`}
        title="Reject"
        onClick={() => onDecide('rejected')}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
      {onEdit ? (
        <Button
          type="button"
          size="icon-sm"
          variant={decision === 'modified' ? 'secondary' : 'outline'}
          className="size-7"
          aria-label={`Edit ${label}`}
          title="Edit"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
