import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DATA_TYPE_HINT, DATA_TYPE_RE } from '@/lib/data-types'
import type { FieldMapping } from '@/types'
import type { FieldMappingOverrides } from '../lib/review'

const identifier = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(63, 'At most 63 characters.')
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase snake_case: letters, digits and underscores, starting with a letter.')

const schema = z.object({
  target_model: identifier,
  target_field: identifier,
  target_type: z
    .string()
    .trim()
    .min(1, 'Required.')
    .regex(DATA_TYPE_RE, DATA_TYPE_HINT),
  normalization_rule: z.string().max(500, 'At most 500 characters.'),
})

type Values = z.infer<typeof schema>

const toValues = (m: FieldMapping): Values => ({
  target_model: m.target_model,
  target_field: m.target_field,
  target_type: m.target_type,
  normalization_rule: m.normalization_rule ?? '',
})

/** Edits the target of a field mapping; saving marks the suggestion as modified. */
export function EditMappingDialog({
  mapping,
  modelOptions,
  onOpenChange,
  onSave,
}: {
  mapping: FieldMapping | null
  modelOptions: string[]
  onOpenChange: (open: boolean) => void
  onSave: (overrides: FieldMappingOverrides) => void
}) {
  const listId = useId()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: mapping ? toValues(mapping) : undefined })
  const { register, handleSubmit, reset, formState } = form

  useEffect(() => {
    if (mapping) reset(toValues(mapping))
  }, [mapping, reset])

  const submit = handleSubmit((values) => {
    onSave({
      target_model: values.target_model,
      target_field: values.target_field,
      target_type: values.target_type.trim().toLowerCase(),
      normalization_rule: values.normalization_rule.trim() || null,
    })
    onOpenChange(false)
  })

  return (
    <Dialog open={Boolean(mapping)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit field mapping</DialogTitle>
          <DialogDescription>Changes are kept as an unsaved decision marked Modified until you save the draft.</DialogDescription>
        </DialogHeader>
        {mapping ? (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs">
              <span className="truncate">
                {mapping.source_table}.{mapping.source_field}
              </span>
              <span className="text-subtle-foreground">({mapping.source_type})</span>
              <ArrowRight className="size-3.5 text-subtle-foreground" aria-hidden />
              <span className="truncate text-muted-foreground">
                {mapping.target_model}.{mapping.target_field}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Target model"
                htmlFor="edit-target-model"
                error={formState.errors.target_model?.message}
                description="Only fields on proposed models become part of a schema proposal."
                required
              >
                <Input list={listId} autoComplete="off" className="font-mono" {...register('target_model')} />
              </FormField>
              <datalist id={listId}>
                {modelOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <FormField label="Target field" htmlFor="edit-target-field" error={formState.errors.target_field?.message} required>
                <Input autoComplete="off" className="font-mono" {...register('target_field')} />
              </FormField>
            </div>
            <FormField
              label="Target type"
              htmlFor="edit-target-type"
              error={formState.errors.target_type?.message}
              description="Include precision where it matters, e.g. numeric(18,2) for currency."
              required
            >
              <Input autoComplete="off" className="font-mono" {...register('target_type')} />
            </FormField>
            <FormField
              label="Normalization rule"
              htmlFor="edit-rule"
              error={formState.errors.normalization_rule?.message}
              description={
                <span className="inline-flex items-center gap-1">
                  Leave empty to copy the value unchanged.
                  <HelpTip label="About normalization rules">
                    A short description or SQL expression of how values are cleaned, e.g. trim, upper, to_char(date, &apos;YYYYMMDD&apos;)::integer or a code mapping.
                  </HelpTip>
                </span>
              }
            >
              <Textarea rows={3} className="font-mono text-[13px]" {...register('normalization_rule')} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!formState.isDirty}>
                Apply edit
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
