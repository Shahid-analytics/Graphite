import { SimulatedBadge } from '@/components/status/simulated'
import { Notice } from '@/components/feedback/notice'
import { formatDateTime } from '@/lib/format'
import type { ConnectionTestResponse } from '@/types'

/**
 * Result of a connection test. `inconclusive` renders a neutral notice for tests that could not run.
 * Stays mounted while there is no result: the screen-reader live region must exist before
 * its text changes for the result to be announced. The region is visually hidden and out of
 * flow, so it adds no grid row; `className` applies to the visible notice only.
 */
export function TestResult({
  result,
  inconclusive = false,
  note,
  className,
}: {
  result: ConnectionTestResponse | null
  inconclusive?: boolean
  note?: string
  className?: string
}) {
  const tone = inconclusive ? 'neutral' : result?.success ? 'success' : 'danger'
  const title = inconclusive ? 'Connection not verified' : result?.success ? 'Connection test passed' : 'Connection test failed'
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {result ? `${title}. ${result.message}` : ''}
      </p>
      {result ? (
        <div className={className}>
          <Notice
            tone={tone}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {title}
                <SimulatedBadge reason="The mock API does not contact databases, repositories or AI providers. This result is simulated from the saved settings." />
              </span>
            }
          >
            <p className="break-words">{result.message}</p>
            <p className="mt-1 text-xs text-subtle-foreground">
              Tested {formatDateTime(result.tested_at)}
              {note ? ` · ${note}` : ''}
            </p>
          </Notice>
        </div>
      ) : null}
    </>
  )
}
