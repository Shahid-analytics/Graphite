import { ArrowRight, Lock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { ConnectorDefinition } from '@/types'
import { ConnectorIcon } from '../components/primitives'
import { SourceWizardForm } from '../components/wizard/source-wizard-form'
import { WizardStepper } from '../components/wizard/wizard-stepper'
import { CATEGORY_LABELS } from '../lib/labels'
import { useConnectors, useSources } from '../queries'

function ConnectorStep({ connectors, selected, onSelect }: { connectors: ConnectorDefinition[]; selected: string | null; onSelect: (type: string) => void }) {
  const available = connectors.filter((c) => c.status === 'available')
  const upcoming = connectors.filter((c) => c.status !== 'available')
  return (
    <div className="space-y-6">
      <section aria-labelledby="available-connectors">
        <h2 id="available-connectors" className="mb-3 text-sm font-semibold">
          Choose a connector
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {available.map((connector) => (
            <li key={connector.type}>
              <button
                type="button"
                onClick={() => onSelect(connector.type)}
                aria-pressed={selected === connector.type}
                className={cn(
                  'flex h-full w-full items-start gap-3 rounded-lg border bg-background p-4 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring/20',
                  selected === connector.type ? 'border-foreground' : 'border-border',
                )}
              >
                <ConnectorIcon category={connector.category} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{connector.name}</span>
                    <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[connector.category]}</span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{connector.description}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-mono">
                      {connector.engine}
                    </Badge>
                    <Badge>{connector.supports_incremental ? 'Incremental sync' : 'Full load only'}</Badge>
                  </span>
                </span>
                <ArrowRight className="mt-1 size-4 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {upcoming.length ? (
        <section aria-labelledby="upcoming-connectors">
          <h2 id="upcoming-connectors" className="mb-1 text-sm font-semibold">
            Coming soon
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">Not yet available. Ask your administrator if you need one of these connectors.</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((connector) => (
              <li key={connector.type} className="flex items-center gap-2.5 rounded-md border border-dashed border-border-strong bg-surface px-3 py-2 text-sm text-muted-foreground" aria-disabled="true">
                <ConnectorIcon category={connector.category} className="size-7 bg-background" />
                <span className="flex-1 truncate">{connector.name}</span>
                <Lock className="size-3.5" aria-label="Not yet available" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export default function NewSourcePage() {
  const { workspaceId } = useWorkspace()
  const canWrite = usePermission('sources:write')
  const [params, setParams] = useSearchParams()
  const connectors = useConnectors()
  const sources = useSources(workspaceId)
  const requested = params.get('connector')
  const connector = connectors.data?.find((c) => c.type === requested && c.status === 'available') ?? null
  const unavailable = requested && connectors.data && !connector ? connectors.data.find((c) => c.type === requested) : null
  const [step, setStep] = useState(() => (requested ? 1 : 0))
  const currentStep = connector ? Math.max(1, step) : 0

  const header = (
    <PageHeader
      title="Add data source"
      description="Connect a system, choose tables and set a schedule. Data lands in the Bronze layer of your warehouse."
      breadcrumbs={[{ label: 'Data Sources', to: wsPath(workspaceId, 'sources') }, { label: 'New source' }]}
    />
  )

  if (!canWrite) {
    return (
      <div>
        {header}
        <EmptyState
          icon={ShieldAlert}
          title="You cannot add data sources"
          description='Adding a source requires the "sources:write" permission, which admins and owners have. Ask a workspace admin to add the connection or change your role.'
          action={
            <Button asChild variant="outline">
              <Link to={wsPath(workspaceId, 'sources')}>Back to data sources</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (connectors.isLoading || sources.isLoading) return <PageSkeleton />
  if (connectors.error || sources.error) {
    return (
      <div>
        {header}
        <ErrorState
          error={connectors.error ?? sources.error}
          onRetry={() => {
            void connectors.refetch()
            void sources.refetch()
          }}
        />
      </div>
    )
  }
  if (!connectors.data?.length) {
    return (
      <div>
        {header}
        <EmptyState title="No connectors available" description="The backend did not return any connectors. Contact your administrator." />
      </div>
    )
  }

  const selectConnector = (type: string | null) => {
    const next = new URLSearchParams(params)
    if (type) next.set('connector', type)
    else next.delete('connector')
    setParams(next, { replace: true })
    setStep(type ? 1 : 0)
  }

  return (
    <div className="mx-auto max-w-4xl">
      {header}
      <WizardStepper current={currentStep} onSelect={(s) => (s === 0 ? selectConnector(null) : setStep(s))} />
      {unavailable ? (
        <Notice tone="warning" className="mb-4" title={`${unavailable.name} is not yet available`}>
          Ask your administrator if you need this connector. Choose an available connector below.
        </Notice>
      ) : null}
      {connector && currentStep > 0 ? (
        <SourceWizardForm
          key={connector.type}
          connector={connector}
          existing={sources.data ?? []}
          step={currentStep}
          onStepChange={setStep}
          onChangeConnector={() => selectConnector(null)}
        />
      ) : (
        <ConnectorStep connectors={connectors.data} selected={connector?.type ?? null} onSelect={(type) => selectConnector(type)} />
      )}
    </div>
  )
}
