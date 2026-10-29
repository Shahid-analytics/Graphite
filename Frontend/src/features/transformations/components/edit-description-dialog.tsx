import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { Transformation } from '@/types'
import { useUpdateTransformation } from '../queries'

const schema = z.object({
  description: z.string().trim().max(2000, 'Keep the description under 2,000 characters.'),
  commit_message: z.string().trim().min(3, 'Describe the change in at least 3 characters.').max(200, 'Keep the commit message under 200 characters.'),
})

type Values = z.infer<typeof schema>

/** Edits the model description; the backend writes it to schema.yml in the dbt repository. */
export function EditDescriptionDialog({
  transformation,
  open,
  onOpenChange,
}: {
  transformation: Transformation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useUpdateTransformation(transformation.id)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { description: transformation.description, commit_message: '' },
  })
  const description = useWatch({ control: form.control, name: 'description' })
  const changed = (description ?? '').trim() !== transformation.description

  const close = (next: boolean) => {
    if (mutation.isPending) return
    if (!next) form.reset()
    onOpenChange(next)
  }

  const submit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values)
      toastSuccess('Description saved', isMockMode ? 'Demo mode: no repository was written.' : 'Committed to the dbt repository.')
      onOpenChange(false)
    } catch (error) {
      if (isApiError(error) && error.fieldErrors.length) {
        error.fieldErrors.forEach((fe) => {
          if (fe.field === 'description' || fe.field === 'commit_message') form.setError(fe.field, { message: fe.message })
        })
        if (error.fieldErrors.some((fe) => fe.field !== 'description' && fe.field !== 'commit_message')) {
          toastError(error, 'Could not save the description')
        }
      } else {
        toastError(error, 'Could not save the description')
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Edit description</DialogTitle>
            <DialogDescription>Shown in the catalog, lineage and Metabase metadata for {transformation.name}.</DialogDescription>
          </DialogHeader>
          <FormField label="Description" htmlFor="transformation-description" error={form.formState.errors.description?.message}>
            <Textarea {...form.register('description')} rows={5} />
          </FormField>
          <FormField
            label="Commit message"
            htmlFor="description-commit-message"
            required
            error={form.formState.errors.commit_message?.message}
          >
            <Input {...form.register('commit_message')} placeholder={`Document ${transformation.name}`} autoComplete="off" maxLength={200} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!changed}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
