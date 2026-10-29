import { CalendarClock } from 'lucide-react'
import { useId, useMemo } from 'react'
import { z } from 'zod'
import { HelpTip } from '@/components/data/display'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COMMON_TIMEZONES, validateCron } from '@/lib/cron'
import { cn } from '@/lib/utils'
import type { SyncFrequency, SyncScheduleConfig } from '@/types'
import { FREQUENCY_OPTIONS, frequencyCron } from '../lib/labels'

export interface ScheduleFormValue {
  frequency: SyncFrequency
  cron: string
  timezone: string
}

export const scheduleSchema = z
  .object({
    frequency: z.enum(['manual', 'hourly', 'every_6_hours', 'daily', 'weekly', 'custom']),
    cron: z.string(),
    timezone: z.string().min(1, 'Choose a time zone.'),
  })
  .superRefine((value, ctx) => {
    if (value.frequency !== 'custom') return
    const check = validateCron(value.cron, value.timezone)
    if (!check.valid) ctx.addIssue({ code: 'custom', path: ['cron'], message: check.error ?? 'Enter a valid cron expression.' })
    else if ((check.minIntervalMinutes ?? 60) < 15) ctx.addIssue({ code: 'custom', path: ['cron'], message: 'Syncs can run at most every 15 minutes.' })
  })

export function toScheduleFormValue(schedule: SyncScheduleConfig): ScheduleFormValue {
  return { frequency: schedule.frequency, cron: schedule.cron ?? '', timezone: schedule.timezone }
}

/** Converts form state into the API schedule payload. Preset frequencies keep an existing matching cron. */
export function toScheduleConfig(value: ScheduleFormValue, current?: SyncScheduleConfig): SyncScheduleConfig {
  if (value.frequency === 'manual') return { frequency: 'manual', cron: null, timezone: value.timezone }
  if (value.frequency === 'custom') return { frequency: 'custom', cron: value.cron.trim().replace(/\s+/g, ' '), timezone: value.timezone }
  const keep = current && current.frequency === value.frequency && current.cron ? current.cron : frequencyCron(value.frequency)
  return { frequency: value.frequency, cron: keep, timezone: value.timezone }
}

function formatInZone(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  } catch {
    return date.toISOString()
  }
}

/** Frequency picker with custom cron, time zone and a preview of upcoming runs. */
export function ScheduleEditor({
  value,
  onChange,
  errors,
  disabled,
  current,
}: {
  value: ScheduleFormValue
  onChange: (value: ScheduleFormValue) => void
  errors?: { cron?: string; timezone?: string; frequency?: string }
  disabled?: boolean
  /** Saved schedule; a preset keeps its saved cron (for example a different hour) when unchanged. */
  current?: SyncScheduleConfig
}) {
  const id = useId()
  const cron = value.frequency === 'custom' ? value.cron : (toScheduleConfig(value, current).cron ?? '')
  const preview = useMemo(() => (cron ? validateCron(cron, value.timezone, 3) : null), [cron, value.timezone])
  const timezones = COMMON_TIMEZONES.includes(value.timezone) ? COMMON_TIMEZONES : [value.timezone, ...COMMON_TIMEZONES]

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Sync frequency</legend>
        <RadioGroup
          value={value.frequency}
          onValueChange={(frequency) => onChange({ ...value, frequency: frequency as SyncFrequency, cron: frequency === 'custom' && !value.cron ? '0 */4 * * *' : value.cron })}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Sync frequency"
        >
          {FREQUENCY_OPTIONS.map((option) => {
            const optionId = `${id}-${option.value}`
            // A selected preset that kept a saved cron (for example 01:30 instead of 02:00) describes that cron.
            const keptOther = value.frequency === option.value && option.cron !== null && cron !== option.cron && preview?.valid
            return (
              <Label
                key={option.value}
                htmlFor={optionId}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 font-normal transition-colors hover:border-border-strong',
                  value.frequency === option.value && 'border-foreground bg-surface',
                )}
              >
                <RadioGroupItem id={optionId} value={option.value} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{keptOther ? `${preview.description}.` : option.description}</span>
                </span>
              </Label>
            )
          })}
        </RadioGroup>
      </fieldset>

      {value.frequency !== 'manual' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {value.frequency === 'custom' ? (
            <FormField
              label="Cron expression"
              htmlFor={`${id}-cron`}
              required
              error={errors?.cron}
              description={
                <span className="inline-flex items-center gap-1">
                  minute hour day-of-month month day-of-week
                  <HelpTip label="About cron expressions">
                    Five space-separated fields. For example "0 */4 * * *" runs every four hours on the hour, and "30 1 * * 1-5" runs at 01:30 on weekdays.
                    Syncs can run at most every 15 minutes.
                  </HelpTip>
                </span>
              }
            >
              <Input
                value={value.cron}
                onChange={(e) => onChange({ ...value, cron: e.target.value })}
                placeholder="0 */4 * * *"
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
                disabled={disabled}
              />
            </FormField>
          ) : null}
          <FormField label="Time zone" htmlFor={`${id}-tz`} error={errors?.timezone} description="Schedules are evaluated in this time zone.">
            <Select value={value.timezone} onValueChange={(timezone) => onChange({ ...value, timezone })} disabled={disabled}>
              <SelectTrigger id={`${id}-tz`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      ) : null}

      {value.frequency !== 'manual' ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2.5 text-sm" aria-live="polite">
          {preview?.valid ? (
            <>
              <p className="flex items-center gap-2 font-medium">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                {preview.description}
                <span className="font-mono text-xs font-normal text-muted-foreground">{cron}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Next runs ({value.timezone})</p>
              <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular">
                {preview.nextRuns.map((date) => (
                  <li key={date.toISOString()}>{formatInZone(date, value.timezone)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">{preview?.error ?? 'Enter a cron expression to preview upcoming runs.'}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No automatic syncs. Trigger syncs from the source page, or let a pipeline sync this source before it transforms data.</p>
      )}
    </div>
  )
}
