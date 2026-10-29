import type { Permission, Role } from './auth'
import type { ID, ISODateTime } from './common'

export type Plan = 'starter' | 'growth' | 'scale'

export type OnboardingStepKey =
  | 'source'
  | 'destination'
  | 'ingestion'
  | 'transformation'
  | 'analytics'

export interface OnboardingState {
  steps: Record<OnboardingStepKey, boolean>
  completed_at: ISODateTime | null
  dismissed: boolean
}

export interface Workspace {
  id: ID
  name: string
  slug: string
  industry: string | null
  region: string
  timezone: string
  plan: Plan
  created_at: ISODateTime
  /** Role of the authenticated user in this workspace. */
  current_user_role: Role
  /** Effective permissions of the authenticated user in this workspace. */
  permissions: Permission[]
  onboarding: OnboardingState
}

export interface CreateWorkspaceRequest {
  name: string
  industry?: string | null
  region: string
  timezone: string
}

export interface UpdateWorkspaceRequest {
  name?: string
  industry?: string | null
  timezone?: string
}

export interface UpdateOnboardingRequest {
  step?: OnboardingStepKey
  completed?: boolean
  dismissed?: boolean
}
