import type { ActorRef, ID, ISODateTime } from './common'

export type AuditStatus = 'success' | 'failure' | 'denied'

export interface AuditChange {
  field: string
  before: unknown
  after: unknown
}

export interface AuditEvent {
  id: ID
  workspace_id: ID
  workspace_name: string
  occurred_at: ISODateTime
  actor: ActorRef
  /** Dotted verb, e.g. "source.created", "pipeline.run_triggered". */
  action: string
  resource: { type: string; id: ID; name: string }
  status: AuditStatus
  execution_id: ID | null
  ip_address: string | null
  changes: AuditChange[]
  metadata: Record<string, unknown>
}

export interface AuditQuery {
  q?: string
  actor_id?: ID
  resource_type?: string
  action?: string
  status?: AuditStatus
  from?: ISODateTime
  to?: ISODateTime
  page?: number
  page_size?: number
}

export type AuditExportFormat = 'jsonl' | 'txt'

export interface AuditFacets {
  actors: { id: ID; name: string; type: string }[]
  resource_types: string[]
  actions: string[]
}
