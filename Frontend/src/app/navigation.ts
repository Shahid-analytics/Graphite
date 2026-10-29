import {
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  Database,
  GitBranch,
  History,
  LayoutDashboard,
  Settings,
  Table2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  /** Path segment under /w/:workspaceId ("" for the overview). */
  path: string
  icon: LucideIcon
  description: string
}

export interface NavGroup {
  label: string | null
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ key: 'overview', label: 'Overview', path: '', icon: LayoutDashboard, description: 'Operational health of the workspace' }],
  },
  {
    label: 'Data platform',
    items: [
      { key: 'sources', label: 'Data Sources', path: 'sources', icon: Database, description: 'Connections, sync and ingestion settings' },
      { key: 'pipelines', label: 'Pipelines & Sync Jobs', path: 'pipelines', icon: Workflow, description: 'End-to-end runs from source to Metabase' },
      { key: 'transformations', label: 'Transformations', path: 'transformations', icon: GitBranch, description: 'dbt models, tests and AI-assisted mapping' },
      { key: 'models', label: 'Data Models', path: 'models', icon: Boxes, description: 'Bronze, Silver and Gold catalog' },
      { key: 'preview', label: 'Data Preview', path: 'preview', icon: Table2, description: 'Browse sample rows of any table' },
      { key: 'schedules', label: 'Schedules', path: 'schedules', icon: CalendarClock, description: 'Recurring syncs, pipelines and dbt runs' },
    ],
  },
  {
    label: 'Insights',
    items: [{ key: 'analytics', label: 'Analytics & Reports', path: 'analytics', icon: BarChart3, description: 'Metabase dashboards and reports' }],
  },
  {
    label: 'Governance',
    items: [
      { key: 'audit', label: 'Audit Trail', path: 'audit', icon: History, description: 'Who changed what, and when' },
      { key: 'notifications', label: 'Notifications', path: 'notifications', icon: Bell, description: 'Failures, retries and data alerts' },
      { key: 'settings', label: 'Settings', path: 'settings', icon: Settings, description: 'Workspace, members and integrations' },
    ],
  },
]

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)
