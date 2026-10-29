import { ArrowRight, PlugZap } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/hooks/use-workspace'
import type { ConfigValue, ConnectorType, TestConnectionResult } from '@/types'
import type { SourceDraft } from '../lib/draft'
import { WIZARD_STEPS } from '../lib/steps'
import { useConnectors } from '../queries'
import { ConnectorConfigForm } from './connector-config-form'
import { ConnectorPicker } from './connector-picker'
import { StepFooter, StepHeader, StepNav, useStepAccess, type StepNavProps } from './step-frame'

const STEP = WIZARD_STEPS[0]

function PickerSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading connectors">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-border p-4">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SourceStep({
  draft,
  onContinue,
  nav,
}: {
  draft: SourceDraft | null
  onContinue: (draft: Omit<SourceDraft, 'id'>) => void
  nav: StepNavProps
}) {
  const { workspaceId } = useWorkspace()
  const connectors = useConnectors()
  const access = useStepAccess(STEP.permission, STEP.action)
  const [selected, setSelected] = useState<ConnectorType | null>(draft?.connector.type ?? null)
  const connector = connectors.data?.find((c) => c.type === selected && c.status === 'available') ?? null
  const footerStart = <StepNav {...nav} />

  const handleContinue = (config: Record<string, ConfigValue>, test: TestConnectionResult) => {
    if (connector) onContinue({ connector, config, test })
  }

  return (
    <>
      <StepHeader stepKey="source" done={nav.done} />
      {access.notice}
      {nav.done && !draft ? (
        <Notice tone="success" title="A source is already connected" className="mb-6">
          You can connect another source here. To create its ingestion in the next steps, test the connection again in this session;
          credentials are never kept after you leave this page.
        </Notice>
      ) : null}

      <section aria-labelledby="connector-heading" className="space-y-3">
        <h2 id="connector-heading" className="text-sm font-semibold">
          Choose a connector
        </h2>
        {connectors.isLoading ? (
          <PickerSkeleton />
        ) : connectors.isError ? (
          <ErrorState error={connectors.error} title="Could not load the connector catalog" onRetry={() => connectors.refetch()} compact />
        ) : !connectors.data?.length ? (
          <EmptyState
            compact
            icon={PlugZap}
            title="No connectors are available"
            description="The ingestion service did not report any connectors. Check the backend configuration, or skip this step for now."
            action={
              <Button variant="outline" onClick={() => connectors.refetch()}>
                Check again
              </Button>
            }
          />
        ) : (
          <ConnectorPicker connectors={connectors.data} value={selected} onChange={setSelected} disabled={!access.allowed} />
        )}
      </section>

      {connector ? (
        <div className="mt-6">
          <ConnectorConfigForm
            key={connector.type}
            workspaceId={workspaceId}
            connector={connector}
            initialConfig={draft?.connector.type === connector.type ? draft.config : undefined}
            initialTest={draft?.connector.type === connector.type ? draft.test : undefined}
            disabled={!access.allowed}
            footerStart={footerStart}
            onContinue={handleContinue}
          />
        </div>
      ) : (
        <StepFooter start={footerStart}>
          <p className="text-xs text-muted-foreground sm:mr-2">Select a connector to enter its connection details.</p>
          <Button type="button" disabled>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </StepFooter>
      )}
    </>
  )
}
