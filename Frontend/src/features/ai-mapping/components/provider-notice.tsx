import { FlaskConical, Settings2 } from 'lucide-react'
import { Link } from 'react-router'
import { Notice } from '@/components/feedback/notice'
import { HealthIndicator } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { isApiError } from '@/services/api-error'
import type { AiProviderConfig } from '@/types'
import { useAiProviderStatus } from '../queries'

export const PROVIDER_LABEL: Record<AiProviderConfig['provider'], string> = {
  none: 'Not configured',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  self_hosted: 'Self-hosted model',
}

export const DATA_SHARING_LABEL: Record<AiProviderConfig['data_sharing'], string> = {
  metadata_only: 'Metadata only',
  metadata_and_samples: 'Metadata and sample values',
}

/** True when a real provider is configured and enabled for this workspace. */
export function providerReady(config: AiProviderConfig | undefined) {
  return Boolean(config && config.enabled && config.provider !== 'none')
}

function ProviderStatus({ workspaceId }: { workspaceId: string }) {
  const query = useAiProviderStatus(workspaceId)
  if (query.isPending) return <Skeleton className="h-4 w-56" />
  if (query.isError) {
    const forbidden = isApiError(query.error) && query.error.status === 403
    return (
      <span className="text-xs text-muted-foreground">
        {forbidden ? 'AI provider status is visible to workspace admins.' : 'Could not load the AI provider status.'}{' '}
        {!forbidden ? (
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => query.refetch()}>
            Retry
          </button>
        ) : null}
      </span>
    )
  }
  const config = query.data
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        Workspace AI provider: <span className="font-medium text-foreground">{PROVIDER_LABEL[config.provider]}</span>
        {config.model ? <span className="font-mono"> ({config.model})</span> : null}
      </span>
      {config.provider !== 'none' ? <HealthIndicator status={config.enabled ? config.status : 'paused'} label={config.enabled ? undefined : 'Disabled'} className="text-xs" /> : null}
      <span>Data sharing: {DATA_SHARING_LABEL[config.data_sharing]}</span>
    </span>
  )
}

/** Mock-mode disclosure plus the current AI provider configuration. */
export function ProviderNotice({ workspaceId }: { workspaceId: string }) {
  const settingsLink = (
    <Button asChild variant="outline" size="sm">
      <Link to={wsPath(workspaceId, 'settings', 'ai')}>
        <Settings2 aria-hidden />
        AI provider settings
      </Link>
    </Button>
  )
  if (isMockMode) {
    return (
      <Notice tone="neutral" icon={FlaskConical} title="Suggestions are simulated by the mock service. No AI provider is called." action={settingsLink}>
        <div className="space-y-1.5">
          <p>A deterministic rule engine in the browser reads Bronze column metadata and proposes mappings. Every suggestion still needs human review.</p>
          <ProviderStatus workspaceId={workspaceId} />
        </div>
      </Notice>
    )
  }
  return (
    <Notice tone="info" title="Suggestions come from the workspace AI provider" action={settingsLink}>
      <div className="space-y-1.5">
        <p>Only the metadata allowed by the data sharing setting is sent. Every suggestion must be reviewed and approved before it is used.</p>
        <ProviderStatus workspaceId={workspaceId} />
      </div>
    </Notice>
  )
}
