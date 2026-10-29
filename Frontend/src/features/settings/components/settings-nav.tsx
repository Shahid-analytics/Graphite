import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, type SettingsSectionKey } from '../lib/sections'

/** Vertical grouped list on large screens; horizontally scrollable tabs below lg. */
export function SettingsNav({ workspaceId, active }: { workspaceId: string; active: SettingsSectionKey | null }) {
  const activeTab = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <>
      <nav aria-label="Settings sections" className="-mx-4 border-b border-border px-4 lg:hidden">
        <ul className="scrollbar-thin flex gap-5 overflow-x-auto">
          {SETTINGS_SECTIONS.map((section) => (
            <li key={section.key} className="shrink-0">
              <NavLink
                to={wsPath(workspaceId, 'settings', section.key)}
                ref={section.key === active ? activeTab : undefined}
                className={({ isActive }) =>
                  cn(
                    '-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                    isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <section.icon className="size-3.5" aria-hidden />
                {section.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Settings sections" className="sticky top-20 hidden w-52 shrink-0 lg:block">
        <div className="space-y-5">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-subtle-foreground uppercase">{group}</p>
              <ul className="space-y-0.5">
                {SETTINGS_SECTIONS.filter((s) => s.group === group).map((section) => (
                  <li key={section.key}>
                    <NavLink
                      to={wsPath(workspaceId, 'settings', section.key)}
                      className={({ isActive }) =>
                        cn(
                          'flex h-8 items-center gap-2 rounded-md px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
                          isActive ? 'bg-surface-2 font-medium text-foreground' : 'text-muted-foreground hover:bg-surface hover:text-foreground',
                        )
                      }
                    >
                      <section.icon className="size-4" aria-hidden />
                      {section.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  )
}
