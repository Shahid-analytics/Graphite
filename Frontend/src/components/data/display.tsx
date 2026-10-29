import { Check, Copy, HelpCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Compact metric tile. Keep these small; avoid oversized dashboard cards. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  icon,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'success' | 'warning' | 'danger'
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-background px-4 py-3.5 shadow-xs', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-subtle-foreground">{icon}</span> : null}
      </div>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold tracking-tight tabular',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function KeyValueGrid({
  items,
  columns = 2,
  className,
}: {
  items: { label: ReactNode; value: ReactNode; mono?: boolean }[]
  columns?: 1 | 2 | 3 | 4
  className?: string
}) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns]
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', cols, className)}>
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          {/* Values wrap rather than truncate: a clipped schedule or retry policy cannot be read anywhere else. */}
          <dd className={cn('mt-0.5 text-sm break-words', item.mono && 'font-mono text-[13px]')}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Relative time with the absolute timestamp in a tooltip. */
export function TimeAgo({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={cn('text-subtle-foreground', className)}>—</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value} className={cn('whitespace-nowrap', className)} tabIndex={0}>
          {formatRelative(value)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(value)}</TooltipContent>
    </Tooltip>
  )
}

/** Explains a technical concept on hover or focus. */
export function HelpTip({ children, label = 'More information', className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className={cn('inline-flex rounded-full text-subtle-foreground hover:text-foreground', className)}>
          <HelpCircle className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  )
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          setCopied(false)
        }
      }}
      className={cn('inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', className)}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}

const SQL_KEYWORDS = /\b(select|from|where|and|or|join|left|right|inner|full|outer|on|as|with|group|by|order|having|case|when|then|else|end|union|all|distinct|create|table|alter|add|column|primary|key|not|null|is|in|interval|coalesce|sum|count|max|min|avg|cast|true|false|using|limit|between|like|varchar|integer|bigint|numeric|boolean|date|char)\b/gi

function highlight(line: string) {
  const parts: ReactNode[] = []
  const templateRe = /(\{\{.*?\}\}|\{%.*?%\}|--.*$|'[^']*')/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  const pushKeywords = (text: string) => {
    let k = 0
    let m: RegExpExecArray | null
    const re = new RegExp(SQL_KEYWORDS)
    while ((m = re.exec(text))) {
      if (m.index > k) parts.push(text.slice(k, m.index))
      parts.push(
        <span key={`k${key++}`} className="font-semibold text-foreground">
          {m[0]}
        </span>,
      )
      k = m.index + m[0].length
    }
    if (k < text.length) parts.push(text.slice(k))
  }
  while ((match = templateRe.exec(line))) {
    if (match.index > last) pushKeywords(line.slice(last, match.index))
    const token = match[0]
    const cls = token.startsWith('--') ? 'italic text-subtle-foreground' : token.startsWith("'") ? 'text-muted-foreground' : 'text-running'
    parts.push(
      <span key={`t${key++}`} className={cls}>
        {token}
      </span>,
    )
    last = match.index + token.length
  }
  if (last < line.length) pushKeywords(line.slice(last))
  return parts
}

/** Read-only code viewer with line numbers and light SQL/Jinja highlighting. */
export function CodeBlock({
  code,
  language = 'sql',
  maxHeight = 480,
  className,
  title,
}: {
  code: string
  language?: 'sql' | 'text' | 'yaml' | 'json'
  maxHeight?: number
  className?: string
  title?: ReactNode
}) {
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-surface', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{title ?? language.toUpperCase()}</span>
        <CopyButton value={code} label="Copy code" />
      </div>
      <div className="scrollbar-thin overflow-auto" style={{ maxHeight }}>
        <pre className="min-w-full py-2 font-mono text-[12.5px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="w-10 shrink-0 select-none pr-3 text-right text-subtle-foreground tabular">{i + 1}</span>
              <code className="whitespace-pre pr-4 text-muted-foreground">{language === 'sql' ? highlight(line) : line || ' '}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
