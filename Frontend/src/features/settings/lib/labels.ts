import type { AiProviderName, Permission, Role } from '@/types'

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

export const PERMISSION_GROUPS: { label: string; permissions: { key: Permission; label: string; description: string }[] }[] = [
  {
    label: 'Workspace',
    permissions: [
      { key: 'workspace:manage', label: 'Manage workspace', description: 'Rename the workspace, change its industry and time zone.' },
      { key: 'members:manage', label: 'Manage members', description: 'Invite people, change roles and remove members.' },
      { key: 'settings:manage', label: 'Manage settings', description: 'Warehouse, dbt, Metabase, AI provider, scheduler and retention settings.' },
    ],
  },
  {
    label: 'Ingestion',
    permissions: [
      { key: 'sources:write', label: 'Edit sources', description: 'Create, edit and delete source connections and credentials.' },
      { key: 'sources:sync', label: 'Sync sources', description: 'Trigger and cancel ingestion runs.' },
      { key: 'pipelines:write', label: 'Edit pipelines', description: 'Create and change pipelines and their stages.' },
      { key: 'pipelines:run', label: 'Run pipelines', description: 'Trigger, retry and cancel pipeline runs.' },
    ],
  },
  {
    label: 'Modelling',
    permissions: [
      { key: 'transformations:write', label: 'Edit transformations', description: 'Change dbt models, tests and configuration.' },
      { key: 'transformations:run', label: 'Run transformations', description: 'Run dbt models and tests.' },
      { key: 'mappings:review', label: 'Review AI mappings', description: 'Accept, modify or reject suggested mappings.' },
      { key: 'mappings:approve', label: 'Approve AI mappings', description: 'Approve reviewed mapping sets for use.' },
      { key: 'models:propose', label: 'Propose schema changes', description: 'Draft schema proposals for review.' },
      { key: 'models:approve', label: 'Approve schema changes', description: 'Approve and apply schema proposals.' },
      { key: 'schedules:write', label: 'Edit schedules', description: 'Create, pause and change schedules.' },
    ],
  },
  {
    label: 'Analytics and governance',
    permissions: [
      { key: 'reports:write', label: 'Create reports', description: 'Draft reports and report requests.' },
      { key: 'reports:publish', label: 'Publish reports', description: 'Publish reviewed reports to Metabase.' },
      { key: 'audit:export', label: 'Export audit log', description: 'Download the audit trail as CSV.' },
    ],
  },
]

export const AI_PROVIDER_OPTIONS: { value: AiProviderName; label: string; modelPlaceholder: string }[] = [
  { value: 'none', label: 'None (AI features off)', modelPlaceholder: '' },
  { value: 'openai', label: 'OpenAI', modelPlaceholder: 'Model name, as listed by the provider' },
  { value: 'anthropic', label: 'Anthropic', modelPlaceholder: 'Model name, as listed by the provider' },
  { value: 'azure_openai', label: 'Azure OpenAI', modelPlaceholder: 'Deployment name' },
  { value: 'self_hosted', label: 'Self-hosted model', modelPlaceholder: 'Model identifier served by your endpoint' },
]

export const PERMISSION_REASON = {
  settings: 'Requires the settings:manage permission',
  workspace: 'Requires the workspace:manage permission (workspace owner)',
  members: 'Requires the members:manage permission',
} as const
