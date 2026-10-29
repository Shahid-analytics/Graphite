import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowUpRight, CheckCircle2, ChevronRight, CircleAlert, FileDiff, GitPullRequestArrow, Loader2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { CodeBlock, HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_TITLE_MAX, PROPOSAL_TITLE_MIN } from '@/lib/proposal-limits'
import { toastError, toastSuccess } from '@/lib/toast'
import { errorMessage } from '@/services/api-error'
import type { MappingSuggestionSet, ProposalStatus, ProposedSchemaChangeInput, ValidateSchemaProposalResponse } from '@/types'
import { applyFieldErrors } from '../lib/form-errors'
import { LAYER_LABEL } from '../lib/labels'
import { buildProposalChanges } from '../lib/review'
import { useCreateProposalFromMapping, useProposalsForMapping, useValidateProposalChanges } from '../queries'
import { DisabledReason } from './disabled-reason'

const PROPOSAL_STATUS: Record<ProposalStatus, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  draft: { label: 'Draft', variant: 'outline' },
  pending_review: { label: 'Pending review', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  applying: { label: 'Applying', variant: 'running' },
  applied: { label: 'Applied', variant: 'success' },
}

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(PROPOSAL_TITLE_MIN, `Title must be at least ${PROPOSAL_TITLE_MIN} characters.`)
    .max(PROPOSAL_TITLE_MAX, `Title must be at most ${PROPOSAL_TITLE_MAX} characters.`),
  description: z.string().trim().max(PROPOSAL_DESCRIPTION_MAX, `Description must be at most ${PROPOSAL_DESCRIPTION_MAX} characters.`),
})

type Values = z.infer<typeof schema>

type Validation = ValidateSchemaProposalResponse | undefined

function ChangeList({ changes, validation }: { changes: ProposedSchemaChangeInput[]; validation: Validation }) {
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {changes.map((change, index) => {
        const errors = validation?.errors.filter((e) => e.change_index === index) ?? []
        const warnings = validation?.warnings.filter((w) => w.change_index === index) ?? []
        const ddl = validation?.changes[index]?.ddl_preview
        return (
          <li key={`${change.change_type}-${change.model_name}-${index}`} className="space-y-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-start gap-2">
              <Badge variant="outline" className="font-mono">
                {change.change_type}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[13px] break-all">{change.model_name}</p>
                <p className="text-xs text-muted-foreground">
                  {change.change_type === 'create_table' ? `${change.columns.length} columns. ` : ''}
                  {change.summary}
                </p>
              </div>
              {errors.length ? <Badge variant="danger">{errors.length === 1 ? '1 error' : `${errors.length} errors`}</Badge> : null}
            </div>
            {errors.length || warnings.length ? (
              <ul className="space-y-1 text-xs">
                {errors.map((e, i) => (
                  <li key={`e${i}`} className="flex gap-1.5 text-danger">
                    <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="sr-only">Error: </span>
                      {e.message}
                    </span>
                  </li>
                ))}
                {warnings.map((w, i) => (
                  <li key={`w${i}`} className="flex gap-1.5 text-muted-foreground">
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
                    <span>
                      <span className="sr-only">Warning: </span>
                      {w.message}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {ddl ? (
              <Collapsible>
                <CollapsibleTrigger className="group inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
                  DDL preview
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <CodeBlock code={ddl} maxHeight={220} />
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function ValidationStatus({ query }: { query: ReturnType<typeof useValidateProposalChanges> }) {
  if (query.isPending) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Checking the changes against the warehouse catalog
      </p>
    )
  }
  if (query.isError) {
    return (
      <Notice tone="warning" title="Could not check the changes" action={<Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button>}>
        {errorMessage(query.error)} The backend validates the proposal again when you create it.
      </Notice>
    )
  }
  const { errors, warnings } = query.data
  if (errors.length) {
    return (
      <Notice tone="danger" title={`${errors.length} ${errors.length === 1 ? 'problem blocks' : 'problems block'} this proposal`}>
        The approved suggestions produce changes the warehouse would reject. Create a proposal manually from Data models, or request new suggestions
        and edit the affected mappings.
      </Notice>
    )
  }
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <CheckCircle2 className="size-3.5 text-success" aria-hidden />
      All changes are valid{warnings.length ? `, with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'} to review` : ''}.
    </p>
  )
}

function CreateProposalDialog({
  set,
  changes,
  open,
  onOpenChange,
}: {
  set: MappingSuggestionSet
  changes: ProposedSchemaChangeInput[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const create = useCreateProposalFromMapping(set.workspace_id)
  const validation = useValidateProposalChanges(set.workspace_id, set.id, changes, open)
  const models = changes.filter((c) => c.change_type === 'create_table').map((c) => c.model_name)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: `${set.source_name} to ${LAYER_LABEL[set.target_layer]}: ${models.slice(0, 3).join(', ')}`.slice(0, PROPOSAL_TITLE_MAX),
      description: `Generated from approved AI mapping suggestions (${set.id}) for ${set.source_tables.join(', ')}.${set.business_context ? ` Business context: ${set.business_context}` : ''}`.slice(0, PROPOSAL_DESCRIPTION_MAX),
    },
  })

  const blocked = validation.data && !validation.data.valid ? 'The derived changes have validation errors. See the list above.' : null

  const submit = form.handleSubmit(async (values) => {
    try {
      const proposal = await create.mutateAsync({
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        mapping_suggestion_id: set.id,
        changes,
        submit_for_review: true,
      })
      toastSuccess('Schema proposal created', 'It is now pending review. Nothing has been applied yet.')
      onOpenChange(false)
      navigate(wsPath(set.workspace_id, 'models', 'proposals', proposal.id))
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, ['title', 'description'])) toastError(error, 'Could not create the schema proposal')
    }
  })

  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create schema proposal</DialogTitle>
          <DialogDescription>
            The proposal is submitted for review. The backend renders DDL for each change; nothing runs until an approver applies it via dbt.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField label="Title" htmlFor="proposal-title" error={form.formState.errors.title?.message} required>
            <Input autoComplete="off" maxLength={PROPOSAL_TITLE_MAX} {...form.register('title')} />
          </FormField>
          <FormField label="Description" htmlFor="proposal-description" error={form.formState.errors.description?.message}>
            <Textarea rows={3} maxLength={PROPOSAL_DESCRIPTION_MAX} {...form.register('description')} />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {changes.length} {changes.length === 1 ? 'change' : 'changes'}
            </p>
            <ValidationStatus query={validation} />
            <div className="scrollbar-thin max-h-72 overflow-y-auto">
              <ChangeList changes={changes} validation={validation.data} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <DisabledReason reason={blocked}>
              <Button type="submit" loading={create.isPending} disabled={Boolean(blocked) || validation.isPending}>
                Create and submit for review
              </Button>
            </DisabledReason>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Shown on approved sets: approved suggestions only take effect through a schema proposal. */
export function CreateProposalPanel({ set }: { set: MappingSuggestionSet }) {
  const canPropose = usePermission('models:propose')
  const [open, setOpen] = useState(false)
  const changes = buildProposalChanges(set)
  const existing = useProposalsForMapping(set.workspace_id, set.id, true)
  const tables = changes.filter((c) => c.change_type === 'create_table').length
  const relationships = changes.length - tables

  const reason = !canPropose
    ? 'Your role does not include the models:propose permission.'
    : changes.length === 0
      ? 'No model proposals were accepted in this set, so there is nothing to turn into schema changes.'
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Next step: schema proposal
          <HelpTip label="About schema proposals">
            A schema proposal lists the tables, columns and relationships to create in the warehouse, with DDL rendered by the backend. It needs its own
            approval and is applied by a dbt run.
          </HelpTip>
        </CardTitle>
        <CardDescription>Turn the accepted model proposals and joins into a reviewable change to the {LAYER_LABEL[set.target_layer]} layer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Notice tone="info" title="Approved mappings are not applied automatically">
          Create a schema proposal, get it approved, then apply it. Applying runs dbt against the warehouse; until then no table or column changes.
        </Notice>
        {existing.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : existing.isError ? (
          <ErrorState error={existing.error} title="Could not load proposals created from this set" onRetry={() => existing.refetch()} compact />
        ) : existing.data.length ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Proposals already created from this set</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {existing.data.map((proposal) => (
                <li key={proposal.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <FileDiff className="size-4 text-subtle-foreground" aria-hidden />
                  <Link to={wsPath(set.workspace_id, 'models', 'proposals', proposal.id)} className="min-w-0 flex-1 truncate font-medium hover:underline">
                    {proposal.title}
                  </Link>
                  <Badge variant={PROPOSAL_STATUS[proposal.status].variant}>{PROPOSAL_STATUS[proposal.status].label}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <DisabledReason reason={reason}>
            <Button onClick={() => setOpen(true)} disabled={Boolean(reason)}>
              <GitPullRequestArrow aria-hidden />
              Create schema proposal
            </Button>
          </DisabledReason>
          {changes.length ? (
            <span className="text-xs text-muted-foreground">
              {tables} {tables === 1 ? 'table' : 'tables'}
              {relationships ? `, ${relationships} ${relationships === 1 ? 'relationship' : 'relationships'}` : ''}
            </span>
          ) : null}
          <Button asChild variant="link" size="sm" className="text-xs">
            <Link to={wsPath(set.workspace_id, 'models', 'proposals')}>
              All schema proposals
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </Button>
        </div>
      </CardContent>
      {open ? <CreateProposalDialog set={set} changes={changes} open={open} onOpenChange={setOpen} /> : null}
    </Card>
  )
}
