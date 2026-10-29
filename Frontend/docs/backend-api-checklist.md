# Graphite backend API checklist

Implementation checklist for the 122 endpoints in [backend-api-contract.md](backend-api-contract.md). Tick the status box (`[x]`) when an endpoint is implemented against the contract and verified with the frontend in live mode (`VITE_API_MODE=live`). Priorities: **P0** is needed for the core flow (sign in, connect a source, sync, run pipelines, see runs and the overview), **P1** for the full product, and **P2** for secondary features and for endpoints with no frontend caller yet. The "Ref" column is the endpoint's ordinal within its contract section (Ref 1.4 is the fourth endpoint of section 1), not a subsection heading number. Appendix A of the contract maps each Ref to the subsection heading that holds it.

## Summary

| Section | Domain | Endpoints | P0 | P1 | P2 |
|---|---|---|---|---|---|
| 1 | Authentication, workspaces, health, search, overview, notifications and audit | 19 | 8 | 10 | 1 |
| 2 | Data sources and runs | 19 | 12 | 6 | 1 |
| 3 | Pipelines and schedules | 15 | 6 | 6 | 3 |
| 4 | Transformations (dbt) and AI business mapping | 12 | 5 | 7 | 0 |
| 5 | Data models, data preview and schema proposals | 19 | 11 | 6 | 2 |
| 6 | Analytics, Metabase and AI report recommendations | 14 | 8 | 4 | 2 |
| 7 | Workspace settings, members, connections and integrations | 24 | 3 | 12 | 9 |
| | **Total** | **122** | **53** | **51** | **18** |

## 1. Authentication, workspaces, health, search, overview, notifications and audit

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 1 | 1.1 | GET | `/api/v1/health` | public | no | None (healthService.health has no caller); deployment liveness probe | P1 |
| [ ] | 2 | 1.2 | GET | `/api/v1/ready` | public | no | None (healthService.ready has no caller); deployment readiness probe | P1 |
| [ ] | 3 | 1.3 | POST | `/api/v1/auth/login` | public | no | Sign-in page (/login) via AuthProvider.login | P0 |
| [ ] | 4 | 1.4 | POST | `/api/v1/auth/logout` | public (idempotent) | no | User menu in the app shell header; account layout on /workspaces pages (Sign out) | P0 |
| [ ] | 5 | 1.5 | GET | `/api/v1/auth/me` | authenticated | no | AuthProvider on app load; RequireAuth and RootRedirect guards; refetched after workspace creation | P0 |
| [ ] | 6 | 1.6 | GET | `/api/v1/workspaces` | authenticated | no | Workspace picker (/workspaces); workspace switcher in the app shell header | P0 |
| [ ] | 7 | 1.7 | POST | `/api/v1/workspaces` | authenticated | no | Create workspace page (/workspaces/new) | P1 |
| [ ] | 8 | 1.8 | GET | `/api/v1/workspaces/{workspace_id}` | any workspace member | no | WorkspaceGate for every /w/:workspaceId route (supplies role and permissions to all pages) | P0 |
| [ ] | 9 | 1.9 | PATCH | `/api/v1/workspaces/{workspace_id}` | `workspace:manage` | no | Settings > Workspace (/w/:ws/settings/workspace) | P1 |
| [ ] | 10 | 1.10 | GET | `/api/v1/workspaces/{workspace_id}/onboarding` | any workspace member | no | None (workspaceService.getOnboarding has no caller; data comes from Workspace.onboarding) | P2 |
| [ ] | 11 | 1.11 | PATCH | `/api/v1/workspaces/{workspace_id}/onboarding` | by body part: `sources:write` (steps source, ingestion), `settings:manage` (other steps, dismissed); both when both parts are sent | no | Onboarding wizard (/w/:ws/onboarding) marks steps; Overview onboarding checklist dismiss (/w/:ws) | P0 |
| [ ] | 12 | 1.12 | GET | `/api/v1/workspaces/{workspace_id}/search` | any workspace member | no | Command palette in the app shell (global search) | P1 |
| [ ] | 13 | 1.13 | GET | `/api/v1/workspaces/{workspace_id}/overview` | any workspace member | no (read-only; polled every 3 s while runs are active) | Overview page (/w/:ws) | P0 |
| [ ] | 14 | 1.14 | GET | `/api/v1/notifications` | any member of workspace_id | no | Notifications page (/w/:ws/notifications: list and tab counts); header bell popover; sidebar unread badge | P0 |
| [ ] | 15 | 1.15 | PATCH | `/api/v1/notifications/{notification_id}` | any member of the notification's workspace | no | Notifications page (mark read or unread); header bell popover (marks an unread item read when it is opened) | P1 |
| [ ] | 16 | 1.16 | POST | `/api/v1/notifications/mark-all-read` | any member of workspace_id | no | Notifications page (Mark all as read, optionally by type); header bell popover | P1 |
| [ ] | 17 | 1.17 | GET | `/api/v1/workspaces/{workspace_id}/audit-events` | any workspace member | no (read-only; polled every 30 s) | Audit trail page (/w/:ws/audit) | P1 |
| [ ] | 18 | 1.18 | GET | `/api/v1/workspaces/{workspace_id}/audit-events/facets` | any workspace member | no | Audit trail page filter bar (actor, resource type, action selects) | P1 |
| [ ] | 19 | 1.19 | GET | `/api/v1/workspaces/{workspace_id}/audit-events/export` | `audit:export` | no (synchronous file download) | Audit trail page export menu (JSONL, text) | P1 |

## 2. Data sources and runs

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 20 | 2.1 | GET | `/api/v1/connectors` | authenticated | no | Sources page (connector catalog), New source wizard, Source detail page, Onboarding source step | P0 |
| [ ] | 21 | 2.2 | GET | `/api/v1/workspaces/{workspace_id}/sources` | any workspace member | no | Sources page (connections table and filters; refetched when a tracked sync finishes), New source wizard (name and schema checks), Pipelines list, Pipeline detail, New pipeline, Edit pipeline dialog, Schedule target picker, AI mapping new page, Settings > Connections | P0 |
| [ ] | 22 | 2.3 | POST | `/api/v1/workspaces/{workspace_id}/sources` | `sources:write` | optional (`run_initial_sync`; returns `initial_run_id`) | New source wizard (review step), Onboarding ingestion step | P0 |
| [ ] | 23 | 2.4 | GET | `/api/v1/sources/{source_id}` | any workspace member | no | Source detail page (all tabs; refetched when a sync finishes), Data model detail (linked source) | P0 |
| [ ] | 24 | 2.5 | PATCH | `/api/v1/sources/{source_id}` | `sources:write` | no | Source detail Settings tab (credentials, schedule), Tables tab (edit selection), Source actions (pause/resume) | P0 |
| [ ] | 25 | 2.6 | DELETE | `/api/v1/sources/{source_id}` | `sources:write` | no | Source actions (delete dialog on Sources page and Source detail) | P1 |
| [ ] | 26 | 2.7 | POST | `/api/v1/workspaces/{workspace_id}/sources/test-connection` | `sources:write` | no | New source wizard (connection step), Onboarding connector config form | P0 |
| [ ] | 27 | 2.8 | POST | `/api/v1/workspaces/{workspace_id}/sources/discover` | `sources:write` | no | New source wizard (table selection step), Onboarding ingestion step | P0 |
| [ ] | 28 | 2.9 | POST | `/api/v1/sources/{source_id}/test-connection` | `sources:sync` (no config) / `sources:write` (with config) | no | Source actions (Test connection), Source detail Settings tab (test before save), Errors tab guidance | P1 |
| [ ] | 29 | 2.10 | GET | `/api/v1/sources/{source_id}/schemas` | any workspace member | no | None (service method `sourcesService.schemas` is not called) | P2 |
| [ ] | 30 | 2.11 | GET | `/api/v1/sources/{source_id}/tables` | any workspace member | no | Source detail Tables tab, AI mapping table picker | P1 |
| [ ] | 31 | 2.12 | GET | `/api/v1/sources/{source_id}/tables/{table}/preview` | any workspace member | no | Source detail Preview tab | P1 |
| [ ] | 32 | 2.13 | POST | `/api/v1/sources/{source_id}/sync` | `sources:sync` | yes (202, ingestion Run) | Source actions (Sync now, full or incremental) on Sources page and Source detail, Preview tab empty state | P0 |
| [ ] | 33 | 2.14 | GET | `/api/v1/sources/{source_id}/runs` | any workspace member | no | Source detail page (latest run header), Overview tab, Runs tab, Errors tab | P0 |
| [ ] | 34 | 2.15 | GET | `/api/v1/workspaces/{workspace_id}/runs` | any workspace member | no | Pipelines page (Recent executions), Transformations Run history tab (`kind=transformation,dbt_test`) | P1 |
| [ ] | 35 | 2.16 | GET | `/api/v1/runs/{run_id}` | any workspace member | no (polled for every run) | Run detail page, Source sync progress panel, Pipeline detail, Onboarding initial run progress, Transformations active run panel, Schedule run progress, Schema proposal detail | P0 |
| [ ] | 36 | 2.17 | GET | `/api/v1/runs/{run_id}/logs` | any workspace member | no | Run detail page (log viewer) | P0 |
| [ ] | 37 | 2.18 | POST | `/api/v1/runs/{run_id}/retry` | by run kind: `sources:sync` / `pipelines:run` / `transformations:run` | yes (202, new Run) | Run detail page (run actions), Overview failed runs card, Source detail Runs and Errors tabs | P0 |
| [ ] | 38 | 2.19 | POST | `/api/v1/runs/{run_id}/cancel` | by run kind: `sources:sync` / `pipelines:run` / `transformations:run` | yes (202, Run; cancellation completes asynchronously) | Run detail page (run actions), Source sync progress panel, Source detail Runs tab | P1 |

## 3. Pipelines and schedules

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 39 | 3.1 | GET | `/api/v1/workspaces/{workspace_id}/pipelines` | any workspace member | no | Pipelines list (`/w/:ws/pipelines`); schedule form target picker (`/w/:ws/schedules/new`, `/w/:ws/schedules/:scheduleId/edit`) | P0 |
| [ ] | 40 | 3.2 | POST | `/api/v1/workspaces/{workspace_id}/pipelines` | `pipelines:write` | no | New pipeline (`/w/:ws/pipelines/new`) | P0 |
| [ ] | 41 | 3.3 | GET | `/api/v1/pipelines/{pipeline_id}` | any workspace member | no | Pipeline detail (`/w/:ws/pipelines/:pipelineId`) | P0 |
| [ ] | 42 | 3.4 | PATCH | `/api/v1/pipelines/{pipeline_id}` | `pipelines:write` | no | Pipeline detail (Edit dialog, Pause / Resume / Activate); Pipelines list row actions (Pause / Resume / Activate) | P1 |
| [ ] | 43 | 3.5 | DELETE | `/api/v1/pipelines/{pipeline_id}` | `pipelines:write` | no | Pipeline detail (Delete with typed confirmation) | P2 |
| [ ] | 44 | 3.6 | POST | `/api/v1/pipelines/{pipeline_id}/runs` | `pipelines:run` | yes (202, Run kind `pipeline`) | Pipelines list row action Run now; Pipeline detail Run now and Run with options (full refresh, stage subset) | P0 |
| [ ] | 45 | 3.7 | GET | `/api/v1/pipelines/{pipeline_id}/runs` | any workspace member | no | Pipeline detail execution history (paged, status filter) | P1 |
| [ ] | 46 | 3.8 | GET | `/api/v1/workspaces/{workspace_id}/schedules` | any workspace member | no | Schedules list (`/w/:ws/schedules`, table and Next 24 hours strip) | P0 |
| [ ] | 47 | 3.9 | POST | `/api/v1/workspaces/{workspace_id}/schedules/validate` | any workspace member | no | Schedule form on new and edit pages (description, next 5 runs, conflict notices; debounced 500 ms, cached 30 s) | P1 |
| [ ] | 48 | 3.10 | POST | `/api/v1/workspaces/{workspace_id}/schedules` | `schedules:write` | no | New schedule (`/w/:ws/schedules/new`) | P0 |
| [ ] | 49 | 3.11 | GET | `/api/v1/schedules/{schedule_id}` | any workspace member | no | Schedule detail (`/w/:ws/schedules/:scheduleId`); Schedule edit (`/w/:ws/schedules/:scheduleId/edit`); Pipeline detail (linked schedule panel) | P1 |
| [ ] | 50 | 3.12 | PATCH | `/api/v1/schedules/{schedule_id}` | `schedules:write` | no | Schedule edit (`/w/:ws/schedules/:scheduleId/edit`); enable switch on Schedules list and Schedule detail | P1 |
| [ ] | 51 | 3.13 | DELETE | `/api/v1/schedules/{schedule_id}` | `schedules:write` | no | Schedule detail and Schedules list row actions (Delete dialog) | P2 |
| [ ] | 52 | 3.14 | GET | `/api/v1/schedules/{schedule_id}/runs` | any workspace member | no | Schedule detail execution history (paged, status filter) | P2 |
| [ ] | 53 | 3.15 | POST | `/api/v1/schedules/{schedule_id}/run` | `pipelines:run` / `sources:sync` / `transformations:run` (by target type) | yes (202, Run kind `pipeline`, `ingestion` or `transformation`) | Schedule detail Run now (inline progress); Schedules list row actions Run now | P1 |

## 4. Transformations (dbt) and AI business mapping

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 54 | 4.1 | GET | `/api/v1/workspaces/{workspace_id}/dbt-project` | any workspace member | no | Transformations page project strip and "No dbt project connected" empty state on 404 (`/w/:ws/transformations`); Transformation detail page workspace guard ("Model not in this workspace") and Details tab project name (`/w/:ws/transformations/:transformationId`) | P0 |
| [ ] | 55 | 4.2 | GET | `/api/v1/workspaces/{workspace_id}/transformations` | any workspace member | no | Transformations page Models tab with q/type/status/tag filters (`/w/:ws/transformations`); Transformation detail page (dependency names, Details tab); schedule form target picker for `transformation` targets (`/w/:ws/schedules/new`, schedule edit) | P0 |
| [ ] | 56 | 4.3 | GET | `/api/v1/transformations/{transformation_id}` | any workspace member | no | Transformation detail page (header, SQL tab, Details tab; polled while a run is active); Data model detail Details tab "built by" link (`/w/:ws/models/:modelId`) | P0 |
| [ ] | 57 | 4.4 | PATCH | `/api/v1/transformations/{transformation_id}` | `transformations:write` | no | Transformation detail SQL tab (save with commit message); Edit description dialog | P1 |
| [ ] | 58 | 4.5 | GET | `/api/v1/transformations/{transformation_id}/runs` | any workspace member | no | Transformation detail page (active-run detection for Run model / Run tests buttons and live run follow-up, `page_size=10`; polled while a run is active); Runs tab with kind toggle and paging | P0 |
| [ ] | 59 | 4.6 | GET | `/api/v1/transformations/{transformation_id}/tests` | any workspace member | no | Transformation detail Tests tab | P1 |
| [ ] | 60 | 4.7 | POST | `/api/v1/transformations/{transformation_id}/run` | `transformations:run` | yes (202, Run kind `transformation`) | Transformation detail "Run model" dialog (include upstream / downstream, full refresh) | P0 |
| [ ] | 61 | 4.8 | POST | `/api/v1/transformations/{transformation_id}/test` | `transformations:run` | yes (202, Run kind `dbt_test`) | Transformation detail "Run tests" button | P1 |
| [ ] | 62 | 4.9 | GET | `/api/v1/workspaces/{workspace_id}/mapping-suggestions` | any workspace member | no (polled while a set is `generating`) | AI mapping list (`/w/:ws/transformations/mapping`) | P1 |
| [ ] | 63 | 4.10 | POST | `/api/v1/ai/mapping-suggestions` | `mappings:review` | no Run; async generation (202, status `generating`) | New AI mapping request (`/w/:ws/transformations/mapping/new`, also prefilled from "Request new suggestions" on a rejected set and "Try again" on a failed set) | P1 |
| [ ] | 64 | 4.11 | GET | `/api/v1/ai/mapping-suggestions/{suggestion_id}` | any workspace member | no (polled while `generating`) | AI mapping review page (`/w/:ws/transformations/mapping/:setId`); New schema proposal from an approved set (`/w/:ws/models/proposals/new?mapping=:setId`) | P1 |
| [ ] | 65 | 4.12 | POST | `/api/v1/ai/mapping-suggestions/{suggestion_id}/review` | `mappings:review`; `mappings:approve` for approve/reject and for changing decisions once `in_review` | no | AI mapping review page (Save draft, Submit for review, bulk accept, edit dialog, reviewer panel Approve / Reject) | P1 |

## 5. Data models, data preview and schema proposals

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 66 | 5.1 | GET | `/api/v1/workspaces/{workspace_id}/models` | any workspace member | no | Data models catalog (`/w/:ws/models`: tree, summary tiles, filtered table); Data preview table picker (`/w/:ws/preview`); Schema proposal builder target pickers (`/w/:ws/models/proposals/new`, proposal edit); Transformation detail Details tab (readable model names for `depends_on` links, `/w/:ws/transformations/:transformationId`) | P0 |
| [ ] | 67 | 5.2 | GET | `/api/v1/models/{model_id}` | any workspace member | no | Model detail (`/w/:ws/models/:modelId`) | P0 |
| [ ] | 68 | 5.3 | GET | `/api/v1/models/{model_id}/columns` | any workspace member | no | Model detail Columns tab; Schema proposal builder column pickers; AI report assistant Save draft dialog (`/w/:ws/analytics/assistant`) | P0 |
| [ ] | 69 | 5.4 | POST | `/api/v1/models/{model_id}/schema-changes/{change_id}/acknowledge` | `models:approve` | no | Model detail schema change notice (Acknowledge button) | P1 |
| [ ] | 70 | 5.5 | GET | `/api/v1/models/{model_id}/preview` | any workspace member | no | Data preview (`/w/:ws/preview?model=:modelId`, paged, sortable, filterable grid); Model detail Preview tab (first 25 rows); Transformation detail Preview tab | P0 |
| [ ] | 71 | 5.6 | GET | `/api/v1/models/{model_id}/lineage` | any workspace member | no | Model detail Lineage tab (depth 1 to 4); Transformation detail model lineage tab | P1 |
| [ ] | 72 | 5.7 | GET | `/api/v1/workspaces/{workspace_id}/lineage` | any workspace member | no | Transformations page workspace lineage tab (`/w/:ws/transformations`) | P1 |
| [ ] | 73 | 5.8 | GET | `/api/v1/models/{model_id}/relationships` | any workspace member | no | Model detail Relationships tab (References / Referenced by) | P1 |
| [ ] | 74 | 5.9 | GET | `/api/v1/workspaces/{workspace_id}/relationships` | any workspace member | no | None (service method exists, no screen calls it) | P2 |
| [ ] | 75 | 5.10 | GET | `/api/v1/models/{model_id}/quality-checks` | any workspace member | no | Model detail Quality tab | P0 |
| [ ] | 76 | 5.11 | GET | `/api/v1/workspaces/{workspace_id}/quality-summary` | any workspace member | no | Data models catalog summary tiles (pass rate, failing checks, stale models) | P0 |
| [ ] | 77 | 5.12 | GET | `/api/v1/workspaces/{workspace_id}/schema-proposals` | any workspace member | no | Schema proposals list (`/w/:ws/models/proposals`, client-side status filter, polls every 2 s while any proposal is applying); AI mapping set page proposals created from the set (`/w/:ws/transformations/mapping/:setId`) | P0 |
| [ ] | 78 | 5.13 | POST | `/api/v1/workspaces/{workspace_id}/schema-proposals/validate` | any workspace member | no | Schema proposal builder on the new and edit pages (Validate and preview DDL); AI mapping set page create-proposal panel (automatic dry run, cached 30 s) | P1 |
| [ ] | 79 | 5.14 | POST | `/api/v1/workspaces/{workspace_id}/schema-proposals` | `models:propose` | no | New schema proposal (`/w/:ws/models/proposals/new`, Save as draft / Submit for review; with `?mapping=:setId` it is prefilled from an approved AI mapping set and sends `mapping_suggestion_id`); AI mapping set page create-proposal panel (`/w/:ws/transformations/mapping/:setId`) | P0 |
| [ ] | 80 | 5.15 | GET | `/api/v1/schema-proposals/{proposal_id}` | any workspace member | no | Schema proposal detail (`/w/:ws/models/proposals/:proposalId`, polls while applying) | P0 |
| [ ] | 81 | 5.16 | PATCH | `/api/v1/schema-proposals/{proposal_id}` | `models:propose` | no | Schema proposal detail (Submit for review); proposal edit mode (`?edit=1`, builder Save draft / Save and submit for review) | P1 |
| [ ] | 82 | 5.17 | DELETE | `/api/v1/schema-proposals/{proposal_id}` | `models:propose` | no | Schema proposal detail (Delete confirmation) | P2 |
| [ ] | 83 | 5.18 | POST | `/api/v1/schema-proposals/{proposal_id}/review` | `models:approve` | no | Schema proposal detail review dialog (Approve / Reject / Request changes) | P0 |
| [ ] | 84 | 5.19 | POST | `/api/v1/schema-proposals/{proposal_id}/apply` | `models:approve` | yes (202, Run kind `schema_apply`) | Schema proposal detail (Apply confirmation, live run progress from `GET /runs/{run_id}`, link to `/w/:ws/runs/:runId`) | P0 |

## 6. Analytics, Metabase and AI report recommendations

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 85 | 6.1 | GET | `/api/v1/workspaces/{workspace_id}/dashboards` | any workspace member | no | Analytics catalog (`/w/:ws/analytics`): Dashboards tab and Favorites and recent tab, with search, business-area filter and favorites toggle | P0 |
| [ ] | 86 | 6.2 | GET | `/api/v1/dashboards/{dashboard_id}` | any workspace member | no | Dashboard detail (`/w/:ws/analytics/dashboards/:dashboardId`) | P0 |
| [ ] | 87 | 6.3 | POST | `/api/v1/dashboards/{dashboard_id}/favorite` | any workspace member | no | Analytics catalog (star on dashboard cards and recent list); Dashboard detail (Favorite button) | P1 |
| [ ] | 88 | 6.4 | POST | `/api/v1/dashboards/{dashboard_id}/embed-session` | any workspace member | no | Dashboard detail embedded Metabase panel (`MetabaseEmbed`, requested only while status is `connected`, refreshed before `expires_at`) | P0 |
| [ ] | 89 | 6.5 | GET | `/api/v1/workspaces/{workspace_id}/reports` | any workspace member | no | Analytics catalog (`/w/:ws/analytics`): Reports tab and Favorites and recent tab | P0 |
| [ ] | 90 | 6.6 | POST | `/api/v1/workspaces/{workspace_id}/reports` | `reports:write` | no | AI report assistant (`/w/:ws/analytics/assistant`): "Review and save as draft" dialog | P0 |
| [ ] | 91 | 6.7 | GET | `/api/v1/reports/{report_id}` | any workspace member | no | Report detail (`/w/:ws/analytics/reports/:reportId`) | P0 |
| [ ] | 92 | 6.8 | POST | `/api/v1/reports/{report_id}/favorite` | any workspace member | no | Analytics catalog (star on report rows and recent list); Report detail (Favorite button) | P1 |
| [ ] | 93 | 6.9 | POST | `/api/v1/reports/{report_id}/publish` | `reports:publish` | no | Report detail (Publish to Metabase; 409 `integration_unavailable` and `already_published` notices) | P1 |
| [ ] | 94 | 6.10 | POST | `/api/v1/ai/report-suggestions` | any workspace member | no | AI report assistant (`/w/:ws/analytics/assistant`): prompt form and recommendation cards; 409 `no_gold_models` empty state | P0 |
| [ ] | 95 | 6.11 | GET | `/api/v1/workspaces/{workspace_id}/report-requests` | any workspace member | no | Analytics catalog (`/w/:ws/analytics`): Requests tab | P2 |
| [ ] | 96 | 6.12 | POST | `/api/v1/workspaces/{workspace_id}/report-requests` | any workspace member | no | Request a custom report dialog, opened from the Analytics catalog and from the AI report assistant | P2 |
| [ ] | 97 | 6.13 | GET | `/api/v1/integrations/metabase/status` | any workspace member | no | Analytics catalog Metabase status strip; Dashboard detail (embed gate, Open in Metabase); Report detail (Open in Metabase, publish notice); Settings > Metabase (`/w/:ws/settings/metabase`) | P0 |
| [ ] | 98 | 6.14 | POST | `/api/v1/integrations/metabase/test-connection` | any workspace member | no | Analytics catalog Metabase status strip (Test connection); Dashboard detail embed panel (Check again); Report detail (Test connection, shown after a refused publish); Settings > Metabase (Test connection); Onboarding analytics step (`/w/:ws/onboarding`) | P1 |

## 7. Workspace settings, members, connections and integrations

| Status | # | Ref | Method | Path | Permission | Async run | Used by (frontend screens) | Priority |
|---|---|---|---|---|---|---|---|---|
| [ ] | 99 | 7.1 | GET | `/api/v1/workspaces/{workspace_id}/members` | any workspace member | no | Settings > Members & roles (members table) | P1 |
| [ ] | 100 | 7.2 | POST | `/api/v1/workspaces/{workspace_id}/invitations` | `members:manage` | no | Settings > Members & roles (invite dialog) | P1 |
| [ ] | 101 | 7.3 | PATCH | `/api/v1/workspaces/{workspace_id}/members/{user_id}` | `members:manage` | no | Settings > Members & roles (inline role select) | P1 |
| [ ] | 102 | 7.4 | DELETE | `/api/v1/workspaces/{workspace_id}/members/{user_id}` | `members:manage` | no | Settings > Members & roles (remove member / revoke invitation) | P1 |
| [ ] | 103 | 7.5 | GET | `/api/v1/workspaces/{workspace_id}/roles` | any workspace member | no | Settings > Members & roles (roles matrix) | P2 |
| [ ] | 104 | 7.6 | GET | `/api/v1/workspaces/{workspace_id}/destination` | any workspace member | no | Settings > Connections (destination form); Onboarding destination step | P0 |
| [ ] | 105 | 7.7 | PUT | `/api/v1/workspaces/{workspace_id}/destination` | `settings:manage` | no | Settings > Connections (destination form); Onboarding destination step | P0 |
| [ ] | 106 | 7.8 | POST | `/api/v1/workspaces/{workspace_id}/destination/test-connection` | `settings:manage` | no | Settings > Connections (Test connection, stored or unsaved values); Onboarding destination step | P0 |
| [ ] | 107 | 7.9 | GET | `/api/v1/workspaces/{workspace_id}/integrations/dbt` | any workspace member | no | Settings > dbt project; Onboarding transformation step | P1 |
| [ ] | 108 | 7.10 | PUT | `/api/v1/workspaces/{workspace_id}/integrations/dbt` | `settings:manage` | no | Settings > dbt project; Onboarding transformation step | P1 |
| [ ] | 109 | 7.11 | POST | `/api/v1/workspaces/{workspace_id}/integrations/dbt/test-connection` | `settings:manage` | no | Settings > dbt project (Test repository); Onboarding transformation step | P1 |
| [ ] | 110 | 7.12 | GET | `/api/v1/workspaces/{workspace_id}/integrations/metabase` | any workspace member | no | Settings > Metabase (config form); Onboarding analytics step | P1 |
| [ ] | 111 | 7.13 | PUT | `/api/v1/workspaces/{workspace_id}/integrations/metabase` | `settings:manage` | no | Settings > Metabase (config form, disconnect); Onboarding analytics step | P1 |
| [ ] | 112 | 7.14 | GET | `/api/v1/workspaces/{workspace_id}/integrations/ai-provider` | any workspace member | no | Settings > AI provider; AI mapping list and new-mapping pages (provider notice) | P1 |
| [ ] | 113 | 7.15 | PUT | `/api/v1/workspaces/{workspace_id}/integrations/ai-provider` | `settings:manage` | no | Settings > AI provider | P1 |
| [ ] | 114 | 7.16 | POST | `/api/v1/workspaces/{workspace_id}/integrations/ai-provider/test-connection` | `settings:manage` | no | Settings > AI provider (Test) | P2 |
| [ ] | 115 | 7.17 | GET | `/api/v1/workspaces/{workspace_id}/settings/scheduler` | any workspace member | no | Settings > Scheduler | P2 |
| [ ] | 116 | 7.18 | PUT | `/api/v1/workspaces/{workspace_id}/settings/scheduler` | `settings:manage` | no | Settings > Scheduler | P2 |
| [ ] | 117 | 7.19 | GET | `/api/v1/workspaces/{workspace_id}/settings/audit-retention` | any workspace member | no | Settings > Audit retention | P2 |
| [ ] | 118 | 7.20 | PUT | `/api/v1/workspaces/{workspace_id}/settings/audit-retention` | `settings:manage` | no | Settings > Audit retention | P2 |
| [ ] | 119 | 7.21 | GET | `/api/v1/me/notification-preferences?workspace_id=` | authenticated + active member of workspace_id | no | Settings > Notifications (personal event x channel matrix) | P2 |
| [ ] | 120 | 7.22 | PUT | `/api/v1/me/notification-preferences?workspace_id=` | authenticated + active member of workspace_id | no | Settings > Notifications | P2 |
| [ ] | 121 | 7.23 | GET | `/api/v1/workspaces/{workspace_id}/integrations` | any workspace member | no | Settings > Integrations (status cards) | P1 |
| [ ] | 122 | 7.24 | GET | `/api/v1/workspaces/{workspace_id}/system-health` | any workspace member | no | Settings > System health (refetched every 60 s) | P2 |

## Cross-cutting work

These items are not single endpoints. Section 8 of the contract describes each one.

| Status | Item | Contract |
|---|---|---|
| [ ] | Error envelope, `X-Request-Id` echo, 422 field paths | 0.4 |
| [ ] | Cookie session, optional bearer token, CSRF, CORS | 0.2, 0.13 |
| [ ] | Role matrix and membership checks on every route; `access.denied` audit | 0.11, 0.10 |
| [ ] | Run queue, workers, logs with stable `seq`, cancel and retry, completion side effects | 0.8, 8.2 |
| [ ] | dlt ingestion workers and connection testing | 8.1 |
| [ ] | dbt execution, manifest parsing and Git commits | 8.3 |
| [ ] | Scheduler: cron and timezone, overlap and retry policies, misfires | 8.4 |
| [ ] | Data quality results | 8.5 |
| [ ] | Schema-change detection and freshness notifications | 8.6 |
| [ ] | Metabase status, signed embeds, publish, catalog sync | 8.8 |
| [ ] | AI provider calls with human review | 8.9 |
| [ ] | Notification fan-out, per-recipient read state, email and digests | 8.10 |
| [ ] | Audit retention purge and export | 8.11 |
| [ ] | Per-user favorites and view history | 8.12 |
| [ ] | Secrets vault for all credentials | 0.9, 8.13 |
| [ ] | Health, readiness and integration probes | 8.14 |
| [ ] | Resolve the open questions | 9 |
