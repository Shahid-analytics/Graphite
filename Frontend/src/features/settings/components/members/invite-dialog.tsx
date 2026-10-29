import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { RoleDefinition } from '@/types'
import { applyFieldErrors } from '../../lib/form-errors'
import { ROLE_LABELS } from '../../lib/labels'
import { useInviteMember } from '../../queries'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter an email address.').email('Enter a valid email address.'),
  role: z.enum(['admin', 'editor', 'viewer'], { error: 'Choose a role.' }),
})

type FormValues = z.infer<typeof schema>

const DEFAULTS: FormValues = { email: '', role: 'editor' }

export function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
  roles,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RoleDefinition[] | undefined
}) {
  const invite = useInviteMember(workspaceId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS })
  const { errors } = form.formState

  const close = (next: boolean) => {
    if (invite.isPending) return
    if (!next) form.reset(DEFAULTS)
    onOpenChange(next)
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const member = await invite.mutateAsync({ email: values.email.trim(), role: values.role })
      toastSuccess(
        `Invitation created for ${member.user.email}`,
        isMockMode ? 'Demo mode does not send email; the invitation appears as pending in the member list.' : 'They will receive an email to join the workspace.',
      )
      form.reset(DEFAULTS)
      onOpenChange(false)
    } catch (error) {
      if (isApiError(error) && error.code === 'already_member') {
        form.setError('email', { type: 'server', message: error.message }, { shouldFocus: true })
        return
      }
      if (!applyFieldErrors(error, form.setError, ['email', 'role'])) toastError(error, 'Could not send the invitation')
    }
  })

  const descriptions = new Map(roles?.map((r) => [r.role, r.description]))

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>They get access to this workspace with the role you choose. You can change the role later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormField label="Email address" htmlFor="invite-email" error={errors.email?.message} required>
            <Input type="email" autoComplete="off" placeholder="name@company.com" autoFocus {...form.register('email')} />
          </FormField>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Role</legend>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} aria-label="Role" className="gap-2">
                  {(['admin', 'editor', 'viewer'] as const).map((role) => (
                    <Label
                      key={role}
                      htmlFor={`invite-role-${role}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 font-normal has-[[data-state=checked]]:border-foreground/40 has-[[data-state=checked]]:bg-surface"
                    >
                      <RadioGroupItem id={`invite-role-${role}`} value={role} className="mt-0.5" />
                      <span className="grid gap-0.5">
                        <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>
                        <span className="text-xs leading-snug text-muted-foreground">{descriptions.get(role) ?? ''}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            {errors.role ? (
              <p role="alert" className="text-xs text-danger">
                {errors.role.message}
              </p>
            ) : null}
          </fieldset>
          <Notice tone="neutral">The owner role cannot be granted by invitation. Ownership transfers are handled by support.</Notice>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={invite.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={invite.isPending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
