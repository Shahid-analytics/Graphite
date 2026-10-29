import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { toastError, toastSuccess } from '@/lib/toast'
import type { BusinessArea } from '@/types'
import { BUSINESS_AREAS, PRIORITIES } from '../lib/labels'
import { placeFieldErrors } from '../lib/form-errors'
import { useCreateReportRequest } from '../queries'
import { OptionSelect } from './option-select'

const AREA_VALUES = BUSINESS_AREAS.map((a) => a.value) as [BusinessArea, ...BusinessArea[]]

function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const schema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(120, 'Title must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(20, 'Describe what you need in at least 20 characters: the question, measures and breakdowns.')
    .max(2000, 'Description must be 2000 characters or fewer.'),
  business_area: z.enum(AREA_VALUES, { error: 'Choose a business area.' }),
  priority: z.enum(['low', 'normal', 'high'], { error: 'Choose a priority.' }),
  needed_by: z
    .string()
    .refine((value) => !value || value >= today(), 'The needed-by date cannot be in the past.'),
})

type FormValues = z.input<typeof schema>
const FIELDS = ['title', 'description', 'business_area', 'priority', 'needed_by']

/** Form for asking the data team for a report the assistant cannot produce. */
export function RequestReportDialog({
  workspaceId,
  open,
  onOpenChange,
  defaultArea,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultArea?: BusinessArea | null
}) {
  const create = useCreateReportRequest(workspaceId)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', business_area: defaultArea ?? undefined, priority: 'normal', needed_by: '' },
  })
  const { errors } = form.formState

  const close = (next: boolean) => {
    if (!next) {
      form.reset({ title: '', description: '', business_area: defaultArea ?? undefined, priority: 'normal', needed_by: '' })
      setFormError(null)
    }
    onOpenChange(next)
  }

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    const parsed = schema.parse(values)
    try {
      await create.mutateAsync({ ...parsed, needed_by: parsed.needed_by || null })
      toastSuccess('Request submitted', 'The data team will pick it up from the Requests list.')
      close(false)
    } catch (error) {
      const { placed, unplaced } = placeFieldErrors(error, form.setError, (field) => (FIELDS.includes(field) ? field : null))
      if (unplaced.length) setFormError(unplaced.join(' '))
      else if (!placed) toastError(error, 'Could not submit the request')
    }
  })

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a custom report</DialogTitle>
          <DialogDescription>Describe the question you need answered. The data team reviews requests and builds the report or dashboard in Metabase.</DialogDescription>
        </DialogHeader>
        <form id="report-request-form" onSubmit={submit} noValidate className="grid gap-4">
          {formError ? <Notice tone="danger">{formError}</Notice> : null}
          <FormField label="Title" htmlFor="rr-title" error={errors.title?.message} required>
            <Input placeholder="e.g. Distributor scheme payout tracker" autoComplete="off" {...form.register('title')} />
          </FormField>
          <FormField
            label="What do you need?"
            htmlFor="rr-description"
            error={errors.description?.message}
            description="Include the measures, breakdowns, time period and who will use it."
            required
          >
            <Textarea rows={4} {...form.register('description')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Business area" htmlFor="rr-area" error={errors.business_area?.message} required>
              <Controller
                control={form.control}
                name="business_area"
                render={({ field }) => <OptionSelect id="rr-area" value={field.value} onChange={field.onChange} options={BUSINESS_AREAS} placeholder="Choose an area" invalid={Boolean(errors.business_area)} />}
              />
            </FormField>
            <FormField label="Needed by" htmlFor="rr-needed-by" error={errors.needed_by?.message} description="Optional">
              <Input type="date" min={today()} {...form.register('needed_by')} />
            </FormField>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Priority</legend>
            <Controller
              control={form.control}
              name="priority"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-4" aria-label="Priority">
                  {PRIORITIES.map((p) => (
                    <div key={p.value} className="flex items-center gap-2">
                      <RadioGroupItem value={p.value} id={`rr-priority-${p.value}`} />
                      <Label htmlFor={`rr-priority-${p.value}`} className="font-normal">
                        {p.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
            {errors.priority ? (
              <p role="alert" className="text-xs text-danger">
                {errors.priority.message}
              </p>
            ) : null}
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="report-request-form" loading={create.isPending}>
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
