import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { DemoBanner } from '@/components/demo/demo-banner'
import { PageHeader } from '@/components/layout/page-header'
import { Logo } from '@/components/logo/logo'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import { isMockMode } from '@/lib/config'
import { errorMessage, isApiError } from '@/services/api-error'
import { DemoAccounts } from '../components/demo-accounts'
import { LoginHero } from '../components/login-hero'
import { PasswordInput } from '../components/password-input'
import { safeRedirect } from '../lib/constants'
import { applyFieldErrors } from '../lib/form-errors'

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address.')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Values = z.infer<typeof schema>

export default function LoginPage() {
  const { session, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const destination = safeRedirect((location.state as { from?: unknown } | null)?.from)

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { register, handleSubmit, setValue, setFocus, setError, control, formState } = form
  const email = useWatch({ control, name: 'email' })

  if (session) return <Navigate to={destination} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values)
      navigate(destination, { replace: true })
    } catch (error) {
      if (applyFieldErrors(error, setError, ['email', 'password'])) return
      setValue('password', '')
      if (isApiError(error) && error.status === 401) {
        setFormError(errorMessage(error, 'Incorrect email or password.'))
        setFocus('password')
      } else {
        setFormError(errorMessage(error, 'Sign-in failed. Try again.'))
      }
    }
  })

  const pickDemoAccount = (address: string) => {
    setValue('email', address, { shouldValidate: formState.isSubmitted, shouldDirty: true })
    setFormError(null)
    setFocus('password')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <DemoBanner showControls={false} />
      <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <LoginHero />

        <main id="main" className="flex flex-col px-4 py-10 sm:px-8 lg:px-12">
          <Logo size={24} className="mb-10 lg:hidden" />
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
            <PageHeader title="Sign in to Graphite" description="Use your work email to open your workspaces." className="mb-8" />

            <form onSubmit={onSubmit} noValidate className="space-y-4" aria-describedby={formError ? 'login-error' : undefined}>
              <FormField label="Work email" htmlFor="login-email" error={formState.errors.email?.message} required>
                <Input type="email" autoComplete="username" inputMode="email" placeholder="you@company.com" autoFocus {...register('email')} />
              </FormField>
              <FormField label="Password" htmlFor="login-password" error={formState.errors.password?.message} required>
                <PasswordInput autoComplete="current-password" {...register('password')} />
              </FormField>

              {formError ? (
                <p id="login-error" role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" className="w-full" loading={formState.isSubmitting}>
                Sign in
                {formState.isSubmitting ? null : <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </form>

            {isMockMode ? <DemoAccounts onSelect={pickDemoAccount} selectedEmail={email} className="mt-8" /> : null}

            <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Production authentication, single sign-on and authorization are provided by the Graphite backend. This screen only
                submits your credentials to it.
              </span>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
