import { Lock, Sparkles } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { PROPOSAL_DESCRIPTION_MAX, PROPOSAL_TITLE_MAX } from '@/lib/proposal-limits'
import type { MappingSuggestionSet } from '@/types'
import { PERMISSION_REASONS } from '../components/gated-button'
import { ProposalBuilder } from '../components/proposal-builder'
import { EMPTY_FORM, fromMappingSet, type ProposalFormValues } from '../lib/form'
import { useMappingSet } from '../queries'

function defaultsFromMapping(set: MappingSuggestionSet): ProposalFormValues {
  return {
    title: `${set.target_layer === 'gold' ? 'Gold' : 'Silver'} models from ${set.source_name} mapping`.slice(0, PROPOSAL_TITLE_MAX),
    description: (set.business_context ?? '').slice(0, PROPOSAL_DESCRIPTION_MAX),
    changes: fromMappingSet(set),
  }
}

export default function NewProposalPage() {
  const { workspaceId } = useWorkspace()
  const canPropose = usePermission('models:propose')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mappingId = params.get('mapping')
  const mapping = useMappingSet(mappingId)
  const listPath = wsPath(workspaceId, 'models', 'proposals')

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Data Models', to: wsPath(workspaceId, 'models') },
        { label: 'Schema proposals', to: listPath },
        { label: 'New proposal' },
      ]}
      title="New schema proposal"
      description="Describe the tables and relationships you need. Validate to preview the DDL, then save a draft or submit it for review."
      meta={mappingId && mapping.data ? <SimulatedBadge label="From AI mapping" reason="Prefilled from simulated AI mapping suggestions. Review every column before submitting." /> : null}
    />
  )

  if (!canPropose) {
    return (
      <div>
        {header}
        <EmptyState
          icon={Lock}
          title="You cannot create schema proposals"
          description={PERMISSION_REASONS.propose}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={listPath}>Back to proposals</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (mappingId && mapping.isLoading) return <PageSkeleton />
  if (mappingId && mapping.error) {
    return (
      <div>
        {header}
        <ErrorState error={mapping.error} title="Could not load the mapping suggestions" onRetry={() => void mapping.refetch()} />
      </div>
    )
  }

  const set = mappingId ? mapping.data : undefined
  if (set && set.status !== 'approved') {
    return (
      <div className="space-y-4">
        {header}
        <Notice
          tone="warning"
          icon={Sparkles}
          title="These mapping suggestions are not approved yet"
          action={
            <>
              <Button asChild variant="outline" size="sm">
                <Link to={wsPath(workspaceId, 'transformations', 'mapping', set.id)}>Open mapping set</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate(wsPath(workspaceId, 'models', 'proposals', 'new'), { replace: true })}>
                Start a manual proposal
              </Button>
            </>
          }
        >
          The {set.source_name} suggestions are {set.status.replace('_', ' ')}. AI suggestions must pass review and approval before they can become a schema
          proposal.
        </Notice>
      </div>
    )
  }

  const accepted = set ? set.model_proposals.filter((m) => m.decision === 'accepted' || m.decision === 'modified').length : 0

  return (
    <div>
      {header}
      {set ? (
        <Notice tone="info" icon={Sparkles} className="mb-6" title={`Based on the approved ${set.source_name} mapping`}>
          {accepted
            ? `${accepted} accepted model suggestion${accepted === 1 ? ' was' : 's were'} converted into changes.`
            : 'This mapping set has no accepted model suggestions, so no changes were prefilled. Add the tables you need below.'}{' '}
          The proposal keeps a link to the mapping set and still goes through review.
        </Notice>
      ) : null}
      <ProposalBuilder
        key={set?.id ?? 'manual'}
        mode="create"
        defaultValues={set ? defaultsFromMapping(set) : EMPTY_FORM}
        mappingSuggestionId={set?.id ?? null}
        onSaved={(proposal) => navigate(wsPath(workspaceId, 'models', 'proposals', proposal.id), { replace: true })}
        onCancel={() => navigate(listPath)}
      />
    </div>
  )
}
