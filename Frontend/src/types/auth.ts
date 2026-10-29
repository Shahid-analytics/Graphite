import type { ID, ISODateTime } from './common'

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export type Permission =
  | 'workspace:manage'
  | 'members:manage'
  | 'sources:write'
  | 'sources:sync'
  | 'pipelines:write'
  | 'pipelines:run'
  | 'transformations:write'
  | 'transformations:run'
  | 'mappings:review'
  | 'mappings:approve'
  | 'models:propose'
  | 'models:approve'
  | 'schedules:write'
  | 'reports:write'
  | 'reports:publish'
  | 'audit:export'
  | 'settings:manage'

export interface User {
  id: ID
  email: string
  name: string
  avatar_url: string | null
}

export interface Membership {
  workspace_id: ID
  workspace_name: string
  role: Role
}

export interface Session {
  user: User
  memberships: Membership[]
  expires_at: ISODateTime
}

export interface LoginRequest {
  email: string
  password: string
}

/**
 * The backend should set an HttpOnly, Secure, SameSite session cookie. `access_token`
 * is optional for bearer deployments; the frontend keeps it in memory only.
 */
export interface LoginResponse {
  session: Session
  access_token?: string | null
}
