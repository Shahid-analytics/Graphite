import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldAlert } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { CopyButton, KeyValueGrid } from '@/components/data/display'
import { Section } from '@/components/layout/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { COMMON_TIMEZONES } from '@/lib/cron'
import { formatDateTime } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Workspace } from '@/types'
import { FormFooter } from '../components/form-footer'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SelectField } from '../components/select-field'
import { UnsavedChangesGuard } from '../components/unsaved-changes-guard'
import { applyFieldErrors } from '../lib/form-errors'
import { PERMISSION_REASON, ROLE_LABELS } from '../lib/labels'
import { useUpdateWorkspace } from '../queries'

const PLAN_LABELS: Record<Workspace['plan'], string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }

const schema = z.object({
  name: z.string().trim().min(2, 'Workspace name must be at least 2 characters.').max(80, 'Keep the name under 80 characters.'),
  industry: z.string().trim().max(80, 'Keep the industry under 80 characters.'),
  timezone: z.string().min(1, 'Choose a time zone.'),
})

type FormValues = z.infer<typeof schema>

const toValues = (workspace: Workspace): FormValues => ({ name: workspace.name, industry: workspace.industry ?? '', timezone: workspace.timezone })

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useWorkspace()
  // Remount per workspace so the form never shows another workspace's values.
  return <WorkspaceSettings key={workspaceId} />
}

function WorkspaceSettings() {
  const { workspace, workspaceId } = useWorkspace()
  const canEdit = usePermission('workspace:manage')
  const update = useUpdateWorkspace(workspaceId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(workspace) })
  const { errors, isDirty } = form.formState
  const timezones = COMMON_TIMEZONES.includes(workspace.timezone) ? COMMON_TIMEZONES : [workspace.timezone, ...COMMON_TIMEZONES]

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ name: values.name, industry: values.industry || null, timezone: values.timezone })
      form.reset(toValues(saved))
      toastSuccess('Workspace updated')
    } catch (error) {
      if (!applyFieldErrors(error, form.setError, ['name', 'industry', 'timezone'])) toastError(error, 'Could not update the workspace')
    }
  })

  return (
    <div className="space-y-8">
      <UnsavedChangesGuard when={isDirty} />
      <Section title="Workspace" description="The name and defaults people see across Graphite. Changes apply to every member.">
        {!canEdit ? <ReadOnlyNotice permission="workspace:manage" who="the workspace owner" /> : null}
        <Card>
          <form onSubmit={onSubmit} noValidate>
            <fieldset disabled={!canEdit || update.isPending} className="contents">
              <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                <FormField label="Workspace name" htmlFor="ws-name" error={errors.name?.message} required className="sm:col-span-2">
                  <Input autoComplete="organization" {...form.register('name')} />
                </FormField>
                <FormField label="Industry" htmlFor="ws-industry" description="Used to tailor AI suggestions and report templates." error={errors.industry?.message}>
                  <Input placeholder="For example, Wholesale distribution" {...form.register('industry')} />
                </FormField>
                <Controller
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <SelectField
                      id="ws-timezone"
                      label="Time zone"
                      description="Default for dates in the interface and for new schedules."
                      error={errors.timezone?.message}
                      required
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!canEdit}
                      options={timezones.map((tz) => ({ value: tz, label: tz }))}
                    />
                  )}
                />
              </CardContent>
            </fieldset>
            <FormFooter
              dirty={isDirty}
              saving={update.isPending}
              canEdit={canEdit}
              blockedReason={PERMISSION_REASON.workspace}
              onDiscard={() => form.reset(toValues(workspace))}
            />
          </form>
        </Card>
      </Section>

      <Section title="Workspace details" description="Assigned when the workspace was created. Contact support to change the region or plan.">
        <Card>
          <CardContent className="pt-5">
            <KeyValueGrid
              columns={3}
              items={[
                {
                  label: 'Workspace ID',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <span className="truncate font-mono text-[13px]">{workspace.id}</span>
                      <CopyButton value={workspace.id} label="Copy workspace ID" className="size-6" />
                    </span>
                  ),
                },
                { label: 'Slug', value: workspace.slug, mono: true },
                { label: 'Data region', value: workspace.region },
                { label: 'Plan', value: PLAN_LABELS[workspace.plan] },
                { label: 'Created', value: formatDateTime(workspace.created_at) },
                { label: 'Your role', value: ROLE_LABELS[workspace.current_user_role] },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Danger zone">
        <Card className="border-danger/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-danger" aria-hidden />
              Delete workspace
            </CardTitle>
            <CardDescription>
              Deleting a workspace removes its source credentials, warehouse schemas, schedules, dashboards and audit history. Because it cannot be undone and
              must respect audit retention and data export obligations, deletion is not available in the control panel. The workspace owner requests it
              from Graphite support; the backend performs it after verifying the owner and offering a final export.
            </CardDescription>
          </CardHeader>
        </Card>
      </Section>
    </div>
  )
}
