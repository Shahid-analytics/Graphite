import { ArrowDown, ArrowUp, CheckCircle2, Trash2 } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ProposalFormValues } from '../lib/form'
import { CHANGE_META } from '../lib/labels'
import { useBuilder } from './builder-context'
import { AddColumnFields, AlterColumnFields, CreateTableFields, RelationshipFields, SurrogateKeyFields } from './change-fields'
import { ChangeDdl, IssueList } from './change-ddl'

export function ChangeEditor({
  index,
  total,
  onMove,
  onRemove,
}: {
  index: number
  total: number
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
}) {
  const { control } = useFormContext<ProposalFormValues>()
  const changeType = useWatch({ control, name: `changes.${index}.change_type` })
  const role = useWatch({ control, name: `changes.${index}.model_role` })
  const name = useWatch({ control, name: `changes.${index}.model_name` })
  const { validation, serverIssues } = useBuilder()
  const meta = CHANGE_META[changeType]
  const Icon = meta.icon
  const result = validation?.[index]
  const issues = serverIssues[index] ?? []
  const headingId = `change-${index}-heading`
  const title = changeType === 'create_table' ? `Create ${role ?? 'table'}` : meta.label

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-background shadow-xs">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md border border-border bg-surface text-xs font-medium tabular">{index + 1}</span>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h3 id={headingId} className="text-sm font-medium">
          {title}
          {name ? <span className="ml-1.5 font-mono text-[13px] font-normal text-muted-foreground">{name}</span> : null}
        </h3>
        {result ? (
          result.errors.length ? (
            <Badge variant="danger">{result.errors.length} error{result.errors.length === 1 ? '' : 's'}</Badge>
          ) : result.warnings.length ? (
            <Badge variant="warning">{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2 aria-hidden />
              Valid
            </Badge>
          )
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={`Move change ${index + 1} up`}>
            <ArrowUp className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(index, index + 1)} disabled={index === total - 1} aria-label={`Move change ${index + 1} down`}>
            <ArrowDown className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => onRemove(index)} aria-label={`Remove change ${index + 1}`}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>
      <div className="space-y-4 px-4 py-4">
        {changeType === 'create_table' ? <CreateTableFields index={index} /> : null}
        {changeType === 'add_relationship' ? <RelationshipFields index={index} /> : null}
        {changeType === 'add_surrogate_key' ? <SurrogateKeyFields index={index} /> : null}
        {changeType === 'add_column' ? <AddColumnFields index={index} /> : null}
        {changeType === 'alter_column' ? <AlterColumnFields index={index} /> : null}

        {issues.length ? <IssueList errors={issues} warnings={[]} /> : null}
        {result ? (
          <div className="space-y-3 border-t border-border pt-4">
            <IssueList errors={result.errors} warnings={result.warnings} />
            {result.change ? <ChangeDdl change={result.change} maxHeight={260} /> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
