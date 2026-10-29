import type { Plan, Role } from '@/types'

export const INDUSTRIES = [
  'Wholesale distribution',
  'Retail',
  'Manufacturing',
  'E-commerce',
  'Logistics',
  'Professional services',
  'Healthcare',
  'Hospitality',
  'Education',
  'Other',
] as const

export const REGIONS = ['ap-south-1 (Mumbai)', 'ap-southeast-1 (Singapore)', 'eu-west-1 (Ireland)', 'us-east-1 (N. Virginia)'] as const

/** Seeded demo users (mock mode only). Roles match the Acme Distributors workspace. */
export const DEMO_ACCOUNTS: { name: string; email: string; role: Role }[] = [
  { name: 'Ananya Rao', email: 'ananya.rao@acme-distributors.example', role: 'owner' },
  { name: 'Rahul Mehta', email: 'rahul.mehta@acme-distributors.example', role: 'admin' },
  { name: 'Priya Nair', email: 'priya.nair@acme-distributors.example', role: 'editor' },
  { name: 'Karan Shah', email: 'karan.shah@acme-distributors.example', role: 'viewer' },
]

export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }

/**
 * Only same-origin, in-app paths are accepted as a post-sign-in destination, so a
 * crafted link cannot redirect a user off-site.
 */
export function safeRedirect(from: unknown): string {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/'
  if (from === '/login' || from.startsWith('/login?') || from.startsWith('/login/')) return '/'
  return from
}

export const PLAN_LABELS: Record<Plan, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' }
