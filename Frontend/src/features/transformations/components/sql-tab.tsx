import { zodResolver } from '@hookform/resolvers/zod'
import { GitCommitHorizontal, Lock, Pencil, Save, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useBlocker } from 'react-router'
import { z } from 'zod'
import { CodeBlock } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { usePermission } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { DbtProject, Transformation } from '@/types'
import { lineDiff } from '../lib/line-diff'
import { useUpdateTransformation } from '../queries'
import { GatedButton, PERMISSION_REASONS } from './gated-button'
import { SqlEditor } from './sql-editor'

const schema = z.object({
  sql: z
    .string()
    .refine((v) => v.trim().length > 0, 'The model SQL cannot be empty.')
    .refine((v) => /\bselect\b/i.test(v.replace(/--.*$/gm, '')), 'A dbt model must contain a select statement.'),
  commit_message: z
    .string()
    .trim()
    .min(3, 'Describe the change in at least 3 characters.')
    .max(200, 'Keep the commit message under 200 characters.'),
})

type Values = z.infer<typeof schema>

function SqlEditForm({
  transformation,
  project,
  onDone,
}: {
  transformation: Transformation
  project: DbtProject | undefined
  onDone: () => void
}) {
  const mutation = useUpdateTransformation(transformation.id)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { sql: transformation.sql, commit_message: '' },
  })
  const sql = useWatch({ control: form.control, name: 'sql' })
  const dirty = sql !== transformation.sql
  const diff = dirty ? lineDiff(transformation.sql, sql) : null

  // Leaving the page with unsaved edits asks for confirmation (tab switches keep the editor mounted).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !mutation.isPending && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const submit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ sql: values.sql, commit_message: values.commit_message })
      toastSuccess(
        `Saved ${transformation.name}`,
        isMockMode
          ? 'Demo mode: the change is kept in this browser session only. No repository was written.'
          : `Committed to ${project?.branch ?? 'the project branch'}. The next dbt run uses the new SQL.`,
      )
      form.reset({ sql: values.sql, commit_message: '' })
      onDone()
    } catch (error) {
      if (isApiError(error) && error.fieldErrors.length) {
        error.fieldErrors.forEach((fe) => {
          if (fe.field === 'sql' || fe.field === 'commit_message') form.setError(fe.field, { message: fe.message })
        })
        if (error.fieldErrors.some((fe) => fe.field !== 'sql' && fe.field !== 'commit_message')) toastError(error, 'Could not save the model')
      } else {
        toastError(error, 'Could not save the model')
      }
    }
  })

  const discard = () => {
    form.reset({ sql: transformation.sql, commit_message: '' })
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-xs text-muted-foreground">{transformation.name}.sql</p>
        <span aria-live="polite" className="inline-flex">
          {dirty && diff ? (
            <Badge variant="warning">
              Unsaved changes · +{diff.added} / -{diff.removed} lines
            </Badge>
          ) : (
            <Badge variant="outline">No changes</Badge>
          )}
        </span>
        <p className="ml-auto hidden text-xs text-muted-foreground md:block" id="sql-editor-help">
          <Kbd>Tab</Kbd> indents, <Kbd>Shift</Kbd>+<Kbd>Tab</Kbd> outdents. Press <Kbd>Esc</Kbd> then <Kbd>Tab</Kbd> to leave the editor.
        </p>
      </div>

      <Controller
        control={form.control}
        name="sql"
        render={({ field, fieldState }) => (
          <div className="grid gap-1.5">
            <label htmlFor="transformation-sql" className="sr-only">
              Model SQL
            </label>
            <SqlEditorField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          </div>
        )}
      />

      <FormField
        label="Commit message"
        htmlFor="transformation-commit-message"
        required
        error={form.formState.errors.commit_message?.message}
        description="Recorded in the repository history and in the audit trail."
      >
        <Input {...form.register('commit_message')} placeholder={`Update ${transformation.name}`} autoComplete="off" maxLength={200} />
      </FormField>

      <Notice tone="neutral" icon={GitCommitHorizontal}>
        Saving commits <span className="font-mono">{transformation.name}.sql</span> to{' '}
        {project ? (
          <>
            <span className="font-mono break-all">{project.repository_url}</span> on branch <span className="font-mono">{project.branch}</span>
          </>
        ) : (
          'the dbt repository'
        )}{' '}
        through the Graphite backend. The model is not rebuilt until the next dbt run.
        {isMockMode ? ' In demo mode nothing is written to a repository.' : null}
      </Notice>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => (dirty ? setConfirmDiscard(true) : discard())} disabled={mutation.isPending}>
          <Undo2 className="size-3.5" aria-hidden />
          {dirty ? 'Discard changes' : 'Close editor'}
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!dirty}>
          {!mutation.isPending ? <Save className="size-3.5" aria-hidden /> : null}
          Save and commit
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description={`Your edits to ${transformation.name} will be lost. The committed SQL stays unchanged.`}
        confirmLabel="Discard changes"
        destructive
        onConfirm={discard}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Leave without saving?"
        description={`You have unsaved changes to ${transformation.name}. Leaving this page discards them.`}
        confirmLabel="Leave page"
        destructive
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed()
        }}
      />
    </form>
  )
}

function SqlEditorField({ value, onChange, onBlur, error }: { value: string; onChange: (v: string) => void; onBlur: () => void; error?: string }) {
  return (
    <>
      <SqlEditor
        id="transformation-sql"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        invalid={Boolean(error)}
        describedBy={[error ? 'transformation-sql-error' : null, 'sql-editor-help'].filter(Boolean).join(' ')}
      />
      {error ? (
        <p id="transformation-sql-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  )
}

/** SQL viewer with an in-place editor for users who can change model code. */
export function SqlTab({ transformation, project }: { transformation: Transformation; project: DbtProject | undefined }) {
  const canWrite = usePermission('transformations:write')
  const [editing, setEditing] = useState(false)

  if (editing && canWrite) return <SqlEditForm transformation={transformation} project={project} onDone={() => setEditing(false)} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Compiled by dbt with Jinja; <span className="font-mono text-xs">ref()</span> and <span className="font-mono text-xs">source()</span> resolve
          to warehouse relations at run time.
        </p>
        <GatedButton allowed={canWrite} reason={PERMISSION_REASONS.write} variant="outline" size="sm" className="ml-auto" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit SQL
        </GatedButton>
      </div>
      {!canWrite ? (
        <Notice tone="neutral" icon={Lock}>
          You have read-only access to this model. Editing SQL requires the transformations:write permission (editor role or above).
        </Notice>
      ) : null}
      <CodeBlock code={transformation.sql} title={`${transformation.name}.sql`} maxHeight={560} />
    </div>
  )
}
