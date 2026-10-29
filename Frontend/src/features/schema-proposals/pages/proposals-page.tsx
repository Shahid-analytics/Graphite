import { FileDiff, Plus, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { HelpTip, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { ProposalStatus, SchemaProposal } from '@/types'
import { GatedButton, PERMISSION_REASONS } from '../components/gated-button'
import { OriginBadge, ProposalStatusBadge } from '../components/proposal-badges'
import { CHANGE_META, HELP } from '../lib/labels'
import { matchesQuery } from '../lib/search'
import { useProposals } from '../queries'

type Tab = 'all' | 'draft' | 'pending_review' | 'approved' | 'applied' | 'rejected'

const TABS: { value: Tab; label: string; statuses: ProposalStatus[] | null; empty: string }[] = [
  { value: 'all', label: 'All', statuses: null, empty: 'No proposals match your search.' },
  { value: 'draft', label: 'Draft', statuses: ['draft'], empty: 'No drafts. Drafts appear here until they are submitted for review.' },
  { value: 'pending_review', label: 'Pending review', statuses: ['pending_review'], empty: 'Nothing is waiting for review.' },
  { value: 'approved', label: 'Approved', statuses: ['approved', 'applying'], empty: 'No approved proposals are waiting to be applied.' },
  { value: 'applied', label: 'Applied', statuses: ['applied'], empty: 'No proposals have been applied yet.' },
  { value: 'rejected', label: 'Rejected', statuses: ['rejected'], empty: 'No rejected proposals.' },
]

function changeBreakdown(p: SchemaProposal) {
  const counts = new Map<string, number>()
  for (const c of p.changes) {
    const label = c.change_type === 'create_table' ? `create ${c.model_role ?? 'table'}` : CHANGE_META[c.change_type].label.toLowerCase()
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].map(([label, n]) => `${n} ${label}`).join(', ')
}

export default function ProposalsPage() {
  const { workspaceId } = useWorkspace()
  const canPropose = usePermission('models:propose')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const proposals = useProposals(workspaceId)
  const tab = (TABS.some((t) => t.value === params.get('status')) ? params.get('status') : 'all') as Tab
  const active = TABS.find((t) => t.value === tab)!

  const all = useMemo(() => proposals.data ?? [], [proposals.data])
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.value, t.statuses ? all.filter((p) => t.statuses!.includes(p.status)).length : all.length])),
    [all],
  )
  const rows = useMemo(
    () => all.filter((p) => !active.statuses || active.statuses.includes(p.status)).filter((p) => matchesQuery(search, p.title, p.description, p.created_by.name)),
    [all, active, search],
  )

  const setTab = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === 'all') next.delete('status')
        else next.set('status', value)
        return next
      },
      { replace: true },
    )

  const columns: Column<SchemaProposal>[] = [
    {
      id: 'title',
      header: 'Proposal',
      sortValue: (p) => p.title.toLowerCase(),
      className: 'max-w-[22rem] whitespace-normal',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={wsPath(workspaceId, 'models', 'proposals', p.id)} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
            {p.title}
          </Link>
          {p.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</p> : null}
        </div>
      ),
    },
    {
      id: 'origin',
      header: 'Origin',
      hideOnMobile: true,
      sortValue: (p) => p.origin,
      cell: (p) => <OriginBadge proposal={p} workspaceId={workspaceId} />,
    },
    {
      id: 'changes',
      header: 'Changes',
      hideOnMobile: true,
      sortValue: (p) => p.changes.length,
      cell: (p) => (
        <span className="text-sm" title={changeBreakdown(p)}>
          <span className="tabular">{p.changes.length}</span>
          <span className="ml-1.5 hidden text-xs text-muted-foreground xl:inline">{changeBreakdown(p)}</span>
        </span>
      ),
    },
    { id: 'status', header: 'Status', sortValue: (p) => p.status, cell: (p) => <ProposalStatusBadge status={p.status} /> },
    {
      id: 'created',
      header: 'Created',
      hideOnMobile: true,
      sortValue: (p) => p.created_at,
      cell: (p) => (
        <div className="text-sm">
          <p>{p.created_by.name}</p>
          <TimeAgo value={p.created_at} className="text-xs text-muted-foreground" />
        </div>
      ),
    },
    {
      id: 'reviewer',
      header: 'Reviewer',
      hideOnMobile: true,
      sortValue: (p) => p.reviewed_by?.name ?? null,
      cell: (p) =>
        p.reviewed_by ? (
          <div className="text-sm">
            <p>{p.reviewed_by.name}</p>
            <TimeAgo value={p.reviewed_at} className="text-xs text-muted-foreground" />
          </div>
        ) : (
          <span className="text-subtle-foreground">—</span>
        ),
    },
  ]

  const newButton = (
    <GatedButton blockedReason={canPropose ? null : PERMISSION_REASONS.propose} asChild={canPropose} size="sm">
      {canPropose ? (
        <Link to={wsPath(workspaceId, 'models', 'proposals', 'new')}>
          <Plus aria-hidden />
          New proposal
        </Link>
      ) : (
        <>
          <Plus aria-hidden />
          New proposal
        </>
      )}
    </GatedButton>
  )

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Data Models', to: wsPath(workspaceId, 'models') }, { label: 'Schema proposals' }]}
        title="Schema proposals"
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Propose facts, dimensions, relationships and surrogate keys. Proposals are validated and applied by the backend only after approval.
            <HelpTip label="About facts and dimensions">
              {HELP.fact} {HELP.dimension}
            </HelpTip>
          </span>
        }
        actions={newButton}
      />

      {proposals.isLoading ? (
        <TableSkeleton rows={4} columns={6} />
      ) : proposals.error ? (
        <ErrorState error={proposals.error} onRetry={() => void proposals.refetch()} />
      ) : !all.length ? (
        <EmptyState
          icon={FileDiff}
          title="No schema proposals yet"
          description="Create a proposal to add a fact or dimension, declare a relationship or add a surrogate key. Approved AI mapping suggestions can also be turned into a proposal."
          action={
            <>
              {newButton}
              <Button asChild variant="outline" size="sm">
                <Link to={wsPath(workspaceId, 'transformations', 'mapping')}>
                  <Sparkles aria-hidden />
                  Review AI mappings
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="space-y-3">
          {/* A filter over one list, so a toggle group (pressed state) rather than tabs that would need a panel per tab. */}
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ToggleGroup type="single" size="sm" value={tab} onValueChange={(value) => value && setTab(value)} aria-label="Filter by status">
              {TABS.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value} aria-label={`${t.label} (${counts[t.value]})`}>
                  {t.label}
                  <span className="rounded-sm bg-surface-2 px-1.5 text-xs text-muted-foreground tabular" aria-hidden>
                    {counts[t.value]}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <TableToolbar className="mb-0">
            <SearchInput value={search} onChange={setSearch} placeholder="Search proposals" />
          </TableToolbar>
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(p) => p.id}
            onRowClick={(p) => navigate(wsPath(workspaceId, 'models', 'proposals', p.id))}
            caption="Schema proposals"
            empty={<EmptyState compact title={search ? 'No matching proposals' : `No ${active.label.toLowerCase()} proposals`} description={search ? 'Try a different search.' : active.empty} />}
          />
        </div>
      )}
    </div>
  )
}
