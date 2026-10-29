import { RefreshCw, Save, Send, SearchX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router'
import { KeyValueGrid, TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { LayerBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import type { FieldMapping, MappingSuggestionSet, ReviewItemType, ReviewMappingRequest } from '@/types'
import { CreateProposalPanel } from '../components/create-proposal-panel'
import { DisabledReason } from '../components/disabled-reason'
import { EditMappingDialog } from '../components/edit-mapping-dialog'
import { FieldMappingsTab } from '../components/field-mappings-tab'
import { GeneratingState } from '../components/generating-state'
import { JoinsTab } from '../components/joins-tab'
import { KeysTab } from '../components/keys-tab'
import { ModelsTab } from '../components/models-tab'
import type { ReviewHandlers } from '../components/review-context'
import { ReviewRecord } from '../components/review-record'
import { ReviewSummary } from '../components/review-summary'
import { ReviewerPanel } from '../components/reviewer-panel'
import { MappingStatusBadge } from '../components/status-badges'
import { BULK_ACCEPT_THRESHOLD, LAYER_LABEL, STATUS_META } from '../lib/labels'
import {
  applyDrafts,
  averageConfidence,
  changedDrafts,
  countDecisions,
  draftKey,
  reviewItems,
  type DraftMap,
  type FieldMappingOverrides,
} from '../lib/review'
import { useMappingSet, useReviewMappingSet } from '../queries'

function setTitle(set: Pick<MappingSuggestionSet, 'source_name' | 'target_layer'>) {
  return `${set.source_name} to ${LAYER_LABEL[set.target_layer]}`
}

function regeneratePath(set: MappingSuggestionSet) {
  const params = new URLSearchParams({ source: set.source_id, tables: set.source_tables.join(','), layer: set.target_layer })
  return `${wsPath(set.workspace_id, 'transformations', 'mapping', 'new')}?${params}`
}

function SetDetails({ set }: { set: MappingSuggestionSet }) {
  return (
    <Card>
      <CardContent>
        <KeyValueGrid
          columns={4}
          items={[
            {
              label: 'Source',
              value: (
                <Link to={wsPath(set.workspace_id, 'sources', set.source_id)} className="hover:underline">
                  {set.source_name}
                </Link>
              ),
            },
            { label: 'Target layer', value: <LayerBadge layer={set.target_layer} /> },
            {
              label: 'Provider',
              value: (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="truncate">{set.provider.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{set.provider.model}</span>
                </span>
              ),
            },
            {
              label: 'Requested',
              value: (
                <span>
                  {set.created_by.name}, <TimeAgo value={set.created_at} />
                </span>
              ),
            },
          ]}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Tables ({set.source_tables.length})</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {set.source_tables.map((t) => (
                <code key={t} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[11.5px]">
                  {t}
                </code>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Business context</p>
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{set.business_context || 'None provided.'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SetView({ set }: { set: MappingSuggestionSet }) {
  const canReview = usePermission('mappings:review')
  const canApprove = usePermission('mappings:approve')
  const review = useReviewMappingSet(set.id)
  const [drafts, setDrafts] = useState<DraftMap>({})
  const [editing, setEditing] = useState<FieldMapping | null>(null)
  const [tab, setTab] = useState('fields')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const effective = useMemo(() => applyDrafts(set, drafts), [set, drafts])
  // A closed set has no unsaved decisions, even while a review response is still settling.
  const reviewOpen = set.status === 'ready' || set.status === 'in_review'
  const changes = useMemo(() => (reviewOpen ? changedDrafts(set, drafts) : []), [reviewOpen, set, drafts])
  const unsavedKeys = useMemo(() => new Set(changes.map((c) => draftKey(c.item_type, c.item_id))), [changes])
  const counts = countDecisions(effective)
  const avg = averageConfidence(effective)
  const bulkTargets = reviewItems(effective).filter(({ item }) => item.decision === 'pending' && item.confidence >= BULK_ACCEPT_THRESHOLD)

  const editable = set.status === 'ready' ? canReview : set.status === 'in_review' ? canApprove : false
  const lockedReason = editable
    ? null
    : set.status === 'approved' || set.status === 'rejected'
      ? `This set was ${set.status}; decisions are read-only.`
      : set.status === 'in_review'
        ? 'Submitted for review. Only approvers (mappings:approve) can change decisions now.'
        : 'Your role does not include the mappings:review permission.'

  // Warn before leaving with unsaved decisions.
  const dirty = changes.length > 0
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  const proceeding = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const decide = useCallback(
    (type: ReviewItemType, id: string, decision: 'accepted' | 'rejected') =>
      setDrafts((prev) => ({ ...prev, [draftKey(type, id)]: { item_type: type, item_id: id, decision } })),
    [],
  )

  const handlers: ReviewHandlers = {
    isUnsaved: (type, id) => unsavedKeys.has(draftKey(type, id)),
    lockedReason,
    onDecide: decide,
  }

  const applyEdit = (mapping: FieldMapping, overrides: FieldMappingOverrides) => {
    const original = set.field_mappings.find((m) => m.id === mapping.id)
    const key = draftKey('field_mapping', mapping.id)
    // Only send values that differ from the saved suggestion.
    const diff = Object.fromEntries(Object.entries(overrides).filter(([k, v]) => original?.[k as keyof FieldMappingOverrides] !== v))
    setDrafts((prev) => {
      const next = { ...prev }
      if (!Object.keys(diff).length) delete next[key]
      else next[key] = { item_type: 'field_mapping', item_id: mapping.id, decision: 'modified', overrides: diff }
      return next
    })
  }

  const bulkAccept = () => {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const { type, item } of bulkTargets) next[draftKey(type, item.id)] = { item_type: type, item_id: item.id, decision: 'accepted' }
      return next
    })
    toastSuccess(`${bulkTargets.length} ${bulkTargets.length === 1 ? 'suggestion' : 'suggestions'} accepted`, 'Save the draft to keep these decisions.')
  }

  const send = async (action: ReviewMappingRequest['action'], comment?: string) => {
    try {
      await review.mutateAsync({ action, decisions: changes, ...(comment ? { comment } : {}) })
      setDrafts({})
      const messages: Record<ReviewMappingRequest['action'], [string, string]> = {
        save_draft: ['Draft saved', `${changes.length} ${changes.length === 1 ? 'decision' : 'decisions'} saved.`],
        submit: ['Submitted for review', 'An approver can now approve or reject this set.'],
        approve: ['Suggestions approved', 'Create a schema proposal to take them further. Nothing has been applied.'],
        reject: ['Suggestions rejected', 'The author can request new suggestions.'],
      }
      toastSuccess(...messages[action])
    } catch (error) {
      const title = action === 'save_draft' ? 'Could not save the draft' : 'Review action failed'
      // The reviewer panel shows comment errors inline; toastError lists the decision-level ones.
      toastError(error, title, { shownFields: ['comment'] })
      throw error
    }
  }

  const saveReason = !editable ? lockedReason : changes.length === 0 ? 'No unsaved decisions.' : null
  const submitReason = !canReview
    ? 'Your role does not include the mappings:review permission.'
    : counts.pending > 0
      ? `${counts.pending} ${counts.pending === 1 ? 'suggestion is' : 'suggestions are'} still pending. Accept, edit or reject every item before submitting.`
      : null

  const actions =
    set.status === 'ready' || set.status === 'in_review' ? (
      <>
        <DisabledReason reason={saveReason}>
          <Button
            variant="outline"
            disabled={Boolean(saveReason)}
            loading={review.isPending && review.variables?.action === 'save_draft'}
            onClick={() => send('save_draft').catch(() => undefined)}
          >
            <Save aria-hidden />
            Save draft{changes.length ? ` (${changes.length})` : ''}
          </Button>
        </DisabledReason>
        {set.status === 'ready' ? (
          <DisabledReason reason={submitReason}>
            <Button disabled={Boolean(submitReason)} onClick={() => setConfirmSubmit(true)}>
              <Send aria-hidden />
              Submit for review
            </Button>
          </DisabledReason>
        ) : null}
      </>
    ) : set.status === 'rejected' && canReview ? (
      <Button asChild variant="outline">
        <Link to={regeneratePath(set)}>
          <RefreshCw aria-hidden />
          Request new suggestions
        </Link>
      </Button>
    ) : null

  const pendingIn = (items: { decision: string }[]) => items.filter((i) => i.decision === 'pending').length
  const tabLabel = (label: string, items: { decision: string }[]) => {
    const pending = pendingIn(items)
    return (
      <>
        {label}
        <span className="text-xs tabular text-subtle-foreground">{items.length}</span>
        {pending ? <span className="sr-only">, {pending} pending</span> : null}
        {pending ? <span className="size-1.5 rounded-full bg-warning" aria-hidden /> : null}
      </>
    )
  }

  const modelOptions = [...new Set([...set.model_proposals.map((m) => m.name), ...set.field_mappings.map((m) => m.target_model)])].sort()

  return (
    <div className="space-y-6">
      <PageHeader
        title={setTitle(set)}
        breadcrumbs={[
          { label: 'Transformations', to: wsPath(set.workspace_id, 'transformations') },
          { label: 'AI mapping', to: wsPath(set.workspace_id, 'transformations', 'mapping') },
          { label: setTitle(set) },
        ]}
        meta={
          <>
            <MappingStatusBadge status={set.status} />
            {set.provider.simulated ? <SimulatedBadge always label="Simulated suggestions" reason="Generated by the mock suggestion engine in the browser. No AI provider was called." /> : null}
          </>
        }
        description={STATUS_META[set.status].description}
        actions={actions}
      />

      <SetDetails set={set} />

      {set.status === 'generating' ? <GeneratingState set={set} /> : null}

      {set.status === 'failed' ? (
        <Notice
          tone="danger"
          title="Suggestions could not be generated"
          action={
            canReview ? (
              <Button asChild size="sm" variant="outline">
                <Link to={regeneratePath(set)}>Try again</Link>
              </Button>
            ) : null
          }
        >
          No suggestions were produced for this request. Request new suggestions, or select fewer tables.
        </Notice>
      ) : null}

      {set.status !== 'generating' && set.status !== 'failed' ? (
        <>
          {set.review ? <ReviewRecord review={set.review} /> : null}
          {set.status === 'approved' ? <CreateProposalPanel set={set} /> : null}

          <ReviewSummary
            counts={counts}
            averageConfidence={avg}
            bulkEligible={bulkTargets.length}
            unsavedCount={changes.length}
            lockedReason={lockedReason}
            onBulkAccept={bulkAccept}
            onDiscard={() => setConfirmDiscard(true)}
          />

          {set.status === 'in_review' ? (
            <ReviewerPanel
              set={set}
              pendingCount={counts.pending}
              unsavedCount={changes.length}
              canApprove={canApprove}
              onAction={(action, comment) => send(action, comment)}
            />
          ) : null}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Suggestion types">
              <TabsTrigger value="fields">{tabLabel('Field mappings', effective.field_mappings)}</TabsTrigger>
              <TabsTrigger value="joins">{tabLabel('Joins and relationships', effective.join_candidates)}</TabsTrigger>
              <TabsTrigger value="keys">{tabLabel('Keys', effective.key_candidates)}</TabsTrigger>
              <TabsTrigger value="models">{tabLabel('Proposed models', effective.model_proposals)}</TabsTrigger>
            </TabsList>
            <TabsContent value="fields">
              <FieldMappingsTab mappings={effective.field_mappings} handlers={handlers} onEdit={setEditing} />
            </TabsContent>
            <TabsContent value="joins">
              <JoinsTab joins={effective.join_candidates} handlers={handlers} />
            </TabsContent>
            <TabsContent value="keys">
              <KeysTab keys={effective.key_candidates} handlers={handlers} />
            </TabsContent>
            <TabsContent value="models">
              <ModelsTab models={effective.model_proposals} layer={set.target_layer} handlers={handlers} />
            </TabsContent>
          </Tabs>
        </>
      ) : null}

      <EditMappingDialog
        mapping={editing}
        modelOptions={modelOptions}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={(overrides) => editing && applyEdit(editing, overrides)}
      />

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Submit for review?"
        description={`All ${counts.total} suggestions have a decision (${counts.accepted} accepted, ${counts.modified} modified, ${counts.rejected} rejected). After submitting, only approvers can change decisions.`}
        confirmLabel="Submit for review"
        onConfirm={() => send('submit')}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved decisions?"
        description={`${changes.length} unsaved ${changes.length === 1 ? 'decision goes' : 'decisions go'} back to the last saved state. This cannot be undone.`}
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => setDrafts({})}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && !proceeding.current && blocker.state === 'blocked') blocker.reset()
          proceeding.current = false
        }}
        title="Leave without saving?"
        description={`You have ${changes.length} unsaved ${changes.length === 1 ? 'decision' : 'decisions'}. They will be lost if you leave this page.`}
        confirmLabel="Discard and leave"
        destructive
        onConfirm={() => {
          proceeding.current = true
          blocker.proceed?.()
        }}
      />
    </div>
  )
}

export default function MappingSetPage() {
  const { setId } = useParams()
  const { workspaceId } = useWorkspace()
  const query = useMappingSet(setId)
  const listPath = wsPath(workspaceId, 'transformations', 'mapping')

  if (query.isPending) return <PageSkeleton />

  if (query.isError || query.data.workspace_id !== workspaceId) {
    const notFound = !query.isError || (isApiError(query.error) && (query.error.status === 404 || query.error.status === 403))
    return (
      <div>
        <PageHeader
          title="Mapping suggestions"
          breadcrumbs={[
            { label: 'Transformations', to: wsPath(workspaceId, 'transformations') },
            { label: 'AI mapping', to: listPath },
            { label: 'Not found' },
          ]}
        />
        {notFound ? (
          <EmptyState
            icon={SearchX}
            title="Suggestion set not found"
            description="It may have been created in another workspace, or the demo data was reset."
            action={
              <Button asChild variant="outline">
                <Link to={listPath}>Back to AI mapping</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} title="Could not load this suggestion set" onRetry={() => query.refetch()} />
        )}
      </div>
    )
  }

  return <SetView key={query.data.id} set={query.data} />
}
