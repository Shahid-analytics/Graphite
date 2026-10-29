import { Link } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { DestinationForm } from '../components/connections/destination-form'
import { SourceConnections } from '../components/connections/source-connections'
import { ReadOnlyNotice } from '../components/read-only-notice'
import { SectionSkeleton } from '../components/section-skeleton'
import { useDestination } from '../queries'

export default function ConnectionsSettingsPage() {
  const { workspaceId } = useWorkspace()
  const canEdit = usePermission('settings:manage')
  const destination = useDestination(workspaceId)

  return (
    <div className="space-y-8">
      <Section
        title="Destination warehouse"
        description="The PostgreSQL database that stores the Bronze, Silver and Gold layers. Credentials are write-only and never shown again after saving."
      >
        {!canEdit ? <ReadOnlyNotice permission="settings:manage" /> : null}
        {destination.isLoading ? (
          <SectionSkeleton fields={8} />
        ) : destination.isError ? (
          <ErrorState error={destination.error} onRetry={() => destination.refetch()} />
        ) : destination.data ? (
          <DestinationForm key={workspaceId} workspaceId={workspaceId} destination={destination.data} canEdit={canEdit} />
        ) : null}
      </Section>

      <Section
        title="Source connections"
        description="Systems Graphite ingests from. Open a source to change its credentials, tables or sync schedule."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={wsPath(workspaceId, 'sources')}>Manage sources</Link>
          </Button>
        }
      >
        <SourceConnections workspaceId={workspaceId} />
      </Section>
    </div>
  )
}
