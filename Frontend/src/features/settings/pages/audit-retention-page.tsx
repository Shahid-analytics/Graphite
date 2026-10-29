import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import type { AuditRetentionSettings } from '@/types'
import { FormFooter } from '../components/form-footer'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SectionSkeleton } from '../components/section-skeleton'
import { SelectField } from '../components/select-field'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { PERMISSION_REASON } from '../lib/labels'
import { useAuditRetention, useUpdateAuditRetention } from '../queries'

const RETENTION_OPTIONS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: '1 year (365 days)' },
  { days: 730, label: '2 years (730 days)' },
  { days: 2555, label: '7 years (2555 days)' },
]

const schema = z.object({
  retention_days: z.string().regex(/^\d+$/, 'Choose a retention period.'),
  export_enabled: z.boolean(),
  include_ip_addresses: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const toValues = (s: AuditRetentionSettings): FormValues => ({
  retention_days: String(s.retention_days),
  export_enabled: s.export_enabled,
  include_ip_addresses: s.include_ip_addresses,
})

const toPayload = (v: FormValues): AuditRetentionSettings => ({
  retention_days: Number(v.retention_days),
  export_enabled: v.export_enabled,
  include_ip_addresses: v.include_ip_addresses,
})

function retentionLabel(days: number) {
  return RETENTION_OPTIONS.find((o) => o.days === days)?.label ?? `${days} days`
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={`${id}-description`} />
    </div>
  )
}

function RetentionForm({ workspaceId, settings, canEdit }: { workspaceId: string; settings: AuditRetentionSettings; canEdit: boolean }) {
  const update = useUpdateAuditRetention(workspaceId)
  const [pendingShorter, setPendingShorter] = useState<FormValues | null>(null)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(settings) })
  const { errors, isDirty } = form.formState
  const options = RETENTION_OPTIONS.some((o) => o.days === settings.retention_days)
    ? RETENTION_OPTIONS
    : [...RETENTION_OPTIONS, { days: settings.retention_days, label: `${settings.retention_days} days` }].sort((a, b) => a.days - b.days)

  const save = async (values: FormValues) => {
    try {
      const saved = await update.mutateAsync(toPayload(values))
      form.reset(toValues(saved))
      toastSuccess('Audit retention saved')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, ['retention_days', 'export_enabled', 'include_ip_addresses'])) toastError(error, 'Could not save audit retention')
      throw error
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (Number(values.retention_days) < settings.retention_days) {
      setPendingShorter(values)
      return
    }
    await save(values).catch(() => undefined)
  })

  return (
    <Card>
      <UnsavedChangesGuard when={isDirty} />
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!canEdit || update.isPending} className="contents">
          <CardContent className="grid gap-5 pt-5">
            <Controller
              control={form.control}
              name="retention_days"
              render={({ field }) => (
                <SelectField
                  id="audit-retention-days"
                  label="Keep audit events for"
                  description="Events older than this are permanently deleted by the backend retention job, which runs daily. Many finance and tax audits expect 7 years."
                  error={errors.retention_days?.message}
                  required
                  value={field.value}
                  onValueChange={field.onChange}
                  options={options.map((o) => ({ value: String(o.days), label: o.label }))}
                  disabled={!canEdit}
                  className="sm:max-w-sm"
                />
              )}
            />
            <Separator />
            <Controller
              control={form.control}
              name="export_enabled"
              render={({ field }) => (
                <ToggleRow
                  id="audit-export"
                  label="Allow audit exports"
                  description="Members with the audit:export permission can download the audit trail as CSV."
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canEdit}
                />
              )}
            />
            <Controller
              control={form.control}
              name="include_ip_addresses"
              render={({ field }) => (
                <ToggleRow
                  id="audit-ip"
                  label="Record IP addresses"
                  description="Stores the client IP address with each user action. Turn off if your privacy policy treats IP addresses as personal data you do not retain."
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={!canEdit}
                />
              )}
            />
          </CardContent>
        </fieldset>
        <FormFooter dirty={isDirty} saving={update.isPending} canEdit={canEdit} blockedReason={PERMISSION_REASON.settings} onDiscard={() => form.reset(toValues(settings))} />
      </form>
      <ConfirmDialog
        open={Boolean(pendingShorter)}
        onOpenChange={(open) => {
          if (!open) setPendingShorter(null)
        }}
        title="Shorten audit retention?"
        description={
          pendingShorter
            ? `Retention drops from ${retentionLabel(settings.retention_days)} to ${retentionLabel(Number(pendingShorter.retention_days))}. On its next run the backend permanently deletes events older than that. Export the audit trail first if you need them.`
            : undefined
        }
        confirmLabel="Shorten retention"
        destructive
        onConfirm={() => (pendingShorter ? save(pendingShorter) : undefined)}
      />
    </Card>
  )
}

export default function AuditRetentionSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const retention = useAuditRetention(workspaceId)

  return (
    <Section
      title="Audit retention"
      description="How long the audit trail of configuration changes, runs, approvals and sign-ins is kept."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={wsPath(workspaceId, 'audit')}>Open audit trail</Link>
        </Button>
      }
    >
      {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
      {retention.isLoading ? (
        <SectionSkeleton fields={3} />
      ) : retention.isError ? (
        <ErrorState error={retention.error} onRetry={() => retention.refetch()} />
      ) : retention.data ? (
        <RetentionForm key={workspaceId} workspaceId={workspaceId} settings={retention.data} canEdit={canEdit} />
      ) : null}
    </Section>
  )
}
