import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { isTerminal, type Run } from '@/types'
import { DOMAINS_FOR_KIND } from './labels'

/** Query key prefixes whose data a run of this kind can change (health, freshness, counts, alerts). */
export function runAffectedPrefixes(kind: Run['kind']): string[] {
  return ['overview', 'notifications', 'audit', 'schedules', ...DOMAINS_FOR_KIND[kind]]
}

/**
 * Refreshes the resources a run affects once it is observed moving from queued or
 * running to a terminal state, so source health, freshness and alert counts update
 * without a reload. Does nothing for runs that were already finished when loaded.
 */
export function useRefreshOnRunSettled(run: Pick<Run, 'id' | 'kind' | 'status'> | null | undefined) {
  const queryClient = useQueryClient()
  const previous = useRef<{ id: string; status: Run['status'] } | null>(null)
  const id = run?.id
  const kind = run?.kind
  const status = run?.status

  useEffect(() => {
    const before = previous.current
    previous.current = id && status ? { id, status } : null
    if (!id || !kind || !status || !before || before.id !== id) return
    if (isTerminal(before.status) || !isTerminal(status)) return
    for (const prefix of runAffectedPrefixes(kind)) void queryClient.invalidateQueries({ queryKey: [prefix] })
  }, [queryClient, id, kind, status])
}
