import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from '@/mocks/handlers/analytics'
import { routes as settingsRoutes } from '@/mocks/handlers/settings'
import { compileRoutes, matchRoute, MockHttpError, type MockContext } from '@/mocks/router'
import { db, resetDb, sessionFor } from '@/mocks/store'
import type { Dashboard, IntegrationStatus, MetabaseStatus, Report, ReportSuggestion, SystemHealth } from '@/types'

const compiled = compileRoutes(routes)

function call<T>(method: 'GET' | 'POST', path: string, options: { body?: unknown; query?: Record<string, string>; user?: string } = {}): T {
  const { route, params } = matchRoute(compiled, { method, path })
  const ctx: MockContext = { params, query: options.query ?? {}, body: options.body, session: sessionFor(options.user ?? 'usr_ananya') }
  return route.handler(ctx) as T
}

function callError(method: 'GET' | 'POST', path: string, options: Parameters<typeof call>[2] = {}) {
  try {
    call(method, path, options)
  } catch (error) {
    if (error instanceof MockHttpError) return error
    throw error
  }
  throw new Error('Expected the call to fail')
}

const suggest = (prompt: string, extra: Record<string, unknown> = {}) =>
  call<ReportSuggestion>('POST', '/ai/report-suggestions', { body: { workspace_id: 'ws_acme', prompt, ...extra } })

beforeEach(() => resetDb())

describe('analytics mock API', () => {
  it('routes prompts to recommendations built from real Gold models', () => {
    const modelIds = new Set(db.models.filter((m) => m.layer === 'gold').map((m) => m.id))
    const cases: [string, string][] = [
      ['Monthly revenue by customer segment for this fiscal year', 'agg_monthly_revenue'],
      ['Which distributors are slow to pay?', 'agg_receivables_aging'],
      ['Stock value by warehouse with slow movers', 'fct_inventory_snapshot'],
      ['Open opportunities and win rate by rep', 'fct_sales_pipeline'],
      ['GST collected per month for returns', 'fct_invoice_lines'],
    ]
    for (const [prompt, model] of cases) {
      const result = suggest(prompt)
      expect(result.provider.simulated).toBe(true)
      expect(result.recommendations.length, prompt).toBeGreaterThanOrEqual(2)
      expect(result.recommendations.length, prompt).toBeLessThanOrEqual(4)
      expect(result.recommendations[0].dataset.model_name, prompt).toBe(model)
      result.recommendations.forEach((r) => expect(modelIds).toContain(r.dataset.model_id))
    }
    expect(db.reportSuggestions).toHaveLength(cases.length)
  })

  it('adds a fiscal year filter and flags failing quality checks', () => {
    const result = suggest('Top customers by revenue this fiscal year')
    const invoices = result.recommendations.find((r) => r.dataset.model_name === 'fct_invoices')
    expect(invoices?.filters.some((f) => f.field === 'dim_date.fiscal_year')).toBe(true)
    expect(invoices?.rationale).toMatch(/quality check/)
  })

  it('returns low-confidence generic recommendations for ambiguous prompts', () => {
    const result = suggest('Something useful for the Monday meeting')
    expect(result.recommendations.length).toBeGreaterThanOrEqual(1)
    expect(result.recommendations.length).toBeLessThanOrEqual(2)
    result.recommendations.forEach((r) => {
      expect(r.confidence).toBeLessThan(0.6)
      expect(r.rationale).toMatch(/ambiguous/)
    })
  })

  it('validates the prompt and refuses workspaces without Gold models', () => {
    expect(callError('POST', '/ai/report-suggestions', { body: { workspace_id: 'ws_acme', prompt: 'short' } }).status).toBe(422)
    const error = callError('POST', '/ai/report-suggestions', { body: { workspace_id: 'ws_northwind', prompt: 'Monthly revenue by segment' } })
    expect(error.code).toBe('no_gold_models')
  })

  it('creates an AI-suggested draft with provenance and refuses to publish it', () => {
    const suggestion = suggest('Which distributors are slow to pay?')
    const rec = suggestion.recommendations[0]
    const report = call<Report>('POST', '/workspaces/ws_acme/reports', {
      user: 'usr_priya',
      body: {
        name: rec.title,
        description: rec.description,
        business_area: 'finance',
        visualization: rec.visualization,
        dataset_model_id: rec.dataset.model_id,
        dimensions: rec.dimensions,
        measures: rec.measures,
        filters: rec.filters,
        suggestion_id: suggestion.id,
        recommendation_id: rec.id,
      },
    })
    expect(report.status).toBe('draft')
    expect(report.origin).toBe('ai_suggestion')
    expect(report.suggestion?.suggestion_id).toBe(suggestion.id)
    expect(db.auditEvents[0].action).toBe('report.created')

    // Editors cannot publish; admins get an honest integration error.
    expect(callError('POST', `/reports/${report.id}/publish`, { user: 'usr_priya' }).status).toBe(403)
    const publish = callError('POST', `/reports/${report.id}/publish`, { user: 'usr_rahul' })
    expect(publish.status).toBe(409)
    expect(publish.code).toBe('integration_unavailable')
    expect(callError('POST', '/reports/rpt_overdue/publish', { user: 'usr_rahul' }).code).toBe('already_published')
  })

  it('maps invalid report definitions to field errors', () => {
    const error = callError('POST', '/workspaces/ws_acme/reports', {
      body: { name: 'x', business_area: 'finance', visualization: 'bar', dataset_model_id: 'mdl_g_fct_invoices', dimensions: ['no_such_column'], measures: [], filters: [{ field: 'status', operator: 'eq', value: '' }] },
    })
    const fields = error.fieldErrors?.map((f) => f.field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'dimensions.0', 'measures', 'filters.0.value']))
  })

  it('never returns an embed URL and reports Metabase status honestly', () => {
    expect(callError('POST', '/dashboards/dsh_exec_revenue/embed-session').code).toBe('integration_unavailable')
    const acme = call<MetabaseStatus>('GET', '/integrations/metabase/status', { query: { workspace_id: 'ws_acme' } })
    expect(acme.status).toBe('unreachable')
    const northwind = call<MetabaseStatus>('POST', '/integrations/metabase/test-connection', { body: { workspace_id: 'ws_northwind' } })
    expect(northwind.status).toBe('not_configured')
    expect(northwind.last_checked_at).toBeTruthy()
  })

  it('reports the stored time of the last Metabase connection test everywhere', () => {
    const status = () => call<MetabaseStatus>('GET', '/integrations/metabase/status', { query: { workspace_id: 'ws_acme' } })
    expect(status().last_checked_at).toBeNull()

    const tested = call<MetabaseStatus>('POST', '/integrations/metabase/test-connection', { body: { workspace_id: 'ws_acme' } })
    expect(tested.last_checked_at).toBeTruthy()
    expect(db.metabaseChecks.ws_acme).toEqual({ checked_at: tested.last_checked_at, status: 'unreachable' })
    expect(status().last_checked_at).toBe(tested.last_checked_at)
    // Checks are per workspace.
    expect(call<MetabaseStatus>('GET', '/integrations/metabase/status', { query: { workspace_id: 'ws_northwind' } }).last_checked_at).toBeNull()

    const settings = compileRoutes(settingsRoutes)
    const settingsCall = <T>(method: 'GET' | 'PUT', path: string, body?: unknown) => {
      const { route, params } = matchRoute(settings, { method, path })
      return route.handler({ params, query: {}, body, session: sessionFor('usr_ananya') }) as T
    }
    const integration = settingsCall<IntegrationStatus[]>('GET', '/workspaces/ws_acme/integrations').find((i) => i.key === 'metabase')
    expect(integration?.last_checked_at).toBe(tested.last_checked_at)
    const component = settingsCall<SystemHealth>('GET', '/workspaces/ws_acme/system-health').components.find((c) => c.component === 'Metabase')
    expect(component?.checked_at).toBe(tested.last_checked_at)

    // A different site has not been checked yet.
    settingsCall('PUT', '/workspaces/ws_acme/integrations/metabase', { site_url: 'https://bi.acme-distributors.example' })
    expect(status().last_checked_at).toBeNull()
  })

  it('keeps favorites per user', () => {
    const favoriteIds = (user: string) => call<Dashboard[]>('GET', '/workspaces/ws_acme/dashboards', { user, query: { favorite: 'true' } }).map((d) => d.id).sort()
    expect(favoriteIds('usr_ananya')).toEqual(['dsh_exec_revenue', 'dsh_sales_pipeline'])
    expect(favoriteIds('usr_rahul')).toEqual(['dsh_receivables'])

    const starred = call<Dashboard>('POST', '/dashboards/dsh_inventory/favorite', { user: 'usr_rahul', body: { is_favorite: true } })
    expect(starred.is_favorite).toBe(true)
    expect(favoriteIds('usr_rahul')).toEqual(['dsh_inventory', 'dsh_receivables'])
    // Another member's view and the shared record are unchanged.
    expect(favoriteIds('usr_ananya')).toEqual(['dsh_exec_revenue', 'dsh_sales_pipeline'])
    expect(call<Dashboard>('GET', '/dashboards/dsh_inventory').is_favorite).toBe(false)
    expect(db.dashboards.find((d) => d.id === 'dsh_inventory')).not.toHaveProperty('is_favorite')

    const report = call<Report>('POST', '/reports/rpt_overdue/favorite', { body: { is_favorite: false } })
    expect(report.is_favorite).toBe(false)
    expect(call<Report>('GET', '/reports/rpt_overdue', { user: 'usr_rahul' }).is_favorite).toBe(true)
    expect(db.auditEvents[0].action).toBe('report.unfavorited')
    // Repeating the same state is a no-op and is not audited again.
    const events = db.auditEvents.length
    call('POST', '/reports/rpt_overdue/favorite', { body: { is_favorite: false } })
    expect(db.auditEvents).toHaveLength(events)
  })

  it('filters dashboards and tracks views', () => {
    const finance = call<{ id: string }[]>('GET', '/workspaces/ws_acme/dashboards', { query: { business_area: 'finance' } })
    expect(finance.map((d) => d.id).sort()).toEqual(['dsh_exec_revenue', 'dsh_receivables'])
    const favorites = call<{ id: string }[]>('GET', '/workspaces/ws_acme/dashboards', { query: { favorite: 'true' } })
    expect(favorites).toHaveLength(2)
    const before = db.dashboards.find((d) => d.id === 'dsh_inventory')!.view_count_30d
    call('GET', '/dashboards/dsh_inventory')
    expect(db.dashboards.find((d) => d.id === 'dsh_inventory')!.view_count_30d).toBe(before + 1)
    expect(callError('GET', '/workspaces/ws_acme/dashboards', { query: { business_area: 'hr' } }).status).toBe(422)
  })

  it('validates custom report requests', () => {
    const error = callError('POST', '/workspaces/ws_acme/report-requests', { body: { title: 'Dead stock', description: 'too short', business_area: 'inventory', priority: 'urgent' } })
    expect(error.fieldErrors?.map((f) => f.field)).toEqual(['description', 'priority'])
    const created = call<{ status: string }>('POST', '/workspaces/ws_acme/report-requests', {
      user: 'usr_karan',
      body: { title: 'Dead stock by warehouse', description: 'Items with no outward movement in 180 days, per warehouse, with value.', business_area: 'inventory', priority: 'normal' },
    })
    expect(created.status).toBe('submitted')
  })
})
