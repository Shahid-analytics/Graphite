import { Outlet, useLocation } from 'react-router'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { SettingsNav } from '../components/settings-nav'
import { ROLE_LABELS } from '../lib/labels'
import { sectionMeta } from '../lib/sections'

export default function SettingsLayout() {
  const { workspace, workspaceId } = useWorkspace()
  const { pathname } = useLocation()
  const segments = pathname.split('/')
  const section = sectionMeta(segments[segments.indexOf('settings') + 1])

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Workspace details, members, warehouse and integration connections, platform defaults and your personal preferences."
        breadcrumbs={[{ label: 'Settings', to: wsPath(workspaceId, 'settings') }, ...(section ? [{ label: section.label }] : [])]}
        meta={<Badge variant="outline">Your role: {ROLE_LABELS[workspace.current_user_role]}</Badge>}
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <SettingsNav workspaceId={workspaceId} active={section?.key ?? null} />
        <div className="min-w-0 flex-1 lg:max-w-4xl">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
