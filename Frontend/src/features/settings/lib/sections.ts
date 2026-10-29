import { Activity, Archive, Bell, Bot, Building2, CalendarClock, ChartColumn, Database, GitBranch, Plug, Users, type LucideIcon } from 'lucide-react'

export type SettingsSectionKey =
  | 'workspace'
  | 'members'
  | 'connections'
  | 'dbt'
  | 'metabase'
  | 'ai'
  | 'scheduler'
  | 'notifications'
  | 'integrations'
  | 'audit-retention'
  | 'system-health'

export interface SettingsSectionMeta {
  key: SettingsSectionKey
  label: string
  icon: LucideIcon
  group: 'Workspace' | 'Data platform' | 'Personal' | 'Operations'
}

/** Order matches the route list; groups drive the desktop sub-navigation. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  { key: 'workspace', label: 'Workspace', icon: Building2, group: 'Workspace' },
  { key: 'members', label: 'Members & roles', icon: Users, group: 'Workspace' },
  { key: 'connections', label: 'Connections', icon: Database, group: 'Data platform' },
  { key: 'dbt', label: 'dbt project', icon: GitBranch, group: 'Data platform' },
  { key: 'metabase', label: 'Metabase', icon: ChartColumn, group: 'Data platform' },
  { key: 'ai', label: 'AI provider', icon: Bot, group: 'Data platform' },
  { key: 'scheduler', label: 'Scheduler', icon: CalendarClock, group: 'Data platform' },
  { key: 'notifications', label: 'Notifications', icon: Bell, group: 'Personal' },
  { key: 'integrations', label: 'Integrations', icon: Plug, group: 'Operations' },
  { key: 'audit-retention', label: 'Audit retention', icon: Archive, group: 'Operations' },
  { key: 'system-health', label: 'System health', icon: Activity, group: 'Operations' },
]

export const SETTINGS_GROUPS = ['Workspace', 'Data platform', 'Personal', 'Operations'] as const

export function sectionMeta(key: string | undefined) {
  return SETTINGS_SECTIONS.find((s) => s.key === key) ?? null
}
