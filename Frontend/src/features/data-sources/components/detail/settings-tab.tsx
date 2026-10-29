import { zodResolver } from '@hookform/resolvers/zod'
import { PlugZap, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, type Path, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/use-workspace'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import type { ConfigValue, ConnectorDefinition, Source, UpdateSourceRequest } from '@/types'
import { buildConfigSchema, defaultConfigValues, type ConfigFormValues } from '../../lib/config-form'
import { useTestSourceConnection, useUpdateSource } from '../../queries'
import { ConfigFields } from '../config-fields'
import { ConnectionTestResult } from '../connection-test-result'
import { GatedButton, permissionReason } from '../primitives'
import { ScheduleEditor, scheduleSchema, toScheduleConfig, toScheduleFormValue, type ScheduleFormValue } from '../schedule-editor'

interface SettingsValues {
  name: string
  config: ConfigFormValues
  schedule: ScheduleFormValue
}

function buildSchema(connector: ConnectorDefinition) {
  return z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80, 'Name must be 80 characters or fewer.'),
    config: buildConfigSchema(connector, { secretOptional: true }),
    schedule: scheduleSchema,
  })
}

/** Builds a PATCH payload with only the values that changed. Blank secret fields keep the stored value. */
function diffPayload(source: Source, connector: ConnectorDefinition, values: SettingsValues): UpdateSourceRequest {
  const payload: UpdateSourceRequest = {}
  if (values.name.trim() !== source.name) payload.name = values.name.trim()
  const config: Record<string, ConfigValue> = {}
  for (const field of connector.config_fields) {
    const raw = values.config[field.key]
    if (field.secret) {
      if (typeof raw === 'string' && raw.length > 0) config[field.key] = raw
      continue
    }
    const next: ConfigValue = field.type === 'boolean' ? Boolean(raw) : typeof raw === 'string' && raw.trim() ? (field.type === 'number' ? Number(raw) : raw.trim()) : null
    const current = source.config[field.key] ?? null
    if (next !== current) config[field.key] = next
  }
  if (Object.keys(config).length) payload.config = config
  const schedule = toScheduleConfig(values.schedule, source.schedule)
  if (JSON.stringify(schedule) !== JSON.stringify(source.schedule)) payload.schedule = schedule
  return payload
}

/**
 * Editable source settings. Remount with a new key after saving so secret inputs
 * and "Replace" toggles return to their stored state.
 */
export function SettingsTab({ source, connector, onDelete }: { source: Source; connector: ConnectorDefinition; onDelete: () => void }) {
  const canWrite = usePermission('sources:write')
  const update = useUpdateSource()
  const test = useTestSourceConnection()
  const [schema] = useState(() => buildSchema(connector))
  const form = useForm<SettingsValues>({
    resolver: zodResolver(schema) as Resolver<SettingsValues>,
    mode: 'onTouched',
    defaultValues: {
      name: source.name,
      config: defaultConfigValues(connector, source.config),
      schedule: toScheduleFormValue(source.schedule),
    },
  })
  const { register, control, handleSubmit, setError, formState, reset, trigger, getValues } = form

  const onSubmit = handleSubmit((values) => {
    const payload = diffPayload(source, connector, values)
    if (!Object.keys(payload).length) {
      toastInfo('No changes to save')
      return
    }
    return update
      .mutateAsync({ sourceId: source.id, payload })
      .then((updated) => {
        const secretsChanged = Object.keys(payload.config ?? {}).some((k) => connector.config_fields.find((f) => f.key === k)?.secret)
        toastSuccess('Settings saved', secretsChanged ? 'New credentials are stored. Test the connection or run a sync to verify them.' : undefined)
        // Drop secret values from form state; the parent remounts this form on update.
        test.reset()
        reset({ name: updated.name, config: defaultConfigValues(connector, updated.config), schedule: toScheduleFormValue(updated.schedule) })
        update.reset()
      })
      .catch((error) => {
        let mapped = false
        if (isApiError(error)) {
          for (const fe of error.fieldErrors) {
            if (fe.field === 'name' || fe.field.startsWith('config.') || fe.field.startsWith('schedule.')) {
              setError(fe.field as Path<SettingsValues>, { type: 'server', message: fe.message }, { shouldFocus: !mapped })
              mapped = true
            }
          }
        }
        toastError(error, mapped ? 'Some settings need attention' : 'Could not save settings')
      })
  })

  const disabled = !canWrite || update.isPending

  /** Tests the stored connection with any edited values (including a replacement secret) applied. */
  const runTest = async () => {
    if (!(await trigger('config'))) return
    const config = diffPayload(source, connector, getValues()).config
    test.mutate(
      { sourceId: source.id, config },
      {
        onError: (error) => {
          if (!isApiError(error)) return
          for (const fe of error.fieldErrors) {
            if (fe.field.startsWith('config.')) setError(fe.field as Path<SettingsValues>, { type: 'server', message: fe.message })
          }
        },
      },
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
      {!canWrite ? <Notice tone="neutral">{permissionReason('sources:write')} You can view these settings but not change them.</Notice> : null}
      <Card>
        <CardContent className="space-y-6">
          <Section title="General">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Source name" htmlFor="settings-name" required error={formState.errors.name?.message}>
                <Input {...register('name')} disabled={disabled} autoComplete="off" />
              </FormField>
              <FormField label="Destination schema" htmlFor="settings-schema" description="Fixed after creation. Create a new source to load into a different schema.">
                <Input value={source.destination_schema} readOnly disabled className="font-mono" />
              </FormField>
            </div>
          </Section>
          <Section title="Connection" description="Secrets are write-only. Leave a secret empty to keep the stored value.">
            <ConfigFields connector={connector} control={control} secrets={source.secrets} disabled={disabled} idPrefix="settings" />
            <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Test with the values above before saving. Unchanged secrets use the stored value.</p>
                <GatedButton
                  type="button"
                  variant="outline"
                  size="sm"
                  reason={canWrite ? null : permissionReason('sources:write')}
                  loading={test.isPending}
                  onClick={() => void runTest()}
                >
                  <PlugZap className="size-3.5" aria-hidden />
                  Test connection
                </GatedButton>
              </div>
              {test.data ? <ConnectionTestResult result={test.data} className="bg-background" /> : null}
              {test.error && !(isApiError(test.error) && test.error.fieldErrors.length) ? (
                <Notice tone="danger" title="The test could not be run">
                  {errorMessage(test.error)}
                </Notice>
              ) : null}
            </div>
          </Section>
          <Section title="Sync schedule">
            <Controller
              control={control}
              name="schedule"
              render={({ field }) => (
                <ScheduleEditor
                  value={field.value}
                  onChange={field.onChange}
                  current={source.schedule}
                  disabled={disabled}
                  errors={{ cron: formState.errors.schedule?.cron?.message, timezone: formState.errors.schedule?.timezone?.message }}
                />
              )}
            />
          </Section>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" disabled={disabled || !formState.isDirty} onClick={() => reset()}>
            Discard changes
          </Button>
          <GatedButton type="submit" reason={canWrite ? null : permissionReason('sources:write')} loading={update.isPending}>
            Save settings
          </GatedButton>
        </CardFooter>
      </Card>

      <Section title="Danger zone">
        <div className="flex flex-col gap-3 rounded-lg border border-danger/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">Delete this source</p>
            <p className="text-muted-foreground">Removes the connection, credentials and schedule. Bronze data stays in the warehouse.</p>
          </div>
          <GatedButton type="button" variant="destructive" size="sm" reason={canWrite ? null : permissionReason('sources:write')} onClick={onDelete}>
            <Trash2 className="size-3.5" aria-hidden />
            Delete source
          </GatedButton>
        </div>
      </Section>
    </form>
  )
}
