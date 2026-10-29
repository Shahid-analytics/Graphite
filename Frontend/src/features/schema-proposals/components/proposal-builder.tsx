import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, FileCode2, ListPlus, Send, ShieldCheck } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { FormProvider, useFieldArray, useForm, useWatch, type Path } from 'react-hook-form'
import { useBlocker } from 'react-router'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { EmptyState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/hooks/use-workspace'
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_TITLE_MAX } from '@/lib/proposal-limits'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { SchemaProposal, ValidateSchemaProposalResponse } from '@/types'
import { buildModelOptions, newChange, proposalFormSchema, toChangeInputs, type NewChangeKind, type ProposalFormValues } from '../lib/form'
import { CHANGE_META } from '../lib/labels'
import { useCatalogModels, useCreateProposal, useUpdateProposal, useValidateProposal } from '../queries'
import { AddChangeMenu } from './add-change-menu'
import { BuilderContext, type BuilderContextValue, type ChangeValidation } from './builder-context'
import { ChangeEditor } from './change-editor'

const REL_ALIASES: Record<string, string> = {
  'relationship.from_column': 'rel_from_column',
  'relationship.to_model': 'rel_to_model',
  'relationship.to_column': 'rel_to_column',
}
const LEAF_FIELD_RE = /^(model_name|layer|model_role|summary|rel_from_column|rel_to_model|rel_to_column|columns\.\d+\.(name|data_type))$/

export function ProposalBuilder({
  mode,
  defaultValues,
  proposalId,
  mappingSuggestionId,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit'
  defaultValues: ProposalFormValues
  proposalId?: string
  mappingSuggestionId?: string | null
  onSaved: (proposal: SchemaProposal) => void
  onCancel: () => void
}) {
  const { workspaceId } = useWorkspace()
  const form = useForm<ProposalFormValues>({ resolver: zodResolver(proposalFormSchema), defaultValues, mode: 'onSubmit' })
  const { control, register, handleSubmit, setError, trigger, getValues, formState } = form
  const { fields, append, remove, move } = useFieldArray({ control, name: 'changes' })
  const watched = useWatch({ control, name: 'changes' })
  const catalog = useCatalogModels(workspaceId)
  const validate = useValidateProposal(workspaceId)
  const create = useCreateProposal(workspaceId)
  const update = useUpdateProposal(proposalId ?? '')
  const [lastValidation, setLastValidation] = useState<{ snapshot: string; result: ValidateSchemaProposalResponse } | null>(null)
  const [serverIssues, setServerIssues] = useState<Record<number, string[]>>({})
  const [generalIssues, setGeneralIssues] = useState<string[]>([])
  const [pendingAction, setPendingAction] = useState<'draft' | 'submit' | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const leaving = useRef(false)

  const changes = useMemo(() => watched ?? [], [watched])
  const snapshot = useMemo(() => JSON.stringify(toChangeInputs(changes)), [changes])
  const fresh = lastValidation !== null && lastValidation.snapshot === snapshot
  const options = useMemo(() => buildModelOptions(changes, catalog.data ?? []), [changes, catalog.data])

  const validation = useMemo<ChangeValidation[] | null>(() => {
    if (!fresh || !lastValidation) return null
    const { result } = lastValidation
    return changes.map((_, i) => ({
      errors: result.errors.filter((e) => e.change_index === i).map((e) => e.message),
      warnings: result.warnings.filter((w) => w.change_index === i).map((w) => w.message),
      change: result.changes[i] ?? null,
    }))
  }, [fresh, lastValidation, changes])

  const context: BuilderContextValue = {
    options,
    catalogLoading: catalog.isLoading,
    catalogError: catalog.error,
    retryCatalog: () => void catalog.refetch(),
    validation,
    serverIssues,
  }

  const isDirty = formState.isDirty
  const blocker = useBlocker(
    // Search counts too: edit mode lives at ?edit=1, so leaving it only changes the query string.
    ({ currentLocation, nextLocation }) =>
      isDirty && !leaving.current && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )

  const resetServerState = () => {
    setServerIssues({})
    setGeneralIssues([])
  }

  const addChange = (kind: NewChangeKind) => {
    resetServerState()
    append(newChange(kind), { shouldFocus: false })
  }

  // Validation only needs the changes, so a missing title does not block the DDL preview.
  const onValidate = async () => {
    resetServerState()
    if (!(await trigger('changes', { shouldFocus: true }))) return
    try {
      const payloadChanges = toChangeInputs(getValues('changes'))
      const result = await validate.mutateAsync({ changes: payloadChanges })
      setLastValidation({ snapshot: JSON.stringify(payloadChanges), result })
      if (result.valid) toastSuccess('Proposal is valid', result.warnings.length ? `${result.warnings.length} warning(s) to review.` : 'DDL previews are shown under each change.')
    } catch (error) {
      toastError(error, 'Validation failed')
    }
  }

  const applyServerErrors = (error: unknown) => {
    if (!isApiError(error)) return
    const issues: Record<number, string[]> = {}
    const general: string[] = []
    let focused = false
    const place = (path: string, message: string) => {
      setError(path as Path<ProposalFormValues>, { type: 'server', message }, { shouldFocus: !focused })
      focused = true
    }
    for (const fe of error.fieldErrors) {
      if (fe.field === 'title' || fe.field === 'description') {
        place(fe.field, fe.message)
        continue
      }
      if (fe.field === 'changes') {
        place('changes.root', fe.message)
        continue
      }
      const match = /^changes\.(\d+)(?:\.(.+))?$/.exec(fe.field)
      if (match) {
        const index = Number(match[1])
        const rest = match[2] ? (REL_ALIASES[match[2]] ?? match[2]) : ''
        const path = `changes.${index}.${rest}`
        // Only fields rendered by the builder can show an inline error; the rest are listed on the change.
        if (LEAF_FIELD_RE.test(rest) && getValues(path as Path<ProposalFormValues>) !== undefined) place(path, fe.message)
        else (issues[index] ??= []).push(fe.message)
        continue
      }
      general.push(fe.message)
    }
    if (!error.fieldErrors.length) general.push(error.message)
    setServerIssues(issues)
    setGeneralIssues(general)
  }

  const save = (submit: boolean) =>
    handleSubmit(async (values) => {
      resetServerState()
      setPendingAction(submit ? 'submit' : 'draft')
      const payload = { title: values.title, description: values.description, changes: toChangeInputs(values.changes) }
      try {
        const proposal =
          mode === 'create'
            ? await create.mutateAsync({ ...payload, submit_for_review: submit, mapping_suggestion_id: mappingSuggestionId ?? undefined })
            : await update.mutateAsync({ ...payload, submit_for_review: submit || undefined })
        toastSuccess(
          submit ? 'Proposal submitted for review' : mode === 'create' ? 'Draft saved' : 'Proposal updated',
          submit ? 'A workspace admin can now approve, reject or request changes.' : undefined,
        )
        leaving.current = true
        onSaved(proposal)
      } catch (error) {
        applyServerErrors(error)
        toastError(error, submit ? 'Could not submit the proposal' : 'Could not save the proposal')
      } finally {
        setPendingAction(null)
      }
    })()

  const requestCancel = () => (isDirty ? setConfirmDiscard(true) : onCancel())

  const counts = changes.reduce<Record<string, number>>((acc, c) => {
    const label = c.change_type === 'create_table' ? `Create ${c.model_role ?? 'table'}` : CHANGE_META[c.change_type].label
    acc[label] = (acc[label] ?? 0) + 1
    return acc
  }, {})
  const result = fresh ? lastValidation!.result : null
  const changesError = formState.errors.changes?.root?.message ?? formState.errors.changes?.message
  const saving = pendingAction !== null

  return (
    <BuilderContext.Provider value={context}>
      <FormProvider {...form}>
        <form onSubmit={(e) => e.preventDefault()} noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-6">
            <section aria-labelledby="proposal-details" className="space-y-4 rounded-lg border border-border bg-background p-4 shadow-xs">
              <h2 id="proposal-details" className="text-sm font-semibold">
                Details
              </h2>
              <FormField label="Title" htmlFor="proposal-title" required error={formState.errors.title?.message}>
                <Input {...register('title')} maxLength={PROPOSAL_TITLE_MAX} placeholder="Collections fact and distributor dimension" autoComplete="off" />
              </FormField>
              <FormField
                label="Description"
                htmlFor="proposal-description"
                error={formState.errors.description?.message}
                description="Explain the business need and grain so reviewers can judge the change."
              >
                <Textarea {...register('description')} rows={3} maxLength={PROPOSAL_DESCRIPTION_MAX} placeholder="Why these models are needed and which reports will use them." />
              </FormField>
            </section>

            <section aria-labelledby="proposal-changes" className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="proposal-changes" className="text-sm font-semibold">
                    Changes
                  </h2>
                  <p className="text-xs text-muted-foreground">Changes are applied in this order. Create tables before relationships that reference them.</p>
                </div>
                {fields.length ? <AddChangeMenu onAdd={addChange} /> : null}
              </div>
              {catalog.error ? (
                <Notice
                  tone="warning"
                  title="Could not load existing models"
                  action={
                    <Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>
                      Retry
                    </Button>
                  }
                >
                  Model pickers only list tables created in this proposal until the catalog loads.
                </Notice>
              ) : null}
              {fields.length ? (
                <ol className="space-y-4">
                  {fields.map((field, index) => (
                    <li key={field.id}>
                      <ChangeEditor
                        index={index}
                        total={fields.length}
                        onMove={(from, to) => {
                          resetServerState()
                          move(from, to)
                        }}
                        onRemove={(i) => {
                          resetServerState()
                          remove(i)
                        }}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  compact
                  icon={ListPlus}
                  title="No changes yet"
                  description="Add a fact or dimension table, a relationship, a surrogate key or a column."
                  action={<AddChangeMenu onAdd={addChange} variant="default" />}
                />
              )}
              {changesError ? (
                <p role="alert" className="text-sm text-danger">
                  {changesError}
                </p>
              ) : null}
            </section>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4" aria-label="Validation and actions">
            <section aria-labelledby="validation-heading" className="space-y-3 rounded-lg border border-border bg-background p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h2 id="validation-heading" className="text-sm font-semibold">
                  Validation
                </h2>
                {result ? <SimulatedBadge reason="Validation and DDL previews were rendered by the in-browser mock API, not by the backend." /> : null}
              </div>
              <div aria-live="polite" className="text-sm">
                {validate.isPending ? (
                  <p className="text-muted-foreground">Validating against the catalog...</p>
                ) : result ? (
                  result.valid ? (
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      <span>
                        No blocking errors.
                        {result.warnings.length ? ` ${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'} to review.` : ''}
                      </span>
                    </p>
                  ) : (
                    <p className="text-danger">
                      {result.errors.length} error{result.errors.length === 1 ? '' : 's'} must be fixed before the proposal can be saved.
                    </p>
                  )
                ) : lastValidation ? (
                  <p className="text-muted-foreground">The proposal changed since the last validation. Validate again to refresh errors and DDL.</p>
                ) : (
                  <p className="text-muted-foreground">Check names, keys and references against the catalog and preview the DDL before saving.</p>
                )}
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => void onValidate()} loading={validate.isPending} disabled={!fields.length || saving}>
                <FileCode2 aria-hidden />
                Validate and preview DDL
              </Button>
              {Object.keys(counts).length ? (
                <dl className="space-y-1 border-t border-border pt-3 text-xs">
                  {Object.entries(counts).map(([label, count]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular">{count}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>

            {generalIssues.length ? (
              <Notice tone="danger" title="The proposal was not saved">
                <ul className="list-disc space-y-0.5 pl-4">
                  {generalIssues.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <section aria-label="Save" className="space-y-2 rounded-lg border border-border bg-background p-4 shadow-xs">
              <Button type="button" className="w-full" onClick={() => void save(true)} loading={pendingAction === 'submit'} disabled={saving && pendingAction !== 'submit'}>
                <Send aria-hidden />
                {mode === 'create' ? 'Submit for review' : 'Save and submit for review'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => void save(false)} loading={pendingAction === 'draft'} disabled={saving && pendingAction !== 'draft'}>
                {mode === 'create' ? 'Save as draft' : 'Save draft'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={requestCancel} disabled={saving}>
                Cancel
              </Button>
            </section>

            <Notice tone="neutral" icon={ShieldCheck}>
              The frontend only submits proposals. Validation, persistence and the dbt run that creates or alters models are backend responsibilities, and
              nothing is applied until an admin approves.
            </Notice>
          </aside>
        </form>
      </FormProvider>

      <ConfirmDialog
        open={confirmDiscard || blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (open) return
          setConfirmDiscard(false)
          if (blocker.state === 'blocked') blocker.reset()
        }}
        title="Discard unsaved changes?"
        description="Your edits to this proposal have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          leaving.current = true
          if (blocker.state === 'blocked') blocker.proceed()
          else onCancel()
        }}
      />
    </BuilderContext.Provider>
  )
}
