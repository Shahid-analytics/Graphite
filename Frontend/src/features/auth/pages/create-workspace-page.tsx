import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { wsPath } from '@/hooks/use-workspace'
import { COMMON_TIMEZONES } from '@/lib/cron'
import { toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import { AccountLayout } from '../components/account-layout'
import { INDUSTRIES, REGIONS } from '../lib/constants'
import { applyFieldErrors } from '../lib/form-errors'
import { useCreateWorkspace } from '../queries'

const schema = z.object({
  name: z.string().trim().min(2, 'Workspace name must be at least 2 characters.').max(80, 'Workspace name must be at most 80 characters.'),
  industry: z.string(),
  region: z.string().min(1, 'Choose a data region.'),
  timezone: z.string().min(1, 'Choose a timezone.'),
})

type Values = z.infer<typeof schema>

const FIELDS = ['name', 'industry', 'region', 'timezone'] as const

function defaultTimezone() {
  try {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (COMMON_TIMEZONES.includes(browser)) return browser
  } catch {
    // Fall back to the platform default below.
  }
  return 'Asia/Kolkata'
}

export default function CreateWorkspacePage() {
  const navigate = useNavigate()
  const create = useCreateWorkspace()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', industry: '', region: REGIONS[0], timezone: defaultTimezone() },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const workspace = await create.mutateAsync({
        name: values.name,
        industry: values.industry || null,
        region: values.region,
        timezone: values.timezone,
      })
      toastSuccess(`${workspace.name} created`, 'Let us connect your first data source.')
      navigate(wsPath(workspace.id, 'onboarding'))
    } catch (error) {
      // 422 and the 409 workspace_exists conflict both name the offending field.
      if (applyFieldErrors(error, setError, FIELDS)) return
      if (isApiError(error) && error.status === 409) {
        setError('name', { type: 'server', message: error.message }, { shouldFocus: true })
        return
      }
      setFormError(errorMessage(error, 'Could not create the workspace.'))
    }
  })

  return (
    <AccountLayout>
      <PageHeader
        title="Create a workspace"
        description="A workspace holds one business's sources, warehouse, transformations and dashboards. You become its owner."
        breadcrumbs={[{ label: 'Workspaces', to: '/workspaces' }, { label: 'New workspace' }]}
      />
      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
            <FormField label="Workspace name" htmlFor="ws-name" required error={formState.errors.name?.message} className="sm:col-span-2" description="Usually your company or business unit name.">
              <Input placeholder="Northwind Retail" autoComplete="organization" autoFocus {...register('name')} />
            </FormField>

            <FormField label="Industry" htmlFor="ws-industry" error={formState.errors.industry?.message} description="Helps tailor starter models and report suggestions.">
              <Controller
                control={control}
                name="industry"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ws-industry" onBlur={field.onBlur} aria-invalid={Boolean(formState.errors.industry)}>
                      <SelectValue placeholder="Select an industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry} value={industry}>
                          {industry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label="Data region" htmlFor="ws-region" required error={formState.errors.region?.message} description="Where the warehouse and backups are hosted. Cannot be changed later.">
              <Controller
                control={control}
                name="region"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ws-region" onBlur={field.onBlur} aria-invalid={Boolean(formState.errors.region)}>
                      <SelectValue placeholder="Select a region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((region) => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label="Timezone" htmlFor="ws-timezone" required error={formState.errors.timezone?.message} description="Default for schedules and reports.">
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ws-timezone" onBlur={field.onBlur} aria-invalid={Boolean(formState.errors.timezone)}>
                      <SelectValue placeholder="Select a timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            {formError ? (
              <Notice tone="danger" title="Workspace not created" className="sm:col-span-2">
                {formError}
              </Notice>
            ) : null}
          </CardContent>
          <CardFooter className="flex-col-reverse items-stretch justify-end sm:flex-row sm:items-center">
            <Button variant="ghost" asChild>
              <Link to="/workspaces">Cancel</Link>
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              Create and start setup
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AccountLayout>
  )
}
