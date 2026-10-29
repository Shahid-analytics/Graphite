import { Download, Loader2, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SearchInput } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/services/api-error'
import { runsService } from '@/services/runs.service'
import type { LogLevel, LogLine } from '@/types'
import { STAGE_META } from './labels'

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-subtle-foreground',
  info: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-danger',
}

const LEVEL_TAG: Record<LogLevel, string> = { debug: 'DEBUG', info: 'INFO', warning: 'WARN', error: 'ERROR' }

/**
 * Fetches log lines incrementally with the `after` cursor and polls every 2 seconds
 * until the server reports the log as complete. Lines are kept in memory only.
 */
function useIncrementalLogs(runId: string) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [complete, setComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const cursorRef = useRef(0)
  /** True once lines were fetched while the run was still active. */
  const streamedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const response = await runsService.logs(runId, cursorRef.current)
        if (cancelled) return
        if (response.complete && streamedRef.current) {
          // Fetch the finished log once so the buffer matches the server exactly. Line numbers
          // are append-only, but timestamps of lines streamed mid-stage can be refined later,
          // and a live backend may not guarantee either; one extra request per run is cheap.
          const full = await runsService.logs(runId, 0)
          if (cancelled) return
          setLines(full.lines)
          cursorRef.current = full.next_cursor
          streamedRef.current = false
        } else {
          if (response.lines.length) {
            setLines((prev) => {
              const seen = new Set(prev.map((l) => l.seq))
              return [...prev, ...response.lines.filter((l) => !seen.has(l.seq))]
            })
          }
          cursorRef.current = Math.max(cursorRef.current, response.next_cursor)
        }
        setError(null)
        setLoading(false)
        setComplete(response.complete)
        if (!response.complete) {
          streamedRef.current = true
          timer = setTimeout(tick, LIVE_POLL_MS)
        }
      } catch (err) {
        if (cancelled) return
        setError(err)
        setLoading(false)
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runId, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { lines, complete, loading, error, retry }
}

function formatLine(line: LogLine) {
  const stage = line.stage ? ` [${line.stage}]` : ''
  return `${line.ts} ${LEVEL_TAG[line.level].padEnd(5)}${stage} ${line.message}`
}

interface LogViewerProps {
  runId: string
  className?: string
  maxHeight?: number
}

/** Monospace run log with level filter, search, auto-scroll and download. */
export function LogViewer(props: LogViewerProps) {
  // Keyed by run so switching runs starts a fresh cursor and buffer.
  return <RunLog key={props.runId} {...props} />
}

function RunLog({ runId, className, maxHeight = 420 }: LogViewerProps) {
  const { lines, complete, loading, error, retry } = useIncrementalLogs(runId)
  const [level, setLevel] = useState<'all' | LogLevel>('all')
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return lines.filter((l) => (level === 'all' || l.level === level) && (!needle || l.message.toLowerCase().includes(needle) || (l.stage ?? '').includes(needle)))
  }, [lines, level, search])

  useEffect(() => {
    const el = scrollRef.current
    if (autoScroll && el) el.scrollTop = el.scrollHeight
  }, [visible.length, autoScroll])

  const download = () => {
    const blob = new Blob([lines.map(formatLine).join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${runId}.log`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const errorCount = lines.filter((l) => l.level === 'error').length
  const warningCount = lines.filter((l) => l.level === 'warning').length

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-background', className)}>
      <div className="flex flex-col gap-2 border-b border-border bg-surface px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search logs" className="sm:w-56" />
        <Select value={level} onValueChange={(v) => setLevel(v as 'all' | LogLevel)}>
          <SelectTrigger size="sm" className="w-full sm:w-36" aria-label="Log level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="error">Errors{errorCount ? ` (${errorCount})` : ''}</SelectItem>
            <SelectItem value="warning">Warnings{warningCount ? ` (${warningCount})` : ''}</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch id={`autoscroll-${runId}`} checked={autoScroll} onCheckedChange={setAutoScroll} />
          <Label htmlFor={`autoscroll-${runId}`} className="text-xs font-normal text-muted-foreground">
            Auto-scroll
          </Label>
          <Button variant="outline" size="sm" onClick={download} disabled={!lines.length}>
            <Download aria-hidden />
            Download .log
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          // Scrolling up to read older lines pauses auto-scroll.
          const el = event.currentTarget
          if (autoScroll && el.scrollHeight - el.scrollTop - el.clientHeight > 48) setAutoScroll(false)
        }}
        role="log"
        aria-live="off"
        aria-label="Run log"
        tabIndex={0}
        className="scrollbar-thin overflow-auto bg-background py-2 font-mono text-[12px] leading-[1.65]"
        style={{ maxHeight }}
      >
        {loading ? (
          <div className="space-y-2 px-3 py-1" aria-busy="true" aria-label="Loading logs">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
            ))}
          </div>
        ) : !lines.length && !error ? (
          <p className="px-3 py-4 font-sans text-sm text-muted-foreground">{complete ? 'This run produced no log output.' : 'Waiting for the worker to start writing logs.'}</p>
        ) : !visible.length && lines.length ? (
          <p className="px-3 py-4 font-sans text-sm text-muted-foreground">No log lines match the current filters.</p>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {visible.map((line) => (
                <tr key={line.seq} className={cn('align-top hover:bg-surface', line.level === 'error' && 'bg-danger-soft/60')}>
                  <td className="w-10 pr-2 pl-3 text-right text-subtle-foreground select-none tabular">{line.seq}</td>
                  <td className="pr-3 whitespace-nowrap text-subtle-foreground tabular">
                    <time dateTime={line.ts}>{formatTime(line.ts)}</time>
                  </td>
                  <td className={cn('pr-3 whitespace-nowrap', LEVEL_CLASS[line.level])}>{LEVEL_TAG[line.level]}</td>
                  <td className="hidden pr-3 whitespace-nowrap text-subtle-foreground md:table-cell">{line.stage ? STAGE_META[line.stage].short : 'run'}</td>
                  <td className={cn('pr-3 break-words whitespace-pre-wrap', line.level === 'error' ? 'text-danger' : 'text-foreground')}>{line.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground">
        <span className="tabular">
          {visible.length === lines.length ? `${lines.length} lines` : `${visible.length} of ${lines.length} lines`}
        </span>
        {error ? (
          <span className="flex items-center gap-2 text-danger" role="alert">
            Could not load logs: {errorMessage(error)}
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={retry}>
              <RotateCw className="size-3" aria-hidden />
              Retry
            </Button>
          </span>
        ) : complete ? (
          <span>Log complete</span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Streaming new lines every {LIVE_POLL_MS / 1000}s
          </span>
        )}
      </div>
    </div>
  )
}
