import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { NOTIFICATION_TYPE_LABELS, NotificationIcon } from '@/components/status/notification-icon'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import type { NotificationPreferences, NotificationSeverity, NotificationType } from '@/types'
import { FormFooter } from '../components/form-footer'
import { SectionSkeleton } from '../components/section-skeleton'
import { SelectField } from '../components/select-field'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../queries'

const EVENT_TYPES: { type: NotificationType; severity: NotificationSeverity; description: string }[] = [
  { type: 'pipeline_failed', severity: 'critical', description: 'A pipeline or sync run failed.' },
  { type: 'repeated_retries', severity: 'critical', description: 'A run failed again after automatic retries.' },
  { type: 'quality_failed', severity: 'critical', description: 'A dbt test or data quality check failed.' },
  { type: 'schema_changed', severity: 'warning', description: 'A source added, removed or retyped a column.' },
  { type: 'stale_data', severity: 'warning', description: 'A model missed its freshness target.' },
  { type: 'sync_completed', severity: 'success', description: 'A sync or pipeline run finished successfully.' },
]

const channel = z.object({ in_app: z.boolean(), email: z.boolean() })

const schema = z.object({
  email_address: z.string().trim().min(1, 'Enter the address that receives email notifications.').email('Enter a valid email address.'),
  digest: z.enum(['off', 'daily', 'weekly']),
  events: z.object({
    pipeline_failed: channel,
    sync_completed: channel,
    repeated_retries: channel,
    quality_failed: channel,
    schema_changed: channel,
    stale_data: channel,
  }),
})

type FormValues = z.infer<typeof schema>

const toValues = (p: NotificationPreferences): FormValues => ({
  email_address: p.email_address,
  digest: p.digest,
  events: structuredClone(p.events),
})

const DIGEST_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'daily', label: 'Daily at 08:00' },
  { value: 'weekly', label: 'Weekly on Monday at 08:00' },
]

function PreferencesForm({ workspaceId, prefs }: { workspaceId: string; prefs: NotificationPreferences }) {
  const update = useUpdateNotificationPreferences(workspaceId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(prefs) })
  const { errors, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ ...values, email_address: values.email_address.trim() })
      form.reset(toValues(saved))
      toastSuccess('Notification preferences saved')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, ['email_address', 'digest'])) toastError(error, 'Could not save your preferences')
    }
  })

  const setAll = (key: 'in_app' | 'email', value: boolean) => {
    for (const { type } of EVENT_TYPES) form.setValue(`events.${type}.${key}`, value, { shouldDirty: true })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <UnsavedChangesGuard when={isDirty} />
      <fieldset disabled={update.isPending} className="contents">
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
            <CardDescription>Where email notifications go and whether you get a summary.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField label="Email address" htmlFor="np-email" error={errors.email_address?.message} required>
              <Input type="email" autoComplete="email" {...form.register('email_address')} />
            </FormField>
            <Controller
              control={form.control}
              name="digest"
              render={({ field }) => (
                <SelectField
                  id="np-digest"
                  label="Summary digest"
                  description="A summary of runs, failures and freshness for this workspace."
                  error={errors.digest?.message}
                  value={field.value}
                  onValueChange={field.onChange}
                  options={DIGEST_OPTIONS}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Choose how you hear about each kind of event in this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <caption className="sr-only">Notification channels for each event type</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Event</TableHead>
                  <TableHead className="w-24 text-center">
                    <span className="block">In-app</span>
                    <span className="flex justify-center gap-1 normal-case">
                      <Button type="button" variant="link" className="py-0 text-[11px] font-normal text-muted-foreground" onClick={() => setAll('in_app', true)} aria-label="Turn on in-app notifications for every event">
                        All
                      </Button>
                      <span aria-hidden>/</span>
                      <Button type="button" variant="link" className="py-0 text-[11px] font-normal text-muted-foreground" onClick={() => setAll('in_app', false)} aria-label="Turn off in-app notifications for every event">
                        None
                      </Button>
                    </span>
                  </TableHead>
                  <TableHead className="w-24 pr-5 text-center">
                    <span className="block">Email</span>
                    <span className="flex justify-center gap-1 normal-case">
                      <Button type="button" variant="link" className="py-0 text-[11px] font-normal text-muted-foreground" onClick={() => setAll('email', true)} aria-label="Turn on email notifications for every event">
                        All
                      </Button>
                      <span aria-hidden>/</span>
                      <Button type="button" variant="link" className="py-0 text-[11px] font-normal text-muted-foreground" onClick={() => setAll('email', false)} aria-label="Turn off email notifications for every event">
                        None
                      </Button>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EVENT_TYPES.map(({ type, severity, description }) => (
                  <TableRow key={type}>
                    <TableCell className="pl-5">
                      <div className="flex items-start gap-3">
                        <NotificationIcon type={type} severity={severity} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{NOTIFICATION_TYPE_LABELS[type]}</p>
                          <p className="text-xs whitespace-normal text-muted-foreground">{description}</p>
                        </div>
                      </div>
                    </TableCell>
                    {(['in_app', 'email'] as const).map((key) => (
                      <TableCell key={key} className={key === 'email' ? 'pr-5 text-center' : 'text-center'}>
                        <Controller
                          control={form.control}
                          name={`events.${type}.${key}`}
                          render={({ field }) => (
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              aria-label={`${NOTIFICATION_TYPE_LABELS[type]}: ${key === 'in_app' ? 'in-app' : 'email'}`}
                            />
                          )}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <FormFooter
            dirty={isDirty}
            saving={update.isPending}
            canEdit
            blockedReason=""
            onDiscard={() => form.reset(toValues(prefs))}
            saveLabel="Save preferences"
          />
        </Card>
      </fieldset>
    </form>
  )
}

export default function NotificationPreferencesPage() {
  const { workspaceId } = useWorkspace()
  const prefs = useNotificationPreferences(workspaceId)

  return (
    <Section
      title="Notifications"
      description="Personal preferences: they apply only to you, in this workspace."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={wsPath(workspaceId, 'notifications')}>View notifications</Link>
        </Button>
      }
    >
      {isMockMode ? <Notice tone="neutral">Demo mode does not send email or digests. The in-app setting is applied: simulated notifications for events you turn off here are not added to your notifications.</Notice> : null}
      {prefs.isLoading ? (
        <SectionSkeleton fields={2} />
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
      ) : prefs.data ? (
        <PreferencesForm key={workspaceId} workspaceId={workspaceId} prefs={prefs.data} />
      ) : null}
    </Section>
  )
}
