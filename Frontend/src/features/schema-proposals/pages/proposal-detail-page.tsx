import { ArrowUpRight, CheckCircle2, Database, FileQuestion, MessageSquareWarning, Pencil, Play, Send, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { CopyButton, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { useRun } from '@/components/runs/use-run'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { SchemaProposal } from '@/types'
import { ApplyProgress } from '../components/apply-progress'
import { ChangeCard } from '../components/change-card'
import { GatedButton, PERMISSION_REASONS } from '../components/gated-button'
import { OriginBadge, ProposalStatusBadge } from '../components/proposal-badges'
import { ProposalBuilder } from '../components/proposal-builder'
import { ReviewDialog, type ReviewAction } from '../components/review-dialog'
import { StatusTimeline } from '../components/status-timeline'
import { fromChanges } from '../lib/form'
import { useApplyProposal, useDeleteProposal, useProposal, useUpdateProposal } from '../queries'

export default function ProposalDetailPage() {
  const { proposalId = '' } = useParams()
  const { workspaceId } = useWorkspace()
  const proposal = useProposal(proposalId)
  const listPath = wsPath(workspaceId, 'models', 'proposals')
  const crumbs = [
    { label: 'Data Models', to: wsPath(workspaceId, 'models') },
    { label: 'Schema proposals', to: listPath },
  ]

  if (proposal.isLoading) return <PageSkeleton />
  if (proposal.error || !proposal.data) {
    const notFound = isApiError(proposal.error) && proposal.error.status === 404
    return (
      <div>
        <PageHeader breadcrumbs={[...crumbs, { label: proposalId }]} title="Schema proposal" />
        {notFound ? (
          <EmptyState
            icon={FileQuestion}
            title="Proposal not found"
            description="It may have been deleted, or the link is wrong."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={listPath}>Back to proposals</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={proposal.error} onRetry={() => void proposal.refetch()} />
        )}
      </div>
    )
  }
  if (proposal.data.workspace_id !== workspaceId) {
    return (
      <div>
        <PageHeader breadcrumbs={[...crumbs, { label: proposal.data.title }]} title={proposal.data.title} />
        <EmptyState
          icon={FileQuestion}
          title="This proposal belongs to another workspace"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={wsPath(proposal.data.workspace_id, 'models', 'proposals', proposal.data.id)}>Open in its workspace</Link>
            </Button>
          }
        />
      </div>
    )
  }
  return <ProposalView proposal={proposal.data} crumbs={crumbs} />
}

function ProposalView({ proposal, crumbs }: { proposal: SchemaProposal; crumbs: { label: string; to: string }[] }) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const canPropose = usePermission('models:propose')
  const canApprove = usePermission('models:approve')
  const [params, setParams] = useSearchParams()
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null)
  const [confirm, setConfirm] = useState<'apply' | 'delete' | null>(null)
  const [submitIssues, setSubmitIssues] = useState<string[]>([])
  const run = useRun(proposal.apply_run_id)
  const submit = useUpdateProposal(proposal.id)
  const apply = useApplyProposal(proposal.id)
  const remove = useDeleteProposal(proposal.id, workspaceId)
  const editing = params.get('edit') === '1' && proposal.status === 'draft' && canPropose
  const status = proposal.status

  const setEditing = (on: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (on) next.set('edit', '1')
        else next.delete('edit')
        return next
      },
      { replace: !on },
    )

  const reviewNotice = proposal.review_comment && proposal.reviewed_by ? (
    <Notice
      tone={status === 'rejected' ? 'danger' : status === 'draft' ? 'warning' : 'neutral'}
      title={
        status === 'rejected'
          ? `Rejected by ${proposal.reviewed_by.name}`
          : status === 'draft'
            ? `Changes requested by ${proposal.reviewed_by.name}`
            : `Review comment from ${proposal.reviewed_by.name}`
      }
    >
      <p className="whitespace-pre-line">{proposal.review_comment}</p>
    </Notice>
  ) : null

  if (editing) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[...crumbs, { label: proposal.title, to: wsPath(workspaceId, 'models', 'proposals', proposal.id) }, { label: 'Edit' }]}
          title={`Edit: ${proposal.title}`}
          meta={<ProposalStatusBadge status={proposal.status} />}
          description="Only drafts can be edited. Saving re-validates every change against the catalog."
        />
        {reviewNotice ? <div className="mb-6">{reviewNotice}</div> : null}
        <ProposalBuilder
          mode="edit"
          proposalId={proposal.id}
          defaultValues={{ title: proposal.title, description: proposal.description, changes: fromChanges(proposal.changes) }}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  const proposeReason = canPropose ? null : PERMISSION_REASONS.propose
  const approveReason = canApprove ? null : PERMISSION_REASONS.approve
  const layers = [...new Set(proposal.changes.map((c) => c.layer))].join(' and ')
  const models = new Set(proposal.changes.map((c) => c.model_name)).size

  const onSubmitForReview = async () => {
    setSubmitIssues([])
    try {
      await submit.mutateAsync({ submit_for_review: true })
      toastSuccess('Proposal submitted for review', 'A workspace admin can now approve, reject or request changes.')
    } catch (error) {
      // The backend re-validates every change on submit; the catalog may have changed since the draft was saved.
      if (isApiError(error) && error.fieldErrors.length) {
        setSubmitIssues(
          error.fieldErrors.map((fe) => {
            const match = /^changes\.(\d+)/.exec(fe.field)
            return match ? `Change ${Number(match[1]) + 1}: ${fe.message}` : fe.message
          }),
        )
      }
      toastError(error, 'Could not submit the proposal')
    }
  }

  const actions = (
    <>
      {status === 'draft' ? (
        <>
          <GatedButton blockedReason={proposeReason} variant="ghost" size="sm" onClick={() => setConfirm('delete')}>
            <Trash2 aria-hidden />
            Delete
          </GatedButton>
          <GatedButton blockedReason={proposeReason} variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </GatedButton>
          <GatedButton blockedReason={proposeReason} size="sm" onClick={() => void onSubmitForReview()} loading={submit.isPending}>
            <Send aria-hidden />
            Submit for review
          </GatedButton>
        </>
      ) : null}
      {status === 'pending_review' ? (
        <>
          <GatedButton blockedReason={approveReason} variant="outline" size="sm" onClick={() => setReviewAction('request_changes')}>
            <MessageSquareWarning aria-hidden />
            Request changes
          </GatedButton>
          <GatedButton blockedReason={approveReason} variant="outline" size="sm" onClick={() => setReviewAction('reject')}>
            <XCircle aria-hidden />
            Reject
          </GatedButton>
          <GatedButton blockedReason={approveReason} size="sm" onClick={() => setReviewAction('approve')}>
            <CheckCircle2 aria-hidden />
            Approve
          </GatedButton>
        </>
      ) : null}
      {status === 'approved' ? (
        <GatedButton blockedReason={approveReason} size="sm" onClick={() => setConfirm('apply')}>
          <Play aria-hidden />
          {run.data?.status === 'failed' ? 'Apply again' : 'Apply'}
        </GatedButton>
      ) : null}
      {status === 'applying' ? (
        <GatedButton blockedReason="The proposal is being applied. Follow the run below." size="sm">
          <Play aria-hidden />
          Applying
        </GatedButton>
      ) : null}
      {status === 'rejected' ? (
        <GatedButton blockedReason={proposeReason} variant="outline" size="sm" onClick={() => setConfirm('delete')}>
          <Trash2 aria-hidden />
          Delete
        </GatedButton>
      ) : null}
      {status === 'applied' ? (
        <Button asChild variant="outline" size="sm">
          <Link to={wsPath(workspaceId, 'models')}>
            <Database aria-hidden />
            Open data models
          </Link>
        </Button>
      ) : null}
    </>
  )


  return (
    <div>
      <PageHeader
        breadcrumbs={[...crumbs, { label: proposal.title }]}
        title={proposal.title}
        meta={
          <>
            <ProposalStatusBadge status={proposal.status} />
            <OriginBadge proposal={proposal} workspaceId={workspaceId} />
          </>
        }
        description={proposal.description || undefined}
        actions={actions}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          {reviewNotice}
          {status === 'draft' && submitIssues.length ? (
            <Notice
              tone="danger"
              title="The proposal could not be submitted"
              action={
                canPropose ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden />
                    Edit proposal
                  </Button>
                ) : undefined
              }
            >
              <ul className="list-disc space-y-0.5 pl-4">
                {submitIssues.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {proposal.apply_run_id ? (
            <ApplyProgress run={run.data} isLoading={run.isLoading} error={run.error} onRetry={() => void run.refetch()} workspaceId={workspaceId} />
          ) : null}
          {status === 'applied' && !proposal.apply_run_id ? (
            <Notice tone="success" title="Applied">
              The backend applied these changes before run history was retained, so no apply run is linked.
            </Notice>
          ) : null}

          <section aria-labelledby="changes-heading" className="space-y-3">
            <div>
              <h2 id="changes-heading" className="text-sm font-semibold">
                Changes <span className="font-normal text-muted-foreground tabular">({proposal.changes.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {models} model{models === 1 ? '' : 's'} in {layers || 'no layer'}. DDL is rendered by the backend for review and is never executed by the browser.
              </p>
            </div>
            {proposal.changes.length ? (
              <ol className="space-y-3">
                {proposal.changes.map((change, i) => (
                  <li key={change.id}>
                    <ChangeCard change={change} index={i} defaultOpen={proposal.changes.length <= 3} />
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                compact
                title="No changes"
                description="This proposal does not contain any changes."
                action={
                  status === 'draft' && canPropose ? (
                    <Button size="sm" onClick={() => setEditing(true)}>
                      Add changes
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
        </div>

        <aside className="space-y-4" aria-label="Proposal status and details">
          <section aria-labelledby="timeline-heading" className="rounded-lg border border-border bg-background p-4 shadow-xs">
            <h2 id="timeline-heading" className="mb-3 text-sm font-semibold">
              Status
            </h2>
            <StatusTimeline proposal={proposal} applyRun={run.data} />
          </section>
          <section aria-labelledby="details-heading" className="rounded-lg border border-border bg-background p-4 shadow-xs">
            <h2 id="details-heading" className="mb-3 text-sm font-semibold">
              Details
            </h2>
            <KeyValueGrid
              columns={1}
              items={[
                {
                  label: 'Origin',
                  value:
                    proposal.origin === 'ai_mapping' && proposal.mapping_suggestion_id ? (
                      <Link to={wsPath(workspaceId, 'transformations', 'mapping', proposal.mapping_suggestion_id)} className="inline-flex items-center gap-1 hover:underline">
                        AI mapping suggestions
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    ) : (
                      'Manual'
                    ),
                },
                { label: 'Created by', value: proposal.created_by.name },
                { label: 'Created', value: <TimeAgo value={proposal.created_at} /> },
                { label: 'Reviewer', value: proposal.reviewed_by ? proposal.reviewed_by.name : 'Not reviewed yet' },
                {
                  label: 'Proposal id',
                  value: (
                    <span className="inline-flex items-center gap-1 font-mono text-[13px]">
                      {proposal.id}
                      <CopyButton value={proposal.id} label="Copy proposal id" className="size-6" />
                    </span>
                  ),
                },
              ]}
            />
          </section>
          <Notice tone="neutral" icon={ShieldCheck}>
            The frontend only submits proposals. Validation, persistence and the dbt run that creates or alters models are backend responsibilities.
          </Notice>
        </aside>
      </div>

      <ReviewDialog proposal={proposal} action={reviewAction} onOpenChange={(open) => !open && setReviewAction(null)} />

      <ConfirmDialog
        open={confirm === 'apply'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Apply schema proposal?"
        description={`The backend will run dbt to create or alter ${models} model${models === 1 ? '' : 's'} in the ${layers} layer${layers.includes(' and ') ? 's' : ''}, then run data quality checks. Warehouse tables change and this cannot be undone from Graphite.`}
        confirmLabel="Apply proposal"
        onConfirm={async () => {
          try {
            await apply.mutateAsync()
            toastSuccess('Apply started', 'Progress is shown on this page.')
          } catch (error) {
            toastError(error, 'Could not apply the proposal')
            throw error
          }
        }}
      >
        {isMockMode ? <p className="text-xs text-muted-foreground">Demo mode: the run is simulated and no warehouse is changed.</p> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this proposal?"
        description={`"${proposal.title}" and its ${proposal.changes.length} change${proposal.changes.length === 1 ? '' : 's'} will be removed. The deletion is recorded in the audit trail.`}
        confirmLabel="Delete proposal"
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync()
            toastSuccess('Proposal deleted')
            navigate(wsPath(workspaceId, 'models', 'proposals'), { replace: true })
          } catch (error) {
            toastError(error, 'Could not delete the proposal')
            throw error
          }
        }}
      />
    </div>
  )
}
