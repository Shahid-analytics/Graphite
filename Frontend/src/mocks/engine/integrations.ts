import type { MetabaseStatus } from '@/types'
import type { MockDb } from '../db'

/**
 * Metabase status in demo mode. The mock API can never reach a Metabase
 * instance, so a configured integration reports "unreachable" and embedding or
 * publishing is refused. Successful embedding is never simulated.
 * last_checked_at is the time of the last connection test (null if never tested).
 */
export function metabaseStatus(db: MockDb, workspaceId: string): MetabaseStatus {
  const config = db.settings[workspaceId]?.metabase
  const checkedAt = db.metabaseChecks[workspaceId]?.checked_at ?? null
  if (!config || !config.site_url) {
    return {
      status: 'not_configured',
      health: 'unknown',
      site_url: null,
      version: null,
      embedding_enabled: false,
      last_checked_at: checkedAt,
      message: 'Metabase is not configured for this workspace. Add the site URL and embedding secret in Settings.',
    }
  }
  return {
    status: 'unreachable',
    health: 'unhealthy',
    site_url: config.site_url,
    version: null,
    embedding_enabled: config.embedding_secret.is_set,
    last_checked_at: checkedAt,
    message: `Demo mode cannot reach Metabase at ${config.site_url}. Dashboards can be embedded once a live backend generates signed embed URLs.`,
  }
}
