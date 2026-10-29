import type { ReviewItemType } from '@/types'

/** Shared review callbacks passed to every suggestion tab. */
export interface ReviewHandlers {
  isUnsaved: (type: ReviewItemType, id: string) => boolean
  /** Why decisions cannot be changed right now, or null when they can. */
  lockedReason: string | null
  onDecide: (type: ReviewItemType, id: string, decision: 'accepted' | 'rejected') => void
}
