import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type Path } from 'react-hook-form'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/hooks/use-workspace'
import { COMMON_TIMEZONES, CRON_PRESETS, presetForCron, validateCron } from '@/lib/cron'
import { formatDuration } from '@/lib/format'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { errorMessage, isApiError } from '@/services/api-error'
import type { IntervalPreset, Schedule, ScheduleTargetType, UpsertScheduleRequest, ValidateScheduleRequest } from '@/types'
import { OVERLAP_POLICIES, TARGET_META, TARGET_TYPES, retryDelays } from '../lib/schedule-utils'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useValidateSchedule } from '../queries'
import { ConflictNotices } from './conflict-notices'
import { CronCheatSheet } from './cron-cheatsheet'
import { CronPreview } from './cron-preview'
import { SchedulerNote } from './scheduler-note'
import { TargetPicker } from './target-picker'

const PRESET_CHOICES = [...CRON_PRESETS.map((p) => p.value), 'custom'] as const

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

const wholeNumber = (label: string, min: number, max: number) =>
  z
    .number({ error: `Enter ${label}.` })
    .int(`${label.charAt(0).toUpperCase()}${label.slice(1)} must be a whole number.`)
    .min(min, `Minimum is ${min}.`)
    .max(max, `Maximum is ${max}.`)

const schema = z
  .object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters.').max(120, 'Name must be 120 characters or fewer.'),
    description: z.string().trim().max(500, 'Description must be 500 characters or fewer.'),
    target_type: z.enum(['pipeline', 'source_sync', 'transformation']),
    target_id: z.string().min(1, 'Select a target to schedule.'),
    preset_choice: z.enum(PRESET_CHOICES),
    cron: z.string().trim(),
    timezone: z.string().min(1, 'Select a timezone.').refine(isValidTimezone, 'Not a valid IANA timezone.'),
    enabled: z.boolean(),
    retry: z.object({
      max_attempts: wholeNumber('a number of retries', 0, 10),
      backoff_seconds: wholeNumber('a backoff in seconds', 30, 86_400),
      backoff_strategy: z.enum(['fixed', 'exponential']),
    }),
    concurrency: z.object({
      max_concurrent_runs: wholeNumber('a run limit', 1, 10),
      overlap_policy: z.enum(['skip', 'queue', 'cancel_running']),
    }),
  })
  .superRefine((values, ctx) => {
    const result = validateCron(values.cron, isValidTimezone(values.timezone) ? values.timezone : 'UTC')
    if (!result.valid) ctx.addIssue({ code: 'custom', path: ['cron'], message: result.error ?? 'Invalid cron expression.' })
  })

export type ScheduleFormValues = z.infer<typeof schema>

export interface ScheduleFormDefaults {
  timezone: string
  target_type?: ScheduleTargetType
  target_id?: string
}

function initialValues(initial: Schedule | undefined, defaults: ScheduleFormDefaults): ScheduleFormValues {
  if (initial) {
    return {
      name: initial.name,
      description: initial.description,
      target_type: initial.target_type,
      target_id: initial.target_id,
      preset_choice: presetForCron(initial.cron),
      cron: initial.cron,
      timezone: initial.timezone,
      enabled: initial.enabled,
      retry: { ...initial.retry },
      concurrency: { ...initial.concurrency },
    }
  }
  const daily = CRON_PRESETS.find((p) => p.value === 'daily')!
  return {
    name: '',
    description: '',
    target_type: defaults.target_type ?? 'pipeline',
    target_id: defaults.target_id ?? '',
    preset_choice: 'daily',
    cron: daily.cron,
    timezone: defaults.timezone,
    enabled: true,
    retry: { max_attempts: 2, backoff_seconds: 300, backoff_strategy: 'exponential' },
    concurrency: { max_concurrent_runs: 1, overlap_policy: 'skip' },
  }
}

function toPayload(values: ScheduleFormValues, initial: Schedule | undefined): UpsertScheduleRequest {
  const cron = values.cron.trim().replace(/\s+/g, ' ')
  // Keep the stored preset label when an unchanged custom cron was originally saved under a preset.
  const preset: IntervalPreset =
    values.preset_choice !== 'custom' ? values.preset_choice : initial && initial.cron === cron ? initial.preset : 'custom'
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    target_type: values.target_type,
    target_id: values.target_id,
    preset,
    cron,
    timezone: values.timezone,
    enabled: values.enabled,
    retry: values.retry,
    concurrency: values.concurrency,
  }
}

const FIELD_PATHS = new Set<string>([
  'name',
  'description',
  'target_type',
  'target_id',
  'cron',
  'timezone',
  'enabled',
  'retry.max_attempts',
  'retry.backoff_seconds',
  'retry.backoff_strategy',
  'concurrency.max_concurrent_runs',
  'concurrency.overlap_policy',
])

function Section({ title, description, help, children }: { title: string; description?: string; help?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {help ? <HelpTip label={`About ${title.toLowerCase()}`}>{help}</HelpTip> : null}
        </CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export function ScheduleForm({
  initial,
  defaults,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Schedule
  defaults: ScheduleFormDefaults
  submitLabel: string
  /** Persists the schedule. Errors are mapped onto fields (422) or shown above the actions. */
  onSubmit: (payload: UpsertScheduleRequest) => Promise<unknown>
  onCancel: () => void
}) {
  const { workspace, workspaceId } = useWorkspace()
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues(initial, defaults),
    mode: 'onTouched',
  })
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = form

  const [targetType, targetId, presetChoice, cron, timezone, retry] = useWatch({
    control,
    name: ['target_type', 'target_id', 'preset_choice', 'cron', 'timezone', 'retry'],
  })

  const timezoneOk = isValidTimezone(timezone)
  const cronValidation = useMemo(() => validateCron(cron, timezoneOk ? timezone : 'UTC'), [cron, timezone, timezoneOk])

  const validationKey = cronValidation.valid && targetId && timezoneOk
    ? JSON.stringify({ cron: cron.trim().replace(/\s+/g, ' '), timezone, target_type: targetType, target_id: targetId, schedule_id: initial?.id })
    : ''
  const debouncedKey = useDebouncedValue(validationKey, 500)
  const validatePayload = debouncedKey ? (JSON.parse(debouncedKey) as ValidateScheduleRequest) : null
  const serverCheck = useValidateSchedule(workspaceId, validatePayload)

  const timezones = useMemo(
    () => Array.from(new Set([workspace.timezone, ...COMMON_TIMEZONES, ...(initial ? [initial.timezone] : [])])),
    [workspace.timezone, initial],
  )

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toPayload(values, initial))
    } catch (error) {
      if (isApiError(error) && error.status === 422 && error.fieldErrors.length) {
        const unmapped: string[] = []
        error.fieldErrors.forEach((fieldError, index) => {
          if (FIELD_PATHS.has(fieldError.field)) {
            setError(fieldError.field as Path<ScheduleFormValues>, { type: 'server', message: fieldError.message }, { shouldFocus: index === 0 })
          } else {
            unmapped.push(fieldError.message)
          }
        })
        if (unmapped.length) setError('root.server', { type: 'server', message: unmapped.join(' ') })
        return
      }
      if (isApiError(error) && error.code === 'duplicate_schedule') {
        setError('cron', { type: 'server', message: error.message }, { shouldFocus: false })
      }
      setError('root.server', { type: 'server', message: errorMessage(error) })
      toastError(error, initial ? 'Could not save the schedule' : 'Could not create the schedule')
    }
  })

  const delays = retry && Number.isInteger(retry.max_attempts) && Number.isInteger(retry.backoff_seconds) && retry.max_attempts <= 10
    ? retryDelays(retry)
    : []
  const meta = TARGET_META[targetType]

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Section title="Details">
        <FormField label="Name" htmlFor="schedule-name" required error={errors.name?.message}>
          <Input placeholder="e.g. Finance every 6 hours" autoComplete="off" {...register('name')} />
        </FormField>
        <FormField
          label="Description"
          htmlFor="schedule-description"
          description="Optional. Explain why this cadence was chosen so others know whether it is safe to change."
          error={errors.description?.message}
        >
          <Textarea rows={2} {...register('description')} />
        </FormField>
      </Section>

      <Section title="Target" description="What the scheduler triggers on each run.">
        <Controller
          control={control}
          name="target_type"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Target type</legend>
              <RadioGroup
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value as ScheduleTargetType)
                  setValue('target_id', '', { shouldDirty: true })
                }}
                className="grid gap-2 sm:grid-cols-3"
              >
                {TARGET_TYPES.map((type) => {
                  const item = TARGET_META[type]
                  const Icon = item.icon
                  const id = `target-type-${type}`
                  return (
                    <Label
                      key={type}
                      htmlFor={id}
                      className={cn(
                        'flex cursor-pointer flex-col items-start gap-1 rounded-md border border-border p-3 font-normal hover:border-border-strong',
                        field.value === type && 'border-primary bg-surface',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <RadioGroupItem id={id} value={type} />
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        {item.label}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                    </Label>
                  )
                })}
              </RadioGroup>
            </fieldset>
          )}
        />
        <Controller
          control={control}
          name="target_id"
          render={({ field, fieldState }) => (
            <div className="grid gap-1.5">
              <Label htmlFor="schedule-target" className="gap-1">
                {meta.label}
                <span aria-hidden className="text-subtle-foreground">
                  *
                </span>
              </Label>
              <TargetPicker
                id="schedule-target"
                type={targetType}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                describedBy={fieldState.error ? 'schedule-target-error' : undefined}
              />
              {fieldState.error ? (
                <p id="schedule-target-error" role="alert" className="text-xs text-danger">
                  {fieldState.error.message}
                </p>
              ) : null}
            </div>
          )}
        />
      </Section>

      <Section
        title="Cadence"
        description="When runs start. Times are evaluated in the selected timezone, including daylight saving changes."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="preset_choice"
            render={({ field }) => (
              <FormField label="Frequency" htmlFor="schedule-preset">
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    const preset = CRON_PRESETS.find((p) => p.value === value)
                    if (preset) setValue('cron', preset.cron, { shouldValidate: true, shouldDirty: true })
                  }}
                >
                  <SelectTrigger id="schedule-preset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value="custom">Custom cron expression</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="timezone"
            render={({ field, fieldState }) => (
              <FormField
                label="Timezone"
                htmlFor="schedule-timezone"
                description={field.value === workspace.timezone ? 'Workspace default timezone.' : `Workspace default is ${workspace.timezone}.`}
                error={fieldState.error?.message}
              >
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="schedule-timezone"
                    aria-invalid={fieldState.error ? true : undefined}
                    // FormField wires these onto its direct child (the Select root), so the trigger needs them explicitly.
                    aria-describedby={['schedule-timezone-description', fieldState.error ? 'schedule-timezone-error' : null].filter(Boolean).join(' ')}
                  >
                    <SelectValue placeholder="Select a timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                        {tz === workspace.timezone ? <span className="text-xs text-muted-foreground">workspace default</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
        </div>

        {presetChoice === 'custom' ? (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="schedule-cron">
                Cron expression
                <span aria-hidden className="text-subtle-foreground">
                  *
                </span>
              </Label>
              <CronCheatSheet />
            </div>
            <Input
              id="schedule-cron"
              className="font-mono"
              placeholder="0 */6 * * *"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.cron ? true : undefined}
              aria-describedby={cronValidation.valid ? 'schedule-cron-help' : 'schedule-cron-help schedule-cron-preview'}
              {...register('cron')}
            />
            <p id="schedule-cron-help" className="text-xs text-muted-foreground">
              Five fields: minute, hour, day of month, month, day of week.
            </p>
          </div>
        ) : null}
        {errors.cron?.message && cronValidation.valid ? (
          <p role="alert" className="text-xs text-danger">
            {errors.cron.message}
          </p>
        ) : null}
        {presetChoice === 'custom' ? null : (
          <p className="text-xs text-muted-foreground">
            Cron expression <code className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-foreground">{cron}</code>. Choose
            "Custom cron expression" to edit it.
          </p>
        )}

        <CronPreview id="schedule-cron-preview" validation={cronValidation} timezone={timezoneOk ? timezone : 'UTC'} />

        <ConflictNotices
          idle={!validationKey}
          result={validatePayload ? serverCheck.data : undefined}
          isFetching={Boolean(validatePayload) && (serverCheck.isFetching || validationKey !== debouncedKey)}
          error={serverCheck.error}
          onRetry={() => void serverCheck.refetch()}
          currentScheduleId={initial?.id}
        />
      </Section>

      <Section
        title="Retry policy"
        help="When a run fails with a retryable error (for example a source timeout or rate limit), the backend scheduler starts a new attempt after the backoff delay. Non-retryable failures such as dbt compile errors are not retried."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Retry attempts"
            htmlFor="retry-attempts"
            description="0 to 10. Set 0 to disable automatic retries."
            error={errors.retry?.max_attempts?.message}
          >
            <Input type="number" inputMode="numeric" min={0} max={10} step={1} {...register('retry.max_attempts', { valueAsNumber: true })} />
          </FormField>
          <FormField
            label="Backoff (seconds)"
            htmlFor="retry-backoff"
            description="Wait before the first retry, 30 to 86400 seconds."
            error={errors.retry?.backoff_seconds?.message}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={30}
              max={86_400}
              step={30}
              {...register('retry.backoff_seconds', { valueAsNumber: true })}
            />
          </FormField>
        </div>
        <Controller
          control={control}
          name="retry.backoff_strategy"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Backoff strategy</legend>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2">
                {[
                  { value: 'fixed', label: 'Fixed', description: 'Waits the same backoff before every retry.' },
                  { value: 'exponential', label: 'Exponential', description: 'Doubles the wait after each failed attempt. Gentler on rate-limited sources.' },
                ].map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`backoff-${option.value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal hover:border-border-strong',
                      field.value === option.value && 'border-primary bg-surface',
                    )}
                  >
                    <RadioGroupItem id={`backoff-${option.value}`} value={option.value} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {delays.length
            ? `A failing run is retried after ${delays.map((s) => formatDuration(s)).join(', then ')}.`
            : retry?.max_attempts === 0
              ? 'Failed runs are not retried automatically.'
              : null}
        </p>
      </Section>

      <Section
        title="Concurrency"
        help="Controls what happens when a run is due while earlier runs of the same target are still in progress, for example after a slow load."
      >
        <FormField
          label="Maximum concurrent runs"
          htmlFor="concurrency-max"
          description="1 to 10. Keep 1 for targets that write to the same tables."
          error={errors.concurrency?.max_concurrent_runs?.message}
          className="sm:max-w-xs"
        >
          <Input type="number" inputMode="numeric" min={1} max={10} step={1} {...register('concurrency.max_concurrent_runs', { valueAsNumber: true })} />
        </FormField>
        <Controller
          control={control}
          name="concurrency.overlap_policy"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">When the limit is reached</legend>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                {OVERLAP_POLICIES.map((policy) => (
                  <Label
                    key={policy.value}
                    htmlFor={`overlap-${policy.value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal hover:border-border-strong',
                      field.value === policy.value && 'border-primary bg-surface',
                    )}
                  >
                    <RadioGroupItem id={`overlap-${policy.value}`} value={policy.value} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{policy.label}</span>
                      <span className="block text-xs text-muted-foreground">{policy.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}
        />
      </Section>

      <Card>
        <CardContent className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="schedule-enabled">Enabled</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Disabled schedules are kept but never trigger runs.</p>
          </div>
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => <Switch id="schedule-enabled" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </CardContent>
      </Card>

      {errors.root?.server?.message ? (
        <Notice tone="danger" title="The schedule was not saved">
          {errors.root.server.message}
        </Notice>
      ) : null}

      <SchedulerNote />

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={Boolean(initial) && !isDirty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
