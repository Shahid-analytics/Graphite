import type { MockRoute } from '../router'
import { nowIso } from '../util'

export const routes: MockRoute[] = [
  { method: 'GET', path: '/health', public: true, handler: () => ({ status: 'ok', version: '0.1.0-mock', time: nowIso() }) },
  {
    method: 'GET',
    path: '/ready',
    public: true,
    handler: () => ({ status: 'ready', checks: { database: 'ok', scheduler: 'ok', worker: 'ok' }, mock: true }),
  },
]
