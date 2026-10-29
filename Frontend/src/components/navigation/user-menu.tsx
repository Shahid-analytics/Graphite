import { BookOpen, CircleHelp, Keyboard, LifeBuoy, LogOut, Settings, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { config } from '@/lib/config'
import { toastError } from '@/lib/toast'
import { initials } from '@/lib/utils'

export function UserMenu() {
  const { session, logout } = useAuth()
  const { workspace } = useWorkspace()
  const navigate = useNavigate()
  if (!session) return null
  const { user } = session

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full" aria-label={`Account menu for ${user.name}`}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="capitalize">{workspace.current_user_role}</span> in {workspace.name}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(wsPath(workspace.id, 'settings', 'notifications'))}>
          <UserRound className="size-4" aria-hidden />
          Notification preferences
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(wsPath(workspace.id, 'settings'))}>
          <Settings className="size-4" aria-hidden />
          Workspace settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            try {
              await logout()
              navigate('/login', { replace: true })
            } catch (error) {
              toastError(error, 'Sign out failed')
            }
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'K'], 'Open the command menu and search'],
  [['Esc'], 'Close dialogs and menus'],
  [['Tab'], 'Move between controls'],
  [['Enter'], 'Open the focused table row'],
]

export function HelpMenu() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Help">
            <CircleHelp className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard className="size-4" aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <BookOpen className="size-4" aria-hidden />
            How {config.appName} works
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <LifeBuoy className="size-4" aria-hidden />
            Contact support
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Use Cmd instead of Ctrl on macOS.</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border rounded-md border border-border">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{label}</span>
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How {config.appName} works</DialogTitle>
            <DialogDescription>End-to-end business intelligence for growing businesses.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-sm">
            {[
              ['Connect', 'Add Salesforce, PostgreSQL and other sources. Credentials are sent once to the backend and never stored in the browser.'],
              ['Ingest', 'dlt loads raw records into the PostgreSQL Bronze layer on a schedule.'],
              ['Transform', 'dbt models clean data into Silver and model it into Gold facts and dimensions. AI suggestions are reviewed before use.'],
              ['Check', 'Data quality tests and freshness SLAs run after every build.'],
              ['Analyse', 'Metabase dashboards and reports read from the Gold layer.'],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-medium">{i + 1}</span>
                <span>
                  <span className="font-medium">{title}.</span> <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Support contact details are provided by your administrator. In demo mode no support channel is connected.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}
