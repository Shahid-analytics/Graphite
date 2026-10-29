import { AlertTriangle, XCircle } from 'lucide-react'
import { CodeBlock, HelpTip } from '@/components/data/display'
import type { ProposedSchemaChange } from '@/types'
import { HELP } from '../lib/labels'

/** Backend-rendered DDL (SQL) or dbt test (YAML) for one change. */
export function ChangeDdl({ change, maxHeight = 320 }: { change: Pick<ProposedSchemaChange, 'change_type' | 'ddl_preview'>; maxHeight?: number }) {
  if (!change.ddl_preview) {
    return <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">No DDL preview was rendered for this change.</p>
  }
  const yaml = change.change_type === 'add_relationship'
  return (
    <CodeBlock
      code={change.ddl_preview}
      language={yaml ? 'yaml' : 'sql'}
      maxHeight={maxHeight}
      title={
        <span className="inline-flex items-center gap-1">
          {yaml ? 'dbt test (YAML), preview only' : 'DDL (SQL), preview only'}
          <HelpTip label="About this preview">{HELP.ddl}</HelpTip>
        </span>
      }
    />
  )
}

export function IssueList({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null
  return (
    <ul className="space-y-1.5">
      {errors.map((message, i) => (
        <li key={`e${i}`} className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm">
          <XCircle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
          <span>
            <span className="sr-only">Error: </span>
            {message}
          </span>
        </li>
      ))}
      {warnings.map((message, i) => (
        <li key={`w${i}`} className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            <span className="sr-only">Warning: </span>
            {message}
          </span>
        </li>
      ))}
    </ul>
  )
}
