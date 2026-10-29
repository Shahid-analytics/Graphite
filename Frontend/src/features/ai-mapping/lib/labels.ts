import type { BadgeProps } from '@/components/ui/badge'
import type { JoinCandidate, KeyCandidate, MappingSetStatus, ReviewDecision } from '@/types'

type Variant = NonNullable<BadgeProps['variant']>

export const STATUS_META: Record<MappingSetStatus, { label: string; variant: Variant; description: string }> = {
  generating: { label: 'Generating', variant: 'running', description: 'Suggestions are being prepared.' },
  ready: { label: 'Needs decisions', variant: 'outline', description: 'Review each suggestion, then submit for approval.' },
  in_review: { label: 'Awaiting approval', variant: 'warning', description: 'Submitted; waiting for an approver.' },
  approved: { label: 'Approved', variant: 'success', description: 'Approved. Not applied until a schema proposal is applied.' },
  rejected: { label: 'Rejected', variant: 'danger', description: 'Rejected by an approver.' },
  failed: { label: 'Failed', variant: 'danger', description: 'Generation failed.' },
}

export const STATUS_OPTIONS = (Object.keys(STATUS_META) as MappingSetStatus[]).map((value) => ({ value, label: STATUS_META[value].label }))

export const DECISION_META: Record<ReviewDecision, { label: string; variant: Variant }> = {
  pending: { label: 'Pending', variant: 'outline' },
  accepted: { label: 'Accepted', variant: 'success' },
  modified: { label: 'Modified', variant: 'info' },
  rejected: { label: 'Rejected', variant: 'danger' },
}

export const DECISION_OPTIONS = (Object.keys(DECISION_META) as ReviewDecision[]).map((value) => ({ value, label: DECISION_META[value].label }))

export const CARDINALITY_LABEL: Record<JoinCandidate['cardinality'], string> = {
  one_to_one: 'One to one',
  one_to_many: 'One to many',
  many_to_one: 'Many to one',
  many_to_many: 'Many to many',
}

export const KEY_TYPE_LABEL: Record<KeyCandidate['key_type'], string> = {
  primary: 'Primary',
  business: 'Business',
  surrogate: 'Surrogate',
}

export const LAYER_LABEL = { silver: 'Silver', gold: 'Gold' } as const

/** High-confidence threshold used by the bulk accept action. */
export const BULK_ACCEPT_THRESHOLD = 0.85
