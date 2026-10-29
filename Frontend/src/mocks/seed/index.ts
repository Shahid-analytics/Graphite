import type { MockDb } from '../db'
import { CONNECTORS, USERS, createMemberships, createNotificationPrefs, createSettings, createWorkspaces } from './core'
import { createDashboards, createFavorites, createReportRequests, createReports } from './analytics'
import { createAuditEvents, createMappingSets, createNotifications, createProposals } from './governance'
import { createPipelines, createRuns, createSchedules } from './operations'
import { createSourceFailures, createSourceTables, createSources } from './sources'
import { createWarehouse } from './warehouse'

/** Builds a fresh, internally consistent demo dataset relative to the current time. */
export function createDb(): MockDb {
  const warehouse = createWarehouse()
  const runs = createRuns()
  return {
    users: structuredClone(USERS),
    memberships: createMemberships(),
    workspaces: createWorkspaces(),
    connectors: structuredClone(CONNECTORS),
    sources: createSources(),
    sourceTables: createSourceTables(),
    sourceFailures: createSourceFailures(),
    runs,
    pipelines: createPipelines(),
    dbtProjects: warehouse.dbtProjects,
    transformations: warehouse.transformations,
    models: warehouse.models,
    columns: warehouse.columns,
    lineage: warehouse.lineage,
    qualityChecks: warehouse.qualityChecks,
    relationships: warehouse.relationships,
    schedules: createSchedules(),
    dashboards: createDashboards(),
    reports: createReports(),
    reportRequests: createReportRequests(),
    reportSuggestions: [],
    mappingSets: createMappingSets(),
    mappingReadyAt: {},
    proposals: createProposals(),
    auditEvents: createAuditEvents(runs),
    notifications: createNotifications(runs),
    settings: createSettings(),
    notificationPrefs: createNotificationPrefs(),
    favorites: createFavorites(),
    metabaseChecks: {},
  }
}
