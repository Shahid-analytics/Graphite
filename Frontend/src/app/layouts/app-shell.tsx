import { ChevronRight, Menu } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useMatches } from 'react-router'
import type { RouteHandle } from '@/app/lazy-page'
import { DemoBanner } from '@/components/demo/demo-banner'
import { PageSkeleton } from '@/components/feedback/states'
import { Logo } from '@/components/logo/logo'
import { CommandPalette } from '@/components/navigation/command-palette'
import { NotificationsPopover, useUnreadCount } from '@/components/navigation/notifications-popover'
import { Sidebar, SidebarNav } from '@/components/navigation/sidebar'
import { HelpMenu, UserMenu } from '@/components/navigation/user-menu'
import { WorkspaceSwitcher } from '@/components/navigation/workspace-switcher'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'

const COLLAPSE_KEY = 'graphite.sidebar.collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function SectionCrumb() {
  const matches = useMatches()
  const { workspaceId } = useWorkspace()
  const crumbs = matches
    .filter((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .map((m) => ({ label: (m.handle as RouteHandle).crumb!, path: m.pathname }))
  const section = crumbs[0]
  if (!section) return null
  return (
    <nav aria-label="Section" className="hidden items-center gap-1 text-sm md:flex">
      <ChevronRight className="size-3.5 text-subtle-foreground" aria-hidden />
      <Link to={section.path === `/w/${workspaceId}` ? wsPath(workspaceId) : section.path} className="rounded-sm px-1 text-muted-foreground hover:text-foreground">
        {section.label}
      </Link>
    </nav>
  )
}

/** Authenticated application layout: sidebar, top bar and page outlet. */
export function AppShell() {
  const { workspaceId } = useWorkspace()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const unread = useUnreadCount(workspaceId)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const toggle = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1')
      } catch {
        // Preference only.
      }
      return !prev
    })
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-md">
        Skip to content
      </a>
      <Sidebar workspaceId={workspaceId} collapsed={collapsed} onToggle={toggle} unreadCount={unread.data ?? 0} />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <Logo size={22} wordmarkClassName="text-white" className="text-white" />
          </div>
          <SidebarNav workspaceId={workspaceId} onNavigate={() => setMobileOpen(false)} unreadCount={unread.data ?? 0} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
          <DemoBanner />
          <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="size-4" />
            </Button>
            <WorkspaceSwitcher />
            <SectionCrumb />
            <div className="ml-auto flex items-center gap-1.5">
              <CommandPalette />
              <NotificationsPopover workspaceId={workspaceId} />
              <HelpMenu />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
