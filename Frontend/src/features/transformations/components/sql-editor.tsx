import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

const INDENT = '  '
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

/**
 * Plain-text SQL editor: monospace textarea with a line-number gutter. Tab inserts
 * two spaces and Shift+Tab outdents the current line. Press Escape first to let Tab
 * move focus out of the editor.
 */
export function SqlEditor({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  height = 440,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  invalid?: boolean
  describedBy?: string
  height?: number
}) {
  const gutterRef = useRef<HTMLDivElement>(null)
  const escaped = useRef(false)
  const lineCount = value.split('\n').length

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      escaped.current = true
      return
    }
    // Modifier presses (for example Shift before Shift+Tab) keep the pending Escape.
    if (MODIFIER_KEYS.has(event.key)) return
    if (event.key !== 'Tab' || escaped.current || event.ctrlKey || event.metaKey || event.altKey) {
      escaped.current = false
      return
    }
    event.preventDefault()
    const el = event.currentTarget
    const { selectionStart: start, selectionEnd: end } = el
    if (event.shiftKey) {
      const lineStart = el.value.lastIndexOf('\n', start - 1) + 1
      const remove = el.value.startsWith(INDENT, lineStart) ? INDENT.length : el.value[lineStart] === ' ' ? 1 : 0
      if (!remove) return
      el.setRangeText('', lineStart, lineStart + remove, 'preserve')
      el.setSelectionRange(Math.max(lineStart, start - remove), Math.max(lineStart, end - remove))
    } else {
      el.setRangeText(INDENT, start, end, 'end')
    }
    onChange(el.value)
  }

  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-lg border bg-background font-mono text-[12.5px] leading-[1.6] shadow-xs focus-within:ring-2 focus-within:ring-ring/20',
        invalid ? 'border-danger focus-within:ring-danger/20' : 'border-input focus-within:border-ring',
      )}
      style={{ height }}
    >
      <div
        ref={gutterRef}
        aria-hidden
        className="w-12 shrink-0 overflow-hidden border-r border-border bg-surface py-2 pr-3 text-right text-subtle-foreground tabular select-none"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
        {/* Room for the textarea's horizontal scrollbar so the last numbers stay aligned. */}
        <div className="h-4" />
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop
        }}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-multiline="true"
        className="scrollbar-thin h-full flex-1 resize-none overflow-auto bg-transparent py-2 pr-4 pl-3 whitespace-pre text-foreground outline-none"
      />
    </div>
  )
}
