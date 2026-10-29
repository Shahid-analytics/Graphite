import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { COMMON_TIMEZONES } from '@/lib/cron'
import { formatDuration } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { SchedulerDefaults } from '@/types'
import { FormFooter } from '../components/form-footer'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SectionSkeleton } from '../components/section-skeleton'
import { SelectField } from '../components/select-field'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { PERMISSION_REASON } from '../lib/labels'
import { useSchedulerDefaults, useUpdateScheduler } from '../queries'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const intField = (label: string, min: number, max: number) =>
  z
    .number({ error: `Enter ${label}.` })
    .int('Enter a whole number.')
    .min(min, `Enter a value between ${min} and ${max}.`)
    .max(max, `Enter a value between ${min} and ${max}.`)

const schema = z
  .object({
    default_timezone: z.string().min(1, 'Choose a time zone.'),
    max_concurrent_runs: intField('the maximum number of concurrent runs', 1, 20),
    default_retry_attempts: intField('the number of retry attempts', 0, 10),
    default_backoff_seconds: intField('the backoff in seconds', 30, 86_400),
    quiet_hours: z.object({
      enabled: z.boolean(),
      start: z.string().regex(TIME, 'Use 24-hour HH:MM.'),
      end: z.string().regex(TIME, 'Use 24-hour HH:MM.'),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.quiet_hours.enabled && v.quiet_hours.start === v.quiet_hours.end) {
      ctx.addIssue({ code: 'custom', path: ['quiet_hours', 'end'], message: 'The end time must differ from the start time.' })
    }
  })

type FormValues = z.infer<typeof schema>

const FIELDS = ['default_timezone', 'max_concurrent_runs', 'default_retry_attempts', 'default_backoff_seconds', 'quiet_hours.enabled', 'quiet_hours.start', 'quiet_hours.end'] as const

const toValues = (d: SchedulerDefaults): FormValues => ({ ...d, quiet_hours: { ...d.quiet_hours } })

function SchedulerForm({ workspaceId, defaults, canEdit }: { workspaceId: string; defaults: SchedulerDefaults; canEdit: boolean }) {
  const update = useUpdateScheduler(workspaceId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(defaults) })
  const { errors, isDirty } = form.formState
  const [backoff, retries, quietEnabled, quietStart, quietEnd] = useWatch({
    control: form.control,
    name: ['default_backoff_seconds', 'default_retry_attempts', 'quiet_hours.enabled', 'quiet_hours.start', 'quiet_hours.end'],
  })
  const timezones = COMMON_TIMEZONES.includes(defaults.default_timezone) ? COMMON_TIMEZONES : [defaults.default_timezone, ...COMMON_TIMEZONES]
  const overnight = quietStart > quietEnd

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(values)
      form.reset(toValues(saved))
      toastSuccess('Scheduler defaults saved', 'They apply to schedules created from now on.')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error, 'Could not save the scheduler defaults')
    }
  })

  const backoffHint = Number.isFinite(backoff) && backoff >= 30
    ? `${formatDuration(backoff)} before the first retry${retries > 1 ? ', doubling after each attempt' : ''}.`
    : 'Wait before the first retry (30 to 86400 seconds).'

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="default_timezone"
              render={({ field }) => (
                <SelectField
                  id="sch-timezone"
                  label="Default time zone"
                  description="Cron expressions in new schedules are evaluated in this zone."
                  error={errors.default_timezone?.message}
                  required
                  value={field.value}
                  onValueChange={field.onChange}
                  options={timezones.map((tz) => ({ value: tz, label: tz }))}
                  disabled={!canEdit}
                />
              )}
            />
            <FormField
              label="Maximum concurrent runs"
              htmlFor="sch-concurrency"
              description="Runs beyond this limit wait in the queue (1-20)."
              error={errors.max_concurrent_runs?.message}
              required
            >
              <Input type="number" inputMode="numeric" min={1} max={20} {...form.register('max_concurrent_runs', { valueAsNumber: true })} />
            </FormField>
            <FormField
              label="Retry attempts"
              htmlFor="sch-retries"
              description="How many times a failed run is retried automatically (0-10)."
              error={errors.default_retry_attempts?.message}
              required
            >
              <Input type="number" inputMode="numeric" min={0} max={10} {...form.register('default_retry_attempts', { valueAsNumber: true })} />
            </FormField>
            <FormField
              label="Retry backoff (seconds)"
              htmlFor="sch-backoff"
              description={
                <span className="inline-flex items-center gap-1">
                  {backoffHint}
                  <HelpTip label="About exponential backoff">
                    Exponential backoff waits longer after each failed attempt, which gives a busy source or warehouse time to recover instead of retrying
                    immediately.
                  </HelpTip>
                </span>
              }
              error={errors.default_backoff_seconds?.message}
              required
            >
              <Input type="number" inputMode="numeric" min={30} max={86400} step={30} {...form.register('default_backoff_seconds', { valueAsNumber: true })} />
            </FormField>

            <div className="sm:col-span-2">
              <Separator className="mb-5" />
              <Controller
                control={form.control}
                name="quiet_hours.enabled"
                render={({ field }) => (
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-0.5">
                      <Label htmlFor="sch-quiet">Quiet hours</Label>
                      <p id="sch-quiet-description" className="text-xs text-muted-foreground">
                        Scheduled runs do not start during this window; they start when it ends. Manual runs are always allowed.
                      </p>
                    </div>
                    <Switch id="sch-quiet" checked={field.value} onCheckedChange={field.onChange} disabled={!canEdit} aria-describedby="sch-quiet-description" />
                  </div>
                )}
              />
            </div>
            {quietEnabled ? (
              <>
                <FormField label="Quiet hours start" htmlFor="sch-quiet-start" error={errors.quiet_hours?.start?.message} required>
                  <Input type="time" step={60} {...form.register('quiet_hours.start')} />
                </FormField>
                <FormField
                  label="Quiet hours end"
                  htmlFor="sch-quiet-end"
                  description={overnight ? 'Ends the next morning.' : undefined}
                  error={errors.quiet_hours?.end?.message}
                  required
                >
                  <Input type="time" step={60} {...form.register('quiet_hours.end')} />
                </FormField>
              </>
            ) : null}
          </CardContent>
        </fieldset>
        <FormFooter
          dirty={isDirty}
          saving={update.isPending}
          canEdit={canEdit}
          blockedReason={PERMISSION_REASON.settings}
          onDiscard={() => form.reset(toValues(defaults))}
        />
      </form>
    </Card>
  )
}

export default function SchedulerSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const defaults = useSchedulerDefaults(workspaceId)

  return (
    <Section
      title="Scheduler defaults"
      description="Defaults for new schedules and limits for the whole workspace. Existing schedules keep their own retry settings."
    >
      {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
      {defaults.isLoading ? (
        <SectionSkeleton fields={4} />
      ) : defaults.isError ? (
        <ErrorState error={defaults.error} onRetry={() => defaults.refetch()} />
      ) : defaults.data ? (
        <SchedulerForm key={workspaceId} workspaceId={workspaceId} defaults={defaults.data} canEdit={canEdit} />
      ) : null}
    </Section>
  )
}
