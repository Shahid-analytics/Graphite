import { X } from 'lucide-react'
import { Link } from 'react-router'
import { DemoBanner } from '@/components/demo/demo-banner'
import { Logo } from '@/components/logo/logo'
import { Button } from '@/components/ui/button'
import { wsPath } from '@/hooks/use-workspace'
import type { Workspace } from '@/types'

/** Header for the full-screen setup flow, which runs outside the application shell. */
export function OnboardingTopBar({ workspace }: { workspace: Workspace }) {
  return (
    <div className="sticky top-0 z-20 bg-background">
      <DemoBanner showControls={false} />
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo size={22} className="shrink-0" />
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{workspace.name}</span>
              <span className="hidden text-xs text-muted-foreground sm:block">Guided setup</span>
            </span>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to={wsPath(workspace.id)}>
              <X className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Exit to overview</span>
              <span className="sm:hidden">Exit</span>
            </Link>
          </Button>
        </div>
      </header>
    </div>
  )
}
