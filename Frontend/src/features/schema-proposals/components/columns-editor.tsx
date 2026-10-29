import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Controller, useFieldArray, useFormContext, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { HelpTip } from '@/components/data/display'
import { cn } from '@/lib/utils'
import { emptyColumn, type ProposalFormValues } from '../lib/form'
import { DataTypeSelect } from './field-controls'

/**
 * Grid editor for column definitions. In "create" mode each row has a key checkbox;
 * in "add" mode (adding columns to an existing model) keys are not editable.
 */
export function ColumnsEditor({ changeIndex, mode }: { changeIndex: number; mode: 'create' | 'add' }) {
  const { control, register } = useFormContext<ProposalFormValues>()
  const { errors } = useFormState({ control, name: `changes.${changeIndex}.columns` })
  const { fields, append, remove, move } = useFieldArray({ control, name: `changes.${changeIndex}.columns` })
  const changeErrors = errors.changes?.[changeIndex]
  const rootError = changeErrors?.columns?.root?.message ?? changeErrors?.columns?.message
  const showKey = mode === 'create'
  const grid = showKey
    ? 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_3rem_minmax(0,1.4fr)_auto]'
    : 'md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]'
  const idBase = `change-${changeIndex}-col`

  return (
    <div className="space-y-2">
      <div className={cn('hidden gap-2 px-1 text-xs font-medium text-muted-foreground md:grid', grid)} aria-hidden>
        <span>Column</span>
        <span>Type</span>
        {showKey ? (
          <span className="inline-flex items-center gap-1">
            Key
            <HelpTip label="What is a key column?">The column, or columns, that uniquely identify a row. Rendered as the primary key.</HelpTip>
          </span>
        ) : null}
        <span>Description</span>
        <span className="w-[6.5rem]" />
      </div>
      <ol className="space-y-2">
        {fields.map((field, i) => {
          const colErrors = changeErrors?.columns?.[i]
          return (
            <li key={field.id} className={cn('grid grid-cols-1 gap-2 rounded-md border border-border p-2 md:border-0 md:p-0', grid)}>
              <div className="min-w-0">
                <label htmlFor={`${idBase}-${i}-name`} className="mb-1 block text-xs text-muted-foreground md:sr-only">
                  Column {i + 1} name
                </label>
                <Input
                  id={`${idBase}-${i}-name`}
                  {...register(`changes.${changeIndex}.columns.${i}.name`)}
                  placeholder="column_name"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={colErrors?.name ? true : undefined}
                  aria-describedby={colErrors?.name ? `${idBase}-${i}-name-error` : undefined}
                  className="h-8 font-mono text-[13px]"
                />
                {colErrors?.name ? (
                  <p id={`${idBase}-${i}-name-error`} className="mt-1 text-xs text-danger">
                    {colErrors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-xs text-muted-foreground md:sr-only">Type</span>
                <Controller
                  control={control}
                  name={`changes.${changeIndex}.columns.${i}.data_type`}
                  render={({ field: f, fieldState }) => (
                    <>
                      <DataTypeSelect value={f.value} onChange={f.onChange} invalid={Boolean(fieldState.error)} label={`Column ${i + 1} data type`} />
                      {fieldState.error ? <p className="mt-1 text-xs text-danger">{fieldState.error.message}</p> : null}
                    </>
                  )}
                />
              </div>
              {showKey ? (
                <div className="flex items-center gap-2 md:h-8 md:justify-center">
                  <Controller
                    control={control}
                    name={`changes.${changeIndex}.columns.${i}.is_key`}
                    render={({ field: f }) => (
                      <Checkbox id={`${idBase}-${i}-key`} checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} aria-label={`Column ${i + 1} is a key`} />
                    )}
                  />
                  <label htmlFor={`${idBase}-${i}-key`} className="text-sm md:hidden">
                    Key column
                  </label>
                </div>
              ) : null}
              <div className="min-w-0">
                <label htmlFor={`${idBase}-${i}-desc`} className="mb-1 block text-xs text-muted-foreground md:sr-only">
                  Column {i + 1} description
                </label>
                <Input
                  id={`${idBase}-${i}-desc`}
                  {...register(`changes.${changeIndex}.columns.${i}.description`)}
                  placeholder="What this column holds"
                  className="h-8"
                />
              </div>
              <div className="flex items-center justify-end gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move column ${i + 1} up`}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(i, i + 1)}
                  disabled={i === fields.length - 1}
                  aria-label={`Move column ${i + 1} down`}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label={`Remove column ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      {!fields.length ? <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No columns yet.</p> : null}
      {rootError ? (
        <p role="alert" className="text-xs text-danger">
          {rootError}
        </p>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyColumn())}>
        <Plus aria-hidden />
        Add column
      </Button>
    </div>
  )
}
