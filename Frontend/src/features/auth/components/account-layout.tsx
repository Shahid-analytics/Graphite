import { LogOut } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { DemoBanner } from '@/components/demo/demo-banner'
import { Logo } from '@/components/logo/logo'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { toastError } from '@/lib/toast'
import { initials } from '@/lib/utils'
import { isApiError } from '@/services/api-error'

/** Frame for signed-in pages that sit outside any workspace (picker, create workspace). */
export function AccountLayout({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch (error) {
      // An expired session is already signed out; the local session has been cleared either way.
      if (isApiError(error) && error.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      toastError(error, 'Could not sign out')
      setSigningOut(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <DemoBanner showControls={false} />
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/workspaces" className="rounded-md" aria-label="Graphite workspaces">
            <Logo size={22} />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {session ? (
              <span className="hidden min-w-0 items-center gap-2 sm:flex">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">{initials(session.user.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">{session.user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{session.user.email}</span>
                </span>
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={signOut} loading={signingOut}>
              {signingOut ? null : <LogOut className="size-3.5" aria-hidden />}
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </main>
    </div>
  )
}
