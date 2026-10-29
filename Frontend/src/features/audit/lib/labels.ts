import { Bot, CalendarClock, KeyRound, User, type LucideIcon } from 'lucide-react'
import type { ActorRef } from '@/types'

export const ACTOR_TYPE: Record<ActorRef['type'], { label: string; icon: LucideIcon }> = {
  user: { label: 'User', icon: User },
  service: { label: 'Service', icon: Bot },
  scheduler: { label: 'Scheduler', icon: CalendarClock },
  api_key: { label: 'API key', icon: KeyRound },
}

export function actorMeta(type: string) {
  return ACTOR_TYPE[type as ActorRef['type']] ?? ACTOR_TYPE.service
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  source: 'Source',
  pipeline: 'Pipeline',
  run: 'Run',
  transformation: 'Transformation',
  model: 'Data model',
  schedule: 'Schedule',
  dashboard: 'Dashboard',
  report: 'Report',
  mapping: 'AI mapping',
  proposal: 'Schema proposal',
  member: 'Member',
  session: 'Session',
  integration: 'Integration',
  audit_log: 'Audit log',
  permission: 'Permission',
  workspace: 'Workspace',
  settings: 'Settings',
}

export function resourceTypeLabel(type: string) {
  if (RESOURCE_TYPE_LABELS[type]) return RESOURCE_TYPE_LABELS[type]
  const words = type.replace(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : type
}

/** Groups dotted actions by their domain prefix, e.g. "pipeline." -> ["pipeline.run_failed", ...]. */
export function groupActions(actions: string[]) {
  const groups = new Map<string, string[]>()
  for (const action of actions) {
    const prefix = action.includes('.') ? action.slice(0, action.indexOf('.') + 1) : action
    groups.set(prefix, [...(groups.get(prefix) ?? []), action])
  }
  return [...groups.entries()].map(([prefix, items]) => ({ prefix, items }))
}

const SECRET_FIELD = /(password|secret|token|api_?key|private_?key|credential)/i

/** True when a change value must never be shown: secret fields or values already redacted by the API. */
export function isRedacted(field: string, value: unknown) {
  if (typeof value === 'string' && /^\[secret[^\]]*\]$/.test(value)) return true
  return SECRET_FIELD.test(field) && value !== null && value !== undefined
}

/** Short description of a redacted value, e.g. "[secret rotated]" -> "rotated". */
export function redactionNote(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^\[secret\s*(.*)\]$/.exec(value)
  return match?.[1] || null
}

export function formatChangeValue(value: unknown) {
  if (value === undefined) return 'null'
  return JSON.stringify(value, null, 2)
}

export function isRunId(id: string | null | undefined): id is string {
  return Boolean(id?.startsWith('run_'))
}
