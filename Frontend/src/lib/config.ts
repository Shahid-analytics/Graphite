/**
 * Runtime configuration resolved from Vite environment variables.
 * Only non-secret, public settings belong here.
 */
export type ApiMode = 'mock' | 'live'

const env = import.meta.env

function readMode(): ApiMode {
  const raw = String(env.VITE_API_MODE ?? 'mock').toLowerCase()
  return raw === 'live' ? 'live' : 'mock'
}

export const config = {
  appName: String(env.VITE_APP_NAME || 'Graphite'),
  apiMode: readMode(),
  apiBaseUrl: String(env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/$/, ''),
  apiTimeoutMs: Number(env.VITE_API_TIMEOUT_MS || 20000),
  mockLatencyMs: Number(env.VITE_MOCK_LATENCY_MS ?? 350),
} as const

export const isMockMode = config.apiMode === 'mock'
