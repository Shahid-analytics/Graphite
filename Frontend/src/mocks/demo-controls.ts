import type { Role } from '@/types'
import { demoSession, resetDb, saveSession } from './store'

/**
 * Demo-only controls used by the mock-mode banner. These are not part of the
 * backend API contract and are never called in live mode.
 */
export function setDemoRole(role: Role | null) {
  demoSession.roleOverride = role
  saveSession()
}

export function getDemoRole(): Role | null {
  return demoSession.roleOverride
}

export function resetDemoData() {
  resetDb()
}
