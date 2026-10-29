import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router'
import { NAV_GROUPS } from '@/app/navigation'
import { Logo } from '@/components/logo/logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'

export function SidebarNav({
  workspaceId,
  collapsed = false,
  onNavigate,
  unreadCount = 0,
}: {
  workspaceId: string
  collapsed?: boolean
  onNavigate?: () => void
  unreadCount?: number
}) {
  return (
    <nav aria-label="Main" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi} className={cn(gi > 0 && 'mt-4')}>
          {group.label && !collapsed ? (
            <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">{group.label}</p>
          ) : null}
          {group.label && collapsed ? <div className="mx-2.5 mb-2 border-t border-sidebar-border" /> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon
              const badge = item.key === 'notifications' && unreadCount > 0 ? unreadCount : null
              const link = (
                <NavLink
                  to={wsPath(workspaceId, ...(item.path ? [item.path] : []))}
                  end={item.path === ''}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-active hover:text-white',
                      'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/60',
                      isActive && 'bg-sidebar-active font-medium text-white',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-white" aria-hidden /> : null}
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                      {badge !== null ? (
                        <span
                          className={cn(
                            'ml-auto min-w-5 rounded-full bg-white px-1.5 text-center text-[11px] font-semibold text-black tabular',
                            collapsed && 'absolute top-1 right-1 ml-0 min-w-4 px-1 text-[10px]',
                          )}
                          aria-label={`${badge} unread`}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              )
              return (
                <li key={item.key}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({
  workspaceId,
  collapsed,
  onToggle,
  unreadCount,
}: {
  workspaceId: string
  collapsed: boolean
  onToggle: () => void
  unreadCount: number
}) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-sidebar-border', collapsed ? 'justify-center' : 'px-4')}>
        <NavLink to={wsPath(workspaceId)} className="rounded-md text-white" aria-label="Go to overview">
          <Logo variant={collapsed ? 'icon' : 'full'} size={22} wordmarkClassName="text-white" />
        </NavLink>
      </div>
      <SidebarNav workspaceId={workspaceId} collapsed={collapsed} unreadCount={unreadCount} />
      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs text-sidebar-muted hover:bg-sidebar-active hover:text-white',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
