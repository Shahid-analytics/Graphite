# Graphite backend API contract

Graphite is the control panel of a cloud BI platform for small and mid-sized businesses (MSMEs). Data flows from Salesforce and PostgreSQL sources through dlt ingestion into a PostgreSQL Bronze layer, then through dbt into Silver and Gold, then through data quality checks into Metabase dashboards and reports. The frontend configures and monitors that flow. Everything else is the backend's job: ingestion, dbt, scheduling, quality checks, AI calls, Metabase, notifications, audit persistence and authorization.

This document is the contract the FastAPI backend has to implement. It was written from the frontend repository, which contains **no backend code**. Today the frontend runs against an in-browser mock of this API (`VITE_API_MODE=mock`, the default), implemented in `frontend/src/mocks`. Setting `VITE_API_MODE=live` and `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`) sends every request to the real backend. **Live mode never falls back to mock data:** a failed live call shows an error state with a retry option. Every request and response shape here is the one the frontend's typed services (`frontend/src/services/*.service.ts`) and types (`frontend/src/types/*.ts`) already use, so a backend that follows this document works with the frontend without changes.

How to read it:

- Section 0 sets the conventions shared by every endpoint.
- Sections 1 to 7 cover one domain each, with its types and then one block per endpoint: permission, parameters, body, response with an example, errors, side effects (audit events, notifications, runs), async behaviour, backend notes, and the screens that use it. Each section was checked against the mock handlers.
- Section 8 lists what the real backend must do that the mock only simulates. Section 9 collects the open questions.
- Appendix A maps every frontend service method to its endpoint.

The prioritised implementation checklist is in [backend-api-checklist.md](backend-api-checklist.md). The frontend's architecture, route map and honesty rules are in [frontend-architecture.md](frontend-architecture.md).

The API has 122 endpoints, which the frontend calls through 122 service methods (one method per endpoint). Seeded examples use the demo workspace "Acme Distributors":

- Salesforce Production is healthy.
- ERP Database is degraded by a schema change.
- Web Orders DB fails authentication.
- Finance and Receivables fails its quality checks on duplicate invoice IDs.
- An Inventory Daily run is in progress at load.
- Metabase is unreachable.

The second workspace, "Northwind Retail", is empty and has not been onboarded. Seeded values are examples, not fixtures the backend must reproduce.

## Contents

- [0. Conventions](#0-conventions)
  - [0.1 Base URL, versioning and paths](#01-base-url-versioning-and-paths)
  - [0.2 Authentication and sessions](#02-authentication-and-sessions)
  - [0.3 JSON, timestamps and IDs](#03-json-timestamps-and-ids)
  - [0.4 Error envelope](#04-error-envelope)
  - [0.5 Pagination](#05-pagination)
  - [0.6 Sorting and filtering](#06-sorting-and-filtering)
  - [0.7 Idempotency and concurrency](#07-idempotency-and-concurrency)
  - [0.8 Runs and asynchronous actions](#08-runs-and-asynchronous-actions)
  - [0.9 Secrets](#09-secrets)
  - [0.10 Audit logging](#010-audit-logging)
  - [0.11 Roles and permissions](#011-roles-and-permissions)
  - [0.12 Timeouts and rate limits](#012-timeouts-and-rate-limits)
  - [0.13 CORS and cookies](#013-cors-and-cookies)
- [1. Authentication, workspaces, health, search, overview, notifications and audit](#1-authentication-workspaces-health-search-overview-notifications-and-audit)
  - [1.0 Conventions used by every endpoint in this section](#10-conventions-used-by-every-endpoint-in-this-section)
  - [1.1 Types](#11-types)
  - [1.2 Health](#12-health)
  - [1.3 Authentication](#13-authentication)
  - [1.4 Workspaces](#14-workspaces)
  - [1.5 Search](#15-search)
  - [1.6 Overview](#16-overview)
  - [1.7 Notifications](#17-notifications)
  - [1.8 Audit](#18-audit)
  - [1.9 Service coverage](#19-service-coverage)
- [2. Data sources and runs](#2-data-sources-and-runs)
  - [2.0 Conventions used in this section](#20-conventions-used-in-this-section)
  - [2.1 Types](#21-types)
  - [2.2 Connector catalog](#22-connector-catalog)
  - [2.3 Sources](#23-sources)
  - [2.4 Connection testing and discovery](#24-connection-testing-and-discovery)
  - [2.5 Source tables and preview](#25-source-tables-and-preview)
  - [2.6 Source syncs](#26-source-syncs)
  - [2.7 Runs](#27-runs)
- [3. Pipelines and schedules](#3-pipelines-and-schedules)
  - [3.0 Conventions used in this section](#30-conventions-used-in-this-section)
  - [3.1 Types](#31-types)
  - [3.2 Pipelines](#32-pipelines)
  - [3.3 Schedules](#33-schedules)
  - [3.4 Scheduler behaviour the mock does not simulate](#34-scheduler-behaviour-the-mock-does-not-simulate)
- [4. Transformations (dbt) and AI business mapping](#4-transformations-dbt-and-ai-business-mapping)
  - [4.0 Conventions used in this section](#40-conventions-used-in-this-section)
  - [4.1 Types](#41-types)
  - [4.2 Transformations](#42-transformations)
  - [4.3 AI business mapping](#43-ai-business-mapping)
  - [4.4 Open questions](#44-open-questions)
- [5. Data models, data preview and schema proposals](#5-data-models-data-preview-and-schema-proposals)
  - [5.0 Conventions used in this section](#50-conventions-used-in-this-section)
  - [5.1 Types](#51-types)
  - [5.2 Data model catalog](#52-data-model-catalog)
  - [5.3 Data preview](#53-data-preview)
  - [5.4 Lineage, relationships and quality](#54-lineage-relationships-and-quality)
  - [5.5 Schema proposals](#55-schema-proposals)
  - [5.6 Open points found while writing this section](#56-open-points-found-while-writing-this-section)
- [6. Analytics, Metabase integration and AI report recommendations](#6-analytics-metabase-integration-and-ai-report-recommendations)
  - [6.0 Conventions used in this section](#60-conventions-used-in-this-section)
  - [6.1 Types](#61-types)
  - [6.2 Dashboards](#62-dashboards)
  - [6.3 Reports](#63-reports)
  - [6.4 AI report recommendations](#64-ai-report-recommendations)
  - [6.5 Custom report requests](#65-custom-report-requests)
  - [6.6 Metabase integration](#66-metabase-integration)
  - [6.7 Cross-cutting backend notes for this section](#67-cross-cutting-backend-notes-for-this-section)
  - [6.8 Open questions](#68-open-questions)
- [7. Workspace settings, members, connections and integrations](#7-workspace-settings-members-connections-and-integrations)
  - [7.0 Conventions](#70-conventions)
  - [7.1 Types](#71-types)
  - [7.2 Members and roles](#72-members-and-roles)
  - [7.3 Warehouse destination (PostgreSQL)](#73-warehouse-destination-postgresql)
  - [7.4 dbt project](#74-dbt-project)
  - [7.5 Metabase](#75-metabase)
  - [7.6 AI provider](#76-ai-provider)
  - [7.7 Scheduler defaults](#77-scheduler-defaults)
  - [7.8 Audit retention](#78-audit-retention)
  - [7.9 Personal notification preferences](#79-personal-notification-preferences)
  - [7.10 Integration status and system health](#710-integration-status-and-system-health)
  - [7.11 Service coverage](#711-service-coverage)
  - [7.12 Open questions](#712-open-questions)
- [8. Cross-cutting backend responsibilities](#8-cross-cutting-backend-responsibilities)
  - [8.1 Ingestion workers (dlt)](#81-ingestion-workers-dlt)
  - [8.2 Run orchestration](#82-run-orchestration)
  - [8.3 dbt execution and the dbt project](#83-dbt-execution-and-the-dbt-project)
  - [8.4 Scheduler](#84-scheduler)
  - [8.5 Data quality checks](#85-data-quality-checks)
  - [8.6 Schema-change detection and freshness](#86-schema-change-detection-and-freshness)
  - [8.7 Catalog, lineage, preview and schema proposals](#87-catalog-lineage-preview-and-schema-proposals)
  - [8.8 Metabase integration and embedding](#88-metabase-integration-and-embedding)
  - [8.9 AI provider calls with human review](#89-ai-provider-calls-with-human-review)
  - [8.10 Notification delivery](#810-notification-delivery)
  - [8.11 Audit retention and export](#811-audit-retention-and-export)
  - [8.12 Per-user state](#812-per-user-state)
  - [8.13 Identity, tenancy and secrets](#813-identity-tenancy-and-secrets)
  - [8.14 Health and integration status](#814-health-and-integration-status)
- [9. Open questions](#9-open-questions)
  - [9.0 Cross-cutting](#90-cross-cutting)
  - [9.1 Authentication, workspaces, search, overview, notifications and audit](#91-authentication-workspaces-search-overview-notifications-and-audit)
  - [9.2 Data sources and runs](#92-data-sources-and-runs)
  - [9.3 Pipelines and schedules](#93-pipelines-and-schedules)
  - [9.4 Transformations and AI business mapping](#94-transformations-and-ai-business-mapping)
  - [9.5 Data models, data preview and schema proposals](#95-data-models-data-preview-and-schema-proposals)
  - [9.6 Analytics, Metabase and AI report recommendations](#96-analytics-metabase-and-ai-report-recommendations)
  - [9.7 Workspace settings, members, connections and integrations](#97-workspace-settings-members-connections-and-integrations)
- [Appendix A. Service method index](#appendix-a-service-method-index)

---

## 0. Conventions

These rules apply to every endpoint in sections 1 to 7. They are taken from the client (`src/services/api-client.ts`, `src/services/api-error.ts`, `src/lib/config.ts`, `src/lib/query-client.ts`), the shared types (`src/types/common.ts`, `src/types/runs.ts`, `src/types/auth.ts`, `src/types/audit.ts`) and the mock (`src/mocks/mock-api.ts`, `src/mocks/router.ts`, `src/mocks/store.ts`, `src/mocks/permissions.ts`). Each section repeats the conventions that matter to it and states its own exceptions. Where a section and this chapter differ, the section describes the endpoint as implemented, and the difference is listed in [9. Open questions](#9-open-questions).

### 0.1 Base URL, versioning and paths

- The client sends every request to `VITE_API_BASE_URL` plus the path. The default is `http://localhost:8000/api/v1`, and a trailing slash is stripped. Every path in this document is written with the `/api/v1` prefix.
- The version is in the URL. Additive changes (new response fields, new optional parameters, new error codes for new situations) are allowed within `v1`, because the client ignores unknown response fields. Renaming or removing a field, changing a type, or changing a status code is a breaking change and needs `/api/v2` or a coordinated frontend release.
- Path parameters are written as `{snake_case}` placeholders, for example `{workspace_id}`. Their values are opaque IDs. The one exception is `{table}` in `GET /api/v1/sources/{source_id}/tables/{table}/preview`, which is a `schema.table` name sent URL-encoded with `encodeURIComponent`.
- The mock router accepts an optional trailing slash. The backend should accept both forms or redirect without losing the method (FastAPI `redirect_slashes` sends a 307, which keeps it).
- An unknown path returns 404 `not_found`. A known path called with the wrong method returns 405 `method_not_allowed` (`"<METHOD> is not supported for <path>."`).

### 0.2 Authentication and sessions

- **Session cookie (primary).** Every request is sent with `credentials: 'include'`. `POST /api/v1/auth/login` sets an HttpOnly, Secure, SameSite session cookie. `POST /api/v1/auth/logout` revokes the session and clears the cookie.
- **Bearer token (optional).** When `LoginResponse.access_token` is a string, the client keeps it in memory only (never in `localStorage` or `sessionStorage`) and sends `Authorization: Bearer <token>`. An in-memory token is lost on a page reload, and the app then calls `GET /api/v1/auth/me`. That call must still succeed through the cookie, so a bearer-only deployment would sign users out on every reload. Send the cookie in every deployment, and treat the token as optional.
- **Restoring the session.** On load the app calls `GET /api/v1/auth/me`, which returns the `Session` (`user`, `memberships` with role per workspace, `expires_at`). A 401 there means "signed out" and is not shown as an error. The client caches the session for 5 minutes.
- **Expiry and refresh.** The client never reads `Session.expires_at` and has no refresh call: there is no refresh-token endpoint in this API. An expired session is noticed only when a request returns 401. Because the app polls several endpoints while it is open, a fixed-lifetime session signs active users out mid-task; a sliding session (each authenticated request extends the cookie) avoids that. The choice is listed in [9.1](#91-authentication-workspaces-search-overview-notifications-and-audit).
- **401 handling.** Any 401 from any endpoint makes the client clear its session and return to `/login`. A 401 must therefore mean only "there is no valid session". A signed-in user who lacks a permission or a membership gets 403, never 401. The 401 for wrong credentials on `POST /api/v1/auth/login` goes through the same handler, which is harmless because no session exists yet on the sign-in page.
- **Public routes:** `GET /api/v1/health`, `GET /api/v1/ready`, `POST /api/v1/auth/login` and `POST /api/v1/auth/logout`. Every other route needs a session.
- **Workspace context.** The client never sends a "current workspace" header. Workspace-scoped resources carry the workspace in the path (`/workspaces/{workspace_id}/...`), or the backend resolves it from the resource (`/sources/{source_id}` and so on). A few routes take it as a query or body parameter: `GET /api/v1/notifications`, `POST /api/v1/notifications/mark-all-read`, `GET` and `PUT /api/v1/me/notification-preferences`, `GET /api/v1/integrations/metabase/status`, `POST /api/v1/integrations/metabase/test-connection`, `POST /api/v1/ai/mapping-suggestions` and `POST /api/v1/ai/report-suggestions`.
- **CSRF.** With cookie authentication every state-changing route needs CSRF protection: SameSite=Lax or Strict plus an `Origin` check, or a CSRF token. The client sends no CSRF header today, so an `Origin` or `Sec-Fetch-Site` check needs no client change. A token scheme would.

Headers the client sends on every request:

| Header | Value |
|---|---|
| `Accept` | `application/json`, or `*/*` for file downloads (the audit export) |
| `Content-Type` | `application/json`, only when there is a body. Body-less POSTs send no `Content-Type` and no body, and the backend must accept them: run retry and cancel, schedule run now, transformation test, proposal apply, schema-change acknowledge, report publish, embed session, and the dbt and AI provider connection tests. |
| `X-Request-Id` | A new UUID per request. Log it and return it as `error.request_id`. |
| `Authorization` | `Bearer <token>`, only when a token was issued at login |

### 0.3 JSON, timestamps and IDs

- Keys are **snake_case** in requests, responses and query parameters (the Pydantic default).
- Timestamps are **ISO 8601 in UTC** with a `Z` suffix and second precision, for example `"2026-10-28T09:15:00Z"`. The client also parses milliseconds and formats every timestamp for display itself. Cron expressions are interpreted in their own IANA `timezone` field.
- IDs are **opaque, prefixed strings**: for example `usr_`, `ws_`, `src_`, `run_`, `pl_`, `sch_`, `trf_`, `dbt_`, `mdl_`, `qc_`, `prop_`, `chg_`, `map_`, `dsh_`, `rpt_`, `rr_`, `ntf_` and `aud_`. The client never parses an ID. New IDs in the mock are the prefix plus 8 base-36 characters. The backend may use any URL-safe format that keeps the prefix.
- **Nullable versus optional.** A type field written `x: T | null` is always present and is `null` when empty. A field written `x?: T` may be omitted. Do not omit nullable fields, because the client distinguishes `null` from a missing value in some places (for example `retryable: null` means "the run has no error").
- **Success bodies are bare.** There is no `{ "data": ... }` wrapper. The client parses the body directly as the documented type.
- **Status codes.** The client treats every 2xx the same way. It returns `undefined` for a 204 and parses JSON for every other 2xx, so a 200 with an empty body breaks it. Use 200 for reads, updates and synchronous actions, 201 for creates, 202 for anything that starts a Run or another asynchronous job, and 204 (no body) for deletes.
- **Unknown request fields** are ignored at the top level of a body. Some nested objects are strict, for example unknown keys inside a source `config` return 422. Each section says which.

### 0.4 Error envelope

Every non-2xx response carries the same envelope (`ApiErrorBody` in `src/types/common.ts`):

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "details": {},
    "field_errors": [
      { "field": "config.port", "message": "Port must be a whole number between 1 and 65535." }
    ],
    "request_id": "8f0c2d6e-1f0b-4c7e-9a43-0f5d3c2b9e11"
  }
}
```

- `code` (string, required) is a stable, machine-readable snake_case code. The client branches on it, so never change an existing code.
- `message` (string, required) is shown to end users as is, in toasts and error states. Write it as a full sentence with no stack traces, SQL or secrets.
- `details` (object, optional) carries structured context for the code, for example `{ "run_id": "run_..." }` for `run_in_progress` or `{ "active_run_ids": [...] }` for `concurrency_limit_reached`.
- `field_errors` (array, optional, 422 only) holds one entry per invalid field. All the errors found in one validation pass are returned together. Forms place each message under the control named by `field`, so messages must be written for end users.
- `field` is a dotted path into the request body or query, with numeric array indexes: `name`, `config.port`, `selected_tables.2.cursor_field`, `changes.0.columns.2.data_type`, `retry.max_attempts`. Query parameters use their own name (`kind`, `status`). The AI mapping review endpoint uses bracket indexes instead (`decisions[2].overrides.target_field`), and its screen depends on that form (see [9.0](#90-cross-cutting)). FastAPI's default `loc` arrays must be converted to this string form.
- `request_id` (string, optional) echoes `X-Request-Id`. The UI shows it in error details for support.
- A response without the envelope is still handled: the client uses the code `http_<status>` and a generic message. Proxies and gateways should still be configured to return the envelope.

Status codes and the shared codes used across the API:

| Status | `code` | Meaning |
|---|---|---|
| 400 | `bad_request`, or a connection-failure code | Malformed request that is not a field validation problem (for example a preview `{table}` that is not `schema.table`). `POST /api/v1/workspaces/{workspace_id}/sources` and `POST /api/v1/workspaces/{workspace_id}/sources/discover` also return 400 when their server-side connection check fails, with the failing test's code (`source_unreachable`, `source_auth_failed`, or `connection_failed` when the test gives none) (section 2.3 and 2.4). |
| 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." Login uses "Incorrect email or password." |
| 403 | `forbidden` | Not an active member of the workspace ("You are not a member of this workspace."), or the role lacks the permission (`Your role (<role>) does not include the "<permission>" permission.`). |
| 404 | `not_found` | Unknown resource. Message pattern: `<Resource> "<id>" was not found.` Some endpoints use a specific 404 code, for example `dbt_not_configured`. |
| 405 | `method_not_allowed` | The path exists, but not for this method. |
| 409 | specific codes | The request conflicts with current state. Examples: `run_in_progress`, `sync_in_progress`, `concurrency_limit_reached`, `run_not_retryable`, `run_not_cancellable`, `pipeline_not_runnable`, `target_not_runnable`, `integration_unavailable`, `workspace_exists`. Each endpoint lists its own. |
| 422 | `validation_error` | Field validation failed. Message "Some fields are invalid." plus `field_errors`. One endpoint uses another 422 code: `POST /api/v1/workspaces/{workspace_id}/integrations/ai-provider/test-connection` returns `ai_provider_not_configured` (with a `provider` field error) when no provider is set (section 7.6). Some endpoints also use their own message instead of "Some fields are invalid.", for example "Invalid list filters." on the dashboard and report lists. |
| 429 | `rate_limited` | Recommended for rate limits (see 0.12). The client has no special handling and shows `message`. |
| 500 | `internal_error` | Unhandled server error. Log it with the request id, and never return internals. |
| 502, 503, 504 | `upstream_unavailable` or similar | A dependency (warehouse, Metabase, AI provider, Git) did not respond. Prefer a 409 with a specific code when the user can act on it. |

The client also produces two codes of its own with status 0, which the backend never sends: `network_error` (the API could not be reached) and `timeout` (no response within the client timeout).

**Order of checks.** The mock checks in this order: route (404 or 405), session (401), resource or workspace lookup (404), membership and permission (403), body or query validation (422), then state conflicts (409). Some endpoints deviate, and each says so. Because the lookup runs before the membership check, a caller can learn that an ID exists in a workspace they do not belong to. The backend may return 404 for both cases (see [9.0](#90-cross-cutting)).

### 0.5 Pagination

- Request: `page` (1-based, default 1) and `page_size`. The default depends on the endpoint: 20 for most lists, 25 for `GET /api/v1/workspaces/{workspace_id}/runs` and `GET /api/v1/workspaces/{workspace_id}/audit-events`, and 10 for `GET /api/v1/transformations/{transformation_id}/runs`. In the mock a non-numeric, zero or negative value falls back to the default. The backend should require positive integers, and may return 422 for other values.
- Upper limit: `page_size` is silently capped at 500, except on `GET /api/v1/workspaces/{workspace_id}/audit-events`, which returns 422 above 200.
- Response (`Paginated<T>`):

  ```json
  { "items": [], "page": 1, "page_size": 25, "total": 237 }
  ```

  `total` is the number of items that match the filters across all pages. `GET /api/v1/notifications` returns `NotificationList`, which adds `unread_count`.
- Paginated endpoints: notifications, audit events, workspace runs, source runs, pipeline runs, schedule runs and transformation runs. The two data previews (`GET /api/v1/models/{model_id}/preview`, section 5.3, and `GET /api/v1/sources/{source_id}/tables/{table}/preview`, section 2.5) page their rows with their own response shape (`columns`, `rows`, `total_rows`, `page`, `page_size`), not `Paginated<T>`. Every other list returns a **bare JSON array**, which the frontend sorts, filters and pages client-side. These arrays are bounded per workspace today. If any of them can grow past a few thousand items, adding pagination is a breaking change and needs a frontend change.

### 0.6 Sorting and filtering

- Lists have a fixed default order, stated per endpoint. Runs and audit events are sorted newest first (`queued_at` or `occurred_at` descending) and notifications by `created_at` descending.
- The shared `PageQuery` type reserves `sort=<field>` (ascending) and `sort=-<field>` (descending). The only endpoint that uses `sort` today is data preview, where it names a column. A backend that adds sorting elsewhere should follow this format.
- Filters are plain query parameters named after the field (`status`, `kind`, `type`, `layer`, `source_id`, `actor_id`, `resource_type`, `action`, `from`, `to`). `q` is a case-insensitive substring search over the fields each endpoint lists.
- Enum filters are validated: an unknown value returns 422 with a field error on that parameter. On most endpoints an empty value means "no filter", and some also accept `all`. Each endpoint states its rule.
- Boolean query values: `true` or `1` mean true, and any other value means false.
- Arrays: the client sends a `string[]` query value as repeated parameters (`?x=a&x=b`). The one exception is the run `kind` filter on `GET /api/v1/workspaces/{workspace_id}/runs`, which is sent as one comma-separated value (`kind=transformation,dbt_test`).
- Time ranges (`from`, `to`) are ISO 8601 UTC timestamps.

### 0.7 Idempotency and concurrency

- **The client never retries a mutation.** Queries are retried once on a network error, a client timeout or a 5xx response, and never on a 4xx (`src/lib/query-client.ts`; `GET /api/v1/auth/me` is never retried). Because a timed-out GET is sent a second time, a slow read can reach the server twice. A failed POST, PUT, PATCH or DELETE is shown to the user, who decides whether to try again.
- The client sends no `Idempotency-Key` header today. The backend should still accept one on the trigger endpoints (`POST .../sync`, `POST .../runs`, `POST .../run`, `POST .../test`, `POST .../apply`, `POST /runs/{run_id}/retry`) and return the original response for a repeated key, so that a double-click or a proxy retry cannot start two runs. Adding the header later is then a client-only change.
- **Active-run guards** must be atomic. Examples are one active run per pipeline (409 `run_in_progress`), one active sync per source (409 `sync_in_progress`) and schedule overlap policies (409 `concurrency_limit_reached`). Implement them with a row lock, an advisory lock or a partial unique index, not with a read followed by an insert.
- **Safe repeats.** `POST /api/v1/auth/logout`, `PATCH /api/v1/notifications/{notification_id}` with the same value, `POST /api/v1/notifications/mark-all-read` and the favorite endpoints (which take an explicit `{ "is_favorite": true | false }`) are safe to repeat. A repeated cancel of a run that is still stopping should return 202 again (section 2.7).
- **Concurrent edits.** No resource has a version, `ETag` or `If-Match` today, so concurrent edits are last-write-wins. `PUT` replaces a whole settings object. `PATCH` changes only the fields that are sent. Optimistic concurrency (for example for transformation SQL saved to Git) is an open question.
- **Uniqueness** (names per workspace, workspace slugs) is enforced by the database and reported as a 422 field error or a 409, as each endpoint states.

### 0.8 Runs and asynchronous actions

Every long-running operation is an asynchronous **Run** (`Run` in `src/types/runs.ts`). A sync, a pipeline run, a dbt run, a dbt test or a schema apply never blocks the request.

**Run kinds** (`RunKind`): `ingestion` (one source sync), `pipeline` (end to end), `transformation` (`dbt run` for one model), `dbt_test` (`dbt test` for one model) and `schema_apply` (applying an approved schema proposal).

**Statuses** (`RunStatus`): `queued` and `running` are active. `succeeded`, `failed`, `cancelled` and `skipped` are terminal. A Run never leaves a terminal status, and a retry creates a new Run.

**Triggers** (`RunTrigger`): `manual`, `schedule`, `retry`, `onboarding` and `api`.

**Stages** run in this fixed order (`StageKey`): `source_connect`, `ingestion`, `bronze_load`, `dbt_transform`, `silver_gold_publish`, `quality_checks`, `metabase_refresh`. Each kind uses a subset, and a pipeline run lists all of them. Each `RunStage` has a `status`, timestamps, `duration_seconds`, an `error` and `metrics`. It also has a `skip_reason`, which is set only when the status is `skipped`:

| Situation | `skip_reason` |
|---|---|
| `metabase_refresh` while Metabase is not connected | "Metabase is not connected, so no dashboards were refreshed." |
| Any other stage left out of the run's plan | "Not selected for this run." |
| A stage after a failed stage | "Not run because <stage name> failed." |

**Errors.** A failed Run has `error: RunError` (`stage`, `code`, `message`, `details`, `retryable`). The failing stage carries the same error. `retryable` is false when repeating the run cannot help until something changes, for example a dbt compile error. `RunSummary`, which is embedded in pipelines, schedules and the overview, carries `error_message` and `retryable` (`error.retryable`, or `null` when the run has no error).

**Tables.** Ingestion and pipeline runs report one `TableSyncResult` per table, with `status`, `mode` and `records`. Tables of failed or cancelled runs that did not finish report `records: 0`.

**Endpoints that start a Run** respond **202** with the new Run in status `queued`:

| Endpoint | Run kind |
|---|---|
| `POST /api/v1/sources/{source_id}/sync` | `ingestion` |
| `POST /api/v1/workspaces/{workspace_id}/sources` with `run_initial_sync: true` | `ingestion` (the response is the source, which carries `initial_run_id`) |
| `POST /api/v1/pipelines/{pipeline_id}/runs` | `pipeline` |
| `POST /api/v1/schedules/{schedule_id}/run` | the schedule target's kind |
| `POST /api/v1/transformations/{transformation_id}/run` | `transformation` |
| `POST /api/v1/transformations/{transformation_id}/test` | `dbt_test` |
| `POST /api/v1/schema-proposals/{proposal_id}/apply` | `schema_apply` |
| `POST /api/v1/runs/{run_id}/retry` | the original run's kind |

**Polling.** The frontend polls, and the backend needs no push channel:

| What | Interval |
|---|---|
| `GET /api/v1/runs/{run_id}` | every 2 s until terminal |
| `GET /api/v1/runs/{run_id}/logs?after=<next_cursor>` | every 2 s until `complete: true`, then once with `after=0` |
| Lists showing active runs (sources, pipelines, transformations, schedules, overview, proposals) | every 2 to 4 s while any item is active (schedules every 60 s when idle) |
| AI mapping generation (`GET /api/v1/ai/mapping-suggestions/{suggestion_id}`) | every 1.5 s while `generating` |
| Notifications and the unread badge | every 30 s |
| Audit events | every 30 s |
| `GET /api/v1/workspaces/{workspace_id}/system-health` | every 60 s |

Keep `GET /runs/{run_id}` and the logs endpoint cheap, because they carry most of the polling load. Server-Sent Events (for example `GET /api/v1/workspaces/{workspace_id}/events`) are a possible later optimisation. The frontend does not depend on them, and polling must keep working.

**Logs.** `GET /api/v1/runs/{run_id}/logs` returns lines after a cursor. Each line's `seq` is strictly increasing and stable. While a run is active, lines are only appended. `next_cursor` is the `seq` to pass as `after` next time, and `complete` becomes true once the run is terminal. Secrets and connection strings must be redacted before logs are stored.

**Cancellation.** `POST /api/v1/runs/{run_id}/cancel` returns 202 with the run in its current state. The worker stops at a safe point, and polling shows `cancelled`, or `succeeded` or `failed` if the run finished first. A run that is already terminal returns 409 `run_not_cancellable`. Stages that were planned skips stay `skipped`. A run cancelled while queued reports `started_at: null`, `duration_seconds: 0` and `records_processed: 0`.

**Retry.** `POST /api/v1/runs/{run_id}/retry` creates a new Run with `trigger: "retry"`, `attempt` incremented and `retry_of` set to the original run. It needs a `failed` or `cancelled` run whose error is retryable (otherwise 409 `run_not_retryable`). Pipeline runs also need a runnable pipeline (409 `pipeline_not_runnable`) and no other active run (409 `run_in_progress`). The retry keeps the original plan, so planned skips stay skipped. A cause that persists fails the retry again, and a failure with `attempt >= 3` raises a `repeated_retries` notification.

**Completion side effects** (applied once per run by the orchestrator, see section 2.7): source sync bookkeeping, model freshness, transformation `last_run_*` fields, notifications and the `<kind>.run_<status>` audit event.

**Other asynchronous jobs that are not Runs.** `POST /api/v1/ai/mapping-suggestions` responds 202 with a suggestion set in status `generating`, and the client polls the set. Connection tests, discovery, previews, AI report suggestions and the audit export are synchronous today. Section 9 notes where they may need to become jobs.

### 0.9 Secrets

- Secret fields (passwords, API keys, deploy keys, embedding secrets, OAuth client secrets) are **write-only**. Responses never contain the value, a masked value or a hash. They describe it as `SecretState`:

  ```ts
  interface SecretState { is_set: boolean; updated_at: string | null }
  ```

- Requests use three forms: a string sets or replaces the secret, `null` clears it, and an omitted key keeps the stored value. Connection-test endpoints accept the same partial body, and fall back to the stored secret when one is omitted.
- Store secrets in a secrets manager or encrypted at rest with envelope encryption, never in plain text in the application database. Use them only server-side, in workers, connection tests, Metabase signing and AI provider calls.
- Never log a secret, put one in a run log, return one in an error message or `details`, or write one to audit `changes` or `metadata`. Audit changes for a secret field record `before: "[secret]"` and `after: "[secret updated]"` or `"[secret cleared]"`, and the audit export replaces any remaining secret-like field values with `[redacted]`.
- `GET /api/v1/workspaces/{workspace_id}/dbt-project` and the source endpoints must strip credentials embedded in URLs (for example `https://user:token@host/repo.git`).
- The frontend clears secret inputs after a submit and never stores them in browser storage.

### 0.10 Audit logging

Every state-changing request records an `AuditEvent` (`src/types/audit.ts`) in the workspace it affects, in the same transaction as the change.

| Field | Rule |
|---|---|
| `actor` | `ActorRef`: `{ type: "user" \| "service" \| "scheduler" \| "api_key", id, name, email? }`. Users for requests, `svc_orchestrator` ("Orchestrator") for run completions, and `svc_scheduler` ("Scheduler") for scheduled runs. |
| `action` | A dotted verb, `<resource>.<past-tense verb>`, for example `source.created`, `pipeline.run_triggered`, `run.retried`, `ingestion.run_failed`, `schema_proposal.applied`. Each endpoint lists the actions it records. |
| `resource` | `{ type, id, name }`. `name` is captured at the time of the event, so it survives renames and deletes. |
| `status` | `success`, `failure` or `denied`. |
| `execution_id` | The run ID for run-related events, otherwise `null`. |
| `ip_address` | The client IP. The audit endpoints show it only when the workspace setting `include_ip_addresses` is true. |
| `changes` | `[{ field, before, after }]`, only for fields that actually changed. Secrets are redacted (see 0.9). |
| `metadata` | Event-specific context. The mock adds `simulated: true` and other demo markers, which the backend must not send for real work. |

- **Denials are audited.** Every 403 caused by a missing permission records `access.denied` with `status: "denied"` and `resource: { type: "permission", id: "<permission>", name: "<permission>" }`. A 403 for non-membership is not recorded.
- Sign-in and sign-out record `auth.login` and `auth.logout` in every workspace the user is an active member of. Failed sign-ins should record `auth.login_failed` (see 9.1).
- The trail is **append-only**. No endpoint edits or deletes an event. Retention is set per workspace (`retention_days`, section 7.8), and events older than that are purged by a background job.
- `GET /api/v1/workspaces/{workspace_id}/audit-events/export` (permission `audit:export`, refused with a 409 when the workspace setting `export_enabled` is false) records `audit.exported`.

### 0.11 Roles and permissions

The backend is the authority for authorization. The frontend reads `Workspace.permissions` from `GET /api/v1/workspaces/{workspace_id}` and only hides or disables controls. Every endpoint enforces its own check, and the mock does the same so both paths are tested. Roles are per workspace membership. Only `active` memberships grant access, and `invited` memberships grant nothing.

Role matrix (`ROLE_PERMISSIONS` in `src/mocks/permissions.ts`):

| Permission | owner | admin | editor | viewer |
|---|---|---|---|---|
| `workspace:manage` | yes | no | no | no |
| `members:manage` | yes | yes | no | no |
| `sources:write` | yes | yes | no | no |
| `sources:sync` | yes | yes | yes | no |
| `pipelines:write` | yes | yes | no | no |
| `pipelines:run` | yes | yes | yes | no |
| `transformations:write` | yes | yes | yes | no |
| `transformations:run` | yes | yes | yes | no |
| `mappings:review` | yes | yes | yes | no |
| `mappings:approve` | yes | yes | no | no |
| `models:propose` | yes | yes | yes | no |
| `models:approve` | yes | yes | no | no |
| `schedules:write` | yes | yes | yes | no |
| `reports:write` | yes | yes | yes | no |
| `reports:publish` | yes | yes | no | no |
| `audit:export` | yes | yes | no | no |
| `settings:manage` | yes | yes | no | no |

Role descriptions, as returned by `GET /api/v1/workspaces/{workspace_id}/roles`:

| Role | Description |
|---|---|
| owner | Full control of the workspace, billing and membership. |
| admin | Manages connections, integrations, members and approvals. |
| editor | Builds transformations and reports, runs jobs and proposes changes. |
| viewer | Read-only access to dashboards, catalog and run history. |

"Any workspace member" in an endpoint means any active membership, including viewer. Read endpoints need only membership unless the endpoint says otherwise. Run actions (retry, cancel) take the permission of the run's kind: `sources:sync` for `ingestion`, `pipelines:run` for `pipeline`, and `transformations:run` for `transformation`, `dbt_test` and `schema_apply`.

### 0.12 Timeouts and rate limits

- **Client timeout:** 20 seconds per request by default (`VITE_API_TIMEOUT_MS`), and 120 seconds for the audit export. When it runs out, the client aborts the request and shows "The server did not respond within N seconds.". Every synchronous endpoint must answer within that time. Connection tests, discovery, previews and AI report suggestions should apply their own upstream timeouts (for example 10 to 15 seconds) and return a structured failure, not hang. Anything that can take longer belongs in a Run or job.
- **Rate limits** are not enforced by the mock, and the client has no 429 handling beyond showing `message`. Recommended limits:
  - sign-in: per IP and per account (for example 10 attempts per 15 minutes);
  - triggers: per workspace;
  - schedule validation: light, because it is called on debounced form changes;
  - AI generation: per workspace, because it consumes provider tokens;
  - audit export: per user (for example 5 per minute).

  Return 429 with the standard envelope, `code: "rate_limited"`, a user-readable `message` and a `Retry-After` header. Exempt the polling endpoints in 0.8, or size their limits for one poll every 2 seconds per open tab.

### 0.13 CORS and cookies

- **Same site is preferred.** Serve the API on the same site as the frontend, behind a reverse proxy at `/api/v1` or on a sibling subdomain such as `app.example.com` and `api.example.com`. The session cookie can then be `SameSite=Lax`.
- **Cross-origin deployments** need CORS with credentials:
  - `Access-Control-Allow-Origin` set to the exact frontend origin (never `*`) and `Access-Control-Allow-Credentials: true`;
  - allowed methods `GET, POST, PUT, PATCH, DELETE`, and allowed headers `Content-Type, Authorization, X-Request-Id`;
  - a preflight `Access-Control-Max-Age` of a few minutes to cut down `OPTIONS` traffic from polling;
  - optionally, expose `X-Request-Id`.
- A cross-site cookie needs `SameSite=None; Secure`, and CSRF protection becomes mandatory.
- Cookie attributes: `HttpOnly`, `Secure`, `Path=/`, and a lifetime matching `Session.expires_at`. Rotate the session ID at sign-in.
- The audit export is downloaded as a blob, and the client builds the file name itself (`exportFilename` in `src/features/audit/components/audit-export-menu.tsx`), so `Content-Disposition` does not need to be listed in `Access-Control-Expose-Headers`. Setting it anyway (section 1.8) is still useful for direct downloads. Return `application/x-ndjson` for `jsonl` and `text/plain` for `txt`. It is the only file download in the API; every other endpoint returns JSON.

---

## 1. Authentication, workspaces, health, search, overview, notifications and audit

This section covers the identity and tenancy layer of Graphite and the cross-cutting read models built on top of it. A **User** signs in and gets a **Session**, which lists their **Memberships**. Each membership gives the user a **Role** in one **Workspace**, and that role expands to a fixed set of **Permissions**. A workspace is the tenant boundary for every other resource. The workspace also carries its **OnboardingState** (five setup steps). The section also covers the per-workspace read models: the **Overview** home page, global **Search**, the in-app **Notification** inbox and the append-only **AuditEvent** trail (with facets and file export). It ends with the two unauthenticated probes, `/health` and `/ready`.

Source of truth for this section: `src/mocks/handlers/{auth,workspaces,health,search,overview,notifications,audit}.ts`, `src/mocks/store.ts`, `src/mocks/router.ts`, `src/mocks/permissions.ts`, `src/services/{auth,workspace,health,overview,notifications,audit}.service.ts` and `src/types/*`. This section has 19 routes.

### 1.0 Conventions used by every endpoint in this section

- **Base path:** every path is relative to `/api/v1`. For example, the mock route `/auth/login` is `POST /api/v1/auth/login`.
- **JSON:** keys are snake_case. Timestamps are ISO 8601 UTC strings (`"2026-10-28T09:15:00Z"`). IDs are opaque prefixed strings (`usr_`, `ws_`, `ntf_`, `aud_`, `run_`, ...).
- **Success bodies are bare:** there is no `{ "data": ... }` wrapper. The client reads the body as the typed object directly. List endpoints return `Paginated<T>` (`items`, `page`, `page_size`, `total`) or a plain array, as each endpoint states.
- **Authentication:** the browser sends `credentials: 'include'`, so the backend should use an HttpOnly, Secure, SameSite session cookie. A bearer token is optional: when `LoginResponse.access_token` is a string, the client keeps it in memory only and sends `Authorization: Bearer <token>`. Every request also carries an `X-Request-Id` header (a UUID). The backend should log that id and echo it as `error.request_id`.
- **Error envelope** (`ApiErrorBody`) on every non-2xx response:

  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "details": {}, "field_errors": [{ "field": "name", "message": "Workspace name must be at least 2 characters." }], "request_id": "8f0c..." } }
  ```

  `details` and `field_errors` are optional. If a response has no envelope, the client falls back to the code `http_<status>`.
- **Common errors.** The rest of this section refers to these by name.

  | Name | Status | `error.code` | Message as implemented | When |
  |---|---|---|---|---|
  | UNAUTH | 401 | `unauthenticated` | "Your session has expired. Please sign in again." | Any non-public route called without a valid session. On any 401, the client clears its session and goes to `/login`. |
  | WS_404 | 404 | `not_found` | `Workspace "<id>" was not found.` | The workspace id does not exist. |
  | NOT_MEMBER | 403 | `forbidden` | "You are not a member of this workspace." | The workspace exists, but the caller has no `active` membership in it. |
  | PERM_403 | 403 | `forbidden` | `Your role (<role>) does not include the "<permission>" permission.` | The caller is a member but lacks the permission. **Side effect:** records the audit event `access.denied` (status `denied`, resource `{type:"permission", id:"<permission>", name:"<permission>"}`). |
  | VALIDATION | 422 | `validation_error` | "Some fields are invalid." plus `field_errors[]` | The body or query fails validation. All field errors found in one pass are returned together. |
  | ROUTE_404 | 404 | `not_found` | — | Unknown path. |
  | 405 | 405 | `method_not_allowed` | `<METHOD> is not supported for <path>.` | The path exists, but not for this method. |
  | 500 | 500 | `internal_error` | — | Unhandled server error. |

- **Order of checks in workspace-scoped routes:** UNAUTH, then WS_404, then NOT_MEMBER, then PERM_403, then VALIDATION. The exceptions are noted per endpoint. Route resolution comes before all of these: in the mock, an unknown path (ROUTE_404) or a wrong method (405) is reported even without a session, before UNAUTH. Note that WS_404 comes before NOT_MEMBER, so a non-member can tell whether a workspace id exists. See the open questions.
- **Role matrix** (`src/mocks/permissions.ts`). The backend is authoritative. The frontend only hides or disables controls, based on `Workspace.permissions`.

  | Permission | owner | admin | editor | viewer |
  |---|---|---|---|---|
  | `workspace:manage` | yes | — | — | — |
  | `members:manage` | yes | yes | — | — |
  | `sources:write` | yes | yes | — | — |
  | `sources:sync` | yes | yes | yes | — |
  | `pipelines:write` | yes | yes | — | — |
  | `pipelines:run` | yes | yes | yes | — |
  | `transformations:write` | yes | yes | yes | — |
  | `transformations:run` | yes | yes | yes | — |
  | `mappings:review` | yes | yes | yes | — |
  | `mappings:approve` | yes | yes | — | — |
  | `models:propose` | yes | yes | yes | — |
  | `models:approve` | yes | yes | — | — |
  | `schedules:write` | yes | yes | yes | — |
  | `reports:write` | yes | yes | yes | — |
  | `reports:publish` | yes | yes | — | — |
  | `audit:export` | yes | yes | — | — |
  | `settings:manage` | yes | yes | — | — |

  The viewer role holds no permissions. "Any workspace member" therefore means read access for all four roles.

### 1.1 Types

The shapes below are written TypeScript-style, with JSON keys exactly as sent. A `?` marks an optional key. `| null` marks a nullable key.

**Identity**

```ts
type Role = 'owner' | 'admin' | 'editor' | 'viewer'

type Permission =
  | 'workspace:manage' | 'members:manage'
  | 'sources:write' | 'sources:sync'
  | 'pipelines:write' | 'pipelines:run'
  | 'transformations:write' | 'transformations:run'
  | 'mappings:review' | 'mappings:approve'
  | 'models:propose' | 'models:approve'
  | 'schedules:write'
  | 'reports:write' | 'reports:publish'
  | 'audit:export' | 'settings:manage'

interface User {
  id: string               // "usr_ananya"
  email: string
  name: string
  avatar_url: string | null
}

interface Membership {        // only memberships with status "active" are listed
  workspace_id: string
  workspace_name: string
  role: Role
}

interface Session {
  user: User
  memberships: Membership[]
  expires_at: string        // ISO 8601; the mock returns now + 8 hours
}

interface LoginRequest {
  email: string             // required
  password: string          // required, write-only, never logged or echoed
}

interface LoginResponse {
  session: Session
  access_token?: string | null   // null or absent for cookie deployments
}

interface ActorRef {          // who performed an audited action
  type: 'user' | 'service' | 'scheduler' | 'api_key'
  id: string                // "usr_priya", "svc_scheduler", "svc_orchestrator", "svc_ingestion"
  name: string
  email?: string | null     // present for users
}
```

**Workspace**

```ts
type Plan = 'starter' | 'growth' | 'scale'

type OnboardingStepKey = 'source' | 'destination' | 'ingestion' | 'transformation' | 'analytics'

interface OnboardingState {
  steps: Record<OnboardingStepKey, boolean>   // all five keys are always present
  completed_at: string | null                 // set when all five steps are true; cleared when any becomes false
  dismissed: boolean                          // the overview checklist was hidden by the user
}

interface Workspace {
  id: string                // "ws_acme"
  name: string              // 2..80 chars, trimmed
  slug: string              // derived from the name at creation; never changes afterwards
  industry: string | null
  region: string            // one of the region values listed under POST /workspaces; immutable
  timezone: string          // IANA zone, e.g. "Asia/Kolkata"
  plan: Plan
  created_at: string
  current_user_role: Role          // role of the caller in this workspace
  permissions: Permission[]        // effective permissions of the caller (the role matrix row)
  onboarding: OnboardingState
}

interface CreateWorkspaceRequest {
  name: string
  industry?: string | null
  region: string
  timezone: string
}

interface UpdateWorkspaceRequest {
  name?: string
  industry?: string | null
  timezone?: string
}

interface UpdateOnboardingRequest {
  step?: OnboardingStepKey
  completed?: boolean       // applies only to `step`; defaults to true
  dismissed?: boolean
}
```

**Health** (these have no named frontend types; `healthService` types them inline)

```ts
interface HealthResponse { status: 'ok'; version: string; time: string }
interface ReadyResponse  { status: 'ready'; checks: Record<string, string>; mock?: boolean }  // checks: { database, scheduler, worker } -> "ok"
```

**Search**

```ts
type ResourceType = 'source' | 'pipeline' | 'run' | 'transformation' | 'model' | 'schedule'
                  | 'dashboard' | 'report' | 'mapping' | 'proposal'

interface SearchResult {
  type: ResourceType        // search returns only source | pipeline | model | transformation | schedule | dashboard | report
  id: string
  title: string
  subtitle: string
}

interface SearchResponse { query: string; results: SearchResult[] }
```

**Overview** (`RunSummary` and `QualitySummary` are shared with the runs and quality sections and are repeated here for completeness)

```ts
type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
type RunKind = 'ingestion' | 'pipeline' | 'transformation' | 'dbt_test' | 'schema_apply'
type RunTrigger = 'manual' | 'schedule' | 'retry' | 'onboarding' | 'api'
type DataLayer = 'bronze' | 'silver' | 'gold'
type FreshnessStatus = 'fresh' | 'stale' | 'unknown'
type ScheduleTargetType = 'pipeline' | 'source_sync' | 'transformation'
type QualityStatus = 'passed' | 'failed' | 'warning' | 'not_run'

interface RunSummary {
  id: string; kind: RunKind; status: RunStatus; trigger: RunTrigger; target_name: string
  pipeline_id: string | null; source_id: string | null; transformation_id: string | null
  queued_at: string; started_at: string | null; finished_at: string | null
  duration_seconds: number | null; attempt: number
  error_message: string | null      // run.error.message
  retryable: boolean | null         // run.error.retryable; null when the run has no error
}

interface FreshnessItem {
  model_id: string; name: string; layer: DataLayer
  last_refreshed_at: string | null; sla_minutes: number | null; status: FreshnessStatus
}

interface UpcomingSchedule {
  id: string; name: string; target_type: ScheduleTargetType; target_name: string; next_run_at: string
}

interface RecentAnalyticsItem {
  id: string; kind: 'dashboard' | 'report'; name: string; business_area: string; accessed_at: string
}

interface QualityCheck {
  id: string; model_id: string; model_name: string; layer: DataLayer; name: string; column: string | null
  check_type: 'not_null' | 'unique' | 'accepted_values' | 'relationships' | 'freshness' | 'row_count' | 'custom_sql'
  severity: 'error' | 'warn'; status: QualityStatus; failing_rows: number; message: string | null
  last_run_at: string | null; run_id: string | null
}

interface QualitySummary {
  generated_at: string; total: number; passed: number; failed: number; warning: number; not_run: number
  pass_rate: number                                // passed / (passed + failed + warning); 0 when none executed
  by_layer: Record<DataLayer, { passed: number; failed: number; warning: number }>
  stale_models: number
  failing_checks: QualityCheck[]                   // failed first, then warning; each group sorted by failing_rows desc
}

interface Overview {
  generated_at: string
  sources: { total: number; healthy: number; degraded: number; unhealthy: number; paused: number }
  runs_24h: { total: number; succeeded: number; failed: number; running: number }  // running counts queued + running
  last_successful_sync_at: string | null
  freshness: { fresh: number; stale: number; unknown: number; items: FreshnessItem[] }
  models: { total: number; bronze: number; silver: number; gold: number; analytical_tables: number }
  recent_runs: RunSummary[]
  failed_runs: RunSummary[]
  upcoming_schedules: UpcomingSchedule[]
  recent_transformation_runs: RunSummary[]
  recent_analytics: RecentAnalyticsItem[]
  latest_audit_events: AuditEvent[]
  run_trend: { date: string; succeeded: number; failed: number }[]   // date = "YYYY-MM-DD" in the workspace timezone
  quality: QualitySummary
}
```

**Notifications**

```ts
type NotificationType = 'pipeline_failed' | 'sync_completed' | 'repeated_retries'
                      | 'quality_failed' | 'schema_changed' | 'stale_data'
type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

interface Notification {
  id: string                // "ntf_01"
  workspace_id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  created_at: string
  read_at: string | null
  resource: { type: ResourceType; id: string; name: string } | null   // the frontend maps this to a route
}

interface NotificationList {          // Paginated<Notification> plus unread_count
  items: Notification[]; page: number; page_size: number; total: number
  unread_count: number                // unread of the `type` filter (or of all types); ignores status and paging
}

interface UpdateNotificationRequest { read: boolean }
interface MarkAllNotificationsReadRequest { workspace_id: string; type?: NotificationType }
interface MarkAllNotificationsReadResponse { updated: number }
```

**Audit**

```ts
type AuditStatus = 'success' | 'failure' | 'denied'
type AuditExportFormat = 'jsonl' | 'txt'

interface AuditChange { field: string; before: unknown; after: unknown }   // secret fields carry "[secret ...]" markers, never values

interface AuditEvent {
  id: string                // "aud_c1"
  workspace_id: string
  workspace_name: string
  occurred_at: string
  actor: ActorRef
  action: string            // dotted verb, e.g. "workspace.updated", "pipeline.run_failed"
  resource: { type: string; id: string; name: string }   // type is free-form: "workspace", "session", "permission", "audit_log", "member", "integration", ...
  status: AuditStatus
  execution_id: string | null   // run id when the event is about a run
  ip_address: string | null     // null for non-user actors, or when the workspace hides IPs
  changes: AuditChange[]
  metadata: Record<string, unknown>
}

interface AuditFacets {
  actors: { id: string; name: string; type: string }[]   // sorted by name
  resource_types: string[]                               // sorted
  actions: string[]                                      // sorted
}

interface Paginated<T> { items: T[]; page: number; page_size: number; total: number }
```

**Audit action strings emitted by the endpoints in this section:** `auth.login`, `auth.logout`, `workspace.created`, `workspace.updated`, `workspace.onboarding_updated`, `workspace.onboarding_completed`, `audit.exported` and `access.denied` (from PERM_403 on any route). The seed also contains `auth.login_failed` (status `failure`, `metadata.reason = "invalid_password"`), but no handler emits it. See the open questions.

---

### 1.2 Health

#### `GET /api/v1/health`
Liveness probe. It returns the API version and server time.
- **Permission:** public (no session needed).
- **Response:** `200 HealthResponse`.
  ```json
  { "status": "ok", "version": "0.1.0-mock", "time": "2026-10-28T09:15:00Z" }
  ```
- **Errors:** none in the mock. `500 internal_error` if the process cannot answer.
- **Side effects:** none.
- **Backend notes:** keep it cheap, with no database call. The frontend has a service method (`healthService.health`) but never calls it. Expose it at `/api/v1/health` as specified; also exposing an unversioned `/health` for load balancers is optional.

#### `GET /api/v1/ready`
Readiness probe. It reports whether dependencies are reachable.
- **Permission:** public.
- **Response:** `200 ReadyResponse`.
  ```json
  { "status": "ready", "checks": { "database": "ok", "scheduler": "ok", "worker": "ok" }, "mock": true }
  ```
- **Errors:** the mock always returns 200.
- **Side effects:** none.
- **Backend notes:** check the metadata database, the scheduler and the worker queue (and optionally the warehouse). Return `503` when any check fails, with the failing entries set to a non-`ok` string, for example `{"status":"not_ready","checks":{"database":"ok","worker":"unreachable"}}`. Do not return the `mock` key. Do not reveal hostnames or credentials. The frontend does not call this endpoint today.

---

### 1.3 Authentication

#### `POST /api/v1/auth/login`
Signs in with email and password. It returns the new session and sets the session cookie.
- **Permission:** public.
- **Request body:** `LoginRequest`.
  - `email` (string, required): must match `^\S+@\S+\.\S+$`. Matching against users is case-insensitive.
  - `password` (string, required, non-empty): write-only. Never log it, persist it in plain text or echo it. The mock only checks that the value is truthy; the backend should also require a string.
  - Validation runs before the credential check, so a 422 is returned even for unknown accounts.
- **Response:** `200 LoginResponse`. The backend sets an HttpOnly, Secure, SameSite session cookie. `access_token` is `null` for cookie deployments.
  ```json
  {
    "session": {
      "user": { "id": "usr_ananya", "email": "ananya.rao@acme-distributors.example", "name": "Ananya Rao", "avatar_url": null },
      "memberships": [
        { "workspace_id": "ws_acme", "workspace_name": "Acme Distributors", "role": "owner" },
        { "workspace_id": "ws_northwind", "workspace_name": "Northwind Retail", "role": "owner" }
      ],
      "expires_at": "2026-10-28T17:15:00Z"
    },
    "access_token": null
  }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 422 | `validation_error` | `email` is missing or invalid (field `email`, "Enter a valid email address."), or `password` is empty (field `password`, "Enter your password."). Both errors can be returned together. |
  | 401 | `unauthenticated` | Wrong credentials. Message: "Incorrect email or password." The mock fails only when the password is the literal `wrong`. |

- **Side effects:** records `auth.login` (resource `{type:"session", id:"web", name:"Web session"}`, status `success`) once **in every workspace the user is an active member of**.
- **Backend notes:**
  - The demo accepts any password and signs an unknown email in as the default user (`usr_ananya`). The real backend must verify a password hash (argon2id or bcrypt) and return the same 401 message for an unknown email and for a wrong password, so that accounts cannot be enumerated.
  - Rate-limit by IP and by account (suggested: 10 attempts per 15 minutes), with lockout or backoff.
  - Record a failed attempt as `auth.login_failed` (status `failure`, `metadata.reason`) for known users. The seed shows this event, but the mock never emits it.
  - Rotate the session id on login (session fixation). With cookie auth, add CSRF protection on state-changing routes: SameSite=Lax or Strict plus an Origin check or a CSRF token.
  - The demo "role override" control (`demoSession.roleOverride`) is mock-only. Ignore it.
  - **Used by:** sign-in page (`/login`), via `AuthProvider.login`.

#### `POST /api/v1/auth/logout`
Ends the current session. It is idempotent.
- **Permission:** public. It succeeds even without a valid session.
- **Request body:** none.
- **Response:** `200 { "ok": true }`.
- **Errors:** none (by design).
- **Side effects:** when a session existed, records `auth.logout` (resource `{type:"session", id:"web", name:"Web session"}`) in every workspace the user is an active member of.
- **Backend notes:** revoke the session server-side and clear the cookie (`Set-Cookie` with `Max-Age=0`). If bearer tokens are issued, revoke the token. The client clears its own cache whatever the outcome.

#### `GET /api/v1/auth/me`
Returns the current session. Called on app load and after workspace creation.
- **Permission:** authenticated.
- **Response:** `200 Session`. The example has the same shape as `LoginResponse.session` above.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session, an expired session, or the user no longer exists. The frontend treats 401 here as "signed out", not as an error. |

- **Side effects:** none.
- **Backend notes:** list only memberships with status `active` (the seeded invited member `usr_meera` is excluded). The mock recomputes `expires_at` as now + 8 hours on every call, which amounts to a sliding session. Decide whether `/auth/me` extends the session or reports the fixed expiry, and document the choice. The client caches the session for 5 minutes.

---

### 1.4 Workspaces

#### `GET /api/v1/workspaces`
Lists the workspaces the caller is an active member of.
- **Permission:** authenticated.
- **Response:** `200 Workspace[]`. This is a plain array, not paginated. Each item includes the caller's `current_user_role`, `permissions` and `onboarding`.
  ```json
  [
    {
      "id": "ws_acme", "name": "Acme Distributors", "slug": "acme-distributors", "industry": "Wholesale distribution",
      "region": "ap-south-1 (Mumbai)", "timezone": "Asia/Kolkata", "plan": "growth", "created_at": "2026-06-08T09:00:00Z",
      "current_user_role": "owner",
      "permissions": ["workspace:manage", "members:manage", "sources:write", "...", "settings:manage"],
      "onboarding": { "steps": { "source": true, "destination": true, "ingestion": true, "transformation": true, "analytics": false }, "completed_at": null, "dismissed": false }
    },
    {
      "id": "ws_northwind", "name": "Northwind Retail", "slug": "northwind-retail", "industry": "Retail",
      "region": "ap-south-1 (Mumbai)", "timezone": "Asia/Kolkata", "plan": "starter", "created_at": "2026-10-27T07:15:00Z",
      "current_user_role": "owner", "permissions": ["workspace:manage", "..."],
      "onboarding": { "steps": { "source": false, "destination": false, "ingestion": false, "transformation": false, "analytics": false }, "completed_at": null, "dismissed": false }
    }
  ]
  ```
- **Errors:** 401 UNAUTH.
- **Side effects:** none.
- **Backend notes:** the number of workspaces per user is small, so the array is not paginated. If that changes, add pagination before users reach about 100 workspaces.

#### `POST /api/v1/workspaces`
Creates a workspace and makes the caller its owner.
- **Permission:** authenticated. Any signed-in user can create a workspace.
- **Request body:** `CreateWorkspaceRequest`.
  - `name` (string, required): trimmed, then 2 to 80 characters. The slug is the lower-cased name with every run of non-`[a-z0-9]` characters replaced by `-` and leading or trailing `-` removed. The slug must not be empty (a name of only symbols is rejected).
  - `region` (string, required): exactly one of `"ap-south-1 (Mumbai)"`, `"ap-southeast-1 (Singapore)"`, `"eu-west-1 (Ireland)"` or `"us-east-1 (N. Virginia)"`. The region cannot be changed later.
  - `timezone` (string, required): an IANA zone name. It must match `^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$` and be a zone the runtime knows. Offsets such as `+05:30` are rejected.
  - `industry` (string or null, optional): free text. The mock does not validate it. The frontend offers a fixed list: Wholesale distribution, Retail, Manufacturing, E-commerce, Logistics, Professional services, Healthcare, Hospitality, Education, Other.
- **Response:** `201 Workspace`. The live API answers 201; the mock transport cannot express status codes. In the response, `plan` is `"starter"`, `current_user_role` is `"owner"`, `permissions` is the full owner list and every onboarding step is `false`.
  ```json
  { "id": "ws_9f2k1c7a", "name": "Coastal Foods", "slug": "coastal-foods", "industry": "Wholesale distribution", "region": "ap-south-1 (Mumbai)", "timezone": "Asia/Kolkata", "plan": "starter", "created_at": "2026-10-28T09:20:00Z", "current_user_role": "owner", "permissions": ["workspace:manage", "..."], "onboarding": { "steps": { "source": false, "destination": false, "ingestion": false, "transformation": false, "analytics": false }, "completed_at": null, "dismissed": false } }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | Field `name`: "Workspace name must be at least 2 characters." / "Workspace name must be at most 80 characters." / "Workspace name must contain letters or digits.". Field `region`: "region must be one of ...". Field `timezone`: "Choose a valid IANA timezone, for example Asia/Kolkata.". All field errors are returned together. |
  | 409 | `workspace_exists` | Another workspace already has the same slug. Message: `A workspace named "<name>" already exists.` The response also carries `details: { slug }` and `field_errors: [{ field: "name", message }]`, so the form can show the error inline. |

- **Side effects:**
  - Creates an `owner` membership (status `active`) for the caller.
  - Creates the default workspace settings: no integrations configured, and the scheduler default timezone set to the workspace timezone.
  - Records `workspace.created` (resource `{type:"workspace", id, name}`).
  - Sends no notifications, creates no schedules and starts no runs.
- **Backend notes:**
  - The slug check in the mock is global across all workspaces. Decide whether slugs must be unique globally (needed if they ever appear in URLs or subdomains) or only per user.
  - Provision the tenant in the same transaction or a follow-up job: the warehouse schema or database in the chosen region, and the default settings row.
  - Make creation idempotent against double submit, for example with an `Idempotency-Key` header.
  - The client refetches `GET /auth/me` afterwards, so that endpoint must list the new membership immediately.

#### `GET /api/v1/workspaces/{workspace_id}`
Returns one workspace, with the caller's role, permissions and onboarding state. The frontend gates every page under `/w/:workspaceId` on this call.
- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace id, e.g. `ws_acme`. |

- **Response:** `200 Workspace`. Same shape as the list items above.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. The frontend shows "Workspace not found". |
  | 403 | `forbidden` | Not an active member. The frontend shows "You do not have access to this workspace". |

- **Side effects:** none.
- **Backend notes:** `permissions` is what the UI uses to enable controls. It must be computed from the same matrix the backend enforces.

#### `PATCH /api/v1/workspaces/{workspace_id}`
Updates the workspace name, industry or timezone.
- **Permission:** `workspace:manage` (owner only; admins get 403).
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateWorkspaceRequest`. Every key is optional, and omitted keys are left unchanged.
  - `name` (string): trimmed, 2 to 80 characters (same length messages as create). The create-only rule "Workspace name must contain letters or digits." is **not** applied here, so the mock accepts a symbols-only rename such as `"!!"`. The backend should apply the same rule on update. A `null` name fails the length rule.
  - `timezone` (string): IANA zone (same rule as create). `null` is rejected.
  - `industry` (string or null): `null` clears it. The mock does not validate it. The settings form limits it to 80 characters.
  - Any other key (`region`, `plan`, `slug`, `onboarding`) is silently ignored.
- **Response:** `200 Workspace` (the updated view).
  ```json
  { "id": "ws_acme", "name": "Acme Distributors Pvt Ltd", "slug": "acme-distributors", "industry": "Wholesale distribution", "region": "ap-south-1 (Mumbai)", "timezone": "Asia/Kolkata", "plan": "growth", "created_at": "2026-06-08T09:00:00Z", "current_user_role": "owner", "permissions": ["workspace:manage", "..."], "onboarding": { "steps": { "source": true, "destination": true, "ingestion": true, "transformation": true, "analytics": false }, "completed_at": null, "dismissed": false } }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member, or the caller lacks `workspace:manage` (records `access.denied`). The permission check runs **before** validation. |
  | 422 | `validation_error` | Field `name` or `timezone` is invalid. |

- **Side effects:** records `workspace.updated` with `changes` listing only the fields whose values differ, for example `[{"field":"name","before":"Acme Distributors","after":"Acme Distributors Pvt Ltd"}]`. The mock records the event even when nothing changed (with `changes: []`).
- **Backend notes:**
  - A rename does not change the slug and is not checked for uniqueness. Decide whether a rename should be checked against `workspace_exists`.
  - Decide whether a timezone change should also update the scheduler default timezone. In the mock it does not.
  - Consider skipping the audit event when `changes` is empty.

#### `GET /api/v1/workspaces/{workspace_id}/onboarding`
Returns the onboarding state on its own.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 OnboardingState`.
  ```json
  { "steps": { "source": false, "destination": false, "ingestion": false, "transformation": false, "analytics": false }, "completed_at": null, "dismissed": false }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none.
- **Backend notes:** no frontend screen calls this today (`workspaceService.getOnboarding` is unused), because `Workspace.onboarding` carries the same data. It is low priority.

#### `PATCH /api/v1/workspaces/{workspace_id}/onboarding`
Marks one onboarding step complete or incomplete, or dismisses or restores the overview checklist.
- **Permission:** depends on the body. Each part needs the permission of the setting it stands for:

  | Body part | Permission |
  |---|---|
  | `step: "source"` or `"ingestion"` | `sources:write` |
  | `step: "destination"`, `"transformation"` or `"analytics"` | `settings:manage` |
  | `dismissed` present | `settings:manage` |

  When the body has both a `step` and `dismissed`, both permissions are required. In effect, only owners and admins can change onboarding state.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateOnboardingRequest`.
  - At least one of `step` or `dismissed` is required.
  - `step` (enum `OnboardingStepKey`, optional).
  - `completed` (boolean, optional, default `true`): the new value for `steps[step]`. It is ignored when no `step` is given.
  - `dismissed` (boolean, optional).
  - Type errors on `completed` or `dismissed` give 422.
- **Response:** `200 OnboardingState` (after the update). The server recomputes `completed_at`: it is set to now the first time all five steps are true, keeps its value while they stay true, and goes back to `null` as soon as any step is false.
  ```json
  { "steps": { "source": true, "destination": true, "ingestion": true, "transformation": true, "analytics": true }, "completed_at": "2026-10-28T09:31:00Z", "dismissed": false }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member (checked first). |
  | 422 | `validation_error` | Field `step`: "Provide a step to update or a dismissed flag." or "step must be one of source, destination, ingestion, transformation, analytics.". Field `completed`: "completed must be true or false.". Field `dismissed`: "dismissed must be true or false.". Validation runs **before** the permission checks below. |
  | 403 | `forbidden` | The caller lacks the step's permission or `settings:manage` for `dismissed` (records `access.denied`). |

- **Side effects:**
  - Records `workspace.onboarding_updated` only when a value actually changes. `changes` uses field names `steps.<step>` and `dismissed`, for example `[{"field":"steps.analytics","before":false,"after":true}]`.
  - When the update completes onboarding (`completed_at` goes from null to set), it also records `workspace.onboarding_completed` with `metadata: { completed_at }`.
  - Other sections also write these flags server-side: `POST /workspaces/{id}/sources` sets `steps.source = true`, and saving a configured destination in settings sets `steps.destination = true`.
- **Backend notes:**
  - Consider deriving step completion from real state (a source exists, the destination test passed, a dbt project test passed, Metabase is reachable) instead of trusting the client. The frontend marks the transformation step only after a passing dbt test.
  - When other endpoints set a step, they should also recompute `completed_at` and emit `workspace.onboarding_completed`. The mock does not do this in those paths.

---

### 1.5 Search

#### `GET /api/v1/workspaces/{workspace_id}/search`
Workspace-wide search across named resources. It feeds the command palette.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | `""` | Search text. It is trimmed and lower-cased. With fewer than 2 characters the response is 200 with empty `results`, not an error. |

- **Response:** `200 SearchResponse`. `query` echoes the trimmed, lower-cased text. `results` holds at most 30 items, in group order: sources, pipelines, models, transformations, schedules, dashboards, reports. Seed order applies inside each group, and there is no relevance ranking. Matching is a case-insensitive substring match on these fields:

  | type | Fields matched | `title` | `subtitle` |
  |---|---|---|---|
  | `source` | name, connector_type | name | `Source · <connector display name>` |
  | `pipeline` | name, description | name | `Pipeline` |
  | `model` | name, `schema.name`, description | `schema.name` | `<Layer> model · <role>` |
  | `transformation` | name, dbt unique_id | name | `dbt <type> model` (type: staging, intermediate, silver, gold) |
  | `schedule` | name, target_name | name | `Schedule` |
  | `dashboard` | name, description | name | `Dashboard · <Business area>` |
  | `report` | name, description | name | `Report · <Business area>` |

  Example (abridged):
  ```json
  { "query": "invoice", "results": [
    { "type": "pipeline", "id": "pl_finance", "title": "Finance and Receivables", "subtitle": "Pipeline" },
    { "type": "model", "id": "mdl_g_fct_invoices", "title": "gold.fct_invoices", "subtitle": "Gold model · fact" },
    { "type": "transformation", "id": "trf_fct_invoices", "title": "fct_invoices", "subtitle": "dbt gold model" },
    { "type": "report", "id": "rpt_overdue", "title": "Invoices overdue more than 60 days", "subtitle": "Report · Finance" }
  ] }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none.
- **Backend notes:**
  - The mock does not scope transformations by workspace: it returns them only for `ws_acme`, because the seed transformations have no `workspace_id`. The backend must filter every type by workspace.
  - Use a proper index (Postgres `pg_trgm` or full-text search) and rank by relevance.
  - The client cancels stale requests with `AbortSignal` and debounces input. A per-user rate limit (for example 10 requests per second) is sufficient.
  - Results contain no row data, only resource names, so no permission filtering beyond membership is needed today.

---

### 1.6 Overview

#### `GET /api/v1/workspaces/{workspace_id}/overview`
A single aggregate for the workspace home page: health counts, recent and failed runs, freshness, model counts, upcoming schedules, recent analytics, latest audit events, a 14-day run trend and the quality summary.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 Overview`. The fields are computed as follows. "Runs" means the workspace's runs, sorted by `queued_at` descending.

  | Field | Rule |
  |---|---|
  | `sources.*` | Count of the workspace's sources by `health` (`healthy`, `degraded`, `unhealthy`, `paused`). Sources with `unknown` health count toward `total` only. |
  | `runs_24h` | Runs with `queued_at` within the last 24 h. `running` counts `queued` + `running`. |
  | `last_successful_sync_at` | Max `last_successful_sync_at` across the sources. |
  | `freshness.fresh/stale/unknown` | Counts across all models (all layers). |
  | `freshness.items` | Up to 8 **bronze and gold** models with a non-null SLA. Stale first, then fresh, then unknown; within each group, oldest `last_refreshed_at` first, and a model that was never refreshed (`null`) sorts before any refreshed one. |
  | `models` | Counts per layer. `analytical_tables` = non-bronze models whose materialization is not `view`. |
  | `recent_runs` | Latest 8 runs of kind `pipeline` or `ingestion`. |
  | `failed_runs` | Up to 5 runs with status `failed`, queued in the last 7 days, **excluding failures that a later run retried** (any run whose id appears as another run's `retry_of`). |
  | `upcoming_schedules` | The 6 enabled schedules with the soonest `next_run_at` (cron evaluated in the schedule timezone). |
  | `recent_transformation_runs` | Latest 6 runs of kind `transformation` or `dbt_test`. |
  | `recent_analytics` | Up to 6 dashboards and reports with a `last_viewed_at`, most recent first. |
  | `latest_audit_events` | The 8 most recent audit events. Retention and IP settings are **not** applied here (see the open questions). |
  | `run_trend` | 14 daily buckets ending today, keyed `YYYY-MM-DD` in the **workspace timezone**. Counts `succeeded` and `failed` runs of kind `pipeline` or `ingestion`, bucketed by `queued_at`. |
  | `quality` | `QualitySummary` over all checks of the workspace's models. |

  Example (Acme, abridged). Source and model counts match the seed; the run, freshness and quality counts are illustrative, because they depend on when the seed was loaded:
  ```json
  {
    "generated_at": "2026-10-28T09:15:00Z",
    "sources": { "total": 4, "healthy": 1, "degraded": 1, "unhealthy": 1, "paused": 1 },
    "runs_24h": { "total": 19, "succeeded": 15, "failed": 3, "running": 1 },
    "last_successful_sync_at": "2026-10-28T08:56:00Z",
    "freshness": { "fresh": 34, "stale": 4, "unknown": 3, "items": [
      { "model_id": "mdl_g_agg_receivables_aging", "name": "agg_receivables_aging", "layer": "gold", "last_refreshed_at": "2026-10-27T02:15:00Z", "sla_minutes": 1440, "status": "stale" }
    ] },
    "models": { "total": 41, "bronze": 15, "silver": 15, "gold": 11, "analytical_tables": 15 },
    "recent_runs": [
      { "id": "run_k3x9q2mf", "kind": "pipeline", "status": "running", "trigger": "manual", "target_name": "Inventory Daily", "pipeline_id": "pl_inventory", "source_id": "src_erp", "transformation_id": null, "queued_at": "2026-10-28T09:14:48Z", "started_at": "2026-10-28T09:14:51Z", "finished_at": null, "duration_seconds": null, "attempt": 1, "error_message": null, "retryable": null }
    ],
    "failed_runs": [
      { "id": "run_fin_000", "kind": "pipeline", "status": "failed", "trigger": "schedule", "target_name": "Finance and Receivables", "pipeline_id": "pl_finance", "source_id": "src_erp", "transformation_id": null, "queued_at": "2026-10-28T06:00:00Z", "started_at": "2026-10-28T06:00:04Z", "finished_at": "2026-10-28T06:11:40Z", "duration_seconds": 696, "attempt": 1, "error_message": "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", "retryable": true }
    ],
    "upcoming_schedules": [ { "id": "sch_sf_sync", "name": "Salesforce hourly sync", "target_type": "source_sync", "target_name": "Salesforce Production", "next_run_at": "2026-10-28T09:30:00Z" } ],
    "recent_transformation_runs": [],
    "recent_analytics": [ { "id": "dsh_exec_revenue", "kind": "dashboard", "name": "Executive Revenue Overview", "business_area": "finance", "accessed_at": "2026-10-28T08:33:00Z" } ],
    "latest_audit_events": [],
    "run_trend": [ { "date": "2026-10-15", "succeeded": 14, "failed": 1 } ],
    "quality": { "generated_at": "2026-10-28T09:15:00Z", "total": 48, "passed": 41, "failed": 1, "warning": 2, "not_run": 4, "pass_rate": 0.93, "by_layer": { "bronze": { "passed": 10, "failed": 0, "warning": 0 }, "silver": { "passed": 14, "failed": 0, "warning": 1 }, "gold": { "passed": 17, "failed": 1, "warning": 1 } }, "stale_models": 4, "failing_checks": [] }
  }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none. It does not start runs. (The mock advances simulated runs before every request; this is a simulation artifact.)
- **Async:** read-only. While any listed run is `queued` or `running`, or `runs_24h.running > 0`, the client polls this endpoint every 3 seconds. Clients follow individual runs with `GET /runs/{run_id}`.
- **Backend notes:**
  - This endpoint is polled, so it must be cheap. Precompute the counters or cache them for a few seconds per workspace, and keep p95 under 300 ms.
  - Bucket `run_trend` in the workspace timezone, not UTC.
  - `recent_analytics` uses `last_viewed_at`, which is workspace-wide in the mock. In production it should be per user, or the field should be renamed to reflect that it is workspace-wide.

---

### 1.7 Notifications

Notifications are created server-side when runs settle:
- A failed run of **any** kind (ingestion, pipeline, transformation, dbt_test, schema_apply) creates one notification with severity `critical` and resource `{type:"run", id:<run id>, name:<target name>}`. Its type is `repeated_retries` when `attempt >= 3` (this takes precedence), otherwise `quality_failed` when the run failed at the `quality_checks` stage, otherwise `pipeline_failed`.
- A successful `ingestion` or `pipeline` run creates `sync_completed` (severity `success`). Its resource is the run for a pipeline run, or the source for an ingestion run.
- Cancelled runs and successful transformation, dbt_test or schema_apply runs create nothing.

Creation honours the in-app preference of the notification type (see the settings section). The frontend polls the list, the tab counts and the unread badge every 30 seconds.

#### `GET /api/v1/notifications`
Lists one workspace's notifications, newest first, with an unread count.
- **Permission:** any member of `workspace_id`.
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `workspace_id` | string | yes | — | Workspace to list. |
  | `status` | `all` \| `unread` \| `read` | no | `all` | Read-state filter. Only an absent parameter defaults to `all`; an empty string (`status=`) gives 422. |
  | `type` | `NotificationType` | no | — | Type filter. An empty string means no filter. |
  | `page` | integer | no | `1` | 1-based. Non-numeric or non-positive values fall back to 1. The mock does not floor fractional values; the backend should require an integer. |
  | `page_size` | integer | no | `20` | Silently clamped to a maximum of 500. Non-numeric or non-positive values fall back to 20. Not floored in the mock either. |

- **Response:** `200 NotificationList`. Items are sorted by `created_at` descending. `unread_count` counts unread notifications of the given `type` (or of all types) and ignores `status` and paging. The frontend gets badge counts from a call with `page_size=1`.
  ```json
  {
    "items": [
      { "id": "ntf_01", "workspace_id": "ws_acme", "type": "quality_failed", "severity": "critical", "title": "Data quality check failed: fct_invoices", "message": "unique_fct_invoices_invoice_id failed with 14 duplicate rows. The Finance pipeline stopped before refreshing Metabase.", "created_at": "2026-10-28T06:12:00Z", "read_at": null, "resource": { "type": "model", "id": "mdl_g_fct_invoices", "name": "gold.fct_invoices" } },
      { "id": "ntf_02", "workspace_id": "ws_acme", "type": "pipeline_failed", "severity": "critical", "title": "Finance and Receivables failed", "message": "Run run_fin_000 failed at Data quality checks.", "created_at": "2026-10-28T06:12:00Z", "read_at": null, "resource": { "type": "run", "id": "run_fin_000", "name": "Finance and Receivables" } }
    ],
    "page": 1, "page_size": 20, "total": 12, "unread_count": 6
  }
  ```
- **Errors** (in check order; each 422 carries a single field error, they are not batched):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | Field `workspace_id`: "workspace_id is required." (missing or empty). |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | Field `status`: "status must be one of all, unread, read.". |
  | 422 | `validation_error` | Field `type`: "type must be one of pipeline_failed, sync_completed, repeated_retries, quality_failed, schema_changed, stale_data.". |

- **Side effects:** none.
- **Backend notes:**
  - **Read state is per workspace in the mock, but must be per user.** Model it as a per-recipient inbox (`notification_recipients(user_id, notification_id, read_at)`) and return only the caller's rows.
  - The mock applies in-app preferences of whichever user is signed in at the moment a run settles. The backend must fan out to each member according to that member's own preferences.
  - Index on `(workspace_id, user_id, read_at, created_at desc)`.
  - The workspace is passed as a query parameter here, unlike the path-scoped routes elsewhere. Keep the path as written, since the frontend depends on it.

#### `PATCH /api/v1/notifications/{notification_id}`
Marks one notification as read or unread.
- **Permission:** any member of the notification's workspace.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `notification_id` | string | yes | e.g. `ntf_03`. |

- **Request body:** `UpdateNotificationRequest`: `{ read: boolean }` (required, must be a boolean).
- **Response:** `200 Notification`. Setting `read: true` keeps an existing `read_at`, so the call is idempotent. `read: false` sets `read_at` to `null`.
  ```json
  { "id": "ntf_03", "workspace_id": "ws_acme", "type": "repeated_retries", "severity": "critical", "title": "Web Orders failed after 3 attempts", "message": "Authentication to Web Orders DB keeps failing. Update the stored password to resume syncs.", "created_at": "2026-10-28T02:15:00Z", "read_at": "2026-10-28T09:16:00Z", "resource": { "type": "source", "id": "src_web_orders", "name": "Web Orders DB" } }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown id: `Notification "<id>" was not found.` |
  | 403 | `forbidden` | Not a member of the notification's workspace. |
  | 422 | `validation_error` | Field `read`: "read must be true or false." |

- **Side effects:** none (no audit event).
- **Backend notes:** update only the caller's recipient row. Return 404 rather than 403 for a notification the caller has never received.

#### `POST /api/v1/notifications/mark-all-read`
Marks every unread notification in a workspace as read, or only the unread ones of one type.
- **Permission:** any member of `workspace_id`.
- **Request body:** `MarkAllNotificationsReadRequest`.
  - `workspace_id` (string, required).
  - `type` (`NotificationType`, optional): when given, only unread notifications of that type are marked.
- **Response:** `200 MarkAllNotificationsReadResponse`.
  ```json
  { "updated": 6 }
  ```
- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | Field `workspace_id`: "workspace_id is required." (missing, empty or not a string). |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | Field `type`: "type must be one of pipeline_failed, sync_completed, repeated_retries, quality_failed, schema_changed, stale_data.". A `null` or empty-string `type` means no filter. |

- **Side effects:** none (no audit event).
- **Backend notes:**
  - In FastAPI, register this route **before** `PATCH /notifications/{notification_id}`. They do not clash, because the methods differ, but keep the literal segment first.
  - Run it as a single `UPDATE` scoped to the caller's recipient rows.
  - It is safe to retry, since `updated` is 0 on the second call.

---

### 1.8 Audit

All three endpoints apply the workspace retention settings (`settings.retention`, see the settings section):
- Events older than `retention_days` are hidden.
- When `include_ip_addresses` is `false`, `ip_address` is returned as `null`.

The list and export endpoints share these filters:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | string | no | — | Trimmed, case-insensitive substring match on action, resource name, resource id, actor name, actor email and execution_id. |
| `actor_id` | string | no | — | Exact match on `actor.id`. |
| `resource_type` | string | no | — | Exact match on `resource.type`. |
| `action` | string | no | — | Exact match. A value ending in `.` or `.*` is a prefix match (`pipeline.` or `pipeline.*` matches every `pipeline.` action). |
| `status` | `success` \| `failure` \| `denied` | no | — | Exact match. |
| `from` | ISO 8601 timestamp | no | — | Inclusive lower bound on `occurred_at`. |
| `to` | ISO 8601 timestamp | no | — | Inclusive upper bound on `occurred_at`. `from` must be earlier than or equal to `to`. |

Results are sorted by `occurred_at` descending.

#### `GET /api/v1/workspaces/{workspace_id}/audit-events`
A paged, filtered list of audit events.
- **Permission:** any workspace member. Viewers can read the audit trail.
- **Path params:** `workspace_id` (string, required).
- **Query params:** the shared filters above, plus:

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `page` | integer | no | `1` | Floored. Values below 1 or non-numeric values become 1. A page past the end returns empty `items`. |
  | `page_size` | integer | no | `25` | Floored, with a minimum of 1 (non-positive or non-numeric values become 25). **A value above 200 returns 422.** |

- **Response:** `200 Paginated<AuditEvent>`.
  ```json
  {
    "items": [
      { "id": "aud_c1", "workspace_id": "ws_acme", "workspace_name": "Acme Distributors", "occurred_at": "2026-10-28T06:11:40Z", "actor": { "type": "scheduler", "id": "svc_scheduler", "name": "Scheduler" }, "action": "pipeline.run_failed", "resource": { "type": "pipeline", "id": "pl_finance", "name": "Finance and Receivables" }, "status": "failure", "execution_id": "run_fin_000", "ip_address": null, "changes": [], "metadata": { "stage": "quality_checks", "failing_test": "unique_fct_invoices_invoice_id" } },
      { "id": "aud_c5", "workspace_id": "ws_acme", "workspace_name": "Acme Distributors", "occurred_at": "2026-10-25T09:15:00Z", "actor": { "type": "user", "id": "usr_priya", "name": "Priya Nair", "email": "priya.nair@acme-distributors.example" }, "action": "source.created", "resource": { "type": "source", "id": "src_web_orders", "name": "Web Orders DB" }, "status": "success", "execution_id": null, "ip_address": "49.36.112.7", "changes": [ { "field": "connector_type", "before": null, "after": "postgres" }, { "field": "password", "before": null, "after": "[secret set]" } ], "metadata": {} }
    ],
    "page": 1, "page_size": 25, "total": 136
  }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | Field `page_size`: "page_size must be between 1 and 200." This is checked on its own, before the filters. |
  | 422 | `validation_error` | Filter errors, returned together in one response: field `status`: "status must be one of success, failure, denied."; field `from` or `to`: "<field> must be an ISO 8601 timestamp, e.g. 2026-10-28T00:00:00Z."; field `from`: "from must be earlier than or equal to to.". |

- **Side effects:** none. Reading the audit log is not itself audited.
- **Backend notes:**
  - The audit page polls this endpoint every 30 seconds with `page_size=25`.
  - The store must be append-only: no update or delete API, and a database role without UPDATE or DELETE.
  - Index on `(workspace_id, occurred_at desc)` plus the filter columns. Use trigram or full-text search for `q`.
  - Offset paging is acceptable up to the 200-row page cap. Consider keyset paging for deep pages.
  - Enforce retention with a purge job as well as at read time.
  - Never write secret values into `changes`. Use `[secret set]`, `[secret updated]` or `[secret cleared]` markers.

#### `GET /api/v1/workspaces/{workspace_id}/audit-events/facets`
Distinct actors, resource types and actions among the retained events. It fills the filter dropdowns.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 AuditFacets`. Actors are de-duplicated by id and sorted by name. Resource types and actions are sorted. Retention applies; the other filters do not. Example (abridged):
  ```json
  {
    "actors": [ { "id": "usr_ananya", "name": "Ananya Rao", "type": "user" }, { "id": "svc_ingestion", "name": "Ingestion service", "type": "service" }, { "id": "usr_karan", "name": "Karan Shah", "type": "user" }, { "id": "svc_scheduler", "name": "Scheduler", "type": "scheduler" } ],
    "resource_types": ["audit_log", "dashboard", "integration", "mapping", "member", "model", "pipeline", "report", "schedule", "session", "source", "transformation"],
    "actions": ["audit.exported", "auth.login", "auth.login_failed", "dashboard.viewed", "pipeline.run_failed", "pipeline.run_triggered", "source.created"]
  }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none.
- **Backend notes:** the client caches this for 60 seconds. Back it with `SELECT DISTINCT` on indexed columns, or a small materialized table refreshed when events are written.

#### `GET /api/v1/workspaces/{workspace_id}/audit-events/export`
Downloads the filtered audit events as a file.
- **Permission:** `audit:export` (owner, admin).
- **Path params:** `workspace_id` (string, required).
- **Query params:** the shared filters above, plus:

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `format` | `jsonl` \| `txt` | yes | — | File format. |

  `page` and `page_size` are ignored.
- **Response:** `200` with a file body, not JSON. The client requests it as a blob with a 120-second timeout.
  - `format=jsonl`: `Content-Type: application/x-ndjson`. Line 1 is a metadata record; each following line is one `AuditEvent`.
    ```
    {"record_type":"export_metadata","demo":true,"generated_at":"2026-10-28T09:20:00Z","workspace_id":"ws_acme","workspace_name":"Acme Distributors","filters":{"action":"pipeline.","status":"failure"},"row_count":14,"truncated":false,"note":"Demo export of simulated audit events from the Graphite mock API"}
    {"id":"aud_c1","workspace_id":"ws_acme",...,"action":"pipeline.run_failed",...}
    ```
  - `format=txt`: `Content-Type: text/plain`. The mock header block is, line by line: `DEMO EXPORT - simulated audit events`, a `Source: Graphite mock API...` disclaimer, `Generated at: <iso>`, `Workspace: <name> (<id>)`, `Filters: k=v, ...` (or `none`), `Events: <n>` (plus ` (truncated to the 10000 most recent)` when truncated), and `Columns: timestamp | actor | action | resource | status | execution id | changes`. A 96-character rule of `-` follows, then one line per event. The actor column is `<name> <<email>> (<type>)` for users and `<name> (<type>)` otherwise. The changes column is `field: before -> after` joined by `; `, or `-` when empty. Example: `2026-10-28T06:11:40Z | Scheduler (scheduler) | pipeline.run_failed | pipeline "Finance and Receivables" (pl_finance) | failure | run_fin_000 | -`.
  - At most 10,000 rows, the most recent first. `truncated` is true when more rows matched.
  - Change fields whose name matches `/(password|secret|token|api_?key|private_?key|credential)/i` are redacted in both formats: a `[secret ...]` marker string is kept as is, a `null` value becomes the string `"null"`, and any other value becomes `[redacted]`. Other fields are unchanged in `jsonl`.
- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member, or the caller lacks `audit:export` (records `access.denied`). |
  | 422 | `validation_error` | Field `format`: "format must be one of jsonl, txt.". |
  | 409 | `audit_export_disabled` | `settings.retention.export_enabled` is false. Message: "Audit exports are turned off for this workspace. An admin can enable them in Settings > Audit retention." |
  | 422 | `validation_error` | Invalid filters (same messages as the list endpoint). |

- **Side effects:** records `audit.exported` (resource `{type:"audit_log", id:"audit", name:"Audit log"}`, `metadata: { format, row_count, truncated, filters, demo: true }`). The event is written after the rows are selected, so the file never contains its own export event.
- **Backend notes:**
  - Stream the response and set `Content-Disposition: attachment; filename="audit-<workspace-slug>-<yyyymmddThhmmZ>.<jsonl|txt>"`.
  - Drop the demo markers: the `demo` key, the `note` text, and the "DEMO EXPORT" / "simulated" header lines in `txt`. Do not write `demo: true` into the audit metadata.
  - For very large ranges, consider an async export job that produces a signed download URL. Keep the synchronous path for up to 10,000 rows, since the frontend expects a direct file.
  - Rate-limit exports per user (for example 5 per minute).
  - The 409 is checked before filter validation. Keep that order, or return all 422s first; either works with the client.

---

### 1.9 Service coverage

| Service method | Endpoint |
|---|---|
| `authService.login` | `POST /auth/login` |
| `authService.logout` | `POST /auth/logout` |
| `authService.me` | `GET /auth/me` |
| `workspaceService.list` | `GET /workspaces` |
| `workspaceService.create` | `POST /workspaces` |
| `workspaceService.get` | `GET /workspaces/{workspace_id}` |
| `workspaceService.update` | `PATCH /workspaces/{workspace_id}` |
| `workspaceService.getOnboarding` | `GET /workspaces/{workspace_id}/onboarding` (no frontend caller) |
| `workspaceService.updateOnboarding` | `PATCH /workspaces/{workspace_id}/onboarding` |
| `workspaceService.search` | `GET /workspaces/{workspace_id}/search` (there is no separate search service) |
| `healthService.health` | `GET /health` (no frontend caller) |
| `healthService.ready` | `GET /ready` (no frontend caller) |
| `overviewService.get` | `GET /workspaces/{workspace_id}/overview` |
| `notificationsService.list` | `GET /notifications` |
| `notificationsService.update` | `PATCH /notifications/{notification_id}` |
| `notificationsService.markAllRead` | `POST /notifications/mark-all-read` |
| `auditService.list` | `GET /workspaces/{workspace_id}/audit-events` |
| `auditService.facets` | `GET /workspaces/{workspace_id}/audit-events/facets` |
| `auditService.export` | `GET /workspaces/{workspace_id}/audit-events/export` |

Every one of the 19 handler routes has a service method, and every service method has a handler.

---

## 2. Data sources and runs

A **source** is a saved connection to an operational system (Salesforce or PostgreSQL today; the other catalog connectors are `coming_soon`). It holds non-secret connection settings, write-only secrets, the Bronze schema it loads into, the tables it replicates (full or incremental) and an optional sync schedule. Every long-running operation (a source sync, a pipeline run, a dbt run or test, a schema apply) is an asynchronous **run**. Triggers return the new run immediately with HTTP 202, and clients poll `GET /runs/{run_id}` and its logs until the run reaches a terminal status.

This section covers 19 endpoints: 14 from `src/mocks/handlers/sources.ts` (`sourcesService`) and 5 from `src/mocks/handlers/runs.ts` (`runsService`). Pipeline triggers, transformation runs and schedule triggers also create runs. Those triggers are documented in their own sections, but the run endpoints below apply to every run.

### 2.0 Conventions used in this section

- All paths are relative to `/api/v1`. JSON keys are snake_case. Timestamps are ISO 8601 UTC strings. IDs are opaque, prefixed strings (`src_…`, `run_…`, `sch_…`, `aud_…`).
- Every non-2xx response uses the standard envelope (`ApiErrorBody`, `src/types/common.ts`):
  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "details": {}, "field_errors": [{ "field": "config.port", "message": "Port must be a whole number between 1 and 65535." }], "request_id": "req_7f3a9c1e" } }
  ```
  `details` and `field_errors` are optional. The client sends an `X-Request-Id` header on every request; echo it as `request_id`.
- **Errors common to every endpoint below.** The per-endpoint tables list them again only where the wording or the trigger is specific:
  | Status | `code` | When |
  |---|---|---|
  | 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." The client treats any 401 as a sign-out. |
  | 403 | `forbidden` | The caller is not an active member of the workspace that owns the resource ("You are not a member of this workspace."), or the caller lacks the required permission ("Your role (editor) does not include the \"sources:write\" permission."). A permission denial also records an `access.denied` audit event with `status: "denied"` and `resource: { type: "permission", id: "<permission>", name: "<permission>" }`. |
  | 404 | `not_found` | The workspace, source or run does not exist. Message pattern: `Source "src_x" was not found.` |
  | 405 | `method_not_allowed` | The path exists but not for this method. |
  | 422 | `validation_error` | Field-level validation failed. `field_errors[].field` is a dotted path into the request body or query (`name`, `config.port`, `selected_tables.2.cursor_field`, `schedule.cron`, `kind`). The frontend places these messages under the matching form fields, so they must be written for end users. |
- **Lookup order.** The mock looks up the source or run first (404), then checks membership and permission (403). A caller can therefore learn that an ID exists in another workspace. The backend may return 404 for both cases.
- **Role matrix** (mock `src/mocks/permissions.ts`; the backend is authoritative): `sources:write` is held by owner and admin. `sources:sync`, `pipelines:run` and `transformations:run` are held by owner, admin and editor. Viewer holds none of them. "Any workspace member" means any active membership, including viewer.
- **Success status codes.** The frontend client treats every 2xx the same way, and treats 204 as "no body". Use 200 for reads and synchronous actions, 201 for creation, 202 for anything that returns a newly queued or asynchronously changing run, and 204 for delete. A 200 with an empty body would break the client, because it calls `response.json()` on every non-204 success.
- **Unknown body fields** are ignored by the mock for top-level request keys. Unknown keys inside `config` are rejected (422).
- Mock-only simulation devices are not part of the contract. Examples are hosts containing `fail`, secrets equal to `wrong`, deterministic latencies and the `simulated: true` audit metadata. They are mentioned only in the backend notes, so the team knows what they stand in for.

### 2.1 Types

Shapes are the JSON wire format and match `src/types/sources.ts`, `src/types/runs.ts` and `src/types/common.ts`.

**Enums**

| Type | Values |
|---|---|
| `ConnectorType` | `salesforce`, `postgres`, `mysql`, `hubspot`, `zoho_crm`, `google_sheets`, `shopify`, `tally`, `razorpay`, `csv_upload` |
| `ConnectorCategory` | `crm`, `database`, `spreadsheet`, `ecommerce`, `finance`, `file` |
| `ConnectorField.type` | `text`, `password`, `number`, `select`, `boolean`, `textarea`, `url` |
| `ConnectorDefinition.status` | `available`, `coming_soon` |
| `IngestionMode` | `full`, `incremental` |
| `SyncFrequency` | `manual`, `hourly`, `every_6_hours`, `daily`, `weekly`, `custom` |
| `SourceStatus` | `active`, `paused`, `error`, `draft` |
| `HealthStatus` | `healthy`, `degraded`, `unhealthy`, `paused`, `unknown` |
| `ConnectionCheck.status` | `passed`, `failed`, `warning` |
| `RunStatus` | `queued`, `running`, `succeeded`, `failed`, `cancelled`, `skipped` (terminal: `succeeded`, `failed`, `cancelled`, `skipped`) |
| `RunKind` | `ingestion`, `pipeline`, `transformation`, `dbt_test`, `schema_apply` |
| `RunTrigger` | `manual`, `schedule`, `retry`, `onboarding`, `api` |
| `StageKey` | `source_connect`, `ingestion`, `bronze_load`, `dbt_transform`, `silver_gold_publish`, `quality_checks`, `metabase_refresh` |
| `LogLevel` | `debug`, `info`, `warning`, `error` |

**Connector catalog**

```ts
ConnectorDefinition {
  type: ConnectorType
  name: string                     // "PostgreSQL"
  category: ConnectorCategory
  description: string
  status: "available" | "coming_soon"
  engine: string                   // ingestion engine, "dlt"
  supports_incremental: boolean
  config_fields: ConnectorField[]  // empty for coming_soon connectors
  docs_url: string | null
}

ConnectorField {
  key: string                      // config key, e.g. "host", "password"
  label: string
  type: "text" | "password" | "number" | "select" | "boolean" | "textarea" | "url"
  required: boolean
  secret: boolean                  // write-only: never echoed back
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]   // for type "select"
  default?: string | number | boolean
}
```

Fields of the two available connectors, as seeded:

| Connector | Key | Type | Required | Secret | Notes |
|---|---|---|---|---|---|
| salesforce | `instance_url` | url | yes | no | Must be `https://` |
| salesforce | `environment` | select | yes | no | `production` (default), `sandbox` |
| salesforce | `username` | text | yes | no | Integration user |
| salesforce | `client_id` | text | yes | no | Connected app consumer key |
| salesforce | `client_secret` | password | yes | yes | Connected app consumer secret |
| salesforce | `security_token` | password | no | yes | Only when IP restrictions apply |
| salesforce | `start_date` | text | no | no | `YYYY-MM-DD`, earliest record date for the initial load |
| postgres | `host` | text | yes | no | |
| postgres | `port` | number | yes | no | Default 5432, integer 1 to 65535 |
| postgres | `database` | text | yes | no | |
| postgres | `username` | text | yes | no | Read-only role recommended |
| postgres | `password` | password | yes | yes | |
| postgres | `ssl_mode` | select | yes | no | `require` (default), `verify-full`, `disable` |
| postgres | `ssh_tunnel` | boolean | no | no | Default false |

**Sources**

```ts
ConfigValue = string | number | boolean | null

SecretState {
  is_set: boolean
  updated_at: string | null        // when the value was last set or cleared
}

SelectedTable {
  schema: string                   // source schema, e.g. "public" or "salesforce"
  name: string                     // source table or object, e.g. "invoices", "Opportunity"
  ingestion_mode: "full" | "incremental"
  cursor_field: string | null      // required for incremental, null for full
  primary_key: string[]            // server-filled from discovery; client value is ignored when the table is known
}

SyncScheduleConfig {
  frequency: SyncFrequency
  cron: string | null              // five-field cron; null when frequency is "manual"
  timezone: string                 // IANA time zone, e.g. "Asia/Kolkata"
}

Source {
  id: string                       // "src_erp"
  workspace_id: string
  name: string
  connector_type: ConnectorType
  status: SourceStatus
  health: HealthStatus
  health_message: string | null
  config: Record<string, ConfigValue>     // non-secret values only
  secrets: Record<string, SecretState>    // one entry per secret ConnectorField.key
  destination_schema: string               // Bronze schema, e.g. "bronze_erp"
  selected_tables: SelectedTable[]
  schedule: SyncScheduleConfig
  last_sync_at: string | null
  last_successful_sync_at: string | null
  last_sync_status: RunStatus | null
  last_sync_duration_seconds: number | null
  last_sync_records: number | null
  total_records: number
  next_sync_at: string | null      // computed from the cron; null unless status is "active" and frequency is not "manual"
  created_at: string
  updated_at: string
  created_by: { id: string; name: string }
}
```

**Connection testing and discovery**

```ts
ConnectionCheck {
  name: string            // "Network" | "Authentication" | "Permissions" | "API limits" (Salesforce) | "Replication" (PostgreSQL)
  status: "passed" | "failed" | "warning"
  message: string
}

TestConnectionResult {
  success: boolean
  latency_ms: number | null        // null when the host could not be reached
  checks: ConnectionCheck[]        // always all four, in order; checks after a failure are "warning" with "Not run because an earlier check failed."
  tested_at: string
  error: { code: string; message: string } | null   // codes used: "source_unreachable", "source_auth_failed"
}

SourceSchema { name: string; tables_count: number }

SourceTable {
  schema: string
  name: string
  label: string | null             // human label (Salesforce objects), else null
  row_count_estimate: number | null
  columns_count: number
  supports_incremental: boolean
  cursor_candidates: string[]      // columns usable as an incremental cursor
  primary_key: string[]
}

PreviewColumn { name: string; data_type: string }   // Postgres type names, e.g. "varchar", "bigint", "timestamptz"

TablePreview {
  columns: PreviewColumn[]
  rows: Record<string, unknown>[]  // keyed by column name
  total_rows: number | null        // size of the bounded sample, at most 100
  page: number
  page_size: number
  sampled_at: string               // when the sampled Bronze data was loaded
}
```

**Runs**

```ts
RunError {
  stage: StageKey | null
  code: string                     // e.g. "source_auth_failed", "source_unreachable", "source_rate_limited", "quality_checks_failed", "dbt_model_error"
  message: string
  details: string | null
  retryable: boolean
}

RunStage {
  key: StageKey
  name: string                     // display name, e.g. "Ingestion (dlt)"
  status: RunStatus
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  error: RunError | null
  skip_reason: string | null       // set only when status is "skipped"
  metrics: Record<string, number>  // e.g. rows_extracted, rows_loaded, models_built, tests_run
}

TableSyncResult {
  table: string                    // "schema.table"
  status: RunStatus
  mode: "full" | "incremental"
  records: number
  error: string | null
}

Run {
  id: string
  workspace_id: string
  kind: RunKind
  status: RunStatus
  trigger: RunTrigger
  triggered_by: { id: string; name: string }   // a user, or { id: "svc_scheduler", name: "Scheduler" }
  target_name: string              // source, pipeline or transformation name at trigger time
  pipeline_id: string | null
  source_id: string | null
  transformation_id: string | null
  schedule_id: string | null
  schema_proposal_id: string | null
  queued_at: string
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null  // elapsed while running, final once terminal
  attempt: number                  // 1 for a fresh run, +1 per retry
  retry_of: string | null          // run this one retries
  records_processed: number | null
  stages: RunStage[]
  tables: TableSyncResult[]        // empty for runs that do not ingest
  error: RunError | null           // set when status is "failed"
}

LogLine { seq: number; ts: string; level: LogLevel; stage: StageKey | null; message: string }

RunLogsResponse {
  run_id: string
  lines: LogLine[]
  next_cursor: number              // pass as `after` to fetch only newer lines
  complete: boolean                // true once the run is terminal; no more lines will be appended
}

Paginated<T> { items: T[]; page: number; page_size: number; total: number }
```

Stages by run kind (the default plan; pipelines can configure a subset):

| Kind | Stages |
|---|---|
| `ingestion` | `source_connect`, `ingestion`, `bronze_load` |
| `pipeline` | all seven, in `StageKey` order |
| `transformation` | `dbt_transform`, `silver_gold_publish` |
| `dbt_test` | `quality_checks` |
| `schema_apply` | `dbt_transform`, `silver_gold_publish`, `quality_checks` |

Skip reasons the frontend displays verbatim: `"Not selected for this run."` (planned subset), `"Metabase is not connected, so no dashboards were refreshed."` (planned Metabase skip), and `"Not run because <Stage name> failed."` (stages after a failure).

**Request and response wrappers**

```ts
CreateSourceRequest {
  name: string
  connector_type: ConnectorType
  config: Record<string, ConfigValue>   // includes secret values (write-only)
  destination_schema: string
  selected_tables: SelectedTable[]
  schedule: SyncScheduleConfig
  run_initial_sync?: boolean
}
CreateSourceResponse { source: Source; initial_run_id: string | null }

UpdateSourceRequest {
  name?: string
  status?: "active" | "paused"
  config?: Record<string, ConfigValue>  // partial; secret keys: string sets, null clears, "" or omitted keeps
  selected_tables?: SelectedTable[]     // replaces the whole list
  schedule?: SyncScheduleConfig         // replaces the schedule
}

TestNewConnectionRequest { connector_type: ConnectorType; config: Record<string, ConfigValue> }
DiscoverRequest          { connector_type: ConnectorType; config: Record<string, ConfigValue> }
DiscoverResponse         { schemas: SourceSchema[]; tables: SourceTable[] }
TriggerSyncRequest       { mode?: "full" | "incremental"; tables?: string[] }   // tables as "schema.table"
```

**Shared validation rules** (used by create, update and the connection endpoints)

- **Name:** trimmed, 2 to 80 characters. It must be unique within the workspace, compared case-insensitively. Messages: "Name must be at least 2 characters.", "Name must be 80 characters or fewer.", `A source named "<name>" already exists in this workspace.`
- **Config** (`field` prefix `config.`):
  - A key that is not in the connector's `config_fields` is rejected: `Unknown setting "<key>" for the <Connector> connector.`
  - A required non-secret field that is blank (missing, null or whitespace) is rejected: `<Label> is required.`
  - `number` fields must convert to a finite number: `<Label> must be a number.` A numeric string such as `"5432"` is accepted and stored as a number. `port` must be an integer from 1 to 65535.
  - `url` fields must match `^https://[^\s/]+\.[^\s]+$` (case-insensitive).
  - `select` fields must be one of the option values.
  - `start_date` must match `^\d{4}-\d{2}-\d{2}$`.
  - `boolean` and `text` fields have no further checks.
  - A required secret must be present and non-blank, unless a value is already stored for the source (update only). A required secret can never be cleared with `null`: `<Label> is required and cannot be cleared.`
- **Destination schema:** must match `^[a-z][a-z0-9_]{1,62}$` (2 to 63 characters). It must not be `public`, `silver`, `gold`, `information_schema` or `pg_catalog`, and it must not already be used by another source in the workspace (`Schema "<schema>" is already used by "<Source>".`).
- **Selected tables** (`field` prefix `selected_tables.<index>`):
  - The list must be a non-empty array: "Select at least one table to replicate." (`field: "selected_tables"`).
  - No duplicate `schema.name` entries: `<schema.table> is selected more than once.` (`field: "selected_tables.<i>"`).
  - Each table must exist in the discovered tables: `<schema.table> was not found in the source. Run discovery again.` (`field: "selected_tables.<i>"`).
  - `ingestion_mode` must be `full` or `incremental` (`field: "selected_tables.<i>.ingestion_mode"`).
  - `incremental` requires both the connector and the table to support it (`supports_incremental`). Otherwise the error `<schema.table> does not support incremental sync. Use a full load.` goes on `selected_tables.<i>.ingestion_mode`. A supported incremental table also requires a `cursor_field` taken from the table's `cursor_candidates`. That error, `Choose a cursor field for <schema.table> (<candidates>).`, goes on `selected_tables.<i>.cursor_field`.
  - For full loads, `cursor_field` is stored as null. `primary_key` is taken from discovery.
- **Schedule** (`field` prefix `schedule.`):
  - `frequency` defaults to `manual`; any other unknown value is rejected with "Choose a sync frequency." `timezone` defaults to `Asia/Kolkata` and must be a valid IANA zone: `Unknown time zone "<tz>".`
  - `custom` requires a valid five-field cron (parsed in the schedule's timezone), normalised to single spaces. The shortest gap between the next five fire times must be at least 15 minutes: "Syncs can run at most every 15 minutes."
  - Presets accept a client-supplied cron variant (for example `30 1 * * *` for daily at 01:30) when it parses. The mock applies no 15-minute check and no check that the variant matches the preset (see open questions). Otherwise the server stores the preset default: hourly `0 * * * *`, every_6_hours `0 */6 * * *`, daily `0 2 * * *`, weekly `0 2 * * 1`.
  - `manual` stores `cron: null`.

---

### 2.2 Connector catalog

#### `GET /api/v1/connectors`
Returns the connector catalog, both available and upcoming connectors, with the form definition for each.
- **Permission:** authenticated (no workspace context).
- **Response:** `200`, `ConnectorDefinition[]`. The seed has 10 entries: `salesforce` and `postgres` are `available`, the rest are `coming_soon` with empty `config_fields`. (The PostgreSQL `config_fields` below are abbreviated; the full list is in the table in 2.1.)
  ```json
  [
    { "type": "postgres", "name": "PostgreSQL", "category": "database", "description": "Replicate tables from any PostgreSQL 11+ database, including ERP and order systems.", "status": "available", "engine": "dlt", "supports_incremental": true, "docs_url": null,
      "config_fields": [
        { "key": "host", "label": "Host", "type": "text", "required": true, "secret": false, "placeholder": "db.internal.example.com" },
        { "key": "port", "label": "Port", "type": "number", "required": true, "secret": false, "default": 5432 },
        { "key": "password", "label": "Password", "type": "password", "required": true, "secret": true }
      ] },
    { "type": "tally", "name": "Tally Prime", "category": "finance", "description": "Vouchers, ledgers and stock items exported from Tally.", "status": "coming_soon", "engine": "dlt", "supports_incremental": false, "config_fields": [], "docs_url": null }
  ]
  ```
- **Errors:** 401 `unauthenticated`.
- **Side effects:** none.
- **Backend notes:** the frontend caches this for 10 minutes and renders forms entirely from `config_fields`, so adding a connector needs no frontend release. Keep `key` values stable, because they are the keys of `Source.config` and `Source.secrets`.

---

### 2.3 Sources

#### `GET /api/v1/workspaces/{workspace_id}/sources`
Lists all sources of a workspace, optionally filtered.
- **Permission:** any workspace member.
- **Path params:**
  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace ID |
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | none | Case-insensitive substring match on the source name, the `destination_schema` or the connector display name |
  | `connector_type` | `ConnectorType` | no | none | Exact match |
  | `status` | `SourceStatus` | no | none | Exact match |
  | `health` | `HealthStatus` | no | none | Exact match |
- **Response:** `200`, `Source[]`. This is a plain array, not paginated. The order is creation order. (In the example, `selected_tables` is abbreviated to two of the seven ERP tables.)
  ```json
  [
    { "id": "src_erp", "workspace_id": "ws_acme", "name": "ERP Database", "connector_type": "postgres",
      "status": "active", "health": "degraded", "health_message": "Schema change detected: items.hsn_code changed from integer to varchar.",
      "config": { "host": "erp-db.acme-distributors.internal", "port": 5432, "database": "erp_prod", "username": "graphite_readonly", "ssl_mode": "require", "ssh_tunnel": true },
      "secrets": { "password": { "is_set": true, "updated_at": "2026-07-30T08:10:00Z" } },
      "destination_schema": "bronze_erp",
      "selected_tables": [
        { "schema": "public", "name": "invoices", "ingestion_mode": "incremental", "cursor_field": "updated_at", "primary_key": ["invoice_id"] },
        { "schema": "public", "name": "items", "ingestion_mode": "full", "cursor_field": null, "primary_key": ["item_code"] }
      ],
      "schedule": { "frequency": "every_6_hours", "cron": "0 */6 * * *", "timezone": "Asia/Kolkata" },
      "last_sync_at": "2026-10-28T06:56:00Z", "last_successful_sync_at": "2026-10-28T06:56:00Z", "last_sync_status": "succeeded",
      "last_sync_duration_seconds": 412, "last_sync_records": 6913, "total_records": 543431, "next_sync_at": "2026-10-28T12:30:00Z",
      "created_at": "2026-06-14T09:10:00Z", "updated_at": "2026-10-19T09:10:00Z", "created_by": { "id": "usr_rahul", "name": "Rahul Mehta" } }
  ]
  ```
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member of the workspace |
  | 404 | `not_found` | Unknown workspace |
- **Side effects:** none.
- **Backend notes:**
  - Invalid enum values in filters are not rejected by the mock; they simply match nothing. Rejecting them with 422 is acceptable.
  - Several screens call this endpoint without filters to fill pickers (pipelines, schedules, AI mapping, settings). An MSME workspace has a handful of sources, so an unpaginated array is fine. If pagination is ever added, it must be opt-in.
  - `health` and `health_message` must reflect current state: recorded connection failures, unacknowledged Bronze schema changes and the latest sync result (see 2.7).
  - The sources page does not poll this list. While a sync started from that page is active, it polls `GET /runs/{run_id}` every 2 seconds, and it refetches this list once the run is terminal.

#### `POST /api/v1/workspaces/{workspace_id}/sources`
Creates a source after validating it and testing the connection, and optionally queues the initial sync.
- **Permission:** `sources:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `CreateSourceRequest`.
  | Field | Type | Required | Rules |
  |---|---|---|---|
  | `name` | string | yes | Name rules (2.1) |
  | `connector_type` | `ConnectorType` | yes | Must exist in the catalog (422 on `connector_type`) and be `available` (409) |
  | `config` | object | yes | Config rules (2.1). Secret values are sent here in plain text over TLS, exactly once. |
  | `destination_schema` | string | yes | Destination schema rules (2.1) |
  | `selected_tables` | `SelectedTable[]` | yes | Selected table rules, checked against the tables the server discovers with this `config` |
  | `schedule` | `SyncScheduleConfig` | yes (the mock defaults a missing value to manual) | Schedule rules |
  | `run_initial_sync` | boolean | no, default false | Queue an ingestion run right after creation |
  ```json
  {
    "name": "Distributor Portal DB",
    "connector_type": "postgres",
    "config": { "host": "portal-db.acme-distributors.internal", "port": 5432, "database": "portal", "username": "graphite_readonly", "password": "<write-only>", "ssl_mode": "require", "ssh_tunnel": false },
    "destination_schema": "bronze_portal",
    "selected_tables": [
      { "schema": "public", "name": "orders", "ingestion_mode": "incremental", "cursor_field": "updated_at", "primary_key": ["id"] },
      { "schema": "reporting", "name": "monthly_targets", "ingestion_mode": "full", "cursor_field": null, "primary_key": ["month", "region"] }
    ],
    "schedule": { "frequency": "daily", "cron": "0 2 * * *", "timezone": "Asia/Kolkata" },
    "run_initial_sync": true
  }
  ```
- **Response:** `201`, `CreateSourceResponse`. The new source has `status: "active"`, `health: "unknown"`, `health_message: null`, all `last_sync_*` fields null and `total_records: 0`. `secrets` has one entry per secret field of the connector, with `is_set` set according to whether a value was supplied. `config` keeps only non-blank, non-secret values, and numbers are coerced to numbers.
  ```json
  { "source": { "id": "src_k3f9q2xa", "workspace_id": "ws_acme", "name": "Distributor Portal DB", "connector_type": "postgres", "status": "active", "health": "unknown", "health_message": null,
      "config": { "host": "portal-db.acme-distributors.internal", "port": 5432, "database": "portal", "username": "graphite_readonly", "ssl_mode": "require", "ssh_tunnel": false },
      "secrets": { "password": { "is_set": true, "updated_at": "2026-10-28T09:41:00Z" } },
      "destination_schema": "bronze_portal",
      "selected_tables": [
        { "schema": "public", "name": "orders", "ingestion_mode": "incremental", "cursor_field": "updated_at", "primary_key": ["id"] },
        { "schema": "reporting", "name": "monthly_targets", "ingestion_mode": "full", "cursor_field": null, "primary_key": ["month", "region"] }
      ],
      "schedule": { "frequency": "daily", "cron": "0 2 * * *", "timezone": "Asia/Kolkata" },
      "last_sync_at": null, "last_successful_sync_at": null, "last_sync_status": null, "last_sync_duration_seconds": null, "last_sync_records": null,
      "total_records": 0, "next_sync_at": "2026-10-28T20:30:00Z", "created_at": "2026-10-28T09:41:00Z", "updated_at": "2026-10-28T09:41:00Z",
      "created_by": { "id": "usr_ananya", "name": "Ananya Rao" } },
    "initial_run_id": "run_m2c8w1zt" }
  ```
- **Errors** (in evaluation order):
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 404 | `not_found` | Unknown workspace |
  | 403 | `forbidden` | Not a member, or no `sources:write` (editor, viewer) |
  | 422 | `validation_error` | `connector_type` is not in the catalog (`field: "connector_type"`, "Choose a connector from the catalog.") |
  | 409 | `connector_unavailable` | Connector is `coming_soon`. `details: { "connector_type": "tally" }` |
  | 422 | `validation_error` | One response with every name, config, destination schema, selected table and schedule error |
  | 400 | `source_unreachable` / `source_auth_failed` (the code of the failed test) | The server-side connection test failed. Message: `The connection test failed: <reason> Fix the configuration and try again.` Nothing is saved. |
- **Side effects:**
  - The source is saved and its discovered tables are stored. They back `GET /sources/{id}/tables` and later `selected_tables` validation.
  - If `schedule.frequency` is not `manual`, a `Schedule` is created with:
    - `target_type: "source_sync"`, `target_id` the source ID, `name: "<Source> sync"` and `description: "Syncs <Source> into <destination_schema>."`.
    - `preset` equal to the frequency, plus the source's cron and timezone.
    - `enabled: true`.
    - `retry` from the workspace scheduler defaults (`max_attempts` = `default_retry_attempts`, `backoff_seconds` = `default_backoff_seconds`, `backoff_strategy: "exponential"`).
    - `concurrency: { max_concurrent_runs: 1, overlap_policy: "skip" }`.
  - The workspace onboarding step `onboarding.steps.source` is set to `true`.
  - Audit `source.created`. The `changes` list `connector_type`, `destination_schema`, `selected_tables` (as `"schema.table (mode: cursor)"` labels) and `schedule` (as `"daily (0 2 * * *, Asia/Kolkata)"` or `"manual"`), all with `before: null`. Each secret that was set is listed as `{ field: "<key>", before: null, after: "[secret set]" }`. Secret values never appear.
  - When `run_initial_sync` is true, an ingestion run is queued. A second audit event `source.sync_triggered` is recorded with `execution_id` set to the run ID and `metadata: { "initial": true }`.
- **Async:** when `run_initial_sync` is true, the response carries `initial_run_id`. The run is created as described under `POST /sources/{id}/sync`, with one difference: `trigger` is `"onboarding"` while the workspace onboarding is not yet completed (`onboarding.completed_at` is null), and `"manual"` otherwise. The wizard and onboarding poll `GET /runs/{initial_run_id}`.
- **Backend notes:**
  - Store secrets in a secrets manager or vault, never in the application database in plain text. Never log request bodies for this route. Never return secret values.
  - The mock discovers tables from the submitted config and validates `selected_tables` against them. The backend must also validate against the live source, or against a discovery result cached for this config during the wizard session. It must not trust the client's list.
  - The connection test runs synchronously before saving. Apply a timeout of about 10 seconds; the mock message says "connection timed out after 10s". On timeout, return 400 `source_unreachable`.
  - Create the Bronze schema (or verify the loader can create it) before the first sync.
  - The mock defaults a missing timezone to `Asia/Kolkata`. Use the workspace's `scheduler.default_timezone` instead.
  - Make creation idempotent against double submits, for example with an `Idempotency-Key` header or by relying on the name uniqueness check.

#### `GET /api/v1/sources/{source_id}`
Returns one source.
- **Permission:** any member of the source's workspace.
- **Path params:** `source_id` (string, required).
- **Response:** `200`, `Source` (see the list example). Seeded Web Orders DB, showing the failing-auth state:
  ```json
  { "id": "src_web_orders", "workspace_id": "ws_acme", "name": "Web Orders DB", "connector_type": "postgres", "status": "error", "health": "unhealthy",
    "health_message": "Authentication failed for user \"graphite_reader\". The password may have been rotated.",
    "config": { "host": "orders-db.storefront.example.com", "port": 5432, "database": "storefront", "username": "graphite_reader", "ssl_mode": "verify-full", "ssh_tunnel": false },
    "secrets": { "password": { "is_set": true, "updated_at": "2026-08-29T09:00:00Z" } },
    "destination_schema": "bronze_web", "schedule": { "frequency": "daily", "cron": "30 1 * * *", "timezone": "Asia/Kolkata" },
    "last_sync_at": "2026-10-28T02:41:00Z", "last_successful_sync_at": "2026-10-25T07:41:00Z", "last_sync_status": "failed",
    "last_sync_duration_seconds": 6, "last_sync_records": 0, "total_records": 70750, "next_sync_at": null, "…": "…" }
  ```
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member of the source's workspace |
  | 404 | `not_found` | `Source "<id>" was not found.` |
- **Side effects:** none.
- **Backend notes:** the source detail page does not poll this endpoint. While a sync is active it polls `GET /runs/{run_id}` and `GET /sources/{id}/runs`, and it refetches the source once the run is terminal. `next_sync_at` is null for `error` sources in the mock, because it is computed only while `status` is `active`.

#### `PATCH /api/v1/sources/{source_id}`
Partially updates a source: rename, pause or resume, edit connection settings or secrets, change the table selection or change the schedule.
- **Permission:** `sources:write`.
- **Path params:** `source_id` (string, required).
- **Request body:** `UpdateSourceRequest`. Every field is optional, and an omitted field is left unchanged. `connector_type` and `destination_schema` cannot be changed; if sent, they are ignored.
  | Field | Type | Rules |
  |---|---|---|
  | `name` | string | Name rules; uniqueness excludes this source |
  | `status` | `"active"` \| `"paused"` | Any other value returns 422 on `status`: "Status can only be set to \"active\" or \"paused\"." |
  | `config` | object | Partial. Only the keys present are validated and applied (config rules, partial mode). **Non-secret keys:** a non-blank value replaces the stored value, and a blank value removes it. A blank value for a required field is a 422. **Secret keys (write-only):** a non-empty string replaces the stored secret, `null` clears it (422 for required secrets), `""` keeps the stored value, and an omitted key keeps it. |
  | `selected_tables` | `SelectedTable[]` | Replaces the whole list. Validated against the tables stored at creation. |
  | `schedule` | `SyncScheduleConfig` | Replaces the schedule. Schedule rules apply. |
  ```json
  { "config": { "password": "<new write-only value>" } }
  ```
  ```json
  { "status": "paused" }
  ```
- **Response:** `200`, the updated `Source`. Behaviour of the status and health fields:
  - `status: "paused"` sets `status: "paused"`, `health: "paused"` and `health_message: "Paused by <user name>."`.
  - `status: "active"` on a paused source resumes it and derives health in this order:
    - a recorded connection failure gives `status: "error"`, `health: "unhealthy"` and the failure message;
    - otherwise an unacknowledged schema change on one of its Bronze models gives `status: "active"`, `health: "degraded"` and `"Schema change detected: <model>.<column> changed from <a> to <b>."` (or `… <column> was added.` / `… <column> was removed.`);
    - otherwise a last sync status of `succeeded` gives `healthy`;
    - otherwise `unknown`.
  - `status: "active"` on a source in `error` does not change its status. The error clears only after a successful sync or replaced credentials.
  - Replacing a secret on a source with a recorded connection failure clears the failure and moves `error` to `active`. Unless the source is paused, it also sets `health: "unknown"` and `health_message: "Credentials updated. Run a sync to verify the connection."`. This status change is not listed in the audit `changes`.
  - Any other PATCH of a source that still has a recorded connection failure and is not paused re-applies `status: "error"`, `health: "unhealthy"` and the failure message.
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member, or no `sources:write` |
  | 404 | `not_found` | Unknown source |
  | 422 | `validation_error` | Any field error (all reported together) |
  | 409 | `source_draft` | `status: "active"` on a `draft` source: "Finish configuring this source before activating it." |
- **Side effects:**
  - The `source_sync` schedule is kept in step:
    - Frequency `manual` deletes it.
    - A first non-manual frequency creates it, as on create.
    - Otherwise every PATCH rewrites its `preset`, `cron`, `timezone`, `target_name` and `updated_at`.
    - It is renamed only if it still has the default name `"<old name> sync"`.
    - `enabled` follows the source: `false` while paused, `true` otherwise.
  - Audit action:
    - `source.paused` or `source.resumed` when the status changed;
    - otherwise `source.updated`.
    - `changes` holds before and after values for every changed key: `name`, `status`, each config key, `selected_tables` (labels) and `schedule` (label).
    - Secret keys appear as `{ "before": "[secret]", "after": "[secret updated]" | "[secret cleared]" }`.
    - **No audit event** is written when nothing changed and the action would be `source.updated`.
- **Backend notes:**
  - Write new secrets to the vault, and record only `SecretState`.
  - The contract does not require the backend to test new credentials on save. The mock marks health `unknown` and lets the next sync verify them. Testing on save is allowed, but a failed test must not block saving unless the product decides so.
  - Pausing must also stop scheduled syncs. The mock does this through the schedule's `enabled` flag.
  - The mock's simulation (a secret equal to `wrong` records an auth failure) is a stand-in for a real rejection detected at the next sync.

#### `DELETE /api/v1/sources/{source_id}`
Deletes a source definition. Data already loaded into Bronze is kept.
- **Permission:** `sources:write`.
- **Path params:** `source_id` (string, required).
- **Response:** `204`, no body.
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member, or no `sources:write` |
  | 404 | `not_found` | Unknown source |
  | 409 | `source_in_use` | One or more pipelines list the source in `source_ids`. Message names them. `details: { "pipelines": [{ "id": "pl_finance", "name": "Finance and Receivables" }, { "id": "pl_inventory", "name": "Inventory Daily" }, { "id": "pl_customer360", "name": "Customer 360" }] }` (deleting `src_erp`) |
  | 409 | `sync_in_progress` | A non-terminal `ingestion` run exists for the source. `details: { "run_id": "run_…" }` |
- **Side effects:**
  - Removes the source, its `source_sync` schedules, its stored discovery result and any recorded connection failure.
  - Past runs are kept and still reference `source_id`.
  - Audit `source.deleted` with `changes: [{ field: "name", before: "<name>", after: null }]` and `metadata: { destination_schema, removed_schedules: ["sch_…"], bronze_data_retained: true }`.
- **Backend notes:**
  - Delete the vault secrets.
  - Do not drop the Bronze schema. The UI tells users the data is retained.
  - In the seed, only `src_sf_sandbox` can be deleted without a 409.

---

### 2.4 Connection testing and discovery

#### `POST /api/v1/workspaces/{workspace_id}/sources/test-connection`
Tests connection settings before a source exists. Used by the create wizard and onboarding.
- **Permission:** `sources:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `TestNewConnectionRequest { connector_type, config }`. The config rules apply in full, including required secrets. Secrets are write-only and are never stored by this call.
  ```json
  { "connector_type": "salesforce", "config": { "instance_url": "https://acme-distributors.my.salesforce.com", "environment": "production", "username": "integration@acme-distributors.example", "client_id": "3MVG9A2kN8Bx", "client_secret": "<write-only>" } }
  ```
- **Response:** `200`, `TestConnectionResult`. A failed test is still a 200 with `success: false`.
  ```json
  { "success": true, "latency_ms": 118, "tested_at": "2026-10-28T09:40:12Z", "error": null,
    "checks": [
      { "name": "Network", "status": "passed", "message": "Reached acme-distributors.my.salesforce.com over TLS in 118 ms." },
      { "name": "Authentication", "status": "passed", "message": "Authenticated as integration@acme-distributors.example via OAuth." },
      { "name": "Permissions", "status": "passed", "message": "Read access confirmed for standard objects (Account, Contact, Opportunity, Product2)." },
      { "name": "API limits", "status": "passed", "message": "31,450 of 100,000 daily API requests used (31%)." } ] }
  ```
  Failure example (PostgreSQL, wrong password):
  ```json
  { "success": false, "latency_ms": 74, "tested_at": "2026-10-28T09:40:12Z",
    "error": { "code": "source_auth_failed", "message": "Authentication failed for user \"graphite_reader\"." },
    "checks": [
      { "name": "Network", "status": "passed", "message": "Reached orders-db.storefront.example.com:5432 over TLS in 74 ms." },
      { "name": "Authentication", "status": "failed", "message": "Authentication failed for user \"graphite_reader\". The password may have been rotated." },
      { "name": "Permissions", "status": "warning", "message": "Not run because an earlier check failed." },
      { "name": "Replication", "status": "warning", "message": "Not run because an earlier check failed." } ] }
  ```
  For PostgreSQL with `ssl_mode: "disable"`, the Replication check is a `warning` and `success` is still true. When the host cannot be reached, the error code is `source_unreachable`, `latency_ms` is null, Network is `failed` and the other checks are `warning`.
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member, or no `sources:write` |
  | 404 | `not_found` | Unknown workspace |
  | 422 | `validation_error` | Unknown `connector_type` (`field: "connector_type"`) |
  | 409 | `connector_unavailable` | Connector is `coming_soon` |
  | 422 | `validation_error` | Config invalid or incomplete. Top-level message: "Complete the required connection settings before testing." |
- **Side effects:** none (no audit, nothing stored).
- **Backend notes:**
  - Run the real connector check from the ingestion workers' network (same egress IPs as syncs). Bound it with a timeout of about 10 seconds.
  - Rate-limit per user and workspace, for example 10 per minute, because this endpoint can be used to probe hosts.
  - Never log the config.
  - Keep the four check names and their order. The UI renders them as a checklist.

#### `POST /api/v1/workspaces/{workspace_id}/sources/discover`
Lists the schemas and tables reachable with unsaved connection settings, so the user can choose what to replicate.
- **Permission:** `sources:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `DiscoverRequest { connector_type, config }`, with the same rules as test-connection.
- **Response:** `200`, `DiscoverResponse`. `schemas` is derived from `tables`, with a count per schema.
  ```json
  { "schemas": [ { "name": "public", "tables_count": 7 }, { "name": "inventory", "tables_count": 3 }, { "name": "hr", "tables_count": 1 } ],
    "tables": [
      { "schema": "public", "name": "invoices", "label": null, "row_count_estimate": 58210, "columns_count": 9, "supports_incremental": true, "cursor_candidates": ["updated_at", "invoice_date"], "primary_key": ["invoice_id"] },
      { "schema": "inventory", "name": "warehouses", "label": null, "row_count_estimate": 6, "columns_count": 4, "supports_incremental": false, "cursor_candidates": [], "primary_key": ["warehouse_code"] } ] }
  ```
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member, or no `sources:write` |
  | 404 | `not_found` | Unknown workspace |
  | 422 | `validation_error` | Unknown `connector_type` (`field: "connector_type"`, top-level message "Some fields are invalid.") |
  | 409 | `connector_unavailable` | Connector is `coming_soon` |
  | 422 | `validation_error` | Config invalid or incomplete. Top-level message: "Complete the required connection settings before discovery." |
  | 400 | `source_unreachable` / `source_auth_failed` | Could not connect. Message: `Discovery could not connect: <reason>` |
- **Side effects:** none.
- **Backend notes:**
  - Discovery can be slow on large databases. If it can exceed about 15 seconds, consider a run-like async job. The frontend currently expects a synchronous 200.
  - `row_count_estimate` should come from catalog statistics (`pg_class.reltuples`, Salesforce record counts), not from `COUNT(*)`.
  - `cursor_candidates` should list monotonically increasing timestamp, date or ID columns.
  - Filter out system schemas.

#### `POST /api/v1/sources/{source_id}/test-connection`
Tests a saved source's connection, optionally with replacement values that are not saved.
- **Permission:** `sources:sync` when the body has no `config` or an empty `config`. `sources:write` when `config` has at least one key. An editor can re-test stored credentials but cannot try new ones.
- **Path params:** `source_id` (string, required).
- **Request body:** optional, `{ config?: Record<string, ConfigValue> }`.
  - `config` is validated in partial mode: only the keys present are checked, and unknown keys are rejected.
  - A key sent for a required field must not be blank. `""`, whitespace or `null` for a required field returns 422 (`<Label> is required.`, or `<Label> is required and cannot be cleared.` for `null` on a required secret). Stored secrets do not exempt this test, unlike PATCH.
  - A blank value for an optional field is ignored, and the stored value is used.
  - The test runs against the stored config and secrets merged with the non-blank overrides.
  - Nothing is persisted.
  ```json
  {}
  ```
  ```json
  { "config": { "password": "<replacement write-only value>" } }
  ```
- **Response:** `200`, `TestConnectionResult`. For the seeded Web Orders DB, a test without a replacement password keeps failing with `source_auth_failed`, matching the recorded failure. A test with a replacement password runs the full check.
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member, or missing the permission chosen above |
  | 404 | `not_found` | Unknown source |
  | 422 | `validation_error` | Invalid override values |
- **Side effects:** audit `source.connection_tested`, with `status: "success"` or `"failure"` and `metadata: { error_code: string | null, replacement_values: boolean }`. The source's `status` and `health` are **not** changed by a test.
- **Backend notes:**
  - Load stored secrets from the vault for the merge. Never log or echo override values.
  - Same timeout and rate limit as the unsaved test.

---

### 2.5 Source tables and preview

#### `GET /api/v1/sources/{source_id}/schemas`
Lists the schemas found in the source, with table counts, from the stored discovery result.
- **Permission:** any member of the source's workspace.
- **Path params:** `source_id` (string, required).
- **Response:** `200`, `SourceSchema[]` (`[]` when nothing is stored).
  ```json
  [ { "name": "salesforce", "tables_count": 12 } ]
  ```
- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (unknown source).
- **Side effects:** none.
- **Backend notes:** no frontend screen calls this endpoint at present (`sourcesService.schemas` is unused); `GET /sources/{id}/tables` is used instead. Low priority.

#### `GET /api/v1/sources/{source_id}/tables`
Lists the tables available in the source (the stored discovery result), optionally limited to one schema.
- **Permission:** any member of the source's workspace.
- **Path params:** `source_id` (string, required).
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `schema` | string | no | none | Only tables in this source schema |
- **Response:** `200`, `SourceTable[]` (`[]` when nothing is stored).
  ```json
  [ { "schema": "salesforce", "name": "Opportunity", "label": "Opportunities", "row_count_estimate": 6380, "columns_count": 49, "supports_incremental": true, "cursor_candidates": ["SystemModstamp", "LastModifiedDate", "CreatedDate"], "primary_key": ["Id"] },
    { "schema": "salesforce", "name": "User", "label": "Users", "row_count_estimate": 48, "columns_count": 120, "supports_incremental": false, "cursor_candidates": [], "primary_key": ["Id"] } ]
  ```
- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (unknown source).
- **Side effects:** none.
- **Backend notes:**
  - This is the list `PATCH selected_tables` is validated against. The mock stores it once, at creation, and has no way to refresh it.
  - The backend should refresh it on a schedule or after each sync, or add an explicit re-discovery action (see open questions). Otherwise tables added to the source later can never be selected.

#### `GET /api/v1/sources/{source_id}/tables/{table}/preview`
Returns a bounded, paged sample of rows for one selected table, read from its Bronze copy.
- **Permission:** any member of the source's workspace.
- **Path params:**
  | Name | Type | Required | Description |
  |---|---|---|---|
  | `source_id` | string | yes | Source ID |
  | `table` | string | yes | `"schema.table"`, URL-encoded (for example `public.invoices` or `salesforce.Opportunity`). It is split at the first `.`. |
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `page` | integer | no | 1 | 1-based page; values that are not positive numbers fall back to the default |
  | `page_size` | integer | no | 25 | Capped at 100 |
- **Response:** `200`, `TablePreview`.
  - The sample holds at most 100 rows: `total_rows = min(100, row_count_estimate ?? 100)`.
  - A page past the end returns `rows: []`.
  - `sampled_at` is the source's `last_successful_sync_at`.
  ```json
  { "columns": [ { "name": "invoice_id", "data_type": "bigint" }, { "name": "customer_code", "data_type": "varchar" }, { "name": "invoice_date", "data_type": "date" }, { "name": "total_amount", "data_type": "numeric" }, { "name": "updated_at", "data_type": "timestamptz" } ],
    "rows": [ { "invoice_id": 104233, "customer_code": "CUST-0412", "invoice_date": "2026-10-21", "total_amount": 48250.0, "updated_at": "2026-10-27T11:02:13Z" } ],
    "total_rows": 100, "page": 1, "page_size": 25, "sampled_at": "2026-10-28T06:56:00Z" }
  ```
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member |
  | 400 | `bad_request` | `table` has no `.` or starts with one: "Table must be given as \"schema.table\"." |
  | 404 | `not_found` | Unknown source, or the table is not both discovered and currently selected (`Selected table "public.carts" was not found.`) |
  | 409 | `no_data_loaded` | The source has never synced successfully: "No data has been loaded for this source yet. Run a sync, then preview the Bronze sample." |
- **Side effects:** none.
- **Backend notes:**
  - Read from `<destination_schema>.<bronze table>` in the warehouse, never from the operational source.
  - Hard-cap the sample at 100 rows, and use a statement timeout.
  - Apply any column masking the workspace defines.
  - Column types should be the Bronze column types. The mock reuses profiled Bronze model columns when they exist and otherwise invents plausible ones.
  - The mapping from source table name to Bronze table name, such as `salesforce.Opportunity` to `bronze_salesforce.opportunity`, is a backend decision.

---

### 2.6 Source syncs

#### `POST /api/v1/sources/{source_id}/sync`
Queues an ingestion run for the source (Source to dlt to Bronze).
- **Permission:** `sources:sync`.
- **Path params:** `source_id` (string, required).
- **Request body:** `TriggerSyncRequest`. The body is optional; the frontend sends `{}` for a default sync.
  | Field | Type | Required | Rules |
  |---|---|---|---|
  | `mode` | `"full"` \| `"incremental"` | no | `full` forces a full reload of every synced table. `incremental` (or omitted) uses each table's configured `ingestion_mode`, so tables configured as `full` stay full. `tables[].mode` in the run reports this effective mode. If the source has never synced successfully (`last_successful_sync_at` is null), the mock loads full table volumes, but `tables[].mode` still shows the configured mode. |
  | `tables` | string[] | no | Restricts the sync to these `"schema.table"` entries. Each must be in `selected_tables`. Omitted or empty means all selected tables. |
  ```json
  { "mode": "full", "tables": ["salesforce.Opportunity", "salesforce.OpportunityLineItem"] }
  ```
- **Response:** `202`, the new `Run`, in its initial state:
  ```json
  { "id": "run_q7h2k9bd", "workspace_id": "ws_acme", "kind": "ingestion", "status": "queued", "trigger": "manual",
    "triggered_by": { "id": "usr_priya", "name": "Priya Nair" }, "target_name": "Salesforce Production",
    "pipeline_id": null, "source_id": "src_sf_prod", "transformation_id": null, "schedule_id": null, "schema_proposal_id": null,
    "queued_at": "2026-10-28T09:42:05Z", "started_at": null, "finished_at": null, "duration_seconds": null,
    "attempt": 1, "retry_of": null, "records_processed": null, "error": null,
    "stages": [
      { "key": "source_connect", "name": "Source connection", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "ingestion", "name": "Ingestion (dlt)", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "bronze_load", "name": "Bronze load", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} } ],
    "tables": [
      { "table": "salesforce.Opportunity", "status": "queued", "mode": "full", "records": 0, "error": null },
      { "table": "salesforce.OpportunityLineItem", "status": "queued", "mode": "full", "records": 0, "error": null } ] }
  ```
- **Errors** (in evaluation order):
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 404 | `not_found` | Unknown source |
  | 403 | `forbidden` | Not a member, or no `sources:sync` (viewer) |
  | 409 | `source_paused` | `"<Source>" is paused. Resume it before syncing.` |
  | 409 | `source_draft` | `"<Source>" is a draft. Finish its configuration before syncing.` |
  | 409 | `sync_in_progress` | A non-terminal ingestion run exists for the source: `A sync for "<Source>" is already <queued|running>.` `details: { "run_id": "run_…" }` |
  | 422 | `validation_error` | `mode` is not `full` or `incremental` (`field: "mode"`) |
  | 422 | `validation_error` | `tables` contains entries that are not selected (`field: "tables"`, "Not selected for this source: public.carts.") |
  | 409 | `no_tables_selected` | The source has no selected tables |
- **Side effects:** audit `source.sync_triggered`, with `resource` set to the source, `execution_id` set to the run ID and `metadata: { mode: "full" | "incremental" | "default", tables: string[] | "all_selected" }`. `tables` is the list as sent (an explicit `[]` is recorded as `[]`), or `"all_selected"` when the field is omitted. Further side effects happen when the run finishes (2.7).
- **Async:**
  - The run starts `queued` with the three ingestion stages queued and one `TableSyncResult` per synced table (`records: 0`). It then moves to `running`, stage by stage, and ends `succeeded` or `failed`.
  - A source in `status: "error"` can still be synced. For Web Orders DB, the run fails at `source_connect` with `source_auth_failed` (retryable) until the password is replaced.
  - Clients poll `GET /runs/{run_id}` every 2 seconds and `GET /runs/{run_id}/logs?after=<cursor>` until the status is terminal.
- **Backend notes:**
  - Enqueue the dlt job and return immediately.
  - Enforce "one active ingestion per source" atomically, for example with a unique partial index or a row lock, not with a read-then-insert.
  - Only `ingestion` runs block a sync. An active pipeline run that reads the same source does not block it. For example, ERP Database can be synced while the seeded Inventory Daily run is in progress. The backend should decide whether a sync and a pipeline ingestion may run against the same Bronze schema at the same time.
  - Persist dlt cursors per table so incremental runs resume.
  - `records_processed` should be the real extracted row count.
  - Support an `Idempotency-Key` header so a double click does not queue two runs. The 409 `sync_in_progress` covers most cases.

#### `GET /api/v1/sources/{source_id}/runs`
Lists the runs that read from the source: its ingestion runs and the pipeline runs attributed to it.
- **Permission:** any member of the source's workspace.
- **Path params:** `source_id` (string, required).
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `status` | `RunStatus` | no | none | Exact match (not validated by the mock) |
  | `kind` | `"ingestion"` \| `"pipeline"` | no | none | One kind only; a comma list is not parsed here (unlike the workspace endpoint) |
  | `page` | integer | no | 1 | 1-based |
  | `page_size` | integer | no | 20 | Capped at 500 |
- **Response:** `200`, `Paginated<Run>`, newest `queued_at` first. Only runs with `kind` of `ingestion` or `pipeline` and `source_id` equal to this source are included.
  ```json
  { "items": [ { "id": "run_web_000", "kind": "pipeline", "status": "failed", "trigger": "retry", "attempt": 3, "retry_of": "run_web_001", "target_name": "Web Orders", "source_id": "src_web_orders", "pipeline_id": "pl_web_orders",
                 "error": { "stage": "source_connect", "code": "source_auth_failed", "message": "Authentication failed for user \"graphite_reader\".", "details": "FATAL: password authentication failed for user \"graphite_reader\" (SQLSTATE 28P01). Update the password in the connection settings and retry.", "retryable": true }, "…": "…" } ],
    "page": 1, "page_size": 20, "total": 14 }
  ```
  (Seeded Web Orders DB: 14 Web Orders pipeline runs and no standalone ingestion runs. The newest, `run_web_000`, is the third failed attempt.)
- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (unknown source).
- **Side effects:** none.
- **Backend notes:**
  - The source detail page polls this every 2 seconds while any listed run is active. Index runs by `(source_id, queued_at desc)`.
  - The mock attributes a pipeline run to one `source_id` only: the source whose connection failed, otherwise the pipeline's first source. The backend should decide whether multi-source pipeline runs (Customer 360) appear under every source they read (see open questions).

---

### 2.7 Runs

These endpoints serve every run kind. Permission for run actions depends on the run's kind:

| Run kind | Permission for retry and cancel |
|---|---|
| `ingestion` | `sources:sync` |
| `pipeline` | `pipelines:run` |
| `transformation`, `dbt_test`, `schema_apply` | `transformations:run` |

**What happens when a run finishes.** These are side effects of the run lifecycle, not of a request. The backend's orchestrator must apply them once per run.

1. **Source state.** This applies to ingestion runs and to pipeline runs that executed at least one of `source_connect`, `ingestion` or `bronze_load`. Cancelled runs are excluded. For each source the run read (all `source_ids` of a pipeline):
   - `last_sync_at = finished_at`.
   - `last_sync_status`: `succeeded` if all executed sync stages succeeded (even if a later stage such as `quality_checks` failed), otherwise the run status.
   - `last_sync_duration_seconds` is the run's duration. `last_sync_records` is the run's record total divided evenly across the sources the run read, or 0 when the sync stages did not all succeed.
   - On a successful sync:
     - `last_successful_sync_at` is set and `total_records` grows by the records loaded.
     - `error` becomes `active`.
     - `unhealthy` or `unknown` health becomes `healthy`, unless a connection failure is still recorded.
     - The source's Bronze models are marked fresh.
   - On a `source_connect` failure, `status: "error"`, `health: "unhealthy"` and `health_message` set to the error message, but only for the source that failed. Other sources of the same pipeline are left unchanged.
2. **Notifications** (in-app, subject to each user's preferences):
   - **Failed run:** type `repeated_retries` when `attempt >= 3`, `quality_failed` when the error stage is `quality_checks`, and `pipeline_failed` otherwise. Severity `critical`.
   - **Succeeded ingestion or pipeline run:** type `sync_completed`, severity `success`.
   - **Cancelled runs:** no notification.
3. **Audit:** action `<kind>.run_<status>`, for example `ingestion.run_succeeded`, `pipeline.run_failed` or `ingestion.run_cancelled`.
   - Actor: the scheduler (`{ type: "scheduler", id: "svc_scheduler" }`) for scheduled runs, and `{ type: "service", id: "svc_orchestrator", name: "Orchestrator" }` otherwise.
   - `status` is `success` for succeeded and cancelled runs, `failure` otherwise.
   - `execution_id` is the run ID, and `metadata` includes `duration_seconds`.
   - `resource` (with `name` = the run's `target_name`): `{ type: "run", id: <run id> }` when the run has a `pipeline_id`; otherwise `{ type: "source", id: <source_id> }` for an ingestion run; otherwise `{ type: "transformation", id: <transformation_id> }` for `transformation` and `dbt_test` runs; otherwise (`schema_apply`) `{ type: "run", id: <run id> }`.
   - The mock adds `simulated: true` to this metadata; the backend must not.
4. **Kind-specific state.** A finished `transformation` run (any terminal status, including cancelled) sets the transformation's `last_run_status`, `last_run_at` and `last_run_duration_seconds`, and a successful one marks its output model `fresh` with `last_refreshed_at = finished_at`. A finished `dbt_test` run sets `last_run_at` and `run_id` on every quality check of the output model. A `schema_apply` run moves its proposal to `applied` on success, or back to `approved` on failure or cancellation (sections 3, 4 and 5 describe these per endpoint).

#### `GET /api/v1/workspaces/{workspace_id}/runs`
Lists runs of every kind across a workspace.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `kind` | string | no | none | One `RunKind`, or a comma-separated list (`kind=transformation,dbt_test`). Unknown values return a 422. |
  | `status` | `RunStatus` | no | none | Unknown value returns a 422 |
  | `page` | integer | no | 1 | 1-based |
  | `page_size` | integer | no | 25 | Capped at 500 |
- **Response:** `200`, `Paginated<Run>`, newest `queued_at` first.
  ```json
  { "items": [ { "id": "run_x1y2z3ab", "kind": "pipeline", "status": "running", "trigger": "manual", "target_name": "Inventory Daily", "pipeline_id": "pl_inventory", "source_id": "src_erp",
                 "triggered_by": { "id": "usr_rahul", "name": "Rahul Mehta" }, "queued_at": "2026-10-28T09:38:00Z", "started_at": "2026-10-28T09:38:02Z", "finished_at": null, "duration_seconds": 14, "records_processed": 2127, "…": "…" } ],
    "page": 1, "page_size": 25, "total": 237 }
  ```
  (At load, Acme Distributors has 237 runs; the newest is the Inventory Daily run that is in progress.)
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 403 | `forbidden` | Not a member |
  | 404 | `not_found` | Unknown workspace |
  | 422 | `validation_error` | `field: "kind"`: `Unknown run kind: <values>. Use ingestion, pipeline, transformation, dbt_test, schema_apply.` |
  | 422 | `validation_error` | `field: "status"`: `Status must be one of queued, running, succeeded, failed, cancelled, skipped.` |
- **Side effects:** none.
- **Backend notes:**
  - The client sends the kind list as one comma-separated value, not as repeated parameters.
  - Items are full `Run` objects with stages, because the lists show stage strips. Index runs by `(workspace_id, queued_at desc)`.
  - Retain run history according to the workspace retention setting.

#### `GET /api/v1/runs/{run_id}`
Returns one run with its stages, table results and error. This is the polling endpoint for every async operation.
- **Permission:** any member of the run's workspace.
- **Path params:** `run_id` (string, required).
- **Response:** `200`, `Run`. Example: the seeded Finance pipeline failure, after the tables were loaded.
  ```json
  { "id": "run_fin_000", "workspace_id": "ws_acme", "kind": "pipeline", "status": "failed", "trigger": "schedule",
    "triggered_by": { "id": "svc_scheduler", "name": "Scheduler" }, "target_name": "Finance and Receivables",
    "pipeline_id": "pl_finance", "source_id": "src_erp", "transformation_id": null, "schedule_id": "sch_finance", "schema_proposal_id": null,
    "queued_at": "2026-10-28T05:59:58Z", "started_at": "2026-10-28T06:00:00Z", "finished_at": "2026-10-28T06:11:12Z", "duration_seconds": 672,
    "attempt": 1, "retry_of": null, "records_processed": 6342,
    "stages": [
      { "key": "dbt_transform", "name": "dbt transformation", "status": "succeeded", "started_at": "2026-10-28T06:06:40Z", "finished_at": "2026-10-28T06:09:55Z", "duration_seconds": 195, "error": null, "skip_reason": null, "metrics": { "models_built": 17 } },
      { "key": "quality_checks", "name": "Data quality checks", "status": "failed", "started_at": "2026-10-28T06:10:10Z", "finished_at": "2026-10-28T06:11:12Z", "duration_seconds": 62,
        "error": { "stage": "quality_checks", "code": "quality_checks_failed", "message": "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", "details": "Credit notes re-issued in the ERP reuse the original invoice_id. Downstream model agg_receivables_aging was not refreshed and Metabase refresh was skipped.", "retryable": true },
        "skip_reason": null, "metrics": { "tests_run": 41 } },
      { "key": "metabase_refresh", "name": "Metabase refresh", "status": "skipped", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": "Not run because Data quality checks failed.", "metrics": {} } ],
    "tables": [ { "table": "public.invoices", "status": "succeeded", "mode": "incremental", "records": 712, "error": null } ],
    "error": { "stage": "quality_checks", "code": "quality_checks_failed", "message": "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", "details": "…", "retryable": true } }
  ```
  (The stage and table lists are abbreviated: a Finance run carries all seven stages and seven ERP tables, and `records_processed` is the sum of the table records. Seeded Finance runs start on six-hour UTC boundaries.)
- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member of the run's workspace); 404 `not_found` (`Run "<id>" was not found.`).
- **Side effects:** none.
- **Backend notes:**
  - This endpoint is polled every 2 seconds per open run view, so serve it from the primary store with no heavy joins.
  - `duration_seconds` must grow while the run is running. The UI shows elapsed time from it.
  - While the run is active, `tables[].status` and `records` should update as dlt reports progress.
  - Server-Sent Events are a possible later optimisation. The frontend does not depend on them.

#### `GET /api/v1/runs/{run_id}/logs`
Returns run log lines, incrementally after a cursor.
- **Permission:** any member of the run's workspace.
- **Path params:** `run_id` (string, required).
- **Query params:**
  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `after` | integer | no | 0 | Return only lines with `seq > after`. Values that are not positive numbers mean 0. |
  | `level` | `LogLevel` | no | none | Return only lines of this level (not validated by the mock; an unknown level returns no lines) |
- **Response:** `200`, `RunLogsResponse`.
  - `next_cursor` is the `seq` of the last line of the whole log, regardless of `after` and `level`.
  - `complete` is true once the run is terminal.
  ```json
  { "run_id": "run_web_001", "complete": true, "next_cursor": 14,
    "lines": [
      { "seq": 1, "ts": "2026-10-28T02:40:56Z", "level": "info", "stage": null, "message": "Run run_web_001 queued (pipeline, trigger: retry, attempt 2)" },
      { "seq": 3, "ts": "2026-10-28T02:40:58Z", "level": "info", "stage": "source_connect", "message": "Source connection started" },
      { "seq": 7, "ts": "2026-10-28T02:41:02Z", "level": "error", "stage": "source_connect", "message": "source_auth_failed: Authentication failed for user \"graphite_reader\"." },
      { "seq": 9, "ts": "2026-10-28T02:41:02Z", "level": "debug", "stage": "ingestion", "message": "Ingestion (dlt) skipped: Not run because Source connection failed." },
      { "seq": 14, "ts": "2026-10-28T02:41:02Z", "level": "error", "stage": null, "message": "Run finished with status FAILED after 6s" } ] }
  ```
  (Lines abbreviated. The full log has 14 lines: queued, worker pickup, the stage start, three progress lines, the error and its details, one `debug` line per skipped stage, and the final status line.)
- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (unknown run).
- **Side effects:** none.
- **Backend notes:**
  - **`seq` must be strictly increasing and stable**: a line keeps its `seq` forever, and while the run is active lines are only appended.
  - The viewer (`src/components/runs/log-viewer.tsx`) polls with `after=<next_cursor>` every 2 seconds and de-duplicates by `seq`. When `complete` becomes true, it fetches `after=0` once to replace its buffer.
  - Store dlt and dbt output per run, and redact secrets and connection strings before storing.
  - A cap on lines per call (for example 1,000) is **not** compatible with the current client as written. The client stops requesting as soon as a response has `complete: true`, and it fetches a finished run once with `after=0`. If the backend caps, it must then set `next_cursor` to the `seq` of the last line returned, not the last line of the whole log. It must also report `complete: false` until the response contains the final line, so the client keeps paging with `after`.
  - Line order: the `queued` line; for a run held back by a schedule overlap policy of `queue`, `Waiting for run <id> to finish (schedule overlap policy: queue)`; the worker pickup line; per stage a start line, progress lines and a completion, error or cancellation line; then the final status line. A skipped stage produces one `debug` line, `<Stage name> skipped: <skip_reason>`, which is appended only once the run has reached that stage or is terminal, so earlier `seq` numbers never shift.
  - Retain logs according to the workspace retention setting.

#### `POST /api/v1/runs/{run_id}/retry`
Starts a new attempt of a failed or cancelled run, with the same plan.
- **Permission:** by the original run's kind (see the table at the top of 2.7).
- **Path params:** `run_id` (string, required). This is the run being retried.
- **Request body:** none. The client sends no body and no `Content-Type`.
- **Response:** `202`, the new `Run`:
  - `id` is new; `trigger` is `"retry"`; `attempt` is the original's attempt + 1; `retry_of` is the original's ID; `status` is `"queued"`.
  - `kind`, `target_name`, `pipeline_id`, `transformation_id`, `schedule_id`, `schema_proposal_id` and the stage list are copied from the original. `source_id` is copied too, with one exception: for a pipeline run, if one of the pipeline's sources has a recorded connection failure, `source_id` is that source.
  - Stages the original skipped by plan are planned as skipped again. `metabase_refresh` is also planned as skipped when the workspace's Metabase integration is not connected (always the case in the demo), or when the retry is expected to fail at `quality_checks`.
  - In the 202 response, every stage is still `queued` with `skip_reason: null`, including the planned skips. Planned skips turn `skipped` (with their skip reason) once the run leaves the queue, so clients see them in the next `GET /runs/{id}` after the run starts. The planned list is in the audit metadata `skipped_stages`.
  - `tables` repeats the original's table list (`status: "queued"`, `records: 0`) when the retry executes ingestion; otherwise it is empty.
  ```json
  { "id": "run_r8n4v2qe", "kind": "pipeline", "status": "queued", "trigger": "retry", "attempt": 2, "retry_of": "run_fin_000",
    "target_name": "Finance and Receivables", "pipeline_id": "pl_finance", "source_id": "src_erp", "triggered_by": { "id": "usr_rahul", "name": "Rahul Mehta" },
    "queued_at": "2026-10-28T09:45:10Z", "started_at": null, "finished_at": null, "duration_seconds": null, "records_processed": null, "error": null,
    "stages": [
      { "key": "source_connect", "name": "Source connection", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "metabase_refresh", "name": "Metabase refresh", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} } ],
    "tables": [ { "table": "public.invoices", "status": "queued", "mode": "incremental", "records": 0, "error": null } ] }
  ```
  (Stages and tables are abbreviated: the retry carries all seven stages and the seven ERP tables of `run_fin_000`. Once the run starts, `metabase_refresh` reads `"status": "skipped"` with `"skip_reason": "Metabase is not connected, so no dashboards were refreshed."`. The retry then fails at `quality_checks` again, and the later stages show `"Not run because Data quality checks failed."`.)
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 404 | `not_found` | Unknown run |
  | 403 | `forbidden` | Not a member, or missing the kind's permission |
  | 409 | `run_not_retryable` | Status is not `failed` or `cancelled`: `Only failed or cancelled runs can be retried (current status: running).` |
  | 409 | `run_not_retryable` | `error.retryable` is false: `This failure is not retryable: <message> Fix the underlying issue and trigger a new run.` |
  | 409 | `pipeline_not_runnable` | Pipeline runs only. The pipeline was deleted (`details: { "status": "deleted" }`), is a draft (`"draft"`) or is paused (`"paused"`). |
  | 409 | `run_in_progress` | Pipeline runs only. Another run of the pipeline is not terminal. `details: { "run_id": "run_…" }` |
- **Side effects:** audit `run.retried`, with:
  - `resource: { type: "run", id: <original id>, name: <target_name> }` and `execution_id: <new run id>`;
  - `metadata: { attempt, skipped_stages: StageKey[], metabase_refresh_skipped?: "Metabase is not connected" }`. The mock also writes `simulated: true`; the backend must not.
- **Async:**
  - Clients poll `GET /runs/{new id}`.
  - If the cause is still present, the retry fails the same way at the same stage. Examples: Web Orders credentials not replaced, Finance duplicate invoice IDs not fixed, a dbt model still broken.
  - A failure with `attempt >= 3` raises a `repeated_retries` notification.
- **Backend notes:**
  - Re-execute for real, with no simulated outcome. For ingestion retries, resume from the saved dlt cursors.
  - The mock checks pipeline state only for pipeline runs. The backend should apply the same guards as the matching trigger for every kind:
    - for ingestion: source exists, not paused, no active sync (`source_paused`, `sync_in_progress`);
    - for transformations: their own trigger rules.
  - See open questions.
  - Retrying an older attempt when a newer attempt exists is not prevented by the mock. Consider allowing a retry only of the latest attempt in a chain.

#### `POST /api/v1/runs/{run_id}/cancel`
Requests cancellation of a queued or running run.
- **Permission:** by the run's kind (see the table at the top of 2.7).
- **Path params:** `run_id` (string, required).
- **Request body:** none.
- **Response:** `202`, the `Run` in its current state. The status is usually still `queued` or `running`, because cancellation is asynchronous. A following `GET /runs/{id}` shows the result:
  - **Cancelled before the run started:** `status: "cancelled"`, every stage `cancelled` (planned skips stay `skipped`), `records_processed: 0`, `duration_seconds: 0`.
  - **Cancelled while running:** the running stage and every later stage become `cancelled` (planned skips stay `skipped`), and `finished_at` is the cancellation time. `records_processed` is the sum of the tables that finished; unfinished tables become `cancelled` with `records: 0`.
- **Errors:**
  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session |
  | 404 | `not_found` | Unknown run |
  | 403 | `forbidden` | Not a member, or missing the kind's permission |
  | 409 | `run_not_cancellable` | The run is already terminal: `The run has already finished with status succeeded.` |
- **Side effects:**
  - Audit `run.cancel_requested`, with `resource` set to the run and `execution_id` set to the run ID.
  - When the run settles, the lifecycle audit `<kind>.run_cancelled` is recorded. Source sync fields are not updated and no notification is sent.
- **Async:** poll `GET /runs/{run_id}` until `status` is `cancelled`, or until it is `succeeded` or `failed` if the run finished before the worker saw the request.
- **Backend notes:**
  - Signal the worker (dlt or dbt process), and let it stop at a safe point. Bronze loads should commit per table or roll back, never leave a half-merged table.
  - A repeated cancel request on a run that is still stopping should return 202 again, not 409. The mock differs: the run settles to `cancelled` before the next request is handled, so a second cancel returns 409 `run_not_cancellable` ("The run has already finished with status cancelled."), which the frontend shows as an error toast.
  - The `Run` type has no field for "cancel requested" (see open questions).

---

## 3. Pipelines and schedules

A **pipeline** is a named, end-to-end job in a workspace: it reads one or more connected sources, loads them into Bronze with dlt, runs a dbt selection into Silver/Gold, optionally runs the data quality tests and optionally refreshes Metabase. Running a pipeline creates an asynchronous **Run** (kind `pipeline`), which the client polls. A **schedule** fires one target (a pipeline, a single source sync, or a single dbt transformation) on a five-field cron expression in an IANA timezone, with a retry policy and a concurrency (overlap) policy. Schedules can also be run once on demand ("Run now").

Ground truth for this section: `src/mocks/handlers/pipelines.ts` (7 routes), `src/mocks/handlers/schedules.ts` (8 routes), `src/services/pipelines.service.ts`, `src/services/schedules.service.ts`, `src/types/pipelines.ts`, `src/types/schedules.ts`, `src/types/runs.ts`, `src/mocks/store.ts`, `src/mocks/router.ts`, `src/mocks/permissions.ts`.

### 3.0 Conventions used in this section

- All paths are relative to `/api/v1`. JSON keys are snake_case. Timestamps are ISO 8601 UTC with second precision, for example `"2026-10-28T09:15:00Z"`. Exception in the mock: the derived `next_run_at` of `Pipeline` and `Schedule` is produced by `Date.toISOString()` and carries milliseconds (`"2026-10-28T12:30:00.000Z"`); the backend should use second precision there too (the client parses either). IDs are opaque prefixed strings (`pl_`, `sch_`, `run_`, `src_`, `trf_`, `ws_`, `usr_`); new ids in the mock are the prefix plus 8 base-36 characters.
- Every route requires a signed-in session (bearer token or HttpOnly session cookie). None is public.
- Errors use the standard envelope from `src/types/common.ts` (`ApiErrorBody`):

  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "field_errors": [{ "field": "name", "message": "Name must be at least 2 characters." }], "details": {}, "request_id": "4f0c..." } }
  ```

  `details`, `field_errors` and `request_id` are optional. The client reads `field_errors` for 422 responses and shows them on the matching form fields; `field` may be a dotted path such as `retry.max_attempts`.
- Error codes shared by every endpoint in this section (they are repeated in each table):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." The client returns to the sign-in screen on any 401. |
  | 403 | `forbidden` | The user is not an active member of the workspace ("You are not a member of this workspace.") or the role lacks the permission ("Your role (viewer) does not include the \"pipelines:write\" permission."). |
  | 404 | `not_found` | The workspace, pipeline or schedule does not exist. Message pattern: `Pipeline "pl_x" was not found.` |
  | 405 | `method_not_allowed` | Path exists but the method does not. |
  | 500 | `internal_error` | Unhandled server error. |

- **Order of checks** in the mock: route matching (404 `not_found` "No mock handler for ..." for an unknown path, 405 for a known path with the wrong method; both before the session check), then session (401), then the resource lookup (404), then workspace membership and permission (403), then body validation (422), then state conflicts (409). For `/workspaces/{workspace_id}/...` routes the 404 is for the workspace (`Workspace "ws_x" was not found.`).
- **Permission denials are audited.** Every 403 caused by a missing permission (not by non-membership) records an audit event `access.denied` with `status: "denied"`, `resource: { type: "permission", id: "<permission>", name: "<permission>" }` and the acting user.
- **Role matrix** (`src/mocks/permissions.ts`) for the permissions used here:

  | Permission | owner | admin | editor | viewer |
  |---|---|---|---|---|
  | `pipelines:write` | yes | yes | no | no |
  | `pipelines:run` | yes | yes | yes | no |
  | `sources:sync` | yes | yes | yes | no |
  | `transformations:run` | yes | yes | yes | no |
  | `schedules:write` | yes | yes | yes | no |

  Read endpoints need only active membership ("any workspace member").
- **Success status codes.** The mock transport does not model 2xx status codes. `202` for anything that starts a Run is stated by the architecture document and the service comments (`trigger`, `runNow`). `200` for reads and updates, `201` for creates and `204` (no body) for deletes are this contract's recommendation; nothing in the frontend depends on them. The API client accepts any 2xx, returns `undefined` for `204`, and otherwise parses the body as JSON, so a delete must answer `204` (or `200` with a JSON body), never `200` with an empty body.
- **Pagination** (`Paginated<T>`): `page` (1-based, default 1) and `page_size` (default 20, capped at 500). Non-numeric, zero or negative values silently fall back to the default; the mock does not reject or round fractional values, the backend should require integers. Response: `{ items, page, page_size, total }`. The two workspace list endpoints in this section are **not** paginated; they return a bare JSON array.
- **Boolean query values**: `true` or `1` mean true; any other present value means false.
- **Async runs**: every trigger responds `202` with the initial `Run` (status `queued`). Clients poll `GET /runs/{run_id}` every 2 seconds and `GET /runs/{run_id}/logs?after={cursor}` for log lines until `status` is terminal (`succeeded`, `failed`, `cancelled`, `skipped`). Run endpoints are specified in the Runs section of this contract.
- **Demo-only markers**: the mock adds `"simulated": true` to audit metadata of triggered runs and labels runs as simulated in the UI. The production backend must not send `simulated: true` for real runs.

### 3.1 Types

All shapes below are the JSON bodies exactly as the frontend types declare them (`src/types`).

**Enums**

```ts
type PipelineStatus = 'active' | 'paused' | 'draft'

type StageKey =
  | 'source_connect'       // "Source connection"
  | 'ingestion'            // "Ingestion (dlt)"
  | 'bronze_load'          // "Bronze load"
  | 'dbt_transform'        // "dbt transformation"
  | 'silver_gold_publish'  // "Silver / Gold publish"
  | 'quality_checks'       // "Data quality checks"
  | 'metabase_refresh'     // "Metabase refresh"

type RunStatus  = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
type RunKind    = 'ingestion' | 'pipeline' | 'transformation' | 'dbt_test' | 'schema_apply'
type RunTrigger = 'manual' | 'schedule' | 'retry' | 'onboarding' | 'api'

type ScheduleTargetType = 'pipeline' | 'source_sync' | 'transformation'
type IntervalPreset = 'every_15_minutes' | 'hourly' | 'every_6_hours' | 'daily' | 'weekly' | 'monthly' | 'custom'
type OverlapPolicy  = 'skip' | 'queue' | 'cancel_running'
type BackoffStrategy = 'fixed' | 'exponential'
type ScheduleConflictKind = 'same_target' | 'overlapping_window' | 'shared_source'
```

Stage order is fixed: `source_connect`, `ingestion`, `bronze_load`, `dbt_transform`, `silver_gold_publish`, `quality_checks`, `metabase_refresh`. A pipeline's `stages` is this list minus `quality_checks` when `quality_checks_enabled` is false and minus `metabase_refresh` when `metabase_refresh_enabled` is false. The server derives `stages`; clients never send it on create or update.

**Pipeline** (`src/types/pipelines.ts`)

```ts
interface Pipeline {
  id: string                       // "pl_..."
  workspace_id: string
  name: string                     // 2..80 chars, unique per workspace (case-insensitive)
  description: string              // "" when not set; max 500 chars
  status: PipelineStatus
  source_ids: string[]             // >= 1 source of the same workspace, no duplicates
  dbt_selector: string             // dbt node selection, e.g. "tag:finance+"
  stages: StageKey[]               // derived from the two flags below
  quality_checks_enabled: boolean
  metabase_refresh_enabled: boolean
  schedule_id: string | null       // derived: linked schedule (see below)
  next_run_at: string | null       // derived
  last_run: RunSummary | null      // derived: newest run of this pipeline
  success_rate_7d: number | null   // derived: 0..1
  avg_duration_seconds: number | null  // derived
  owner: { id: string; name: string }
  created_at: string
  updated_at: string
}
```

Derived fields, computed on every read:

- `schedule_id`: the stored link if it still points to an existing schedule, otherwise the first schedule whose `target_type` is `pipeline` and `target_id` is this pipeline, otherwise `null`. Schedule writes keep the stored link pointed at an enabled schedule when one exists (see 3.3).
- `next_run_at`: the next cron occurrence of the linked schedule, only when that schedule is enabled **and** the pipeline is `active`; otherwise `null`.
- `last_run`: summary of the most recently queued run with this `pipeline_id`, any trigger.
- `success_rate_7d`: among this pipeline's runs queued in the last 7 days with status `succeeded` or `failed` (cancelled runs are excluded), the fraction that succeeded, as an unrounded number; `null` when there are none.
- `avg_duration_seconds`: rounded mean `duration_seconds` of the 20 most recent `succeeded` runs with a non-zero duration; `null` when there are none.

**RunSummary** (`src/types/runs.ts`): `Pick<Run, id | kind | status | trigger | target_name | pipeline_id | source_id | transformation_id | queued_at | started_at | finished_at | duration_seconds | attempt>` plus:

```ts
  error_message: string | null   // run.error.message
  retryable: boolean | null      // run.error.retryable; null when the run has no error
```

**Run** (returned by the trigger endpoints and the run-history endpoints; full specification in the Runs section)

```ts
interface Run {
  id: string                         // "run_..."
  workspace_id: string
  kind: RunKind
  status: RunStatus
  trigger: RunTrigger
  triggered_by: { id: string; name: string }
  target_name: string                // pipeline, source or transformation name at trigger time
  pipeline_id: string | null
  source_id: string | null
  transformation_id: string | null
  schedule_id: string | null
  schema_proposal_id: string | null
  queued_at: string
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  attempt: number                    // 1 for a first attempt
  retry_of: string | null
  records_processed: number | null
  stages: RunStage[]
  tables: TableSyncResult[]
  error: RunError | null
}
interface RunStage {
  key: StageKey
  name: string                       // display name, see StageKey comments
  status: RunStatus
  started_at: string | null
  finished_at: string | null
  duration_seconds: number | null
  error: RunError | null
  skip_reason: string | null         // set only when status is "skipped"
  metrics: Record<string, number>
}
interface RunError {
  stage: StageKey | null
  code: string                       // e.g. "quality_checks_failed"
  message: string
  details: string | null
  retryable: boolean
}
interface TableSyncResult {
  table: string                      // "schema.table"
  status: RunStatus
  mode: 'full' | 'incremental'
  records: number
  error: string | null
}
```

**Paginated<T>**: `{ items: T[]; page: number; page_size: number; total: number }`.

**Schedule** (`src/types/schedules.ts`)

```ts
interface RetryPolicy {
  max_attempts: number               // integer 0..10
  backoff_seconds: number            // integer 30..86400
  backoff_strategy: BackoffStrategy
}
interface ConcurrencyPolicy {
  max_concurrent_runs: number        // integer 1..10
  overlap_policy: OverlapPolicy
}
interface Schedule {
  id: string                         // "sch_..."
  workspace_id: string
  name: string                       // 3..120 chars
  description: string                // "" when not set; max 500 chars
  target_type: ScheduleTargetType
  target_id: string                  // pl_..., src_... or trf_... in the same workspace
  target_name: string                // derived: current name of the target
  preset: IntervalPreset             // UI label for the cadence; cron is authoritative
  cron: string                       // five fields, whitespace-normalised
  timezone: string                   // IANA name, e.g. "Asia/Kolkata"
  enabled: boolean
  retry: RetryPolicy
  concurrency: ConcurrencyPolicy
  next_run_at: string | null         // derived: next occurrence when enabled, else null
  last_run: RunSummary | null        // derived: newest run with this schedule_id
  created_by: { id: string; name: string }
  created_at: string
  updated_at: string
}
```

**ScheduleConflict / ValidateScheduleResponse**

```ts
interface ScheduleConflict {
  schedule_id: string                // "" for an overlapping_window warning on an unsaved schedule
  schedule_name: string              // "This schedule" for overlapping_window
  kind: ScheduleConflictKind
  message: string
}
interface ValidateScheduleResponse {
  valid: boolean                     // true when errors is empty
  description: string | null         // human-readable cron, 24-hour clock, e.g. "On the hour, every 6 hours"
  next_runs: string[]                // next 5 occurrences (UTC ISO) when cron and timezone are valid, else []
  conflicts: ScheduleConflict[]      // warnings only; they never make valid false
  errors: string[]                   // plain messages, not field errors
}
```

Conflicts are advisory and never block a save. The only blocking schedule conflict is `duplicate_schedule` (409) on create and update.

---

### 3.2 Pipelines

#### `GET /api/v1/workspaces/{workspace_id}/pipelines`

Lists the pipelines of a workspace with their derived run statistics.

- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `workspace_id` | string | yes | | Workspace id. |

- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | | Trimmed, case-insensitive substring match on `name`, `description` or `dbt_selector`. |
  | `status` | `PipelineStatus` | no | | Exact match. Unknown value: 422. |
  | `last_run_status` | `RunStatus` | no | | Matches `last_run.status`. Pipelines with no runs never match. Unknown value: 422. |
  | `source_id` | string | no | | Pipelines whose `source_ids` contains this id. |

- **Request body:** none.
- **Response:** `200`, `Pipeline[]` (not paginated). The mock returns storage order (newest created first, then seed order); the UI sorts client-side by name, status, last run, success rate, duration and next run, so order is not significant.

  Example for the seeded Finance pipeline, requested at 09:15 UTC (seeded Finance runs start at 00:00, 06:00, 12:00 and 18:00 UTC; 25 of the 27 succeeded or failed runs of the last 7 days succeeded):

  ```json
  [
    {
      "id": "pl_finance",
      "workspace_id": "ws_acme",
      "name": "Finance and Receivables",
      "description": "ERP invoices and payments into revenue, collections and receivables ageing.",
      "status": "active",
      "source_ids": ["src_erp"],
      "dbt_selector": "tag:finance+",
      "stages": ["source_connect", "ingestion", "bronze_load", "dbt_transform", "silver_gold_publish", "quality_checks", "metabase_refresh"],
      "quality_checks_enabled": true,
      "metabase_refresh_enabled": true,
      "schedule_id": "sch_finance",
      "next_run_at": "2026-10-28T12:30:00Z",
      "last_run": {
        "id": "run_fin_000", "kind": "pipeline", "status": "failed", "trigger": "schedule",
        "target_name": "Finance and Receivables", "pipeline_id": "pl_finance", "source_id": "src_erp", "transformation_id": null,
        "queued_at": "2026-10-28T05:59:58Z", "started_at": "2026-10-28T06:00:00Z", "finished_at": "2026-10-28T06:11:09Z",
        "duration_seconds": 669, "attempt": 1,
        "error_message": "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).",
        "retryable": true
      },
      "success_rate_7d": 0.9259259259259259,
      "avg_duration_seconds": 642,
      "owner": { "id": "usr_rahul", "name": "Rahul Mehta" },
      "created_at": "2026-06-22T09:15:00Z",
      "updated_at": "2026-10-22T09:15:00Z"
    }
  ]
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the workspace. |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | `field_errors[].field` is `status` ("Status must be one of active, paused, draft.") or `last_run_status` ("Run status must be one of queued, running, succeeded, failed, cancelled, skipped."). |

- **Side effects:** none.
- **Backend notes:** Compute `last_run`, `success_rate_7d` and `avg_duration_seconds` with one aggregate query per page, not per row; the list is polled every 3 seconds while any pipeline has a non-terminal `last_run`. If workspaces can grow beyond a few hundred pipelines, add pagination as a backward-compatible change (the frontend currently expects an array).

#### `POST /api/v1/workspaces/{workspace_id}/pipelines`

Creates a pipeline in the workspace. New pipelines are always `active`.

- **Permission:** `pipelines:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `CreatePipelineRequest`

  ```ts
  {
    name: string                      // required
    description?: string              // optional; the TS type allows only string, the mock also accepts null
    source_ids: string[]              // required
    dbt_selector: string              // required
    quality_checks_enabled: boolean   // required
    metabase_refresh_enabled: boolean // required
  }
  ```

  Validation (all failures are collected and returned together as one 422):
  - `name`: trimmed length 2..80; must not equal (case-insensitive) the name of another pipeline in the workspace.
  - `description`: if present and not null, must be a string of at most 500 characters (checked before trimming). Stored trimmed; absent or null is stored as `""`.
  - `source_ids`: the workspace must have at least one source; the array must be non-empty; every id must be a source of this workspace; no duplicates. A source in `error` or `paused` state is accepted.
  - `dbt_selector`: trimmed, non-empty, at most 200 characters, and must match `^[A-Za-z0-9_.:/*+@,\- ]+$` (dbt selection methods such as `tag:`, `path:`, `source:`, graph operators `+ @ *`, unions with spaces or commas).
  - `quality_checks_enabled`, `metabase_refresh_enabled`: must be JSON booleans.
  - No secrets are involved.

  ```json
  { "name": "Collections Weekly", "description": "Receivables collection effort by region.", "source_ids": ["src_erp"], "dbt_selector": "tag:finance+ tag:collections", "quality_checks_enabled": true, "metabase_refresh_enabled": false }
  ```

- **Response:** `201`, `Pipeline`. Server-set fields: `id`, `workspace_id`, `status: "active"`, `stages` (derived from the flags), `schedule_id: null`, `next_run_at: null`, `last_run: null`, `success_rate_7d: null`, `avg_duration_seconds: null`, `owner` (the caller), `created_at`, `updated_at`.

  ```json
  { "id": "pl_7hq2m4ne", "workspace_id": "ws_acme", "name": "Collections Weekly", "description": "Receivables collection effort by region.", "status": "active", "source_ids": ["src_erp"], "dbt_selector": "tag:finance+ tag:collections", "stages": ["source_connect", "ingestion", "bronze_load", "dbt_transform", "silver_gold_publish", "quality_checks"], "quality_checks_enabled": true, "metabase_refresh_enabled": false, "schedule_id": null, "next_run_at": null, "last_run": null, "success_rate_7d": null, "avg_duration_seconds": null, "owner": { "id": "usr_rahul", "name": "Rahul Mehta" }, "created_at": "2026-10-28T09:15:00Z", "updated_at": "2026-10-28T09:15:00Z" }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `pipelines:write` (editor, viewer). |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | Field errors on `name` ("Name must be at least 2 characters.", "Name must be 80 characters or fewer.", `A pipeline named "Sales Analytics" already exists in this workspace.`), `description` ("Description must be text.", "Description must be 500 characters or fewer."), `source_ids` ("This workspace has no data sources yet. Connect a source before creating a pipeline.", "Select at least one source.", "Unknown source in this workspace: src_x.", "Each source can only be selected once."), `dbt_selector` ("Enter a dbt selector, for example tag:sales+.", "Selector must be 200 characters or fewer.", "Selector contains unsupported characters. ..."), `quality_checks_enabled` / `metabase_refresh_enabled` ("Must be true or false."). |

- **Side effects:** audit `pipeline.created` on resource `{ type: "pipeline", id, name }` with `changes` listing `name`, `description`, `status`, `source_ids`, `dbt_selector`, `quality_checks_enabled`, `metabase_refresh_enabled` (before `null`). No schedule is created and no run is started.
- **Backend notes:** Enforce name uniqueness with a unique index on `(workspace_id, lower(name))` and map the violation to the same 422 field error. Validate `dbt_selector` against the workspace's dbt project (for example `dbt ls --select`) asynchronously or at first run; the mock only checks the character set. Creating a pipeline in `draft` status is not possible through this endpoint (see open questions).

#### `GET /api/v1/pipelines/{pipeline_id}`

Returns one pipeline with its derived fields.

- **Permission:** any member of the pipeline's workspace.
- **Path params:** `pipeline_id` (string, required).
- **Response:** `200`, `Pipeline` (same shape and example as the list item).
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Caller is not a member of the pipeline's workspace. |
  | 404 | `not_found` | `Pipeline "pl_x" was not found.` |

- **Side effects:** none.
- **Backend notes:** The detail page polls this endpoint every 3 seconds while `last_run` is non-terminal. The mock returns 404 for an unknown id but 403 for an existing pipeline in a workspace the caller does not belong to, which reveals that the id exists; the backend should return 404 in both cases.

#### `PATCH /api/v1/pipelines/{pipeline_id}`

Partially updates a pipeline's configuration or changes its status (pause, resume, activate).

- **Permission:** `pipelines:write`.
- **Path params:** `pipeline_id` (string, required).
- **Request body:** `UpdatePipelineRequest = Partial<CreatePipelineRequest> & { status?: PipelineStatus }`. Every key is optional; absent keys are left unchanged. Unknown keys are ignored.
  - Each present key is validated with the same rules as create. The name uniqueness check excludes the pipeline itself. `description: null` clears the description to `""`.
  - `status`: must be `active`, `paused` or `draft` (422 otherwise). Allowed transitions: `draft -> active`, `draft -> paused`, `active -> paused`, `paused -> active`, and any no-op. Moving an `active` or `paused` pipeline to `draft` is a 409.
  - `stages` is recomputed from the (possibly updated) flags on every PATCH.

  ```json
  { "status": "paused" }
  ```

- **Response:** `200`, the updated `Pipeline`.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `pipelines:write`. |
  | 404 | `not_found` | Pipeline does not exist. |
  | 422 | `validation_error` | Same field errors as create, plus `status`: "Status must be one of active, paused, draft." |
  | 409 | `invalid_status_transition` | `status: "draft"` on a pipeline that is not a draft. Message: "An active or paused pipeline cannot be moved back to draft. Pause it instead." Checked after validation. |

- **Side effects:** an audit event is written only when at least one editable field (`name`, `description`, `status`, `source_ids`, `dbt_selector`, `quality_checks_enabled`, `metabase_refresh_enabled`) actually changed. The action is:
  - `pipeline.paused` when only `status` changed and the new status is `paused`;
  - `pipeline.activated` when only `status` changed and the previous status was `draft`;
  - `pipeline.resumed` when only `status` changed otherwise (`paused -> active`);
  - `pipeline.updated` in every other case.

  `changes` holds `{ field, before, after }` for each changed field. Schedules targeting the pipeline are not modified: a paused pipeline keeps its enabled schedules, the pipeline's own `next_run_at` becomes `null` (the schedules' `next_run_at` is still computed, because it ignores the target's status), and "Run now" on those schedules returns 409 `target_not_runnable`.
- **Backend notes:** Edits are allowed while a run is in progress; the running attempt keeps the configuration it started with, so the backend must snapshot the pipeline definition onto the run at trigger time. The scheduler must skip (not queue) scheduled firings of a paused or draft pipeline; the UI tells users "Scheduled runs are skipped until the pipeline is resumed."

#### `DELETE /api/v1/pipelines/{pipeline_id}`

Deletes a pipeline that has no schedules and no run in progress.

- **Permission:** `pipelines:write`.
- **Path params:** `pipeline_id` (string, required).
- **Request body:** none.
- **Response:** `204`, no body.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `pipelines:write`. |
  | 404 | `not_found` | Pipeline does not exist. |
  | 409 | `pipeline_has_schedules` | One or more schedules (enabled or not) target the pipeline. Message: `"Finance and Receivables" is the target of a schedule: Finance every 6 hours. Delete or retarget it first.` `details: { "schedules": [{ "id": "sch_finance", "name": "Finance every 6 hours" }] }`. Checked first. |
  | 409 | `run_in_progress` | A run of the pipeline is `queued` or `running`. `details: { "run_id": "run_..." }`. |

- **Side effects:** audit `pipeline.deleted` on `{ type: "pipeline", id, name }` with `changes: []` and no metadata (the mock calls `diffChanges(snapshot, {})`, which yields no entries because it only iterates the keys of the empty "after" object). The backend may record the deleted configuration instead; the UI does not depend on it. Existing runs keep their `pipeline_id`; run history is not deleted.
- **Backend notes:** Perform both checks and the delete in one transaction (or with a row lock on the pipeline) so a schedule or run created concurrently cannot slip in. Decide whether to soft-delete so that run history and audit links keep resolving to a name.

#### `POST /api/v1/pipelines/{pipeline_id}/runs`

Starts a manual run of an active pipeline, optionally as a full refresh or for a subset of its stages.

- **Permission:** `pipelines:run`.
- **Path params:** `pipeline_id` (string, required).
- **Request body:** `TriggerPipelineRunRequest`, optional (an empty body or `{}` runs every stage incrementally).

  ```ts
  {
    full_refresh?: boolean   // default false; re-extracts every row of every selected table
    stages?: StageKey[]      // default: all of pipeline.stages
  }
  ```

  Validation, in order (each failure returns a single-field 422 immediately):
  - `full_refresh`, if present, must be a boolean.
  - `stages`, if present, must be a non-empty array and every entry must be in `pipeline.stages`. Order and duplicates are not checked.

  ```json
  { "full_refresh": false, "stages": ["dbt_transform", "silver_gold_publish", "quality_checks"] }
  ```

- **Response:** `202`, `Run` at creation:
  - `kind: "pipeline"`, `status: "queued"`, `trigger: "manual"`, `triggered_by` = caller, `target_name` = pipeline name;
  - `pipeline_id` = the pipeline; `source_id` = the first source (or, when a source is known to be failing, that source); `schedule_id: null`; `transformation_id: null`; `schema_proposal_id: null`;
  - `attempt: 1`, `retry_of: null`, `started_at`, `finished_at`, `duration_seconds` and `records_processed` all `null`, `error: null`;
  - `stages`: one entry per `pipeline.stages` (including stages that will be skipped), each `status: "queued"` with null timings;
  - `tables`: one entry per selected table of every source when `ingestion` is executed, `status: "queued"`, `records: 0`, `mode` = `"full"` when `full_refresh` is true, otherwise the table's configured ingestion mode; `[]` when `ingestion` is not executed (so the stage-subset request example above returns `tables: []`).

  Response to an empty body `{}` for the Finance pipeline:

  ```json
  {
    "id": "run_k3x9q2mf", "workspace_id": "ws_acme", "kind": "pipeline", "status": "queued", "trigger": "manual",
    "triggered_by": { "id": "usr_rahul", "name": "Rahul Mehta" }, "target_name": "Finance and Receivables",
    "pipeline_id": "pl_finance", "source_id": "src_erp", "transformation_id": null, "schedule_id": null, "schema_proposal_id": null,
    "queued_at": "2026-10-28T09:15:02Z", "started_at": null, "finished_at": null, "duration_seconds": null,
    "attempt": 1, "retry_of": null, "records_processed": null,
    "stages": [
      { "key": "source_connect", "name": "Source connection", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "metabase_refresh", "name": "Metabase refresh", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} }
    ],
    "tables": [ { "table": "public.invoices", "status": "queued", "mode": "incremental", "records": 0, "error": null } ],
    "error": null
  }
  ```

  (`stages` and `tables` are abbreviated in the example; the real response lists all seven stages and all seven ERP tables.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `pipelines:run` (viewer). |
  | 404 | `not_found` | Pipeline does not exist. |
  | 422 | `validation_error` | `full_refresh`: "full_refresh must be true or false."; `stages`: "Select at least one stage to run." or "Not part of this pipeline: metabase_refresh." |
  | 409 | `pipeline_not_runnable` | Pipeline status is `draft` (`"Customer 360" is a draft. Activate it before running.`) or `paused` (`... is paused. Resume it before running.`). `details: { "status": "draft" }`. |
  | 409 | `run_in_progress` | The pipeline already has a `queued` or `running` run. `details: { "run_id": "run_..." }`. |

- **Side effects:**
  - Audit `pipeline.run_triggered` on the pipeline with `execution_id` = run id and `metadata: { full_refresh, stages: <executed stages>, metabase_refresh_skipped?: "Metabase status: unreachable" }` (the mock also adds `simulated: true`).
  - When the run reaches a terminal state the orchestrator (actor `{ type: "service", id: "svc_orchestrator", name: "Orchestrator" }`; for runs with `trigger: "schedule"` the actor is `{ type: "scheduler", id: "svc_scheduler", name: "Scheduler" }`) records `pipeline.run_succeeded`, `pipeline.run_failed` or `pipeline.run_cancelled` on resource `{ type: "run", id: <run id>, name: <pipeline name> }`, with `status` `success` (succeeded or cancelled) or `failure`, `execution_id` = run id and `metadata: { duration_seconds }` (plus `simulated: true` in the mock).
  - Notifications on completion: failure produces exactly one notification with severity `critical`, chosen in this order: `repeated_retries` when `attempt` is 3 or more, else `quality_failed` when the error stage is `quality_checks`, else `pipeline_failed`; success produces `sync_completed`, severity `success`; a cancelled run produces none. Each honours the recipient's in-app notification preferences.
  - Source bookkeeping on completion (not on cancel): when any of `source_connect`, `ingestion`, `bronze_load` executed, each source's `last_sync_at`, `last_sync_status`, `last_sync_duration_seconds`, `last_sync_records` are updated; a successful sync also sets `last_successful_sync_at`, adds to `total_records`, returns an `error` source to `active`, marks its Bronze models fresh. A `source_connect` failure marks only the failing source `error`/`unhealthy`.
- **Async:** yes. Stages not in the request are reported `skipped` with `skip_reason: "Not selected for this run."`, except `metabase_refresh`, whose planned-skip reason in the mock is always `"Metabase is not connected, so no dashboards were refreshed."` (even when it was merely deselected; the backend should say "Not selected for this run." in that case). `metabase_refresh` is also reported `skipped` with that reason whenever it is executed but the workspace's Metabase integration is not `connected` (always the case in the demo: Acme is `unreachable`, Northwind `not_configured`). When a stage fails, the run fails and every later stage, including planned skips, is `skipped` with `skip_reason: "Not run because <stage name> failed."`. Demo outcomes: Web Orders fails at `source_connect` (`source_auth_failed`, "Authentication failed for user \"graphite_reader\".") only when `source_connect` is executed; Finance and Receivables fails at `quality_checks` with code `quality_checks_failed` ("1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", `retryable: true`) only when `quality_checks` is executed, so a Finance run without that stage succeeds. Clients poll `GET /runs/{run_id}` and `GET /runs/{run_id}/logs?after=` every 2 seconds until terminal.
- **Backend notes:** Enqueue the run on the orchestrator (dlt, dbt with `--select <dbt_selector>`, dbt tests, Metabase API) and return immediately; do not wait for a worker. Make the "one active run per pipeline" check atomic (for example a partial unique index on `runs(pipeline_id) WHERE status IN ('queued','running')`). Consider an `Idempotency-Key` header so a double-click cannot create two runs. A stage subset that skips `ingestion` but runs `dbt_transform` is accepted; the backend decides whether stale Bronze is acceptable. Snapshot the pipeline definition (sources, selector, flags) onto the run. Consider a per-workspace rate limit on triggers.

#### `GET /api/v1/pipelines/{pipeline_id}/runs`

Paginated execution history of one pipeline.

- **Permission:** any member of the pipeline's workspace.
- **Path params:** `pipeline_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `status` | `RunStatus` | no | | Exact match. Unknown value: 422. |
  | `page` | integer | no | 1 | 1-based page number. |
  | `page_size` | integer | no | 20 | Max 500. The UI sends 10. |

  `RunListQuery.kind` exists in the shared type but is ignored by this endpoint.
- **Response:** `200`, `Paginated<Run>` of runs with this `pipeline_id` (any trigger, including schedule, retry and schedule "Run now" runs), newest `queued_at` first (the mock returns storage order, which is newest first; it does not sort explicitly).

  ```json
  { "items": [ { "id": "run_fin_000", "kind": "pipeline", "status": "failed", "trigger": "schedule", "schedule_id": "sch_finance", "attempt": 1, "...": "full Run" } ], "page": 1, "page_size": 10, "total": 56 }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the pipeline's workspace. |
  | 404 | `not_found` | Pipeline does not exist. |
  | 422 | `validation_error` | `status`: "Status must be one of queued, running, succeeded, failed, cancelled, skipped." |

- **Side effects:** none.
- **Backend notes:** Polled every 3 seconds while any listed run is non-terminal. Index `runs(pipeline_id, queued_at DESC)`. A full `Run` per item includes `stages` and `tables`; if that becomes heavy, keep the shape but cap `page_size` at 100.

---

### 3.3 Schedules

Behaviour shared by schedule writes:

- **Target resolution.** `target_id` must exist in the schedule's workspace: a pipeline (`target_type: "pipeline"`), a source (`"source_sync"`) or a dbt transformation whose dbt project belongs to the workspace (`"transformation"`). `target_name` is re-read from the target on every read, falling back to the stored name when the target no longer exists.
- **Linked-resource sync** after create, update (for both the old and the new target) and delete:
  - `source_sync`: the source's `schedule` object (`{ frequency, cron, timezone }`) mirrors the most recently updated **enabled** sync schedule of that source. `frequency` is the preset when it is one of `hourly`, `every_6_hours`, `daily`, `weekly`, otherwise `custom`. With no enabled sync schedule, the source becomes `{ frequency: "manual", cron: null, timezone: <unchanged> }`. The source's `updated_at` is bumped only when the object actually changes.
  - `pipeline`: the pipeline's stored `schedule_id` is set to its current schedule if that is still enabled, else to any enabled schedule targeting it, else to its current or first schedule, else `null`.
- **Duplicate rule.** An enabled schedule may not share the same `target_type`, `target_id` and whitespace-normalised `cron` with another enabled schedule of the workspace (timezone is not compared). Violations return 409 `duplicate_schedule`.
- **Cron.** Exactly five fields (minute hour day-of-month month day-of-week), whitespace collapsed to single spaces, parsed in the schedule's timezone with standard cron semantics (ranges, steps, lists, names). Seconds fields and `@daily`-style macros are rejected by the five-field rule.

#### `GET /api/v1/workspaces/{workspace_id}/schedules`

Lists the schedules of a workspace.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | | Case-insensitive substring match on `name`, `description`, `target_name` or `cron`. |
  | `enabled` | boolean | no | | `true`/`1` for enabled only; any other value for disabled only. |
  | `target_type` | `ScheduleTargetType` | no | | Exact match. Not validated: an unknown value returns `[]`. |

- **Response:** `200`, `Schedule[]` (not paginated), sorted by `name` ascending (locale compare).

  ```json
  [
    {
      "id": "sch_finance", "workspace_id": "ws_acme", "name": "Finance every 6 hours",
      "description": "Revenue, collections and receivables.",
      "target_type": "pipeline", "target_id": "pl_finance", "target_name": "Finance and Receivables",
      "preset": "every_6_hours", "cron": "0 */6 * * *", "timezone": "Asia/Kolkata", "enabled": true,
      "retry": { "max_attempts": 3, "backoff_seconds": 600, "backoff_strategy": "exponential" },
      "concurrency": { "max_concurrent_runs": 1, "overlap_policy": "skip" },
      "next_run_at": "2026-10-28T12:30:00Z",
      "last_run": { "id": "run_fin_000", "kind": "pipeline", "status": "failed", "trigger": "schedule", "target_name": "Finance and Receivables", "pipeline_id": "pl_finance", "source_id": "src_erp", "transformation_id": null, "queued_at": "2026-10-28T05:59:58Z", "started_at": "2026-10-28T06:00:00Z", "finished_at": "2026-10-28T06:11:09Z", "duration_seconds": 669, "attempt": 1, "error_message": "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", "retryable": true },
      "created_by": { "id": "usr_rahul", "name": "Rahul Mehta" },
      "created_at": "2026-06-30T09:15:00Z", "updated_at": "2026-10-18T09:15:00Z"
    }
  ]
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the workspace. |
  | 404 | `not_found` | Workspace does not exist. |

- **Side effects:** none.
- **Backend notes:** The list page calls this twice (unfiltered for the "Next 24 hours" strip, filtered for the table) and refreshes every 60 seconds, or every 4 seconds while any `last_run` is active. `next_run_at` must be computed in the schedule's timezone, including DST transitions. Consider rejecting an unknown `target_type` with 422 for consistency with the pipelines list.

#### `POST /api/v1/workspaces/{workspace_id}/schedules/validate`

Dry-run validation of a cron expression for a target: returns a readable description, the next five run times and advisory conflicts. Nothing is stored.

- **Permission:** any workspace member (no write permission is needed).
- **Path params:** `workspace_id` (string, required).
- **Request body:** `ValidateScheduleRequest`

  ```ts
  {
    cron: string                     // required for a useful answer
    timezone: string                 // IANA name
    target_type: ScheduleTargetType
    target_id: string                // may be ""; then the target is not checked and no conflicts are computed
    schedule_id?: string             // when editing: excluded from conflict detection
  }
  ```

  This endpoint never returns 422. Problems are reported in `errors` and `valid: false`:
  - timezone not a valid IANA name: `"\"Mars/Base\" is not a valid IANA timezone."`;
  - cron empty, not five fields, or not parseable (parser message, e.g. "Constraint error, got value 25 expected range 0-23");
  - when `target_id` is non-empty: unknown `target_type` ("Unknown target type.") or target not in the workspace (`Pipeline "pl_x" does not exist in this workspace.`).
- **Response:** `200`, `ValidateScheduleResponse`. `description` and `next_runs` are filled only when both the cron and timezone are valid (`description` can still be `null` if the describer cannot phrase the expression). `conflicts` are computed only when the cron, timezone and target are all valid:
  - `same_target`: each other **enabled** schedule (excluding `schedule_id`) with the same target. Message: `"<name>" already runs <target> (<description>, <timezone>). Both schedules will trigger it.`
  - `shared_source`: each other enabled schedule with a different target that reads at least one of the same sources (pipelines read their `source_ids`, a source sync reads its source, transformations read none) and has an occurrence within 15 minutes of any of this schedule's next five runs. Message names the sources and the first overlap in the requested timezone.
  - `overlapping_window`: when the smallest gap between the next five runs is shorter than the target's typical duration (median, upper middle for an even count, of the non-zero `duration_seconds` of its last ten `succeeded` or `failed` runs of the target's own kind: `pipeline`, `ingestion` or `transformation`). Message: `Runs can start every <gap>, but <target> typically takes <duration>. Consecutive runs will overlap and the overlap policy will apply.` `schedule_id` is the request's `schedule_id` or `""`, `schedule_name` is `"This schedule"`.

  Example for the seeded Finance schedule (request `{ "cron": "0 */6 * * *", "timezone": "Asia/Kolkata", "target_type": "pipeline", "target_id": "pl_finance", "schedule_id": "sch_finance" }`, sent at 09:15 UTC):

  ```json
  {
    "valid": true,
    "description": "On the hour, every 6 hours",
    "next_runs": ["2026-10-28T12:30:00Z", "2026-10-28T18:30:00Z", "2026-10-29T00:30:00Z", "2026-10-29T06:30:00Z", "2026-10-29T12:30:00Z"],
    "conflicts": [
      { "schedule_id": "sch_inventory", "schedule_name": "Inventory before business hours", "kind": "shared_source", "message": "Runs within 15 minutes of \"Inventory before business hours\", which also reads from ERP Database (first overlap at 29 Oct, 06:00 Asia/Kolkata). Concurrent extraction can hit source rate limits or lock tables." },
      { "schedule_id": "sch_erp_sync", "schedule_name": "ERP sync every 6 hours", "kind": "shared_source", "message": "Runs within 15 minutes of \"ERP sync every 6 hours\", which also reads from ERP Database (first overlap at 28 Oct, 18:00 Asia/Kolkata). Concurrent extraction can hit source rate limits or lock tables." }
    ],
    "errors": []
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the workspace. |
  | 404 | `not_found` | Workspace does not exist. |

- **Side effects:** none.
- **Backend notes:** Called by the schedule form on every debounced change (cached client-side for 30 seconds), so it must be cheap: cap the occurrence expansion of other schedules (the mock caps at 2,000 occurrences per schedule) and consider a light rate limit. Use one cron library for validation, `next_run_at` and the scheduler itself so the preview matches what actually fires. The description text comes from cronstrue in the mock (24-hour clock); any equivalent wording is acceptable.

#### `POST /api/v1/workspaces/{workspace_id}/schedules`

Creates a schedule.

- **Permission:** `schedules:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpsertScheduleRequest`

  ```ts
  {
    name: string                     // required, trimmed, 3..120
    description?: string             // optional, max 500, stored trimmed, default ""
    target_type: ScheduleTargetType  // required
    target_id: string                // required, must exist in the workspace
    preset: IntervalPreset           // required, enum
    cron: string                     // required, five fields, whitespace-normalised before storage
    timezone: string                 // required, valid IANA name
    enabled?: boolean                // optional on create, default true (absent or null); the TS type marks it required
    retry: RetryPolicy               // required: max_attempts int 0..10, backoff_seconds int 30..86400, backoff_strategy enum
    concurrency: ConcurrencyPolicy   // required: max_concurrent_runs int 1..10, overlap_policy enum
  }
  ```

  All validation failures are returned together. Unknown keys inside `retry` and `concurrency` are dropped. `preset` is not cross-checked against `cron`. The target may be paused or a draft; that only blocks "Run now". No secrets are involved.

  ```json
  { "name": "Collections weekly Monday", "description": "", "target_type": "pipeline", "target_id": "pl_finance", "preset": "weekly", "cron": "0 7 * * 1", "timezone": "Asia/Kolkata", "enabled": true, "retry": { "max_attempts": 2, "backoff_seconds": 300, "backoff_strategy": "exponential" }, "concurrency": { "max_concurrent_runs": 1, "overlap_policy": "skip" } }
  ```

- **Response:** `201`, `Schedule` with `id`, `workspace_id`, `target_name`, `created_by` (caller), `created_at`, `updated_at`, and derived `next_run_at` and `last_run: null`.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `schedules:write` (viewer). |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | Field errors: `name` ("Name must be at least 3 characters.", "Name must be 120 characters or fewer."), `description` ("Description must be 500 characters or fewer."), `target_type` ("Target type must be pipeline, source_sync or transformation."), `target_id` ("Select a pipeline to schedule.", `Pipeline "pl_x" does not exist in this workspace.`), `preset` ("Unknown frequency preset."), `timezone` (`"Mars/Base" is not a valid IANA timezone, e.g. Asia/Kolkata.`), `cron` ("Enter a cron expression.", "Use five fields: minute hour day-of-month month day-of-week.", or the parser message), `enabled` ("Enabled must be true or false."), `retry` ("Retry policy is required."), `retry.max_attempts` ("Retry attempts must be a whole number from 0 to 10."), `retry.backoff_seconds` ("Backoff must be between 30 seconds and 86400 seconds (24 hours)."), `retry.backoff_strategy` (`Backoff strategy must be "fixed" or "exponential".`), `concurrency` ("Concurrency policy is required."), `concurrency.max_concurrent_runs` ("Concurrent runs must be a whole number from 1 to 10."), `concurrency.overlap_policy` ("Overlap policy must be skip, queue or cancel_running."). The `target_id` message names the type: "Select a pipeline / source / transformation to schedule." |
  | 409 | `duplicate_schedule` | Enabled and another enabled schedule has the same target and cron. Message: `"Finance every 6 hours" already runs this target on the same cron (0 */6 * * *). Disable it or choose a different cadence.` `details: { "schedule_id": "sch_finance", "schedule_name": "Finance every 6 hours" }`. |

- **Side effects:** linked-resource sync (source `schedule` object or pipeline `schedule_id`, see 3.3 intro). Audit `schedule.created` on `{ type: "schedule", id, name }` with `changes` from empty for every definition field, with `retry` and `concurrency` flattened to dotted keys (`retry.max_attempts`, `concurrency.overlap_policy`, ...), and `metadata: { target_type, target_id }`. No run is started.
- **Backend notes:** Register the schedule with the real scheduler (for example a scheduler table polled by a worker, or Airflow/Temporal schedules) inside the same transaction or with an outbox, so a stored schedule is never left unregistered. Enforce the duplicate rule atomically.

#### `GET /api/v1/schedules/{schedule_id}`

Returns one schedule.

- **Permission:** any member of the schedule's workspace.
- **Path params:** `schedule_id` (string, required).
- **Response:** `200`, `Schedule` (example as in the list).
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the schedule's workspace. |
  | 404 | `not_found` | `Schedule "sch_x" was not found.` |

- **Side effects:** none.
- **Backend notes:** The detail page polls every 2 seconds while `last_run` is active, otherwise every 60 seconds. The pipeline detail page also calls this for the pipeline's linked schedule. The frontend treats a schedule whose `workspace_id` differs from the URL workspace as not found; the backend should return 404 (not 403) for schedules outside the caller's workspaces.

#### `PATCH /api/v1/schedules/{schedule_id}`

Partially updates a schedule, including enabling or disabling it.

- **Permission:** `schedules:write`.
- **Path params:** `schedule_id` (string, required).
- **Request body:** `UpdateScheduleRequest = Partial<UpsertScheduleRequest>`. Only the editable keys (`name`, `description`, `target_type`, `target_id`, `preset`, `cron`, `timezone`, `enabled`, `retry`, `concurrency`) are read; any other key (`id`, `workspace_id`, `created_by`, `next_run_at`, ...) is ignored. `retry` and `concurrency` may be partial objects; they are merged into the stored policy. `name` and `description` are trimmed and the cron is normalised (other strings are used as sent). A `null` value for `name`, `description`, `cron`, `retry` or `concurrency` keeps the stored value; a `null` for `target_type`, `target_id`, `preset`, `timezone` or `enabled` replaces it and fails validation. The merged definition is then validated with the full create rules, and the duplicate rule is applied excluding this schedule; both run before the no-change check below.

  ```json
  { "enabled": false }
  ```

- **Response:** `200`, the updated `Schedule`. When the merged definition equals the stored one, the stored schedule is returned unchanged (same `updated_at`), and no linked-resource sync or audit event happens.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `schedules:write`. |
  | 404 | `not_found` | Schedule does not exist. |
  | 422 | `validation_error` | Same field errors as create, evaluated on the merged definition. |
  | 409 | `duplicate_schedule` | The merged schedule is enabled and duplicates another enabled schedule (for example re-enabling a schedule after an identical one was created). Same `details` as create. |

- **Side effects:** linked-resource sync for the previous target and the new target. Audit `schedule.enabled` or `schedule.disabled` when `enabled` is the only changed field, otherwise `schedule.updated`; `changes` uses dotted keys for policy fields (seeded example: `{ "field": "retry.max_attempts", "before": 2, "after": 3 }`).
- **Backend notes:** Update the scheduler registration in the same transaction or via an outbox. Disabling must stop future firings but must not cancel runs already in progress. The list page toggles `enabled` optimistically and rolls back on error, so return errors promptly.

#### `DELETE /api/v1/schedules/{schedule_id}`

Deletes a schedule.

- **Permission:** `schedules:write`.
- **Path params:** `schedule_id` (string, required).
- **Request body:** none.
- **Response:** `204`, no body.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `schedules:write`. |
  | 404 | `not_found` | Schedule does not exist. |

- **Side effects:** linked-resource sync for the target (a source falls back to another enabled sync schedule or to `manual`; a pipeline's `schedule_id` moves to another schedule or `null`). Audit `schedule.deleted` with `metadata: { target_type, target_id, cron, timezone }`. Runs already started keep their `schedule_id`; in-progress runs are not cancelled.
- **Backend notes:** Deregister from the scheduler atomically with the delete. Decide how run history refers to a deleted schedule (soft delete, or keep `schedule_id` as a dangling reference as the mock does).

#### `GET /api/v1/schedules/{schedule_id}/runs`

Paginated execution history of a schedule: every run whose `schedule_id` is this schedule (scheduled firings and "Run now").

- **Permission:** any member of the schedule's workspace.
- **Path params:** `schedule_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `kind` | `RunKind` | no | | Exact match on one kind. Not validated: an unknown value, or a comma-separated list, returns no items. |
  | `status` | `RunStatus` | no | | Exact match. Not validated: an unknown value returns no items. |
  | `page` | integer | no | 1 | 1-based page number. |
  | `page_size` | integer | no | 20 | Max 500. The UI sends 10. |

- **Response:** `200`, `Paginated<Run>`, newest `queued_at` first.

  ```json
  { "items": [ { "id": "run_sfsync_000", "kind": "ingestion", "status": "succeeded", "trigger": "schedule", "triggered_by": { "id": "svc_scheduler", "name": "Scheduler" }, "target_name": "Salesforce Production", "source_id": "src_sf_prod", "schedule_id": "sch_sf_sync", "...": "full Run" } ], "page": 1, "page_size": 10, "total": 36 }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the schedule's workspace. |
  | 404 | `not_found` | Schedule does not exist. |

- **Side effects:** none.
- **Backend notes:** Index `runs(schedule_id, queued_at DESC)`. Polled every 2 seconds while any listed run is active. The shared `RunListQuery` type documents a comma-separated `kind` list (`kind=transformation,dbt_test`); this endpoint should accept that form to match `GET /workspaces/{id}/runs`. Validate `status` and `kind` with 422 like the pipeline runs endpoint.

#### `POST /api/v1/schedules/{schedule_id}/run`

Runs the schedule's target once, now, applying the schedule's concurrency policy ("Run now"). Works for enabled and disabled schedules.

- **Permission:** depends on the target: `pipelines:run` for `pipeline`, `sources:sync` for `source_sync`, `transformations:run` for `transformation`. `schedules:write` is neither required nor sufficient.
- **Path params:** `schedule_id` (string, required).
- **Request body:** none.
- **Response:** `202`, `Run` at creation, with `status: "queued"`, `trigger: "manual"`, `triggered_by` = caller, `schedule_id` = this schedule, `attempt: 1`, `retry_of: null`, and per target type:
  - `pipeline`: `kind: "pipeline"`, `pipeline_id`, `source_id` (first source, or the failing source), `stages` = the pipeline's stages, `tables` = all selected tables of its sources in their configured ingestion mode (never full refresh). `metabase_refresh` is skipped when Metabase is not connected; the same seeded failures as `POST /pipelines/{id}/runs` apply.
  - `source_sync`: `kind: "ingestion"`, `source_id`, stages `source_connect`, `ingestion`, `bronze_load`, `tables` = the source's selected tables. Web Orders DB fails at `source_connect`.
  - `transformation`: `kind: "transformation"`, `transformation_id`, stages `dbt_transform`, `silver_gold_publish`, `tables: []`. Fails at `dbt_transform` (`retryable: false`) when the model's SQL has unbalanced `{{`/`}}` delimiters or a `ref()` to a model outside its dbt project (`dbt_compilation_error`), or still casts `hsn_code` to an integer after the ERP schema change (`dbt_model_error`).

  Example for `sch_sf_sync` triggered by Priya Nair (editor, holds `sources:sync`); `stages` and `tables` are abbreviated, the real response lists the three ingestion stages and all six Salesforce tables:

  ```json
  { "id": "run_p8d1w0za", "workspace_id": "ws_acme", "kind": "ingestion", "status": "queued", "trigger": "manual", "triggered_by": { "id": "usr_priya", "name": "Priya Nair" }, "target_name": "Salesforce Production", "pipeline_id": null, "source_id": "src_sf_prod", "transformation_id": null, "schedule_id": "sch_sf_sync", "schema_proposal_id": null, "queued_at": "2026-10-28T09:20:11Z", "started_at": null, "finished_at": null, "duration_seconds": null, "attempt": 1, "retry_of": null, "records_processed": null, "stages": [ { "key": "source_connect", "name": "Source connection", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} } ], "tables": [ { "table": "salesforce.Opportunity", "status": "queued", "mode": "incremental", "records": 0, "error": null } ], "error": null }
  ```

- **Concurrency policy.** "Active runs" are the target's runs with status `queued` or `running`: for a pipeline, runs of kind `pipeline` with that `pipeline_id`; for a source, runs of kind `ingestion` with that `source_id` (pipeline runs that read the source are not counted); for a transformation, runs of kind `transformation` with that `transformation_id`. Runs from any trigger count. When the count is at least `concurrency.max_concurrent_runs`:
  - `skip`: 409 `concurrency_limit_reached`, no run is created.
  - `cancel_running`: the oldest `count - max_concurrent_runs + 1` active runs are cancelled, then the new run is created. Runs already being cancelled are counted as active but are not picked again, so fewer runs may be cancelled than the formula gives. The cancelled runs report `cancelled` from the next read on; their ids appear only in the audit metadata, not in the response.
  - `queue`: the new run is created and stays `queued` until the most recently queued active run is terminal; it then starts.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks the target's run permission (viewer). |
  | 404 | `not_found` | Schedule does not exist. |
  | 409 | `schedule_target_missing` | The target no longer exists. Message: "The pipeline this schedule targets no longer exists. Edit the schedule to choose a new target." |
  | 409 | `target_not_runnable` | Pipeline target is `paused` or `draft` (`Pipeline "Customer 360" is draft. Activate it before running it.`), or source target is `paused` or `draft` (`Source "Salesforce Sandbox" is paused. Resume it before syncing.`). A source in `error` is runnable. |
  | 409 | `concurrency_limit_reached` | Limit reached with overlap policy `skip`. Message: `Salesforce Production already has 1 run in progress (limit 1). The overlap policy is "skip", so no new run was started.` `details: { "active_run_ids": ["run_..."] }`. |

- **Side effects:** audit `schedule.run_now` on the schedule with `execution_id` = new run id and `metadata: { target_type, target_id, run_kind, cancelled_run_ids?, overlap_policy?, queued_behind_run_id? }` (the mock also adds `simulated: true`). Cancelled runs later record `<kind>.run_cancelled`. On completion the same orchestrator audit (`<kind>.run_<status>`, actor Orchestrator because the trigger is `manual`) and failure notifications as `POST /pipelines/{id}/runs` apply; the audit resource is `{ type: "run" }` for pipeline runs, `{ type: "source", id: <source_id> }` for ingestion runs and `{ type: "transformation", id: <transformation_id> }` for transformation runs. `sync_completed` success notifications are sent only for `pipeline` and `ingestion` runs; pipeline and ingestion runs update source sync status (not when cancelled); a finished transformation run (any terminal status) updates the transformation's `last_run_status`, `last_run_at` and `last_run_duration_seconds`, and a successful one also marks its output model fresh.
- **Async:** yes. Clients poll `GET /runs/{run_id}` every 2 seconds; the schedule detail page shows inline progress with an `aria-live` region and links to `/w/{ws}/runs/{run_id}`.
- **Backend notes:** The concurrency check, cancellation and enqueue must be atomic per target (row lock or advisory lock on the target). Cancellation must reach the worker (dlt or dbt process), not only flip a status. A queued-behind run needs a durable dependency in the run queue. Note that `POST /pipelines/{id}/runs` uses a stricter rule (always 409 `run_in_progress` when any run is active), so the two entry points can disagree for a pipeline whose schedule allows `queue` or more than one concurrent run.

---

### 3.4 Scheduler behaviour the mock does not simulate

The mock never fires schedules on its own; every scheduled run in the demo is seeded history. The backend scheduler must:

- Fire each enabled schedule at its cron occurrences in its timezone, creating a run with `trigger: "schedule"`, `triggered_by: { "id": "svc_scheduler", "name": "Scheduler" }`, `schedule_id` set, and audit actor `{ type: "scheduler", id: "svc_scheduler", name: "Scheduler" }` for the completion event.
- Apply the concurrency policy exactly as "Run now" does.
- Skip firings for a pipeline that is `paused` or `draft`, and for a source that is `paused` or `draft`. Recording such a firing as a run with status `skipped` would let the history explain the gap (decision needed).
- Apply the retry policy to failed runs whose `error.retryable` is true: up to `max_attempts` additional attempts, waiting `backoff_seconds` (fixed) or doubling the wait after each failed attempt, `backoff_seconds * 2^i` for the i-th retry starting at 0 (exponential; this is how the UI previews it in `src/features/schedules/lib/schedule-utils.ts`), each a new run with `trigger: "retry"`, `attempt` incremented and `retry_of` = previous attempt. A failed attempt numbered 3 or more produces the `repeated_retries` notification.
- Survive restarts without double-firing (persist the last fired occurrence per schedule) and decide a misfire policy for occurrences missed during downtime.

---

## 4. Transformations (dbt) and AI business mapping

A workspace has at most one connected **dbt project** (a Git repository, branch and target). Each dbt model in it is a **transformation**: the frontend shows its SQL, columns, dependencies and tests, lets editors save SQL or descriptions (the backend commits them to the repository), and starts `dbt run` or `dbt test` for one model as an asynchronous **Run**. **AI business mapping** produces a **suggestion set** for selected Bronze tables of one source: field mappings, join candidates, key candidates and proposed Silver/Gold models, each of which a person accepts, edits or rejects before an approver signs off. An approved set feeds a schema proposal, which is specified in Section 5 (Data models, data preview and schema proposals).

Ground truth for this section: `src/mocks/handlers/transformations.ts` (8 routes), `src/mocks/handlers/mapping.ts` (4 routes), `src/services/transformations.service.ts` (8 methods), `src/services/mapping.service.ts` (4 methods), `src/types/transformations.ts`, `src/types/mapping.ts`, `src/types/runs.ts`, `src/types/quality.ts`, `src/types/common.ts`, `src/mocks/engine/dbt.ts`, `src/mocks/engine/runs.ts`, `src/mocks/store.ts`, `src/mocks/router.ts`, `src/mocks/permissions.ts`, `src/lib/data-types.ts`. Every handler route has a service method and every service method has a handler route.

### 4.0 Conventions used in this section

- All paths are relative to `/api/v1`. JSON keys are snake_case. Timestamps are ISO 8601 UTC, for example `"2026-10-28T09:15:00Z"`. IDs are opaque prefixed strings: `dbt_` (dbt project), `trf_` (transformation), `mdl_` (data model), `qc_` (quality check / dbt test), `run_`, `map_` (suggestion set), `fm_`, `jc_`, `kc_`, `mp_` (items inside a set), `src_`, `ws_`, `usr_`.
- Every route requires a signed-in session (bearer token or HttpOnly session cookie). None is public.
- Errors use the standard envelope (`ApiErrorBody` in `src/types/common.ts`):

  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "field_errors": [{ "field": "sql", "message": "A dbt model must contain a select statement." }], "details": {}, "request_id": "4f0c..." } }
  ```

  `details` and `field_errors` are optional. `field` may be a path such as `decisions[2].overrides.target_field`; the review screen and the SQL editor map these onto the matching control.
- Error codes shared by every endpoint in this section (repeated in each table where they apply):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." The client returns to the sign-in screen on any 401. |
  | 403 | `forbidden` | Not an active member of the workspace ("You are not a member of this workspace.") or the role lacks the permission ("Your role (viewer) does not include the \"transformations:run\" permission."). |
  | 404 | `not_found` | The workspace, transformation or suggestion set does not exist. Message pattern: `Transformation "trf_x" was not found.`, `Mapping suggestion set "map_x" was not found.`, `Workspace "ws_x" was not found.` |
  | 405 | `method_not_allowed` | Path exists but the method does not. |
  | 500 | `internal_error` | Unhandled server error. |

- **Workspace resolution.** Transformations carry no `workspace_id`; the server resolves it through `transformation.project_id` -> `dbt_project.workspace_id`. Suggestion sets carry `workspace_id` directly.
- **Order of checks** in the mock: session (401), resource lookup (404), workspace membership and permission (403), body or query validation (422), state conflicts (409). The exceptions are called out per endpoint (`POST /ai/mapping-suggestions` validates `workspace_id` before the permission check; the review endpoint validates `action` before the permission check and some field rules after the 409 checks).
- **Permission denials are audited.** Every 403 caused by a missing permission (not by non-membership) records an audit event `access.denied` with `status: "denied"`, `resource: { type: "permission", id: "<permission>", name: "<permission>" }` and the acting user.
- **Role matrix** (`src/mocks/permissions.ts`) for the permissions used here:

  | Permission | owner | admin | editor | viewer |
  |---|---|---|---|---|
  | `transformations:write` | yes | yes | yes | no |
  | `transformations:run` | yes | yes | yes | no |
  | `mappings:review` | yes | yes | yes | no |
  | `mappings:approve` | yes | yes | no | no |

  Read endpoints need only active membership ("any workspace member").
- **Success status codes.** The mock transport does not model 2xx codes; the codes below follow the service comments and the architecture document: `200` for reads and updates, `202` for anything that starts a Run or an asynchronous generation (`POST .../run`, `POST .../test`, `POST /ai/mapping-suggestions`).
- **Pagination** (`Paginated<T>`): only `GET /transformations/{transformation_id}/runs` is paginated, with `page` (1-based, default 1) and `page_size` (default **10** for this endpoint, capped at 500). Non-numeric, zero or negative values fall back to the default. Response `{ items, page, page_size, total }`. The other list endpoints return a bare JSON array.
- **Enum query filters** on the transformation endpoints: an absent, empty or `all` value means "no filter"; any other value outside the enum returns 422 `validation_error` with `field_errors: [{ field: "<param>", message: "Unknown <param> \"<value>\". Expected one of: <list>." }]`. Only the first value of a repeated parameter is read.
- **Async runs**: `POST .../run` and `POST .../test` respond `202` with the initial `Run` (status `queued`). Clients poll `GET /runs/{run_id}` and `GET /runs/{run_id}/logs?after={cursor}` (Section 2, Runs) until `status` is terminal (`succeeded`, `failed`, `cancelled`, `skipped`). The transformation screens also re-fetch `GET /transformations/{transformation_id}` and `/runs` every few seconds while a run is active.
- **Async generation**: `POST /ai/mapping-suggestions` responds `202` with a set in status `generating` and empty item lists. Clients poll `GET /ai/mapping-suggestions/{suggestion_id}` (and the workspace list) every 1.5 seconds until status leaves `generating`.
- **Demo-only markers**: the mock adds `"simulated": true` to the audit metadata of every `PATCH /transformations/{id}` change (SQL or description), of run and test requests and their completion events, and of `mapping.suggestions_requested` (not of the review events), and reports `provider.simulated: true` on suggestion sets. Notification messages for failed simulated runs end with "(simulated run <run_id>)". The production backend must send `simulated: false` (or omit the audit key) for real work.

### 4.1 Types

All shapes below are the JSON bodies exactly as the frontend types declare them (`src/types`).

**Enums**

```ts
type TransformationType = 'staging' | 'intermediate' | 'silver' | 'gold'   // list sort order is this order
type Materialization    = 'view' | 'table' | 'incremental' | 'ephemeral'
type RunStatus          = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'
type RunKind            = 'ingestion' | 'pipeline' | 'transformation' | 'dbt_test' | 'schema_apply'
type TestStatus         = 'passed' | 'failed' | 'warning' | 'not_run'            // TestResult.status, QualityStatus
type TestType           = 'not_null' | 'unique' | 'accepted_values' | 'relationships' | 'freshness' | 'row_count' | 'custom_sql'

type MappingSetStatus = 'generating' | 'ready' | 'in_review' | 'approved' | 'rejected' | 'failed'
type ReviewDecision   = 'pending' | 'accepted' | 'rejected' | 'modified'
type ReviewItemType   = 'field_mapping' | 'join' | 'key' | 'model'
type ReviewAction     = 'save_draft' | 'submit' | 'approve' | 'reject'
type TargetLayer      = 'silver' | 'gold'
type JoinCardinality  = 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many'
type KeyType          = 'primary' | 'business' | 'surrogate'
type ModelType        = 'fact' | 'dimension'
```

**DbtProject** (`src/types/transformations.ts`)

```ts
interface DbtProject {
  id: string                    // "dbt_acme"
  workspace_id: string
  name: string                  // dbt project name from dbt_project.yml, e.g. "acme_analytics"
  repository_url: string        // HTTPS Git URL; never contains credentials
  branch: string                // e.g. "main"
  dbt_version: string           // e.g. "1.10"
  target: string                // profiles target, e.g. "prod"
  threads: number
  last_compiled_at: string | null
  models_count: number          // derived: transformations in this project
  tests_count: number           // derived: dbt tests (quality checks) on the output models of those transformations
}
```

**Transformation** and **TransformationSummary**

```ts
interface TransformationColumn {
  name: string
  data_type: string             // warehouse type, e.g. "bigint", "numeric", "varchar"
  description: string
  tests: string[]               // dbt test names on the column, e.g. ["unique", "not_null", "relationships(dim_customer.customer_sk)"]
}

interface TestSummary { total: number; passed: number; failed: number; warned: number }

interface Transformation {
  id: string                    // "trf_fct_invoices"
  project_id: string            // DbtProject.id
  name: string                  // dbt model name, unique within the project
  unique_id: string             // dbt unique_id, "model.<project>.<name>"
  type: TransformationType
  materialization: Materialization
  schema: string                // target schema, e.g. "silver", "gold"
  description: string           // "" when undocumented; max 2000 chars on write
  sql: string                   // full model source including Jinja; max 100000 chars on write
  tags: string[]
  depends_on: string[]          // upstream transformation ids, or Bronze data model ids for staging models
  output_model_id: string | null  // DataModel id of the relation this model builds
  columns: TransformationColumn[]
  last_run_status: RunStatus | null   // derived while a dbt run is active (see below)
  last_run_at: string | null
  last_run_duration_seconds: number | null
  tests: TestSummary            // derived from the current dbt test results (see below)
  owner: string                 // display name of the owning person or team
  updated_at: string            // last SQL or description change
}

// List rows omit the two heavy fields.
type TransformationSummary = Omit<Transformation, 'sql' | 'columns'>
```

Derived fields, computed on every read of a transformation, a summary or the project:

- `last_run_status`: when a `transformation` run (kind `transformation`, not `dbt_test`) for this model is `queued` or `running`, that run's status; otherwise the status stored when the last dbt run of this model finished.
- `tests`: when the output model has dbt tests, the counts of the current test results (`total`, and `passed`, `failed`, `warned` by `status`; `not_run` tests count only in `total`). When it has none, the stored summary (all zeros in practice).
- `DbtProject.models_count` and `tests_count`: counted live, not stored.

**TestResult** (one dbt test on the model's output relation)

```ts
interface TestResult {
  id: string                    // quality check id, "qc_..."
  name: string                  // dbt test name, e.g. "unique_fct_invoices_invoice_id"
  column: string | null         // null for model-level tests (freshness, unique_combination, row_count)
  test_type: string             // one of TestType
  status: TestStatus
  failing_rows: number
  message: string | null        // human-readable explanation of a failure or warning
  last_run_at: string | null
}
```

The underlying quality check also has `severity: 'error' | 'warn'`, which `TestResult` does not expose; it decides whether a failing test fails a `dbt test` run (only `error` severity does). The full `QualityCheck` shape is specified in Section 5 (Data models, data preview and schema proposals).

**Run** and **Paginated<Run>**: the `Run` shape is specified in Section 2 (Runs). The fields relevant here: `kind` is `transformation` (a `dbt run`) or `dbt_test` (a `dbt test`); `transformation_id` is the model; `target_name` is the model name; `pipeline_id`, `source_id`, `schedule_id` and `schema_proposal_id` are `null`; `tables` is `[]`. `stages` is `["dbt_transform", "silver_gold_publish"]` for `transformation` and `["quality_checks"]` for `dbt_test`.

**Request bodies (transformations)**

```ts
interface UpdateTransformationRequest {
  sql?: string
  description?: string
  commit_message?: string       // used for the Git commit; default "Update <name> via Graphite"
}

interface RunTransformationRequest {
  include_upstream?: boolean    // dbt selector "+model"
  include_downstream?: boolean  // dbt selector "model+"
  full_refresh?: boolean        // dbt --full-refresh
}
```

**AI mapping items** (`src/types/mapping.ts`). Every item carries `confidence` (0 to 1, two decimals), a plain-English `rationale` and a `decision`, which is `pending` when generated. In generated sets the mock clamps field mapping, join and model proposal confidences to 0.55..0.97 (a model proposal with no mapped fields gets 0.7); key candidates use fixed values between 0.74 and 0.98.

Item ids are unique within their set only. Generated items are `fm_<set>_<n>`, `jc_<set>_<n>`, `kc_<set>_<n>` and `mp_<set>_<n>`, where `<set>` is the set id without its `map_` prefix (for example `fm_q8d2k7ra_1`). The seeded demo sets use short ids such as `fm_1` and `kc_4`.

```ts
interface FieldMapping {
  id: string                    // "fm_..."
  source_table: string          // qualified source table, "<schema>.<table>", e.g. "public.payments", "salesforce.Opportunity"
  source_field: string          // source column name as stored in Bronze
  source_type: string           // Bronze column type, e.g. "numeric"
  target_model: string          // proposed model name, matches a ModelProposal.name in the set when one exists
  target_field: string          // snake_case target column
  target_type: string           // warehouse type, e.g. "numeric(18,2)"
  normalization_rule: string | null   // human-readable rule, e.g. "trim, upper"; null when copied unchanged
  confidence: number
  rationale: string
  decision: ReviewDecision
}

interface JoinCandidate {
  id: string                    // "jc_..."
  left_table: string
  left_field: string
  right_table: string
  right_field: string
  cardinality: JoinCardinality
  match_rate: number            // 0..1, share of left rows that find a right row (mock: up to 6 decimals)
  confidence: number
  rationale: string
  decision: ReviewDecision
}

interface KeyCandidate {
  id: string                    // "kc_..."
  table: string                 // qualified source table, or a proposed model name for surrogate keys
  fields: string[]              // one or more columns (composite keys)
  key_type: KeyType
  uniqueness: number            // 0..1 share of distinct values in the profiled sample
  confidence: number
  rationale: string
  decision: ReviewDecision
}

interface ProposedColumn {
  name: string
  data_type: string
  expression: string            // SQL expression or a description of the lookup, e.g. "round(payments.amount, 2)"
  description: string
}

interface ModelProposal {
  id: string                    // "mp_..."
  name: string                  // e.g. "fct_collections"; never an existing model name in the target layer (a "_v2" suffix is added)
  model_type: ModelType
  grain: string                 // e.g. "One row per payment allocated to an invoice"
  description: string
  source_tables: string[]
  columns: ProposedColumn[]
  confidence: number
  rationale: string
  decision: ReviewDecision
}
```

**MappingSuggestionSet**, its summary and the review record

```ts
interface AiProviderInfo {
  name: string                  // provider display name; mock: "Graphite mock suggestion engine"
  model: string                 // model id; mock: "simulated"
  simulated: boolean            // true only when suggestions came from the mock engine
}

interface MappingReview {
  action: 'approved' | 'rejected'
  reviewed_by: { id: string; name: string }
  reviewed_at: string
  comment: string | null
}

interface MappingSuggestionSet {
  id: string                    // "map_..."
  workspace_id: string
  source_id: string
  source_name: string           // source name at request time
  source_tables: string[]       // 1..10 qualified tables, as requested
  target_layer: TargetLayer
  business_context: string | null
  status: MappingSetStatus
  provider: AiProviderInfo
  created_at: string
  created_by: { id: string; name: string }
  submitted_at: string | null   // set by the "submit" review action
  field_mappings: FieldMapping[]      // [] while generating
  join_candidates: JoinCandidate[]    // [] while generating
  key_candidates: KeyCandidate[]      // [] while generating
  model_proposals: ModelProposal[]    // [] while generating; at most 3
  review: MappingReview | null  // set by "approve" or "reject"
}

// List rows omit the four item lists and add decision counts across all four.
type MappingSuggestionSetSummary = Omit<MappingSuggestionSet, 'field_mappings' | 'join_candidates' | 'key_candidates' | 'model_proposals'> & {
  counts: { total: number; pending: number; accepted: number; rejected: number; modified: number }
}
```

**Request bodies (mapping)**

```ts
interface CreateMappingSuggestionRequest {
  workspace_id: string
  source_id: string
  source_tables: string[]       // "<schema>.<table>" as listed by GET /sources/{source_id}/tables
  target_layer: TargetLayer
  business_context?: string     // free text, max 2000 chars after trimming
}

interface ReviewItemDecision {
  item_id: string
  item_type: ReviewItemType
  decision: 'accepted' | 'rejected' | 'modified'     // "pending" cannot be sent
  overrides?: Record<string, unknown>                 // only with "modified"; see the review endpoint
}

interface ReviewMappingRequest {
  decisions: ReviewItemDecision[]                     // may be empty; missing is treated as []
  action: ReviewAction
  comment?: string                                    // max 2000 chars; required (non-blank) for "reject"
}
```

**Suggestion set lifecycle**

```
generating --(generation completes)--> ready --submit--> in_review --approve--> approved   (read-only)
           \--(generation fails)--> failed (read-only)            \--reject---> rejected   (read-only)
```

`save_draft` is allowed in `ready` and `in_review` and does not change the status. There is no transition out of `approved`, `rejected` or `failed`. Instead, the review page offers "Request new suggestions" on a `rejected` set and "Try again" on a `failed` set (both open the new-request form prefilled, which sends a new `POST`), and on an `approved` set it shows a panel that creates a schema proposal from the set. The mock never produces `failed`, but the review endpoint and the review page already handle it.

### 4.2 Transformations

#### `GET /api/v1/workspaces/{workspace_id}/dbt-project`

Returns the workspace's connected dbt project with live model and test counts.

- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `workspace_id` | string | yes | | Workspace id. |

- **Response:** `200`, `DbtProject`.

  ```json
  {
    "id": "dbt_acme", "workspace_id": "ws_acme", "name": "acme_analytics",
    "repository_url": "https://git.example.com/acme/analytics-dbt.git", "branch": "main",
    "dbt_version": "1.10", "target": "prod", "threads": 4,
    "last_compiled_at": "2026-10-28T10:21:26Z", "models_count": 26, "tests_count": 81
  }
  ```

  (Counts are those of the demo seed: 26 models and 81 tests on their output models. Both are computed at read time.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 404 | `dbt_not_configured` | The workspace has no dbt project (Northwind Retail in the demo). Message: "No dbt project is connected to this workspace. An admin can connect the dbt repository under Settings > dbt project." On any 404 from this endpoint the Transformations page shows its "No dbt project connected" empty state (with a "Connect dbt project" link to Settings), and the transformation detail page shows "Model not in this workspace". |

- **Side effects:** none.
- **Backend notes:** The connection settings (repository, branch, deploy key, target) are written through the Settings / onboarding dbt endpoints, not here; this read must never return the deploy key or any credential, and `repository_url` must have any embedded credentials stripped. `last_compiled_at` should be the time of the last successful `dbt compile` / `dbt parse` the backend ran, which also refreshes the list of transformations. Keep `dbt_not_configured` as a distinct code. Today the client branches on the 404 status alone, so a missing workspace and a missing project look the same to it; the code lets it tell them apart later. In the mock, saving the dbt connection under Settings or onboarding (`/workspaces/{workspace_id}/integrations/dbt`) does not create a project, so this endpoint stays 404 for Northwind Retail even after its dbt step. The backend must create the project and parse its models once the connection is saved and tested (see 4.4 Open questions).

#### `GET /api/v1/workspaces/{workspace_id}/transformations`

Lists the dbt models of the workspace's project, optionally filtered.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | | Case-insensitive substring match (after trimming) on `name`, `unique_id`, `description`, `schema`, `owner` or any tag. |
  | `type` | `TransformationType` or `all` | no | all | Exact match. Unknown value: 422. |
  | `status` | `RunStatus` or `all` | no | all | Matches the derived `last_run_status`, so `running` finds models with an active dbt run. Unknown value: 422. Models that never ran (`null`) only appear without this filter. |
  | `tag` | string | no | all | Model must carry this tag exactly (case-sensitive). `all` means no filter. |

- **Response:** `200`, `TransformationSummary[]` (not paginated), sorted by `type` in the order `staging`, `intermediate`, `silver`, `gold`, then by `name` ascending. A workspace without a dbt project returns `[]` (not 404).

  ```json
  [
    {
      "id": "trf_fct_invoices", "project_id": "dbt_acme", "name": "fct_invoices",
      "unique_id": "model.acme_analytics.fct_invoices", "type": "gold", "materialization": "incremental",
      "schema": "gold", "description": "One row per sales invoice with amounts and outstanding balance.",
      "tags": ["finance"], "depends_on": ["trf_stg_erp_invoices", "trf_dim_customer", "trf_dim_date"],
      "output_model_id": "mdl_g_fct_invoices",
      "last_run_status": "failed", "last_run_at": "2026-10-28T08:58:26Z", "last_run_duration_seconds": 112,
      "tests": { "total": 5, "passed": 4, "failed": 1, "warned": 0 },
      "owner": "Priya Nair", "updated_at": "2026-10-09T10:59:26Z"
    }
  ]
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | `type` or `status` is not a known value, e.g. field `type`: `Unknown type "mart". Expected one of: staging, intermediate, silver, gold.` |

- **Side effects:** none.
- **Backend notes:** The list is the parsed dbt manifest joined with the latest run status and test results; cache the manifest per commit rather than parsing the repository on every request. The client polls this list every 3 seconds while any row has `last_run_status` `queued` or `running`, so keep it cheap. If projects grow beyond a few hundred models, add pagination as a backward-compatible option (the current clients expect a bare array).

#### `GET /api/v1/transformations/{transformation_id}`

Returns one model with its SQL, columns, dependencies and live status.

- **Permission:** any workspace member (of the workspace that owns the model's dbt project).
- **Path params:** `transformation_id` (string, required).
- **Response:** `200`, `Transformation` (the summary fields plus `sql` and `columns`).

  ```json
  {
    "id": "trf_fct_invoices", "project_id": "dbt_acme", "name": "fct_invoices",
    "unique_id": "model.acme_analytics.fct_invoices", "type": "gold", "materialization": "incremental", "schema": "gold",
    "description": "One row per sales invoice with amounts and outstanding balance.",
    "sql": "{{\n  config(\n    materialized='incremental',\n    unique_key='invoice_id',\n    on_schema_change='append_new_columns'\n  )\n}}\n\nwith invoices as (\n    select * from {{ ref('stg_erp_invoices') }}\n ...",
    "tags": ["finance"], "depends_on": ["trf_stg_erp_invoices", "trf_dim_customer", "trf_dim_date"],
    "output_model_id": "mdl_g_fct_invoices",
    "columns": [
      { "name": "invoice_id", "data_type": "bigint", "description": "Invoice id.", "tests": ["unique", "not_null"] },
      { "name": "customer_sk", "data_type": "bigint", "description": "Surrogate key of the customer dimension.", "tests": ["relationships(dim_customer.customer_sk)"] }
    ],
    "last_run_status": "failed", "last_run_at": "2026-10-28T08:58:26Z", "last_run_duration_seconds": 112,
    "tests": { "total": 5, "passed": 4, "failed": 1, "warned": 0 },
    "owner": "Priya Nair", "updated_at": "2026-10-09T10:59:26Z"
  }
  ```

  (`sql` is truncated and `columns` abbreviated; the seeded `fct_invoices` has 9 columns.)

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist, or (data inconsistency) its dbt project no longer exists (`dbt project "dbt_x" was not found.`). |
  | 403 | `forbidden` | Not a member of the owning workspace. The detail page shows a generic "Could not load this model" error for this (it shows "Model not found" only on 404). Its "Model not in this workspace" state is for a model that loads but whose `project_id` is not the current workspace's dbt project, or when the current workspace has no dbt project. |

- **Side effects:** none.
- **Backend notes:** `sql` is the file content at the head of the configured branch, including Jinja (not compiled SQL). The client polls this endpoint every 2 seconds while `last_run_status` is `queued` or `running`. Consider returning 404 instead of 403 to non-members so model ids from other tenants cannot be probed.

#### `PATCH /api/v1/transformations/{transformation_id}`

Saves new model SQL and/or a new description; the backend commits the change to the dbt repository.

- **Permission:** `transformations:write`.
- **Path params:** `transformation_id` (string, required).
- **Request body:** `UpdateTransformationRequest`. At least one of `sql` and `description` must be present.

  ```ts
  {
    sql?: string             // non-blank; must contain the word "select" outside "--" line comments; max 100000 chars
    description?: string     // string; max 2000 chars (length checked before trimming); stored trimmed
    commit_message?: string  // max 200 chars after trimming; null or blank means the default
  }
  ```

  Validation (all failures are collected into one 422):
  - Neither `sql` nor `description` present: 422 on field `sql`, "Provide the model SQL or a description to update." (returned alone, before other checks).
  - `sql`: not a string or blank -> "The model SQL cannot be empty."; no `select` keyword (case-insensitive, word boundary, after removing `--` comments; block comments are not removed) -> "A dbt model must contain a select statement."; longer than 100000 characters -> "The model SQL must be at most 100,000 characters." Only the first failing rule is reported.
  - `description`: not a string -> "Description must be text."; longer than 2000 -> "Description must be at most 2000 characters."
  - `commit_message`: not a string -> "Commit message must be text."; longer than 200 after trimming -> "Commit message must be at most 200 characters."

  The SQL is stored verbatim (not trimmed). Jinja and `ref()` correctness are **not** validated on save; they surface as a failed run (see `POST .../run`).

  ```json
  { "sql": "{{ config(materialized='incremental', unique_key='invoice_id') }}\nselect ...", "commit_message": "Exclude re-issued credit notes from fct_invoices" }
  ```

- **Response:** `200`, the updated `Transformation` (same shape as GET). If nothing changed (`sql` equal to the stored SQL and trimmed `description` equal to the stored description), the current model is returned unchanged, `updated_at` is not touched and no audit event is recorded.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `transformations:write` (viewer). |
  | 422 | `validation_error` | Field rules above; fields `sql`, `description`, `commit_message`. |

- **Side effects:**
  - Sets `updated_at` to now.
  - Audit on the transformation (`resource: { type: "transformation", id, name }`): action `transformation.sql_updated` when the SQL changed (even if the description changed too), otherwise `transformation.updated`.
    - `changes`: for SQL, `{ field: "sql", before: "<n> lines", after: "<m> lines (+<added> / -<removed>)" }` (never the SQL text); for description, `{ field: "description", before, after }`.
    - `metadata`: `commit_message` (the default when none was sent), `repository_branch` (the project's branch), and for SQL changes `lines_added`, `lines_removed`, `lines_before`, `lines_after`. The mock adds `simulated: true`.
  - No run is started; the user runs the model separately.
- **Backend notes:** This is a Git write: commit the file at the model's path on the configured branch (or open a branch / pull request if the workspace requires review; the current UI assumes a direct commit) with the given message, authored as the signed-in user or a service identity with the user in a `Co-authored-by` trailer. Store the deploy key or token in a secrets vault, never in the database row. Add optimistic concurrency (for example an `If-Match` on `updated_at` or the file's blob sha, returning 409 when the branch moved) because two editors can save the same model; the mock has none. Define an error code for a failed push (for example 502 `dbt_repository_unavailable`) and for a protected branch. After the commit, re-parse the project so `columns`, `depends_on` and `tests` reflect the new SQL. Never write the SQL into the audit log; the line-count diff is deliberate. Both client forms (the SQL tab and the Edit description dialog) require a commit message of 3 to 200 characters after trimming. The server only enforces the 200 maximum.

#### `GET /api/v1/transformations/{transformation_id}/runs`

Lists the dbt runs and dbt test runs of one model, newest first.

- **Permission:** any workspace member.
- **Path params:** `transformation_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `kind` | `transformation`, `dbt_test` or `all` | no | all | Single value. Any other run kind (for example `pipeline`) or a comma-separated list returns 422. A repeated parameter (`kind=transformation&kind=dbt_test`, which is how the API client serialises an array) is not rejected: only the first value is used. |
  | `status` | `RunStatus` or `all` | no | all | Exact match on the run status. |
  | `page` | integer >= 1 | no | 1 | |
  | `page_size` | integer >= 1 | no | 10 | Capped at 500. |

- **Response:** `200`, `Paginated<Run>`, sorted by `queued_at` descending. Only runs with this `transformation_id` are included, so pipeline runs that happened to build the model are not listed.

  ```json
  {
    "items": [
      {
        "id": "run_dbt_0", "workspace_id": "ws_acme", "kind": "dbt_test", "status": "failed", "trigger": "manual",
        "triggered_by": { "id": "usr_priya", "name": "Priya Nair" }, "target_name": "fct_invoices",
        "pipeline_id": null, "source_id": null, "transformation_id": "trf_fct_invoices", "schedule_id": null, "schema_proposal_id": null,
        "queued_at": "2026-10-28T08:47:24Z", "started_at": "2026-10-28T08:47:26Z", "finished_at": "2026-10-28T08:48:35Z", "duration_seconds": 69,
        "attempt": 1, "retry_of": null, "records_processed": null,
        "stages": [ { "key": "quality_checks", "name": "Data quality checks", "status": "failed", "started_at": "2026-10-28T08:47:26Z", "finished_at": "2026-10-28T08:48:35Z", "duration_seconds": 69, "error": { "stage": "quality_checks", "code": "quality_checks_failed", "message": "unique_fct_invoices_invoice_id failed (14 rows).", "details": "Credit notes re-issued in the ERP reuse the original invoice_id. Downstream model agg_receivables_aging was not refreshed and Metabase refresh was skipped.", "retryable": true }, "skip_reason": null, "metrics": { "tests_run": 33 } } ],
        "tables": [],
        "error": { "stage": "quality_checks", "code": "quality_checks_failed", "message": "unique_fct_invoices_invoice_id failed (14 rows).", "details": "Credit notes re-issued in the ERP reuse the original invoice_id. Downstream model agg_receivables_aging was not refreshed and Metabase refresh was skipped.", "retryable": true }
      }
    ],
    "page": 1, "page_size": 10, "total": 2
  }
  ```

  (One of the two seeded runs of `fct_invoices` is shown; the other is a succeeded `transformation` run with stage metrics such as `{ "models_built": 22 }`. Seeded historical runs carry stage `metrics`; runs started through this API report `metrics: {}`. The seeded test failure has `retryable: true`, whereas a new `dbt test` failure reports `retryable: false`, see `POST .../test`.)

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | `kind` or `status` unknown, e.g. field `kind`: `Unknown kind "pipeline". Expected one of: transformation, dbt_test.` |

- **Side effects:** none.
- **Backend notes:** The detail page calls this twice: once with `page=1&page_size=10` and no filter to decide whether a run or test is already active (to disable "Run model" and "Run tests" and to follow live runs), and once from the Runs tab with `kind` (toggle), `page` and `page_size=10`. Both poll every 2 seconds while any listed run is active. Index `runs(transformation_id, queued_at desc)`. `RunListQuery.kind` in `src/types/runs.ts` also allows an array; this endpoint accepts one value only (see 4.4 Open questions).

#### `GET /api/v1/transformations/{transformation_id}/tests`

Returns the latest result of every dbt test defined on the model's output relation.

- **Permission:** any workspace member.
- **Path params:** `transformation_id` (string, required).
- **Response:** `200`, `TestResult[]` (not paginated), sorted by status (`failed`, `warning`, `not_run`, `passed`) and then by `name`. A model without an output relation or without tests returns `[]`.

  ```json
  [
    { "id": "qc_g_fct_invoices_1", "name": "unique_fct_invoices_invoice_id", "column": "invoice_id", "test_type": "unique", "status": "failed", "failing_rows": 14, "message": "14 duplicate invoice_id values. Credit notes re-issued in the ERP reuse the original invoice id.", "last_run_at": "2026-10-28T08:58:26Z" },
    { "id": "qc_g_fct_invoices_5", "name": "freshness_fct_invoices", "column": null, "test_type": "freshness", "status": "passed", "failing_rows": 0, "message": null, "last_run_at": "2026-10-28T08:58:26Z" }
  ]
  ```

  (Abbreviated; `fct_invoices` has 5 tests in the seed: the failing `unique` test, then the passed `freshness`, `not_null` and two `relationships` tests in name order.)

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist. |
  | 403 | `forbidden` | Not a member. |

- **Side effects:** none.
- **Backend notes:** Populate from dbt `run_results.json` of the most recent `dbt test` (or `dbt build`) that covered each test, whether started here, by a pipeline run or by a schedule. `failing_rows` comes from `failures`; `message` should be a readable explanation, not the raw compiled SQL. Expose `severity` as well if the UI later needs to separate blocking from warning tests (it is on `QualityCheck` but not on `TestResult`).

#### `POST /api/v1/transformations/{transformation_id}/run`

Queues `dbt run` for this model, optionally with its upstream and/or downstream models and as a full refresh.

- **Permission:** `transformations:run`.
- **Path params:** `transformation_id` (string, required).
- **Request body:** `RunTransformationRequest`, optional (an empty body or `{}` runs only this model incrementally).

  ```ts
  {
    include_upstream?: boolean    // default false; adds "+" before the model in the selector
    include_downstream?: boolean  // default false; adds "+" after the model in the selector
    full_refresh?: boolean        // default false; dbt --full-refresh (rebuilds incremental models)
  }
  ```

  Each flag, when present and not `null`, must be a boolean; failures are collected into one 422 (field = flag name, message "<flag> must be true or false.").

  ```json
  { "include_upstream": false, "include_downstream": true, "full_refresh": false }
  ```

- **Response:** `202`, `Run` at creation:
  - `kind: "transformation"`, `status: "queued"`, `trigger: "manual"`, `triggered_by` = caller, `target_name` = model name, `transformation_id` = the model;
  - `pipeline_id`, `source_id`, `schedule_id`, `schema_proposal_id`: `null`; `attempt: 1`; `retry_of: null`; `started_at`, `finished_at`, `duration_seconds`, `records_processed`: `null`; `error: null`; `tables: []`;
  - `stages`: `dbt_transform` ("dbt transformation") and `silver_gold_publish` ("Silver / Gold publish"), each `status: "queued"` with null timings, `skip_reason: null`, `metrics: {}`.

  ```json
  {
    "id": "run_7hq2m4xa", "workspace_id": "ws_acme", "kind": "transformation", "status": "queued", "trigger": "manual",
    "triggered_by": { "id": "usr_priya", "name": "Priya Nair" }, "target_name": "fct_invoices",
    "pipeline_id": null, "source_id": null, "transformation_id": "trf_fct_invoices", "schedule_id": null, "schema_proposal_id": null,
    "queued_at": "2026-10-28T09:15:02Z", "started_at": null, "finished_at": null, "duration_seconds": null,
    "attempt": 1, "retry_of": null, "records_processed": null,
    "stages": [
      { "key": "dbt_transform", "name": "dbt transformation", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "silver_gold_publish", "name": "Silver / Gold publish", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} }
    ],
    "tables": [], "error": null
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `transformations:run` (viewer). |
  | 422 | `validation_error` | A flag is not a boolean. |
  | 409 | `transformation_run_in_progress` | A `transformation` run for this model is `queued` or `running`. Message: "A dbt run for fct_invoices is already running (run run_x). Wait for it to finish or cancel it first." `details: { "run_id": "run_x" }`. A dbt test run in progress does not block a dbt run. |

- **Side effects:**
  - Audit `transformation.run_requested` on the transformation with `execution_id` = run id and `metadata: { include_upstream, include_downstream, full_refresh, selector, models_selected }`, where `selector` is the dbt selector (`fct_invoices`, `+fct_invoices`, `fct_invoices+`, `+fct_invoices+`) and `models_selected` is 1 + all transitive upstream + all transitive downstream transformations selected. The mock adds `simulated: true`.
  - On completion (orchestrator actor `{ type: "service", id: "svc_orchestrator", name: "Orchestrator" }`): audit `transformation.run_succeeded`, `transformation.run_failed` or `transformation.run_cancelled` on the transformation (`resource: { type: "transformation", id, name }`) with `execution_id`, audit `status` `failure` for a failed run and `success` otherwise, and `metadata: { duration_seconds }` (the mock adds `simulated: true`).
  - On completion (including cancellation) the model's `last_run_status`, `last_run_at` and `last_run_duration_seconds` are updated; on success its output data model is marked fresh (`last_refreshed_at` = finish time, `freshness_status: "fresh"`).
  - On failure: notification `pipeline_failed`, severity `critical`, title "<model> failed", message = the run error message (the mock appends " (simulated run <run_id>)"), `resource: { type: "run", id: <run id>, name: <model> }`. It honours the in-app notification preferences. No notification on success or cancellation.
- **Async:** yes. Clients poll `GET /runs/{run_id}` and its logs, and re-fetch the transformation. `records_processed` on success is the sum of the output row counts of every selected model (the mock raises it in proportion to progress while the run is active). Compile-time failures fail the run at `dbt_transform` with `retryable: false`, and `silver_gold_publish` is then `skipped` with `skip_reason: "Not run because dbt transformation failed."`. The mock checks upstream models first (nearest last), then this model, then downstream models, and reports the first failure:
  - `dbt_compilation_error`: unbalanced `{{` / `}}` ("Compilation error in model X: unbalanced Jinja expression delimiters ({{ and }}).") or a `ref('name')` to a model not in the project ("... depends on a node named 'name' which was not found.");
  - `dbt_model_error`: an integer cast of `hsn_code` ("Database error in model X: invalid input syntax for type integer: \"8471A\""), the ERP schema-change story.
- **Backend notes:** Enqueue `dbt run --select <selector> [--full-refresh] --target <project.target>` on the orchestrator and return immediately. Make "one active dbt run per model" atomic (partial unique index on `runs(transformation_id) WHERE kind = 'transformation' AND status IN ('queued','running')`); also decide whether a run should be refused while a pipeline run is building the same model (the mock does not check). Update `last_run_*` and freshness for **every** model in the selection, not only the requested one (the mock updates only the requested model). Store the selector and flags on the run so the history can show them (the `Run` type has no field for them today). Accept an `Idempotency-Key` header so a double-click cannot queue two runs. Real compile errors come from dbt; map them to `dbt_compilation_error` / `dbt_model_error` with the dbt message in `message` and the hint in `details`.

#### `POST /api/v1/transformations/{transformation_id}/test`

Queues `dbt test` for the tests defined on this model.

- **Permission:** `transformations:run`.
- **Path params:** `transformation_id` (string, required).
- **Request body:** none (any body is ignored).
- **Response:** `202`, `Run` at creation, as for `POST .../run` but `kind: "dbt_test"` and a single stage `quality_checks` ("Data quality checks"), `status: "queued"`.

  ```json
  {
    "id": "run_p0w8c1nd", "workspace_id": "ws_acme", "kind": "dbt_test", "status": "queued", "trigger": "manual",
    "triggered_by": { "id": "usr_priya", "name": "Priya Nair" }, "target_name": "fct_invoices",
    "pipeline_id": null, "source_id": null, "transformation_id": "trf_fct_invoices", "schedule_id": null, "schema_proposal_id": null,
    "queued_at": "2026-10-28T09:16:40Z", "started_at": null, "finished_at": null, "duration_seconds": null,
    "attempt": 1, "retry_of": null, "records_processed": null,
    "stages": [ { "key": "quality_checks", "name": "Data quality checks", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} } ],
    "tables": [], "error": null
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Transformation does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `transformations:run` (viewer). |
  | 409 | `transformation_test_in_progress` | A `dbt_test` run for this model is `queued` or `running`. Message: "A dbt test run for fct_invoices is already queued (run run_x). Wait for it to finish or cancel it first." `details: { "run_id": "run_x" }`. Checked before the next row. |
  | 409 | `transformation_has_no_tests` | The model's output relation has no tests. Message: "<name> has no tests defined. Add tests to its schema.yml in the dbt repository, then run dbt test." The detail page disables "Run tests" when `tests.total` is 0. |

- **Side effects:**
  - Audit `transformation.test_requested` on the transformation with `execution_id` and `metadata: { tests_selected, expected_failures, expected_warnings }` (the mock adds `simulated: true`; `expected_*` are the counts of currently failing error-severity tests and of warning tests, a mock artefact the backend can drop).
  - On completion: audit `dbt_test.run_succeeded`, `dbt_test.run_failed` or `dbt_test.run_cancelled` (actor Orchestrator, resource the transformation, `status` `failure` for a failed run, `metadata: { duration_seconds }` plus `simulated: true` in the mock); every test on the output model gets `last_run_at` = finish time and `run_id` = this run (the mock does this on cancellation too).
  - On failure: notification `quality_failed`, severity `critical`, title "<model> failed", message = the run error message (the mock appends " (simulated run <run_id>)"), `resource: { type: "run", id, name }`.
- **Async:** yes; poll `GET /runs/{run_id}`. The run fails at `quality_checks` when any `error`-severity test fails, with `error: { stage: "quality_checks", code: "quality_checks_failed", message: "1 error-severity test failed: unique_fct_invoices_invoice_id (14 failing rows).", details: <joined test messages>, retryable: false }`. Warning-severity failures do not fail the run. `records_processed` stays `null`. In the demo, testing `fct_invoices` always fails on the 14 duplicate invoice ids.
- **Backend notes:** Run `dbt test --select <model>` and write each result from `run_results.json` back to the quality checks (status, `failing_rows`, message), so `GET .../tests`, the model's `tests` summary and the quality dashboard change accordingly; the mock only stamps `last_run_at` and `run_id` and keeps the previous statuses. Same atomic "one active test run per model" guard and idempotency key as for runs.

### 4.3 AI business mapping

All four endpoints are used by the AI mapping screens under `/w/:ws/transformations/mapping`. The mock's suggestion engine is deterministic and calls no AI provider: it reads Bronze column metadata (or synthesizes plausible columns for tables not yet ingested), applies naming and normalisation rules, and profiles joins and keys with fixed story numbers (6 orphan payments; 14 duplicate invoice ids; 212 customers without GSTIN).

#### `GET /api/v1/workspaces/{workspace_id}/mapping-suggestions`

Lists the workspace's suggestion sets with decision counts, newest first.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200`, `MappingSuggestionSetSummary[]` (not paginated, no filters), sorted by `created_at` descending. Sets whose generation has completed are reported as `ready` with their counts (the mock completes generation lazily on read).

  ```json
  [
    {
      "id": "map_erp_gold", "workspace_id": "ws_acme", "source_id": "src_erp", "source_name": "ERP Database",
      "source_tables": ["public.invoices", "public.payments", "public.customers"], "target_layer": "gold",
      "business_context": "We want a collections fact to track how fast distributors pay and a customer dimension keyed on GSTIN.",
      "status": "in_review",
      "provider": { "name": "Graphite mock suggestion engine", "model": "simulated", "simulated": true },
      "created_at": "2026-10-27T05:15:00Z", "created_by": { "id": "usr_priya", "name": "Priya Nair" },
      "submitted_at": "2026-10-27T07:15:00Z", "review": null,
      "counts": { "total": 21, "pending": 2, "accepted": 15, "rejected": 1, "modified": 3 }
    }
  ]
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member. |

- **Side effects:** none (the mock's lazy completion of generation is a simulation detail).
- **Backend notes:** The list polls every 1.5 seconds while any row is `generating`. Compute `counts` in SQL or store them on the set; do not load every item. Add `page`/`page_size` and a `status` filter if workspaces accumulate many sets.

#### `POST /api/v1/ai/mapping-suggestions`

Requests AI suggestions for selected tables of one source; generation runs asynchronously.

- **Permission:** `mappings:review` in `workspace_id` (owner, admin, editor).
- **Request body:** `CreateMappingSuggestionRequest`.

  ```ts
  {
    workspace_id: string        // required; checked first
    source_id: string           // required; must be a source of this workspace
    source_tables: string[]     // required; 1..10 entries, no duplicates, each "<schema>.<table>" known for the source
    target_layer: 'silver' | 'gold'
    business_context?: string   // optional; trimmed; max 2000 chars; blank or a non-string value is stored as null (no error)
  }
  ```

  Validation order:
  1. `workspace_id` missing or not a string: 422 on `workspace_id`, "workspace_id is required." (before the permission check).
  2. Workspace lookup (404) and permission (403).
  3. Collected field errors, returned together as one 422:
     - `source_id`: missing -> "Choose a data source."; not in this workspace -> "This source does not exist in the workspace."
     - `source_tables`: empty or not an array -> "Select at least one table."; more than 10 -> "Select at most 10 tables per suggestion set."; duplicates -> "Each table can only be selected once."; entries not among the source's discovered tables, including non-string entries -> "Unknown table for ERP Database: public.foo." or "Unknown tables for ERP Database: public.foo, public.bar." These rules are checked in this order and only the first failing one is reported; the unknown-table rule runs only when `source_id` is valid.
     - `target_layer`: not `silver` or `gold` -> "Target layer must be silver or gold."
     - `business_context`: longer than 2000 after trimming -> "Business context must be at most 2000 characters."

  The source's health is not checked: a degraded or failing source (ERP Database, Web Orders DB) is accepted, and tables that have not been ingested yet get synthesized columns.

  ```json
  {
    "workspace_id": "ws_acme", "source_id": "src_erp",
    "source_tables": ["public.invoices", "public.payments", "public.customers"],
    "target_layer": "gold",
    "business_context": "We want a collections fact to track how fast distributors pay."
  }
  ```

- **Response:** `202`, the new `MappingSuggestionSet` with `status: "generating"`, `created_by` = caller, `submitted_at: null`, `review: null`, `business_context` trimmed or `null`, `source_name` copied from the source, and all four item lists empty.

  ```json
  {
    "id": "map_q8d2k7ra", "workspace_id": "ws_acme", "source_id": "src_erp", "source_name": "ERP Database",
    "source_tables": ["public.invoices", "public.payments", "public.customers"], "target_layer": "gold",
    "business_context": "We want a collections fact to track how fast distributors pay.",
    "status": "generating",
    "provider": { "name": "Graphite mock suggestion engine", "model": "simulated", "simulated": true },
    "created_at": "2026-10-28T09:20:00Z", "created_by": { "id": "usr_priya", "name": "Priya Nair" },
    "submitted_at": null, "field_mappings": [], "join_candidates": [], "key_candidates": [], "model_proposals": [], "review": null
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | `workspace_id` missing (checked before 404/403). |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `mappings:review` (viewer). |
  | 422 | `validation_error` | Field rules above; fields `source_id`, `source_tables`, `target_layer`, `business_context`. |

- **Side effects:**
  - Audit `mapping.suggestions_requested`, `resource: { type: "mapping", id: <set id>, name: "ERP Database to Gold mappings" }` (pattern "<source name> to Gold|Silver mappings"), `metadata: { source_id, source_tables, target_layer, provider }` (the mock adds `simulated: true`).
  - No audit event or notification when generation completes.
- **Async:** yes, but not a Run. The set stays `generating` (about 3.5 seconds in the mock) and then becomes `ready` with its items filled. The client polls `GET /ai/mapping-suggestions/{id}` every 1.5 seconds. What generation produces (mock rules the real provider output must fit):
  - **Field mappings:** at most 10 per table; Bronze housekeeping columns (`_dlt*`, `system_modstamp`) are skipped, and for Gold also `created_at`/`updated_at`. `target_model` is `stg_<source prefix>_<plural table>` for Silver and a fact/dimension name for Gold (`fct_collections`, `dim_distributor`, `fct_<plural>`, `dim_<singular>`), suffixed `_v2`, `_v3`... when that name already exists in the target layer.
  - **Join candidates:** columns ending in `_id` or `_code` that equal the single-column primary key of another selected table (plus Salesforce lookups to `Id`), with `match_rate` and `many_to_one` / `one_to_one` cardinality.
  - **Key candidates:** declared primary keys, business keys (`gstin`, the table's own document number, master `email`/`product_code`), and for Gold dimensions a surrogate key (with `valid_from` for SCD type 2 dimensions).
  - **Model proposals:** at most 3 (facts first, keeping slots for dimensions when master tables are selected), with columns derived from the field mappings, surrogate keys for Gold dimensions, `valid_from`/`valid_to`/`is_current` for SCD type 2, and fact-to-dimension surrogate key lookups.
  - Item ids are `fm_<set>_<n>`, `jc_<set>_<n>`, `kc_<set>_<n>`, `mp_<set>_<n>` (`<set>` is the set id without `map_`), unique within the set.
  - Field mapping, join and model proposal confidences are clamped to 0.55..0.97; key candidate confidences are fixed per rule (0.74 to 0.98).
- **Backend notes:**
  - Run generation as a background job and call the provider configured under Settings > AI provider (`GET/PUT /workspaces/{workspace_id}/integrations/ai-provider`). Respect its `enabled` flag and `data_sharing` (`metadata_only` must send only table and column metadata and profiling statistics; `metadata_and_samples` may add sample values). The mock ignores both, so an error code for "provider disabled or not configured" is still to be defined (see 4.4 Open questions).
  - On provider error, timeout or unparseable output, set `status: "failed"` (and consider storing a reason; the type has no field for it).
  - Fill `provider` with the real provider name and model id and `simulated: false`.
  - Validate the provider output before storing it: identifiers must match `^[a-z][a-z0-9_]{0,62}$`, types must pass the supported-type rule below, and confidences must be within 0..1.
  - Rate-limit per workspace (cost control) and accept an `Idempotency-Key` header.
  - `source_tables` should accept the tables listed by `GET /sources/{source_id}/tables`, which is where the client's picker gets them.
  - Profiling for joins and keys (match rates, uniqueness, null counts) should run against Bronze in the warehouse, not be invented by the model.

#### `GET /api/v1/ai/mapping-suggestions/{suggestion_id}`

Returns one suggestion set with all its items.

- **Permission:** any member of the set's workspace.
- **Path params:** `suggestion_id` (string, required).
- **Response:** `200`, `MappingSuggestionSet`. While `generating`, the item lists are empty.

  ```json
  {
    "id": "map_erp_gold", "workspace_id": "ws_acme", "source_id": "src_erp", "source_name": "ERP Database",
    "source_tables": ["public.invoices", "public.payments", "public.customers"], "target_layer": "gold",
    "business_context": "We want a collections fact to track how fast distributors pay and a customer dimension keyed on GSTIN.",
    "status": "in_review",
    "provider": { "name": "Graphite mock suggestion engine", "model": "simulated", "simulated": true },
    "created_at": "2026-10-27T05:15:00Z", "created_by": { "id": "usr_priya", "name": "Priya Nair" }, "submitted_at": "2026-10-27T07:15:00Z",
    "field_mappings": [
      { "id": "fm_4", "source_table": "public.payments", "source_field": "amount", "source_type": "numeric", "target_model": "fct_collections", "target_field": "amount_collected", "target_type": "numeric(18,2)", "normalization_rule": "round to 2 decimals", "confidence": 0.94, "rationale": "Currency amounts in INR with paise precision.", "decision": "accepted" }
    ],
    "join_candidates": [
      { "id": "jc_1", "left_table": "public.payments", "left_field": "invoice_id", "right_table": "public.invoices", "right_field": "invoice_id", "cardinality": "many_to_one", "match_rate": 0.9988, "confidence": 0.97, "rationale": "99.88% of payments match an invoice; 6 orphan payments found.", "decision": "accepted" }
    ],
    "key_candidates": [
      { "id": "kc_4", "table": "public.invoices", "fields": ["invoice_id"], "key_type": "primary", "uniqueness": 0.9998, "confidence": 0.74, "rationale": "14 duplicate ids caused by re-issued credit notes. Consider (invoice_id, invoice_type).", "decision": "pending" }
    ],
    "model_proposals": [
      { "id": "mp_1", "name": "fct_collections", "model_type": "fact", "grain": "One row per payment allocated to an invoice", "description": "Collections with days past due for receivables analysis.", "source_tables": ["public.payments", "public.invoices"], "columns": [ { "name": "amount_collected", "data_type": "numeric(18,2)", "expression": "round(payments.amount, 2)", "description": "Amount collected." } ], "confidence": 0.87, "rationale": "Payments carry invoice references and amounts; a payment-grain fact supports DSO and ageing.", "decision": "accepted" }
    ],
    "review": null
  }
  ```

  (Item lists abbreviated; the seed set has 12 field mappings, 3 joins, 4 keys and 2 model proposals, and its pending items are `jc_3` and `kc_4`. In the full response `fct_collections` has 5 columns.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Set does not exist ("Mapping suggestion set \"map_x\" was not found."). |
  | 403 | `forbidden` | Not a member of the set's workspace. |

- **Side effects:** none.
- **Backend notes:** Also used by the new schema proposal page (`/w/:ws/models/proposals/new?mapping=...`) to derive proposal changes from an approved set. Consider 404 instead of 403 for non-members. The client polls every 1.5 seconds while `generating`; a cheap status-only path is not required but the response should be served from storage, not regenerated.

#### `POST /api/v1/ai/mapping-suggestions/{suggestion_id}/review`

Records item decisions and, depending on `action`, saves a draft, submits the set for review, or approves or rejects it.

- **Permission:**
  - `mappings:approve` (owner, admin) for `action` `approve` or `reject`, and for `save_draft`/`submit` that carry at least one decision while the set is `in_review` ("once submitted, only approvers may change decisions");
  - otherwise `mappings:review` (owner, admin, editor).
- **Path params:** `suggestion_id` (string, required).
- **Request body:** `ReviewMappingRequest`.

  ```ts
  {
    action: 'save_draft' | 'submit' | 'approve' | 'reject'   // required
    decisions?: ReviewItemDecision[]                          // must be an array when present (null is rejected); [] allowed
    comment?: string                                          // trimmed; max 2000; required (non-blank) for "reject"
  }
  ```

  Each `ReviewItemDecision`:
  - `item_id` (string, required) must be an item of `item_type` in this set.
  - `item_type`: `field_mapping` | `join` | `key` | `model`.
  - `decision`: `accepted` | `rejected` | `modified` (`pending` is not accepted, so a decision cannot be reset to pending).
  - `overrides`: when present, a non-null object (not an array). With `modified` it must contain at least one key; with `accepted` or `rejected` it must be absent or empty (`{}` is tolerated). Editable keys per item type and their rules:

    | item_type | Key | Rule |
    |---|---|---|
    | `field_mapping` | `target_model`, `target_field` | snake_case identifier `^[a-z][a-z0-9_]{0,62}$` |
    | `field_mapping` | `target_type` | Supported warehouse type, case-insensitive, surrounding whitespace ignored, stored trimmed and lower-cased: `varchar` / `varchar(n)` and `char` / `char(n)` (n up to 5 digits), `numeric` / `numeric(p)` / `numeric(p,s)` or `numeric(p, s)` (p and s up to 2 digits), `smallint`, `integer`, `bigint`, `date`, `timestamp`, `timestamptz`, `boolean`, `text`, `double precision` (`src/lib/data-types.ts`). Error message: "Use a supported type: varchar(n), char(n), numeric(p,s), smallint, integer, bigint, date, timestamp, timestamptz, boolean, text or double precision." |
    | `field_mapping` | `normalization_rule` | `null` or a string of at most 500 chars |
    | `join` | `cardinality` | `one_to_one`, `one_to_many`, `many_to_one` or `many_to_many` |
    | `key` | `fields` | non-empty array of snake_case identifiers |
    | `model` | `name` | snake_case identifier |
    | `model` | `grain`, `description` | non-blank string of at most 500 chars |

    Any other key: "\"<key>\" cannot be edited for this item. Editable fields: <list>."

  The client keeps decisions locally and sends only the changed ones. Example (reviewer approving the ERP set after deciding its last two pending items):

  ```json
  {
    "action": "approve",
    "decisions": [
      { "item_id": "jc_3", "item_type": "join", "decision": "rejected" },
      { "item_id": "kc_4", "item_type": "key", "decision": "modified", "overrides": { "fields": ["invoice_id", "invoice_type"] } }
    ],
    "comment": "Approved with a composite invoice key; duplicate credit notes handled in Silver."
  }
  ```

- **Order of checks** (mock):
  1. 404 set.
  2. 422 `action` invalid ("action must be save_draft, submit, approve or reject."); 422 `decisions` not an array ("decisions must be a list.").
  3. 403 membership / permission (as above).
  4. 409 state checks (table below).
  5. 422 `comment` longer than 2000 or blank on `reject`.
  6. 422 per-decision validation, collected across all decisions, message "Some review decisions are invalid.", fields such as `decisions[0].item_id`, `decisions[1].overrides.target_type`. Per decision the structural checks run in the order `item_id` present ("Each decision needs an item_id, item_type and decision."), `item_type` valid ("item_type must be one of field_mapping, join, key or model."), item exists ("No field mapping with id \"fm_x\" in this suggestion set."), `decision` valid ("decision must be accepted, rejected or modified."), `overrides` shape ("overrides must be an object of edited values."), and stop at the first failure; override key errors are then all reported (`decisions[i].overrides.<key>`). Identifier keys fail with "Use a lowercase snake_case identifier (letters, digits and underscores, starting with a letter, at most 63 characters)."
  7. 422 target clash: a `modified` field mapping that changes `target_model` or `target_field` to a `target_model.target_field` already used by another non-rejected field mapping. Message "Two field mappings cannot write to the same target column.", field `decisions[i].overrides.target_field`, text "fct_collections.amount_collected is already the target of public.payments.amount. Choose another field name or reject that mapping." Nothing is saved.
  8. 422 pending items on `submit` or `approve`: after applying the decisions, any item still `pending`. Message "2 items still pending review.", field `decisions`, text "2 suggestions are still pending. Accept, edit or reject every item first." Nothing is saved. `reject` and `save_draft` allow pending items.

  Steps 6 to 8 are atomic: either every decision is applied or none is.
- **Effects of a `modified` decision** (applied server-side, visible in the response):
  - Field mapping retargeted: the matching column in the model proposal named by the old `target_model` is renamed and retyped; if `target_model` changed, the column is removed from the old proposal and added to the proposal with the new name, unless that proposal already has a column with that name or no proposal has that name (then the column is only removed). Nothing happens to proposals when the old proposal has no column named by the old `target_field`.
  - Model renamed: every field mapping with the old `target_model` and every key candidate whose `table` is the old name are re-pointed to the new name.
- **State transitions by action:**
  - `save_draft`: status unchanged.
  - `submit` (`ready` only): status `in_review`, `submitted_at` = now.
  - `approve` / `reject` (`in_review` only): status `approved` / `rejected`, `review = { action, reviewed_by: caller, reviewed_at: now, comment or null }`.
  - `comment` is stored only for `approve`/`reject`; it is ignored for `save_draft`/`submit`.
- **Response:** `200`, the full updated `MappingSuggestionSet`.

  ```json
  {
    "id": "map_erp_gold", "status": "approved", "submitted_at": "2026-10-27T07:15:00Z",
    "review": { "action": "approved", "reviewed_by": { "id": "usr_rahul", "name": "Rahul Mehta" }, "reviewed_at": "2026-10-28T09:30:00Z", "comment": "Approved with a composite invoice key; duplicate credit notes handled in Silver." },
    "key_candidates": [ { "id": "kc_4", "table": "public.invoices", "fields": ["invoice_id", "invoice_type"], "key_type": "primary", "uniqueness": 0.9998, "confidence": 0.74, "rationale": "14 duplicate ids caused by re-issued credit notes. Consider (invoice_id, invoice_type).", "decision": "modified" } ]
  }
  ```

  (Abbreviated; the real response is the complete set.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Set does not exist. |
  | 422 | `validation_error` | `action` or `decisions` malformed (checked before 403). |
  | 403 | `forbidden` | Not a member; role lacks `mappings:review` (viewer); or role lacks `mappings:approve` (editor) for approve/reject or for changing decisions of an `in_review` set. |
  | 409 | `mapping_not_ready` | Status `generating`. "Suggestions are still being generated. Try again in a few seconds." |
  | 409 | `mapping_generation_failed` | Status `failed`. "Generation failed for this set. Request new suggestions instead." |
  | 409 | `mapping_review_closed` | Status `approved` or `rejected`. "This suggestion set was already approved; it is read-only." `details: { "status": "approved" }`. |
  | 409 | `mapping_already_submitted` | `submit` when status is not `ready` (that is, `in_review`). `details: { "status": "in_review" }`. |
  | 409 | `mapping_not_submitted` | `approve`/`reject` when status is not `in_review` (that is, `ready`). "Only suggestion sets that were submitted for review can be approved or rejected." `details: { "status": "ready" }`. |
  | 422 | `validation_error` | `comment` too long or missing on reject ("Explain why the suggestions are rejected so the author can act on it."); per-decision errors; target clash; pending items on submit/approve. |

  On any 409 the client re-fetches the set ("someone else changed it").
- **Side effects:** one audit event per successful call, `resource: { type: "mapping", id, name: "<source name> to Gold|Silver mappings" }`, `metadata` always including `decisions_applied` (number of decisions in the request) and the resulting `accepted`, `modified`, `rejected`, `pending` counts:
  - `save_draft`: `mapping.draft_saved`.
  - `submit`: `mapping.submitted_for_review`, `changes: [{ field: "status", before: "ready", after: "in_review" }]`.
  - `approve`: `mapping.approved`; `reject`: `mapping.rejected`; both with `changes` on `status` and `metadata.comment`.
  - No notifications are created (the client still refreshes the notification list).
  - Approval creates nothing else: the schema proposal is created separately with `POST /workspaces/{workspace_id}/schema-proposals` and `mapping_suggestion_id`, which returns 409 `mapping_not_approved` unless the set is `approved` (Section 5).
- **Backend notes:** Use a row lock or a version check on the set so two reviewers cannot interleave decisions; the client already handles 409 by reloading, so a `409 mapping_conflict` (stale version) fits the existing flow. Check membership before validating the body. Decide the self-approval policy (the mock lets an admin approve a set they created or submitted). Consider notifying approvers on `submit` and the creator on `approve`/`reject`; the `NotificationType` enum has no mapping type yet. Store each decision with the deciding user and time if per-item history is needed for audit; the mock keeps only the latest decision. Validate `model` renames for uniqueness against other proposals in the set and existing models in the target layer (the mock does not).

### 4.4 Open questions

The open questions for this section are collected in [9.4](#94-transformations-and-ai-business-mapping).

---

## 5. Data models, data preview and schema proposals

A **data model** is one warehouse table or view in the Bronze, Silver or Gold layer, with its column profile, freshness, data quality results, detected schema drift, relationships and lineage (source to Bronze to Silver to Gold to Metabase dashboard). **Data preview** serves a small, bounded sample of a model's rows for inspection; it is never a full extract. A **schema proposal** is a reviewed change set (new fact or dimension tables, added or altered columns, relationships, surrogate keys) that an editor drafts, an approver reviews, and an approver applies as an asynchronous `schema_apply` run.

Ground truth for this section: `src/mocks/handlers/models.ts` (11 routes), `src/mocks/handlers/proposals.ts` (8 routes), `src/services/models.service.ts` (19 methods), `src/types/models.ts`, `src/types/quality.ts`, `src/types/sources.ts` (`TablePreview`), `src/types/runs.ts`, `src/mocks/engine/lineage.ts`, `src/mocks/engine/quality.ts`, `src/mocks/engine/sample-rows.ts`, `src/mocks/engine/runs.ts`, `src/mocks/store.ts`, `src/mocks/router.ts`, `src/mocks/permissions.ts`, `src/lib/data-types.ts`, `src/lib/proposal-limits.ts`.

### 5.0 Conventions used in this section

- All paths are relative to `/api/v1`. JSON keys are snake_case. Timestamps are ISO 8601 UTC with second precision, for example `"2026-10-28T09:15:00Z"`. IDs are opaque prefixed strings (`mdl_`, `sc_`, `qc_`, `prop_`, `chg_`, `run_`, `src_`, `trf_`, `dsh_`, `ws_`, `usr_`). Model ids in the seed follow `mdl_<schema prefix>_<name>`, for example `mdl_g_fct_invoices` or `mdl_berp_items`; clients must treat them as opaque.
- Every route requires a signed-in session (bearer token or HttpOnly session cookie). None is public.
- Errors use the standard envelope (`ApiErrorBody`, `src/types/common.ts`):

  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "field_errors": [{ "field": "changes.1.relationship.to_model", "message": "Choose the target model." }], "details": {}, "request_id": "4f0c..." } }
  ```

  `details` and `field_errors` are optional. For 422 the client maps `field_errors[].field` onto form fields; `field` may be a dotted path with numeric array indexes (`changes.0.columns.2.data_type`).
- Error codes shared by every endpoint in this section (repeated in each table):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." The client returns to the sign-in screen on any 401. |
  | 403 | `forbidden` | Not an active member of the workspace ("You are not a member of this workspace.") or the role lacks the permission ("Your role (viewer) does not include the \"models:approve\" permission."). |
  | 404 | `not_found` | The workspace, model, schema change or proposal does not exist. Message pattern: `Model "mdl_x" was not found.`, `Schema proposal "prop_x" was not found.`, `Workspace "ws_x" was not found.` |
  | 405 | `method_not_allowed` | Path exists but the method does not. |
  | 500 | `internal_error` | Unhandled server error. |

- **Order of checks** in the mock: route matching first (an unknown path is 404 `not_found`, a known path with the wrong method is 405, both before any session check), then session (401), then the resource lookup (404), then workspace membership and permission (403). After that the order differs per endpoint and is stated in each block (several proposal endpoints check state (409) before the body (422)). For `/workspaces/{workspace_id}/...` routes the 404 is for the workspace. A model or proposal in a workspace the caller does not belong to returns 403, not 404.
- **Permission denials are audited.** Every 403 caused by a missing permission (not by non-membership) records an audit event `access.denied` with `status: "denied"`, `resource: { type: "permission", id: "<permission>", name: "<permission>" }` and the acting user.
- **Role matrix** (`src/mocks/permissions.ts`) for the permissions used here:

  | Permission | owner | admin | editor | viewer |
  |---|---|---|---|---|
  | `models:propose` | yes | yes | yes | no |
  | `models:approve` | yes | yes | no | no |

  Every read endpoint, and the proposal dry-run validation, needs only active membership ("any workspace member"), so viewers can read the catalog, previews, lineage, quality and proposals.
- **Success status codes.** The mock transport does not model 2xx codes; the codes below follow the architecture document and the service comments: `200` for reads, updates and actions that return the updated resource, `201` for creates, `202` for anything that starts a Run, `204` (no body) for deletes. The API client accepts any 2xx and treats `204` as "no body".
- **No pagination on lists in this section.** Every list endpoint returns a bare JSON array; the frontend pages, sorts and filters client-side (the models table shows 20 rows per page). Only the preview endpoint pages, with its own parameters (5.3).
- **Boolean query values**: `true` or `1` mean true; any other present value means false.
- **Enum query values** are validated: an unknown value returns 422 with a field error on that parameter. An empty value is treated as "not set".
- **Async runs**: `POST /schema-proposals/{proposal_id}/apply` responds `202` with the initial `Run` (status `queued`). The proposal detail page polls `GET /runs/{run_id}` every 2 seconds until `status` is terminal; the run detail page it links to also reads `GET /runs/{run_id}/logs?after={cursor}`. Run endpoints are specified in section 2.7.
- **Demo-only markers**: the mock adds `"simulated": true` to the audit metadata of the apply trigger and of the orchestrator's run-completion event, and preview rows are synthetic (labelled "Simulated" in the UI). The production backend must not send `simulated: true` for real runs or real data.
- **Notifications**: no endpoint in this section creates a notification directly. The only notification is the generic run-failure notification when a `schema_apply` run fails (see 5.5, apply).

### 5.1 Types

All shapes below are the JSON bodies exactly as the frontend types declare them. Some enum aliases below (`Materialization`, `SchemaDriftType`, `LineageRefType`, `LineageStatus`, `Cardinality`, `QualityCheckType`, `QualitySeverity`, `ProposalOrigin`, `ReviewAction`) are named here for readability; `src/types` declares those unions inline on the fields that use them.

**Enums**

```ts
type DataLayer       = 'bronze' | 'silver' | 'gold'
type ModelRole       = 'raw' | 'staging' | 'intermediate' | 'fact' | 'dimension' | 'aggregate'
type FreshnessStatus = 'fresh' | 'stale' | 'unknown'
type Materialization = 'table' | 'view' | 'incremental'

type SchemaDriftType = 'column_added' | 'column_removed' | 'type_changed'      // SchemaChange.change_type (detected drift)

type LineageNodeKind = 'source' | 'bronze' | 'staging' | 'intermediate' | 'silver' | 'gold' | 'dashboard'
type LineageRefType  = 'source' | 'model' | 'transformation' | 'dashboard'
type LineageStatus   = 'ok' | 'warning' | 'error' | 'unknown'

type Cardinality     = 'one_to_one' | 'one_to_many' | 'many_to_one'

type QualityStatus    = 'passed' | 'failed' | 'warning' | 'not_run'
type QualityCheckType = 'not_null' | 'unique' | 'accepted_values' | 'relationships' | 'freshness' | 'row_count' | 'custom_sql'
type QualitySeverity  = 'error' | 'warn'

type SchemaChangeType = 'create_table' | 'add_column' | 'add_relationship' | 'add_surrogate_key' | 'alter_column'  // proposed change
type ProposalStatus   = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'applying' | 'applied'
type ProposalOrigin   = 'manual' | 'ai_mapping'
type ReviewAction     = 'approve' | 'reject' | 'request_changes'
```

**Supported warehouse data types** (proposal columns; `src/lib/data-types.ts`, shared with the forms). Case-insensitive; the server lowercases them:

```
varchar | varchar(n) | char | char(n)            n = 1..5 digits
numeric | numeric(p) | numeric(p,s)               p, s = 1..2 digits; one optional space after the comma
smallint | integer | bigint | date | timestamp | timestamptz | boolean | text | double precision
```

Regex: `^(?:(?:varchar|char)(?:\(\d{1,5}\))?|numeric(?:\(\d{1,2}(?:,\s?\d{1,2})?\))?|smallint|integer|bigint|date|timestamp|timestamptz|boolean|text|double precision)$` (case-insensitive).

**SchemaChange** (detected drift on a model, usually a Bronze table)

```ts
interface SchemaChange {
  id: string                    // "sc_..."
  detected_at: string
  change_type: SchemaDriftType
  column: string
  from_type: string | null      // null for column_added
  to_type: string | null        // null for column_removed
  acknowledged: boolean
}
```

**DataModel** (`src/types/models.ts`)

```ts
interface DataModel {
  id: string                         // "mdl_..."
  workspace_id: string
  database: string                   // "analytics"
  schema: string                     // "bronze_erp", "silver", "gold", ...
  name: string                       // "fct_invoices"
  layer: DataLayer
  role: ModelRole
  materialization: Materialization
  description: string
  row_count: number | null
  size_bytes: number | null
  columns_count: number
  primary_key: string[]              // column names; several for a composite key; [] when none
  business_keys: string[]
  last_refreshed_at: string | null
  freshness_sla_minutes: number | null   // null: no SLA, freshness_status is "unknown"
  freshness_status: FreshnessStatus      // stale when minutes since last_refreshed_at > SLA
  quality: { passed: number; failed: number; warned: number }   // counts of this model's checks by status
  null_issue_columns: number         // columns with null_fraction > 0.05
  duplicate_rows: number             // duplicate primary key values
  schema_changes: SchemaChange[]     // full history, acknowledged ones included
  source_id: string | null           // Bronze models: the source that loads them; otherwise null
  transformation_id: string | null   // dbt model that builds it; null for Bronze
  tags: string[]
  owner: string                      // display name
}
```

**ColumnProfile**

```ts
interface ColumnProfile {
  name: string
  data_type: string
  nullable: boolean
  description: string
  is_primary_key: boolean
  is_business_key: boolean
  is_surrogate_key: boolean
  references: { model_id: string; model_name: string; column: string } | null   // foreign key target
  null_fraction: number | null      // 0..1
  distinct_count: number | null
  duplicate_count: number | null    // set for single-column primary keys only
}
```

**Relationship**

```ts
interface Relationship {
  from_model_id: string
  from_model: string        // bare model name, e.g. "fct_invoices"
  from_column: string
  to_model_id: string
  to_model: string
  to_column: string
  cardinality: Cardinality  // every seeded relationship is "many_to_one"
}
```

**LineageGraph**

```ts
interface LineageNode {
  id: string              // model id, source id, or "node_<dashboard id>" for dashboards
  name: string            // Bronze: "<schema>.<name>"; other models: bare name; sources and dashboards: display name
  kind: LineageNodeKind
  ref_id: string          // id of the underlying resource
  ref_type: LineageRefType
  status: LineageStatus
}
interface LineageEdge { from: string; to: string }   // node ids, upstream to downstream
interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
  focus_id: string | null   // model id the graph is centred on; null for the workspace graph
}
```

Node rules: model `kind` is `bronze` for Bronze, `gold` for Gold, and for Silver `staging` (role staging), `intermediate` (role intermediate) or `silver` (anything else). Model `status`: `error` when `quality.failed > 0`; else `warning` when the model is stale, has `quality.warned > 0` or has an unacknowledged schema change; else `ok`. Source `status`: `error` for health `unhealthy`, `warning` for `degraded`, otherwise `ok`. Dashboard `status`: `unknown` for a draft dashboard, otherwise `ok`. Sources with no downstream table are omitted. The mock never emits `ref_type: "transformation"`.

**PreviewColumn / TablePreview** (`src/types/sources.ts`, shared with the source table preview in section 2.5)

```ts
interface PreviewColumn { name: string; data_type: string }
interface TablePreview {
  columns: PreviewColumn[]
  rows: Record<string, unknown>[]   // keyed by column name; values are string | number | boolean | null
  total_rows: number | null         // rows matching the filter within the sample (see 5.3), not the table row count
  page: number
  page_size: number
  sampled_at: string
}
```

**QualityCheck / QualitySummary** (`src/types/quality.ts`)

```ts
interface QualityCheck {
  id: string                 // "qc_..."
  model_id: string
  model_name: string         // "<schema>.<name>", e.g. "gold.fct_invoices"
  layer: DataLayer
  name: string               // dbt test name, e.g. "unique_fct_invoices_invoice_id"
  column: string | null
  check_type: QualityCheckType
  severity: QualitySeverity
  status: QualityStatus
  failing_rows: number
  message: string | null     // human explanation of a failure or warning
  last_run_at: string | null
  run_id: string | null      // run that last executed the check
}

interface QualitySummary {
  generated_at: string
  total: number
  passed: number
  failed: number
  warning: number
  not_run: number
  pass_rate: number          // passed / (passed + failed + warning); 0 when nothing has run
  by_layer: Record<DataLayer, { passed: number; failed: number; warning: number }>
  stale_models: number
  failing_checks: QualityCheck[]   // status failed or warning; failed first, then failing_rows descending
}
```

**ProposedSchemaChange / SchemaProposal**

```ts
interface ProposedSchemaChange {
  id: string                          // "chg_..."
  change_type: SchemaChangeType
  model_name: string                  // bare table name ("dim_customer"); "schema.name" is rejected by the name rule (5.5)
  layer: DataLayer                    // resolved by the server (see 5.5)
  model_role: 'fact' | 'dimension' | null
  summary: string                     // server generates one when empty
  columns: { name: string; data_type: string; is_key: boolean; description: string }[]
  relationship: { from_column: string; to_model: string; to_column: string } | null  // add_relationship only; to_model may be "name" or "schema.name"
  ddl_preview: string                 // rendered by the server for review only; never executed by the client
}

interface SchemaProposal {
  id: string                          // "prop_..."
  workspace_id: string
  title: string
  description: string                 // "" when not set
  status: ProposalStatus
  origin: ProposalOrigin              // "ai_mapping" when created with mapping_suggestion_id
  mapping_suggestion_id: string | null
  changes: ProposedSchemaChange[]
  created_by: { id: string; name: string }
  created_at: string
  reviewed_by: { id: string; name: string } | null
  reviewed_at: string | null
  review_comment: string | null
  apply_run_id: string | null         // run started by the latest apply call; kept after the run ends; a retry through /runs/{run_id}/retry does not update it
}
```

Proposal lifecycle:

```
draft --PATCH submit_for_review--> pending_review --review approve--> approved --apply--> applying --run succeeded--> applied
  ^                                     |  \--review reject--> rejected                   |
  |                                     |                                                 \--run failed or cancelled--> approved
  \------review request_changes---------/
create with submit_for_review: true goes straight to pending_review.
DELETE is allowed in draft and rejected only.
```

**Request inputs**

```ts
type ProposedSchemaChangeInput = Omit<ProposedSchemaChange, 'id' | 'ddl_preview'> & { id?: string }
// `id` is not in the TypeScript input type but the server accepts it: an id starting with "chg_" is kept,
// anything else (or none) gets a new "chg_..." id. The frontend sends existing ids back when editing.

interface ValidateSchemaProposalRequest  { changes: ProposedSchemaChangeInput[] }
interface ValidateSchemaProposalResponse {
  valid: boolean
  errors:   { change_index: number; message: string }[]
  warnings: { change_index: number; message: string }[]
  changes: ProposedSchemaChange[]        // normalised changes with ddl_preview
}
interface CreateSchemaProposalRequest {
  title: string
  description?: string
  changes: ProposedSchemaChangeInput[]
  mapping_suggestion_id?: string
  submit_for_review?: boolean
}
interface UpdateSchemaProposalRequest {
  title?: string
  description?: string
  changes?: ProposedSchemaChangeInput[]
  submit_for_review?: boolean
}
interface ReviewSchemaProposalRequest { action: ReviewAction; comment?: string }
```

**Run** is specified in section 2.1 and 2.7. The apply endpoint returns a `Run` with `kind: "schema_apply"`.

### 5.2 Data model catalog

#### `GET /api/v1/workspaces/{workspace_id}/models`

Lists every warehouse model of the workspace, optionally filtered.

- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace id. |

- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | none | Trimmed, case-insensitive substring match on `name`, `schema`, `"<schema>.<name>"`, `description` and each tag. |
  | `layer` | `DataLayer` | no | none | Exact layer. |
  | `role` | `ModelRole` | no | none | Exact role. |
  | `freshness` | `FreshnessStatus` | no | none | Exact freshness status. |
  | `schema` | string | no | none | Exact schema name (case-sensitive), e.g. `bronze_erp`. Not validated; an unknown schema returns `[]`. |
  | `has_schema_changes` | boolean | no | none | `true`: only models with at least one unacknowledged schema change. Any other present value: only models with none. Absent: no filter. |

- **Request body:** none.
- **Response:** `200`, `DataModel[]`, not paginated, sorted by layer (bronze, silver, gold), then `schema`, then `name`. An empty workspace (Northwind Retail) returns `[]`.

  ```json
  [
    {
      "id": "mdl_berp_items", "workspace_id": "ws_acme", "database": "analytics", "schema": "bronze_erp", "name": "items",
      "layer": "bronze", "role": "raw", "materialization": "table", "description": "Item master from the ERP database.",
      "row_count": 2240, "size_bytes": 962188, "columns_count": 6, "primary_key": ["item_code"], "business_keys": [],
      "last_refreshed_at": "2026-10-28T07:03:00Z", "freshness_sla_minutes": 480, "freshness_status": "fresh",
      "quality": { "passed": 3, "failed": 0, "warned": 0 }, "null_issue_columns": 0, "duplicate_rows": 0,
      "schema_changes": [
        { "id": "sc_items_hsn", "detected_at": "2026-10-27T03:15:00Z", "change_type": "type_changed", "column": "hsn_code", "from_type": "integer", "to_type": "varchar", "acknowledged": false }
      ],
      "source_id": "src_erp", "transformation_id": null, "tags": ["erp", "inventory"], "owner": "Rahul Mehta"
    }
  ]
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member of the workspace. |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | `layer`, `role` or `freshness` is not a known value. One field error per call (the first invalid parameter, checked in that order), message `Unknown layer "platinum". Expected one of: bronze, silver, gold.` |

- **Side effects:** none.
- **Backend notes:** Read from the catalog the backend maintains from dbt artifacts (`manifest.json`, `catalog.json`, `run_results.json`) and from the dlt load metadata for Bronze. `freshness_status`, `quality`, `null_issue_columns` and `duplicate_rows` must be derived from the latest profiling and test results, not stored by hand; in the mock `quality`, `null_issue_columns` and `duplicate_rows` are a static seed snapshot that does not change when checks re-run, while `last_refreshed_at` and `freshness_status: "fresh"` are updated when the sync stages of an ingestion or pipeline run succeed, even if a later stage fails (the source's Bronze models), or a transformation run succeeds (its output model). The mock never recomputes `stale` over time. The response is unbounded; at MSME scale (tens to a few hundred models) that is acceptable, but cap it (for example 1,000) and log when the cap is hit. The frontend calls this endpoint twice on the catalog page (unfiltered for the tree and summary, filtered for the table), so it should be cheap.

#### `GET /api/v1/models/{model_id}`

Returns one model.

- **Permission:** any workspace member (of the model's workspace).
- **Path params:** `model_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `DataModel` (shape and example as in the list endpoint).
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Model does not exist: `Model "mdl_x" was not found.` |
  | 403 | `forbidden` | Not a member of the model's workspace. |

- **Side effects:** none.

#### `GET /api/v1/models/{model_id}/columns`

Returns the column profile of a model.

- **Permission:** any workspace member.
- **Path params:** `model_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `ColumnProfile[]` in table column order; `[]` when the model has not been profiled.

  ```json
  [
    { "name": "invoice_id", "data_type": "bigint", "nullable": false, "description": "Invoice id.", "is_primary_key": true, "is_business_key": false, "is_surrogate_key": false, "references": null, "null_fraction": 0, "distinct_count": 58210, "duplicate_count": 14 },
    { "name": "invoice_no", "data_type": "varchar", "nullable": false, "description": "Invoice no.", "is_primary_key": false, "is_business_key": true, "is_surrogate_key": false, "references": null, "null_fraction": 0, "distinct_count": 27114, "duplicate_count": null },
    { "name": "customer_sk", "data_type": "bigint", "nullable": false, "description": "Surrogate key of the customer dimension.", "is_primary_key": false, "is_business_key": false, "is_surrogate_key": false, "references": { "model_id": "mdl_g_dim_customer", "model_name": "dim_customer", "column": "customer_sk" }, "null_fraction": 0, "distinct_count": 22477, "duplicate_count": null }
  ]
  ```

  (First three of the nine columns of `gold.fct_invoices`.)

- **Errors:** 401 `unauthenticated`; 404 `not_found` (model); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** `null_fraction`, `distinct_count` and `duplicate_count` come from a profiling job, not from a query per request; return `null` when not profiled. Column types should be the warehouse types in lowercase. The schema proposal builder uses this endpoint to offer existing columns, and the AI report assistant uses it for dataset context.

#### `POST /api/v1/models/{model_id}/schema-changes/{change_id}/acknowledge`

Marks one detected schema change on a model as acknowledged.

- **Permission:** `models:approve`.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `model_id` | string | yes | Model id. |
  | `change_id` | string | yes | `SchemaChange.id`, e.g. `sc_items_hsn`. |

- **Request body:** none (the client sends no body).
- **Response:** `200`, the updated `DataModel` (the change now has `acknowledged: true`).
- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Model does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:approve` (editor, viewer). |
  | 404 | `not_found` | No schema change with that id on this model: `Schema change "sc_x" was not found.` |
  | 409 | `schema_change_already_acknowledged` | The change is already acknowledged. Message: `The type changed change on "hsn_code" has already been acknowledged.` `details: { "change_id": "sc_items_hsn" }`. |

- **Side effects:**
  - Audit `model.schema_change_acknowledged` on resource `{ type: "model", id, name: "<schema>.<name>" }` with `changes: [{ field: "schema_changes.<change_id>.acknowledged", before: false, after: true }]` and `metadata: { change_id, change_type, column, from_type, to_type }`.
  - **Source health reconciliation** (Bronze models only): when the model's source has `health: "degraded"`, no recorded connection failure, and a `health_message` starting with `Schema change detected`, the server looks at the source's Bronze models for any remaining unacknowledged change. If one remains, `health_message` is rewritten to name it (`Schema change detected: <model>.<column> changed from <from> to <to>.` / `was added.` / `was removed.`). If none remains, `health` becomes `healthy` (or `unknown` when the source's `last_sync_status` is not `succeeded`) and `health_message` becomes `null`. In the demo, acknowledging `sc_items_hsn` on `bronze_erp.items` returns ERP Database to `healthy`. The client refreshes models, sources, overview, audit and search after this call.
- **Backend notes:** Acknowledging records that a person has seen the drift; it does not change the warehouse. Store who acknowledged and when (the type has only the boolean; consider adding `acknowledged_by` and `acknowledged_at`). Schema changes are detected by the ingestion service (the seed has an audit `model.schema_change_detected` by actor `svc_ingestion`); that detection and the matching `degraded` source health are backend responsibilities outside this endpoint. Make the acknowledge idempotent under concurrency (a conditional update `WHERE acknowledged = false`), returning 409 to the loser.

### 5.3 Data preview

#### `GET /api/v1/models/{model_id}/preview`

Returns one page of a bounded sample of a model's rows, optionally filtered and sorted within the sample.

- **Permission:** any workspace member.
- **Path params:** `model_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `page` | integer | no | 1 | 1-based page. Floored; values that are not a positive number fall back to 1. |
  | `page_size` | integer | no | 25 | Floored and clamped to 1..100; values that are not a positive number fall back to 25. The UI offers 25, 50 and 100. |
  | `sort` | string | no | none | Column name to sort by (case-sensitive). Must be one of the model's columns. An empty value means no sort. |
  | `order` | `'asc' \| 'desc'` | no | `asc` | Sort direction. It has no effect without `sort` but is validated even then; an empty value means `asc`. Nulls sort last for `asc` and first for `desc` (the descending sort reverses the whole comparison). |
  | `q` | string | no | none | Trimmed, case-insensitive substring match against the text of every non-null cell in a row (so ids and amounts match too). |

- **Request body:** none.
- **Response:** `200`, `TablePreview`.
  - `columns`: the model's columns (`name`, `data_type`) in table order.
  - The sample pool is the first `min(row_count, 250)` rows of the model. `q` filters the pool, `sort` sorts it, then the page is sliced.
  - `total_rows`: number of pool rows that match `q` (at most 250), not the table's `row_count`.
  - `page`, `page_size`: the effective values after clamping. A page past the end returns `rows: []`.
  - `sampled_at`: time the sample was taken.

  ```json
  {
    "columns": [
      { "name": "invoice_id", "data_type": "bigint" }, { "name": "invoice_no", "data_type": "varchar" },
      { "name": "customer_sk", "data_type": "bigint" }, { "name": "invoice_date_key", "data_type": "integer" },
      { "name": "gross_amount", "data_type": "numeric" }, { "name": "tax_amount", "data_type": "numeric" },
      { "name": "net_amount", "data_type": "numeric" }, { "name": "outstanding_amount", "data_type": "numeric" },
      { "name": "status", "data_type": "varchar" }
    ],
    "rows": [
      { "invoice_id": 100004, "invoice_no": "invoice no 1", "customer_sk": 100000, "invoice_date_key": 20261096, "gross_amount": 113823.19, "tax_amount": 5444.16, "net_amount": 54827.16, "outstanding_amount": 51422.48, "status": "PAID" },
      { "invoice_id": 100011, "invoice_no": "invoice no 2", "customer_sk": 100007, "invoice_date_key": 20261823, "gross_amount": 98457.77, "tax_amount": 231739.82, "net_amount": 165161.06, "outstanding_amount": 95827.81, "status": "OPEN" }
    ],
    "total_rows": 250, "page": 1, "page_size": 25, "sampled_at": "2026-10-28T09:15:00Z"
  }
  ```

  (`GET /models/mdl_g_fct_invoices/preview`; first two of the 25 rows. The values are the mock's deterministic synthetic rows, which is why `invoice_no` reads `invoice no 1` and the amounts are not internally consistent. A real backend returns warehouse values.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Model does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | `sort`: `Column "foo" does not exist in gold.fct_invoices.`; `order`: `Order must be "asc" or "desc".` (also when `sort` is absent). Both are reported in one response when both are wrong. |

- **Side effects:** none.
- **Backend notes:**
  - The mock generates deterministic synthetic rows; the backend must read real rows from the warehouse with a hard row limit (a `LIMIT 250` sample, or `TABLESAMPLE` for large tables), a statement timeout (for example 10 seconds) and a read-only role. Never run an unbounded query for a preview.
  - Filter and sort within the sample, not the whole table, so a preview never becomes a full scan; or, if the backend chooses to filter server-side on the table, it must document that `total_rows` semantics change. The UI shows `total_rows` as the number of rows in the sample.
  - Apply column-level masking for columns tagged as PII (GSTIN, email, phone) according to the workspace's policy before returning rows; the mock does not mask.
  - Serialise `bigint` values above 2^53 and high-precision `numeric` values as strings; dates as `"YYYY-MM-DD"`, timestamps as ISO 8601 UTC.
  - When a model has no profiled columns the mock returns `columns: []` with empty row objects; the backend should return `columns: []`, `rows: []`, `total_rows: 0`.
  - Rate-limit previews per user (for example 30 per minute); the preview grid refetches on every page, sort and filter change (filter input is debounced by the client).
  - Consider caching a sample per model for a short time and returning the cached `sampled_at`.

### 5.4 Lineage, relationships and quality

#### `GET /api/v1/models/{model_id}/lineage`

Returns the lineage subgraph around one model.

- **Permission:** any workspace member.
- **Path params:** `model_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `depth` | integer | no | 3 | Number of hops to follow upstream and, separately, downstream. Whole number 1..6; anything else, including an empty value (`depth=`), returns 422. The model detail page offers 1 to 4 (default 2); the transformation detail page defaults to 3. |

- **Request body:** none.
- **Response:** `200`, `LineageGraph` with `focus_id` = the model id. The server builds the full workspace graph (as in the workspace endpoint), then keeps the focus node, every node reachable upstream within `depth` hops and every node reachable downstream within `depth` hops (the two walks are independent, so siblings reached only by going up then down are not included). `edges` are all edges whose two ends are both kept.

  ```json
  {
    "nodes": [
      { "id": "mdl_g_fct_invoices", "name": "fct_invoices", "kind": "gold", "ref_id": "mdl_g_fct_invoices", "ref_type": "model", "status": "error" },
      { "id": "mdl_s_stg_erp_invoices", "name": "stg_erp_invoices", "kind": "staging", "ref_id": "mdl_s_stg_erp_invoices", "ref_type": "model", "status": "ok" },
      { "id": "mdl_g_dim_customer", "name": "dim_customer", "kind": "gold", "ref_id": "mdl_g_dim_customer", "ref_type": "model", "status": "ok" },
      { "id": "node_dsh_receivables", "name": "Receivables and Collections", "kind": "dashboard", "ref_id": "dsh_receivables", "ref_type": "dashboard", "status": "ok" }
    ],
    "edges": [
      { "from": "mdl_s_stg_erp_invoices", "to": "mdl_g_fct_invoices" },
      { "from": "mdl_g_dim_customer", "to": "mdl_g_fct_invoices" },
      { "from": "mdl_g_fct_invoices", "to": "node_dsh_receivables" }
    ],
    "focus_id": "mdl_g_fct_invoices"
  }
  ```

  (Abbreviated at `depth=1`; the real response also contains `dim_date`, `fct_invoice_lines`, `fct_payments`, `agg_monthly_revenue`, `agg_receivables_aging` and the Executive Revenue Overview dashboard.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Model does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | `depth` is not a whole number from 1 to 6: `Depth must be a whole number between 1 and 6.` |

- **Side effects:** none.
- **Backend notes:** Build lineage from the dbt manifest (`depends_on`, `sources`), the dlt pipeline-to-table mapping for Source to Bronze edges, and Metabase dashboard card queries (or dbt exposures) for model to dashboard edges. When Metabase is unreachable (the demo state), return the last known dashboard edges rather than dropping them. Cache the workspace graph and invalidate it on dbt compile, source changes and dashboard changes.

#### `GET /api/v1/workspaces/{workspace_id}/lineage`

Returns the full lineage graph of a workspace: sources to Bronze to Silver to Gold to dashboards.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:** none.
- **Request body:** none.
- **Response:** `200`, `LineageGraph` with `focus_id: null`. Node and status rules are in 5.1. A workspace with no models and no dashboards (Northwind) returns `{ "nodes": [], "edges": [], "focus_id": null }`; sources without a downstream table are omitted, so Northwind's graph is empty even if it has sources. Dashboards are always included as nodes, with or without edges.

  ```json
  {
    "nodes": [
      { "id": "src_erp", "name": "ERP Database", "kind": "source", "ref_id": "src_erp", "ref_type": "source", "status": "warning" },
      { "id": "mdl_berp_items", "name": "bronze_erp.items", "kind": "bronze", "ref_id": "mdl_berp_items", "ref_type": "model", "status": "warning" },
      { "id": "src_web_orders", "name": "Web Orders DB", "kind": "source", "ref_id": "src_web_orders", "ref_type": "source", "status": "error" }
    ],
    "edges": [ { "from": "src_erp", "to": "mdl_berp_items" } ],
    "focus_id": null
  }
  ```

  (Abbreviated.)
- **Errors:** 401 `unauthenticated`; 404 `not_found` (workspace); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** As for model lineage. The graph is unbounded; at MSME scale it is small, but cap nodes (for example 2,000) and return a flag or 422 if the cap is exceeded rather than a partial graph without notice.

#### `GET /api/v1/models/{model_id}/relationships`

Lists the relationships in which the model is on either side (it references another model, or another model references it).

- **Permission:** any workspace member.
- **Path params:** `model_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `Relationship[]`, both directions, in catalog order. The UI splits them into "References" (`from_model_id` = this model) and "Referenced by" (`to_model_id` = this model).

  ```json
  [
    { "from_model_id": "mdl_g_fct_invoices", "from_model": "fct_invoices", "from_column": "customer_sk", "to_model_id": "mdl_g_dim_customer", "to_model": "dim_customer", "to_column": "customer_sk", "cardinality": "many_to_one" },
    { "from_model_id": "mdl_g_fct_payments", "from_model": "fct_payments", "from_column": "invoice_id", "to_model_id": "mdl_g_fct_invoices", "to_model": "fct_invoices", "to_column": "invoice_id", "cardinality": "many_to_one" }
  ]
  ```

  (Abbreviated. For `mdl_g_fct_invoices` the seed returns four rows in this order: `fct_invoices.customer_sk` to `dim_customer`, `fct_invoices.invoice_date_key` to `dim_date`, `fct_invoice_lines.invoice_id` to `fct_invoices`, `fct_payments.invoice_id` to `fct_invoices`.)

- **Errors:** 401 `unauthenticated`; 404 `not_found` (model); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** Derive relationships from dbt `relationships` tests (and foreign keys declared in model YAML). Cardinality can be inferred from the uniqueness of each side; the mock always reports `many_to_one`.

#### `GET /api/v1/workspaces/{workspace_id}/relationships`

Lists every relationship whose `from` model belongs to the workspace.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `Relationship[]` (shape as above). `[]` for Northwind.
- **Errors:** 401 `unauthenticated`; 404 `not_found` (workspace); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** No frontend screen calls this endpoint today (see the open questions); it exists in the service for an ER diagram view. Implement it cheaply from the same source as the per-model endpoint.

#### `GET /api/v1/models/{model_id}/quality-checks`

Lists the data quality checks (dbt tests and freshness checks) defined on one model with their latest result.

- **Permission:** any workspace member.
- **Path params:** `model_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `QualityCheck[]`, sorted by status (`failed`, `warning`, `not_run`, `passed`), then `name`.

  ```json
  [
    { "id": "qc_g_fct_invoices_1", "model_id": "mdl_g_fct_invoices", "model_name": "gold.fct_invoices", "layer": "gold", "name": "unique_fct_invoices_invoice_id", "column": "invoice_id", "check_type": "unique", "severity": "error", "status": "failed", "failing_rows": 14, "message": "14 duplicate invoice_id values. Credit notes re-issued in the ERP reuse the original invoice id.", "last_run_at": "2026-10-28T07:14:00Z", "run_id": null },
    { "id": "qc_g_fct_invoices_5", "model_id": "mdl_g_fct_invoices", "model_name": "gold.fct_invoices", "layer": "gold", "name": "freshness_fct_invoices", "column": null, "check_type": "freshness", "severity": "error", "status": "passed", "failing_rows": 0, "message": null, "last_run_at": "2026-10-28T07:14:00Z", "run_id": null }
  ]
  ```

  (Abbreviated. `fct_invoices` has five checks; after the failed `unique` check the passed ones follow by name: `freshness_fct_invoices`, `not_null_fct_invoices_invoice_id`, `relationships_fct_invoices_customer_sk`, `relationships_fct_invoices_invoice_date_key`. Seeded `relationships` checks have severity `warn`, the others `error`.)

- **Errors:** 401 `unauthenticated`; 404 `not_found` (model); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** Populate from dbt `run_results.json` after each `dbt test` (and the quality stage of pipeline runs) and from source freshness. Set `run_id` to the run that last executed the check; the mock updates `last_run_at` and `run_id` when a `dbt_test` run of the model's transformation finishes, but does not change `status` or `failing_rows`. Do not return failing row values here; the UI only shows counts and the message.

#### `GET /api/v1/workspaces/{workspace_id}/quality-summary`

Returns workspace-wide data quality totals and the list of failing and warning checks.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `QualitySummary`, computed at request time over every check of every model in the workspace:
  - `total`, `passed`, `failed`, `warning`, `not_run`: counts by status.
  - `pass_rate` = `passed / (passed + failed + warning)`, or `0` when no check has run.
  - `by_layer`: counts per layer (keys `bronze`, `silver`, `gold` always present).
  - `stale_models`: models with `freshness_status: "stale"`.
  - `failing_checks`: checks with status `failed` or `warning`; `failed` first; within the same status, `failing_rows` descending.

  ```json
  {
    "generated_at": "2026-10-28T09:15:00Z",
    "total": 125, "passed": 114, "failed": 4, "warning": 3, "not_run": 4, "pass_rate": 0.9421487603305785,
    "by_layer": { "bronze": { "passed": 38, "failed": 2, "warning": 0 }, "silver": { "passed": 38, "failed": 0, "warning": 1 }, "gold": { "passed": 38, "failed": 2, "warning": 2 } },
    "stale_models": 3,
    "failing_checks": [
      { "id": "qc_g_fct_invoices_1", "model_id": "mdl_g_fct_invoices", "model_name": "gold.fct_invoices", "layer": "gold", "name": "unique_fct_invoices_invoice_id", "column": "invoice_id", "check_type": "unique", "severity": "error", "status": "failed", "failing_rows": 14, "message": "14 duplicate invoice_id values. Credit notes re-issued in the ERP reuse the original invoice id.", "last_run_at": "2026-10-28T07:14:00Z", "run_id": null }
    ]
  }
  ```

  (Counts are those of the Acme seed at load; `pass_rate` is not rounded. `failing_checks` is abbreviated to its first entry. In seed order the seven failing checks are: `fct_invoices` unique invoice_id (failed, 14 rows), freshness of `bronze_web.orders`, `bronze_web.order_items` and `agg_receivables_aging` (failed, 0 rows each), `stg_erp_customers` gstin not null (warning, 212), `fct_payments` invoice_id relationships (warning, 6), `fct_sales_pipeline` stage accepted values (warning, 3). The four `not_run` checks are the non-freshness checks of the two Web Orders Bronze tables. The three stale models are the two Web Orders Bronze tables and `agg_receivables_aging`.)
- **Errors:** 401 `unauthenticated`; 404 `not_found` (workspace); 403 `forbidden` (not a member).
- **Side effects:** none.
- **Backend notes:** Compute from the latest result per check (not the history). Return the full `failing_checks` list; if it can grow large, cap it (for example 200) and keep the counts exact.

### 5.5 Schema proposals

**Validation of changes.** The validate, create and update endpoints share one validator (`validateChanges` in the proposals handler). It runs against the workspace catalog (every model and its columns) plus the tables created earlier or later in the same proposal. It produces **errors** (block saving) and **warnings** (advice only), each tied to a change index and, for errors, a field path inside the change. Input is normalised first: strings are trimmed (non-strings become `""`), `data_type` is lowercased, `is_key` is `true` only when the JSON value is `true`, `model_role` is kept only when it is `fact` or `dimension` (otherwise `null`), `columns` defaults to `[]` when it is not an array, and `relationship` is `null` unless a truthy value is sent (any truthy value becomes an object whose missing members are `""`).

Common rules (the column rules apply to `create_table`, `add_column`, `alter_column` and `add_surrogate_key` only):

| Field | Rule | Error message |
|---|---|---|
| `change_type` | One of `SchemaChangeType`. | `Unknown change type "drop_table".` (field `change_type`) |
| `model_name` | `^[a-z][a-z0-9_]{1,62}$` (2 to 63 chars, starts with a lowercase letter). Checked only when `change_type` is valid. A dotted `schema.name` fails this rule for every change type; only `relationship.to_model` accepts `schema.name`. | `Enter a model name.` or `Model name "Dim Channel" must start with a lowercase letter and use only lowercase letters, digits and underscores (2 to 63 characters).` (field `model_name`) |
| `columns[i].name` | `^[a-z_][a-z0-9_]{0,62}$`, unique within the change. | `Column 2 needs a name.`, `Column name "Amount" must be lowercase letters, digits and underscores.`, `Column "amount" is listed more than once.` (field `columns.<i>.name`) |
| `columns[i].data_type` | Supported data type (5.1). Not required for the non-key (source) columns of `add_surrogate_key`. | `Choose a data type for column "amount".` or `Data type "money" is not supported.` (field `columns.<i>.data_type`) |
| `changes` (array) | 1 to 50 entries. | `Add at least one change.` / `A proposal can contain at most 50 changes.` (field `changes`; returned as 422 by validate, create and update) |

`add_relationship` changes and changes with an unknown `change_type` are not column-checked: their `columns` are returned as sent (after normalisation). A backend should reject or drop `columns` on `add_relationship` rather than store unchecked values.

**Table resolution.** A reference (`model_name` of non-create changes, `relationship.to_model`) is resolved against tables created by `create_table` changes of the same proposal first, then existing models. Among matches, the one in the change's `layer` wins, then other Silver/Gold layers, then Bronze. Existing Silver tables live in schema `silver`, Gold in `gold`. For non-create changes the resolved table's `layer` and (when fact or dimension) role replace the client's values in the response. An invalid or missing `layer` on a non-create change defaults to `gold` for resolution. `relationship.to_model` is resolved with the from table's resolved layer as the preferred layer; when it is written as `schema.name` only tables in that schema match. Only `create_table` changes with a valid name and a Silver or Gold layer count as tables created in the proposal.

Rules per change type:

- **`create_table`**
  - Errors: `layer` `bronze` (`Bronze tables are created by ingestion, not by schema proposals. Choose Silver or Gold.`) or not `silver`/`gold` (`Choose the Silver or Gold layer.`), field `layer`; `model_role` not `fact`/`dimension` (`Choose whether this table is a fact or a dimension.`, field `model_role`); no columns (`Add at least one column.`, field `columns`); a model with the same name already exists in that layer (`A gold model named "fct_invoices" already exists (gold.fct_invoices). Choose another name, or use "Add column" to extend it.`, field `model_name`); the same layer and name is created by an earlier change (`"dim_channel" is already created by change 1 of this proposal.`, field `model_name`); a fact or dimension with columns but no `is_key` column (`Fact tables need a key column. Mark the column that uniquely identifies a row as the key.`, field `columns`).
  - Warnings: fact name not starting `fct_`, dimension name not starting `dim_`; a fact with no `add_relationship` change in the proposal whose `model_name` is this table (`Fact table "fct_collections" has no relationship to a dimension. ...`); a dimension with no business key (no column matching `(_code|_id|_key|_no|_number|^gstin|^email)$` other than `*_sk`, and no non-`_sk` key column).
  - `ddl_preview`: `create table <schema>.<name> (...)` with `not null` on key columns, `primary key (...)` over the key columns and one `comment on column` statement per column description (single quotes doubled).
  - Default summary: `Create dimension gold.dim_channel with 3 columns.`
- **`add_column`**
  - Errors: target not found (`Model "x" was not found among existing models or tables created in this proposal.`, field `model_name`); target is Bronze (`Bronze tables mirror the source and are changed by ingestion only. Target a Silver or Gold model.`, field `model_name`); no columns (`Add at least one column.`, field `columns`); a column that already exists on the target (`Column "x" already exists on gold.dim_customer.`, field `columns.<i>.name`).
  - Warnings: the target is created in the same proposal (suggests adding the column to its definition).
  - `ddl_preview`: one `alter table <schema>.<name>\n  add column <col> <type>;` per column. Default summary: `Add a, b to gold.dim_customer.`
- **`alter_column`**
  - Errors: target not found or Bronze (as above); no columns (`Choose the column to change.`); a column that does not exist on the target (`Column "x" does not exist on gold.fct_invoices.`, field `columns.<i>.name`).
  - Warnings: the type is unchanged; the type family changes (text, integer, decimal, timestamp or other), which fails for rows that cannot be cast.
  - `ddl_preview`: `alter table ... alter column <col> type <type> using <col>::<type>;`. Default summary: `Change hsn_code to varchar(8) on silver.stg_erp_items.`
- **`add_surrogate_key`**: exactly one `is_key` column (the new key) plus one or more non-key columns (the columns the key is generated from).
  - Errors: target not found or Bronze; no key column (`Name the surrogate key column.`); more than one key column; the key column already exists (field `columns.<keyIndex>.name`); no source columns (`Select at least one source column to generate the surrogate key from.`); a source column that does not exist on the target (field `columns`).
  - Warnings: key name not ending `_sk`; the target is not a dimension.
  - The server fills a source column's empty or unsupported `data_type` with the target column's type, so reviewers see it.
  - `ddl_preview`: `alter table ... add column <key> <type>;` plus a comment showing `{{ dbt_utils.generate_surrogate_key(['a', 'b']) }} as <key>`.
- **`add_relationship`**: `model_name` is the referencing (from) table; `relationship` names the from column and the target.
  - Errors: from table not found (field `model_name`; unlike the other non-create types, a Bronze from or target table is not an error); `relationship` missing (`Describe the relationship: from column, target model and target column.`, field `relationship`); `from_column` empty or not on the from table (field `relationship.from_column`); `to_model` empty or not found (field `relationship.to_model`); `to_column` empty or not on the target (field `relationship.to_column`).
  - Warnings: the target column is not a key of the target; the type families of the two columns differ; the same relationship already exists in the catalog.
  - `ddl_preview`: a dbt `schema.yml` fragment headed `# dbt relationships test (models/<from layer>/schema.yml)` with a `relationships` test (`to: ref('<target>')`, `field: <to_column>`); `""` unless both tables resolve. Default summary: `fct_collections.distributor_sk references dim_distributor.distributor_sk.`
  - The response keeps `relationship` only for this change type; other types return `relationship: null`.

#### `GET /api/v1/workspaces/{workspace_id}/schema-proposals`

Lists the workspace's schema proposals, newest first.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `status` | `ProposalStatus` | no | none | Exact status. An empty value means no filter. |
  | `q` | string | no | none | Case-insensitive substring match on `title` and `description` (not trimmed). Not exposed by the frontend service. |

- **Request body:** none.
- **Response:** `200`, `SchemaProposal[]` (full objects including `changes`), sorted by `created_at` descending, not paginated.

  ```json
  [
    {
      "id": "prop_order_channel", "workspace_id": "ws_acme", "title": "Add channel dimension for web orders",
      "description": "Draft: normalise storefront channels (web, app, marketplace) into a small dimension.",
      "status": "draft", "origin": "manual", "mapping_suggestion_id": null,
      "changes": [
        { "id": "chg_o1", "change_type": "create_table", "model_name": "dim_channel", "layer": "gold", "model_role": "dimension", "summary": "Create channel dimension.",
          "columns": [ { "name": "channel_sk", "data_type": "integer", "is_key": true, "description": "Surrogate key." }, { "name": "channel_code", "data_type": "varchar(20)", "is_key": false, "description": "Channel code." }, { "name": "channel_name", "data_type": "varchar(60)", "is_key": false, "description": "Display name." } ],
          "relationship": null, "ddl_preview": "create table gold.dim_channel (\n  channel_sk   integer primary key,\n  channel_code varchar(20) not null,\n  channel_name varchar(60) not null\n);" }
      ],
      "created_by": { "id": "usr_priya", "name": "Priya Nair" }, "created_at": "2026-10-27T09:15:00Z",
      "reviewed_by": null, "reviewed_at": null, "review_comment": null, "apply_run_id": null
    }
  ]
  ```

  (First entry only. Seed for Acme, newest first: `prop_order_channel` draft, `prop_collections` pending review, `prop_sales_rep_sk` applied. Northwind returns `[]`. The seeded `ddl_preview` strings are hand-written; the validator re-renders them in its own format (5.5) the next time the proposal is edited or submitted.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | Unknown `status`: `Unknown status "open". Use one of draft, pending_review, approved, rejected, applied, applying.` |

- **Side effects:** none.
- **Backend notes:** The frontend always calls without `status` and filters and counts tabs client-side; the AI mapping page filters the result by `mapping_suggestion_id` client-side. The list page polls every 2 seconds while any proposal is `applying`, so the list must be cheap; if `changes` makes it heavy, consider a summary shape, but that requires a frontend change (the list shows the change count). Consider adding a `mapping_suggestion_id` query parameter.

#### `POST /api/v1/workspaces/{workspace_id}/schema-proposals/validate`

Dry-runs a set of changes against the current catalog: returns errors, warnings and server-rendered DDL without saving anything.

- **Permission:** any workspace member (no permission string is checked; viewers can call it).
- **Path params:** `workspace_id` (string, required).
- **Request body:** `ValidateSchemaProposalRequest`:

  ```ts
  { changes: ProposedSchemaChangeInput[] }   // required, 1..50 entries; rules in 5.5 "Validation of changes"
  ```

  ```json
  {
    "changes": [
      { "change_type": "add_relationship", "model_name": "fct_collections", "layer": "gold", "model_role": null, "summary": "", "columns": [],
        "relationship": { "from_column": "distributor_sk", "to_model": "dim_distributor", "to_column": "distributor_sk" } }
    ]
  }
  ```

- **Response:** `200`, `ValidateSchemaProposalResponse`. Errors in the changes do **not** produce a 422 here: they are returned in `errors` with `valid: false`. Unlike the 422 of create and update, entries carry only `change_index` and `message`, not a field path.

  ```json
  {
    "valid": false,
    "errors": [
      { "change_index": 0, "message": "Model \"fct_collections\" was not found among existing models or tables created in this proposal." },
      { "change_index": 0, "message": "Target model \"dim_distributor\" was not found among existing models or tables created in this proposal." }
    ],
    "warnings": [],
    "changes": [
      { "id": "chg_8f2k1x0a", "change_type": "add_relationship", "model_name": "fct_collections", "layer": "gold", "model_role": null,
        "summary": "fct_collections.distributor_sk references dim_distributor.distributor_sk.", "columns": [],
        "relationship": { "from_column": "distributor_sk", "to_model": "dim_distributor", "to_column": "distributor_sk" }, "ddl_preview": "" }
    ]
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member. |
  | 422 | `validation_error` | `changes` missing, not an array, empty (`Add at least one change.`) or longer than 50 (`A proposal can contain at most 50 changes.`), field `changes`. |

- **Side effects:** none (no audit event). New `chg_` ids in the response are not persisted.
- **Backend notes:** Validation must read the same catalog snapshot the create endpoint uses. The proposal builder calls it on "Validate and preview DDL"; the AI mapping page calls it automatically for an approved mapping set (cached 30 seconds client-side). Rate-limit per user. Render `ddl_preview` for the warehouse dialect actually used (the mock renders PostgreSQL DDL and dbt YAML).

#### `POST /api/v1/workspaces/{workspace_id}/schema-proposals`

Creates a proposal as a draft, or directly in review.

- **Permission:** `models:propose`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `CreateSchemaProposalRequest`:

  ```ts
  {
    title: string                    // required; trimmed length 3..120
    description?: string             // trimmed length <= 2000; stored as "" when omitted
    changes: ProposedSchemaChangeInput[]   // required, 1..50, all rules in "Validation of changes"
    mapping_suggestion_id?: string   // an AI mapping suggestion set of this workspace with status "approved"; an empty string is not checked (see backend notes)
    submit_for_review?: boolean      // only the JSON value true submits; default false (draft)
  }
  ```

  Validation order: title and description (one 422 listing both fields if both fail), then `changes` presence and length, then `mapping_suggestion_id`, then the change rules (one 422 listing every change error).

  ```json
  {
    "title": "Add channel dimension for web orders",
    "description": "Normalise storefront channels (web, app, marketplace) into a small dimension.",
    "submit_for_review": true,
    "changes": [
      { "change_type": "create_table", "model_name": "dim_channel", "layer": "gold", "model_role": "dimension", "summary": "",
        "columns": [ { "name": "channel_sk", "data_type": "integer", "is_key": true, "description": "Surrogate key." }, { "name": "channel_code", "data_type": "varchar(20)", "is_key": false, "description": "Channel code." } ],
        "relationship": null }
    ]
  }
  ```

- **Response:** `201`, the created `SchemaProposal`: `status` `pending_review` when `submit_for_review` is `true`, otherwise `draft`; `origin` `ai_mapping` when `mapping_suggestion_id` is set, otherwise `manual`; `created_by` = caller; review fields and `apply_run_id` `null`; `changes` normalised with ids and `ddl_preview`.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:propose` (viewer). |
  | 422 | `validation_error` | `title`: `Title must be at least 3 characters.` / `Title must be at most 120 characters.`; `description`: `Description must be at most 2000 characters.` |
  | 422 | `validation_error` | `changes`: `Add at least one change.` / `A proposal can contain at most 50 changes.` |
  | 422 | `validation_error` | `mapping_suggestion_id`: `Mapping suggestion set "map_x" was not found in this workspace.` |
  | 409 | `mapping_not_approved` | The mapping set exists but is not `approved`. Message: `The mapping suggestions for ERP Database are "in review". Approve them before generating a schema proposal.` `details: { "mapping_suggestion_id": "map_erp_gold", "status": "in_review" }`. |
  | 422 | `validation_error` | Change rule errors. Message: `The proposal has 2 validation errors.` `field_errors[].field` = `changes.<index>.<field path>` (e.g. `changes.1.relationship.to_model`, `changes.0.columns.2.data_type`) or `changes.<index>` when the error has no field. |

- **Side effects:**
  - Audit `schema_proposal.created` on resource `{ type: "proposal", id, name: title }` with `metadata: { changes: <count>, origin, mapping_suggestion_id, status }`.
  - When submitted, a second audit event `schema_proposal.submitted` on the same resource.
  - No notification is sent (see backend notes).
- **Backend notes:** Persist the proposal and its changes in one transaction. Titles are not unique. Store the catalog version the proposal was validated against. Consider notifying users with `models:approve` when a proposal enters `pending_review` (the notification types in the frontend do not include one today). Consider an `Idempotency-Key` so a double submit cannot create two proposals. The mock skips the mapping check for `"mapping_suggestion_id": ""` and then stores `""` with `origin: "manual"`; the backend should treat an empty string as absent and store `null`. The frontend never sends an empty string.

#### `GET /api/v1/schema-proposals/{proposal_id}`

Returns one proposal.

- **Permission:** any workspace member (of the proposal's workspace).
- **Path params:** `proposal_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `SchemaProposal`.

  ```json
  {
    "id": "prop_collections", "workspace_id": "ws_acme", "title": "Collections fact and distributor dimension",
    "description": "Drafted by hand from the finance team collections requirements. Adds fct_collections, dim_distributor with an SCD2 surrogate key, and their relationship. The ERP to Gold AI mapping suggestions for the same tables are still in review and are not the basis of this proposal.",
    "status": "pending_review", "origin": "manual", "mapping_suggestion_id": null,
    "changes": [
      { "id": "chg_3", "change_type": "add_relationship", "model_name": "fct_collections", "layer": "gold", "model_role": "fact",
        "summary": "fct_collections.distributor_sk references dim_distributor.distributor_sk.", "columns": [],
        "relationship": { "from_column": "distributor_sk", "to_model": "dim_distributor", "to_column": "distributor_sk" },
        "ddl_preview": "-- dbt test (schema.yml)\n- name: distributor_sk\n  tests:\n    - relationships:\n        to: ref('dim_distributor')\n        field: distributor_sk" }
    ],
    "created_by": { "id": "usr_priya", "name": "Priya Nair" }, "created_at": "2026-10-27T08:15:00Z",
    "reviewed_by": null, "reviewed_at": null, "review_comment": null, "apply_run_id": null
  }
  ```

  (`changes` abbreviated to the third of three: `chg_1` creates `gold.dim_distributor`, `chg_2` creates `gold.fct_collections`.)
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | `Schema proposal "prop_x" was not found.` |
  | 403 | `forbidden` | Not a member of the proposal's workspace. |

- **Side effects:** none.
- **Backend notes:** The detail page polls this endpoint every 2 seconds while `status` is `applying`, and polls `GET /runs/{apply_run_id}` for stage progress.

#### `PATCH /api/v1/schema-proposals/{proposal_id}`

Edits a draft proposal and, optionally, submits it for review.

- **Permission:** `models:propose`.
- **Path params:** `proposal_id` (string, required).
- **Request body:** `UpdateSchemaProposalRequest`, every field optional; omitted fields keep their value:

  ```ts
  {
    title?: string                        // trimmed length 3..120 when present
    description?: string                  // trimmed length <= 2000 when present
    changes?: ProposedSchemaChangeInput[] // replaces the whole list; 1..50; full change validation
    submit_for_review?: boolean           // any truthy value submits
  }
  ```

  - When `changes` is present it replaces the list and is validated. When `changes` is absent but `submit_for_review` is truthy, the stored changes are **re-validated** against the current catalog (it may have changed since the draft was saved); a 422 blocks the submission.
  - Change ids starting with `chg_` are preserved; other changes get new ids.
  - Submitting sets `status: "pending_review"` and clears `reviewed_by`, `reviewed_at` and `review_comment`. An edit without submitting keeps the previous review comment (so the author can see a "changes requested" comment while editing).

  ```json
  { "title": "Add channel dimension for web orders", "submit_for_review": true }
  ```

- **Response:** `200`, the updated `SchemaProposal`.
- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Proposal does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:propose`. |
  | 409 | `proposal_not_editable` | Status is not `draft`. Message: `Only draft proposals can be edited (current status: pending review).` `details: { "status": "pending_review" }`. Checked before the body. |
  | 422 | `validation_error` | `title` / `description` length (as in create). |
  | 422 | `validation_error` | `changes` present but not an array (including `null`), empty, or longer than 50 (field `changes`). |
  | 422 | `validation_error` | Change rule errors, as in create (`The proposal has N validation errors.`, fields `changes.<index>...`). |

  Nothing is saved when any check fails.
- **Side effects:** Audit on resource `{ type: "proposal", id, name: <title after the update> }` with action `schema_proposal.submitted` when `submit_for_review` is truthy, otherwise `schema_proposal.updated`. `changes` lists the differing keys among `title`, `description`, `changes` (the change count, not the content) and `status`, each as `{ field, before, after }`.
- **Backend notes:** There is no ownership check: any user with `models:propose` can edit any draft in the workspace. Use optimistic concurrency (an `updated_at` or version precondition) so two editors cannot silently overwrite each other; the mock has none. The mock writes the audit event even when nothing changed.

#### `DELETE /api/v1/schema-proposals/{proposal_id}`

Deletes a draft or rejected proposal.

- **Permission:** `models:propose`.
- **Path params:** `proposal_id` (string, required).
- **Request body:** none.
- **Response:** `204`, no body.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Proposal does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:propose`. |
  | 409 | `proposal_not_deletable` | Status is `pending_review`, `approved`, `applying` or `applied`. Message: `Only draft or rejected proposals can be deleted (current status: approved).` `details: { "status": "approved" }`. |

- **Side effects:** Audit `schema_proposal.deleted` on resource `{ type: "proposal", id, name: title }` with `metadata: { status }`.
- **Backend notes:** Consider a soft delete so audit links keep resolving to a title. The proposal's mapping set (if any) is not affected.

#### `POST /api/v1/schema-proposals/{proposal_id}/review`

Approves, rejects or sends back a proposal that is pending review.

- **Permission:** `models:approve`.
- **Path params:** `proposal_id` (string, required).
- **Request body:** `ReviewSchemaProposalRequest`:

  ```ts
  {
    action: 'approve' | 'reject' | 'request_changes'   // required
    comment?: string    // trimmed; required (>= 3 chars) for reject and request_changes; <= 2000 chars for every action
  }
  ```

  ```json
  { "action": "request_changes", "comment": "Keep customer_code as the business key on dim_distributor and add a relationship from fct_collections." }
  ```

- **Response:** `200`, the updated `SchemaProposal`. New status: `approve` gives `approved`, `reject` gives `rejected`, `request_changes` gives `draft`. `reviewed_by` = caller, `reviewed_at` = now, `review_comment` = trimmed comment or `null` when empty.

  ```json
  {
    "id": "prop_collections", "workspace_id": "ws_acme", "title": "Collections fact and distributor dimension",
    "description": "Drafted by hand from the finance team collections requirements. Adds fct_collections, dim_distributor with an SCD2 surrogate key, and their relationship. The ERP to Gold AI mapping suggestions for the same tables are still in review and are not the basis of this proposal.",
    "status": "draft", "origin": "manual", "mapping_suggestion_id": null,
    "changes": [
      { "id": "chg_3", "change_type": "add_relationship", "model_name": "fct_collections", "layer": "gold", "model_role": "fact",
        "summary": "fct_collections.distributor_sk references dim_distributor.distributor_sk.", "columns": [],
        "relationship": { "from_column": "distributor_sk", "to_model": "dim_distributor", "to_column": "distributor_sk" },
        "ddl_preview": "-- dbt test (schema.yml)\n- name: distributor_sk\n  tests:\n    - relationships:\n        to: ref('dim_distributor')\n        field: distributor_sk" }
    ],
    "created_by": { "id": "usr_priya", "name": "Priya Nair" }, "created_at": "2026-10-27T08:15:00Z",
    "reviewed_by": { "id": "usr_rahul", "name": "Rahul Mehta" }, "reviewed_at": "2026-10-28T09:20:00Z",
    "review_comment": "Keep customer_code as the business key on dim_distributor and add a relationship from fct_collections.",
    "apply_run_id": null
  }
  ```

  (`changes` abbreviated as in the GET example; review does not re-validate or re-render them.)

- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Proposal does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:approve` (editor, viewer). |
  | 409 | `proposal_not_in_review` | Status is not `pending_review`. Message: `Only proposals pending review can be reviewed (current status: draft).` `details: { "status": "draft" }`. Checked before the body. |
  | 422 | `validation_error` | `action`: `Action must be approve, reject or request_changes.` |
  | 422 | `validation_error` | `comment` shorter than 3 characters for `reject` (`Explain why the proposal is rejected.`) or `request_changes` (`Describe the changes you need.`). |
  | 422 | `validation_error` | `comment` longer than 2000 characters: `Comment must be at most 2000 characters.` |

- **Side effects:** Audit `schema_proposal.approved`, `schema_proposal.rejected` or `schema_proposal.changes_requested` on resource `{ type: "proposal", id, name: title }` with `changes: [{ field: "status", before: "pending_review", after: <new status> }]` and `metadata: { comment, self_review }`, where `self_review` is `true` when the reviewer created the proposal.
- **Backend notes:** The mock allows a user to approve their own proposal and only records `self_review` in the audit metadata. Decide whether to forbid self-approval (a workspace setting would fit MSMEs with a single admin). Re-validate the changes on approve so an approval cannot stand on a catalog that has moved on (the mock does not). Make the status transition conditional on `status = 'pending_review'` so two concurrent reviews cannot both succeed.

#### `POST /api/v1/schema-proposals/{proposal_id}/apply`

Applies an approved proposal to the warehouse by starting a `schema_apply` run.

- **Permission:** `models:approve`.
- **Path params:** `proposal_id` (string, required).
- **Request body:** none.
- **Response:** `202`, the new `Run` at creation:
  - `kind: "schema_apply"`, `status: "queued"`, `trigger: "manual"`, `triggered_by` = caller, `target_name` = proposal title;
  - `schema_proposal_id` = the proposal; `pipeline_id`, `source_id`, `transformation_id`, `schedule_id` all `null`;
  - `attempt: 1`, `retry_of: null`, `started_at`, `finished_at`, `duration_seconds`, `records_processed` and `error` all `null`;
  - `stages`: `dbt_transform`, `silver_gold_publish`, `quality_checks`, each `status: "queued"` with null timings and `metrics: {}`;
  - `tables`: one entry per distinct `"<silver|gold>.<model_name>"` among the changes, in order of first appearance (a change whose layer is not `silver` is listed under `gold`; an `add_relationship` change lists its from table), each `status: "queued"`, `mode: "full"`, `records: 0`, `error: null`.

  The proposal itself becomes `status: "applying"` with `apply_run_id` = the run id.

  ```json
  {
    "id": "run_q8w2m4zt", "workspace_id": "ws_acme", "kind": "schema_apply", "status": "queued", "trigger": "manual",
    "triggered_by": { "id": "usr_rahul", "name": "Rahul Mehta" }, "target_name": "Collections fact and distributor dimension",
    "pipeline_id": null, "source_id": null, "transformation_id": null, "schedule_id": null, "schema_proposal_id": "prop_collections",
    "queued_at": "2026-10-28T09:25:00Z", "started_at": null, "finished_at": null, "duration_seconds": null,
    "attempt": 1, "retry_of": null, "records_processed": null,
    "stages": [
      { "key": "dbt_transform", "name": "dbt transformation", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "silver_gold_publish", "name": "Silver / Gold publish", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} },
      { "key": "quality_checks", "name": "Data quality checks", "status": "queued", "started_at": null, "finished_at": null, "duration_seconds": null, "error": null, "skip_reason": null, "metrics": {} }
    ],
    "tables": [
      { "table": "gold.dim_distributor", "status": "queued", "mode": "full", "records": 0, "error": null },
      { "table": "gold.fct_collections", "status": "queued", "mode": "full", "records": 0, "error": null }
    ],
    "error": null
  }
  ```

- **Errors** (in check order):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Proposal does not exist. |
  | 403 | `forbidden` | Not a member, or role lacks `models:approve`. |
  | 409 | `proposal_apply_in_progress` | Status is `applying`. Message: `This proposal is already being applied.` `details: { "run_id": "run_..." }`. |
  | 409 | `proposal_not_approved` | Any other status than `approved`. Message: `Only approved proposals can be applied (current status: pending review).` `details: { "status": "pending_review" }`. |

- **Side effects:**
  - Audit `schema_proposal.apply_triggered` on resource `{ type: "proposal", id, name: title }` with `execution_id` = run id and `metadata: { changes: <count> }` (the mock adds `simulated: true`).
  - On completion the orchestrator (actor `{ type: "service", id: "svc_orchestrator", name: "Orchestrator" }`) records `schema_apply.run_succeeded`, `schema_apply.run_failed` or `schema_apply.run_cancelled` on resource `{ type: "run", id: <run id>, name: title }` with `execution_id`, audit `status` `success` (succeeded or cancelled) or `failure` (failed), and `metadata: { duration_seconds }` (the mock adds `simulated: true`).
  - Proposal status on completion: `succeeded` sets `applied`; `failed` or `cancelled` sets it back to `approved` (so it can be applied again). `apply_run_id` keeps pointing at the last run.
  - Notification on failure only: type `pipeline_failed` (or `quality_failed` when the failing stage is `quality_checks`; `repeated_retries` from attempt 3), severity `critical`, honouring the recipient's in-app preferences. No notification on success.
  - The client refreshes proposals, runs, overview, models and audit after the call.
- **Async:** yes. The run moves `queued` to `running` to a terminal status; in the demo it always succeeds after roughly 12 to 18 seconds. The AI mapping page creates proposals through the create endpoint with `mapping_suggestion_id` set; in the seed only `map_sf_silver` (Salesforce Production) is `approved`, and `map_erp_gold` (ERP Database) is `in_review`, which yields the 409 `mapping_not_approved` example above. The proposal detail page polls `GET /runs/{apply_run_id}` every 2 seconds until the run is terminal (it shows live stage progress and links to `/w/:ws/runs/:runId`) and `GET /schema-proposals/{proposal_id}` every 2 seconds until the status leaves `applying`; the proposals list polls while any proposal is `applying`. Cancel and retry use `POST /runs/{run_id}/cancel` and `/retry` (section 2.7).
- **Backend notes:**
  - The mock changes no catalog: after `applied`, no new `DataModel` appears and no column is added. The backend must turn the approved changes into dbt changes (new model SQL and YAML, `relationships` tests, `generate_surrogate_key` expressions), commit them to the workspace's dbt project (directly or as a pull request, per policy), then run `dbt run` and `dbt test` for the affected models (the three stages), and refresh the catalog so the new tables and columns appear in `GET /workspaces/{workspace_id}/models`.
  - The rendered `ddl_preview` is for review only. Do not execute it verbatim; generate the warehouse DDL from the structured changes, inside a transaction where the warehouse allows it.
  - Re-validate the changes against the current catalog before starting; return 409 (or 422) if they no longer apply.
  - Make the `approved` to `applying` transition atomic so a double click cannot start two runs; consider an `Idempotency-Key`.
  - `alter_column` changes can fail on existing rows; surface the cast error as the run's `error` with `retryable: false`.
  - Snapshot the proposal's changes onto the run so a later edit cannot change what a running apply does.

### 5.6 Open points found while writing this section

The open questions for this section are collected in [9.5](#95-data-models-data-preview-and-schema-proposals).

---

## 6. Analytics, Metabase integration and AI report recommendations

This domain is the consumption end of the platform. A **dashboard** is a Metabase dashboard built on Silver/Gold models that the workspace catalogs and embeds through short-lived signed URLs. A **report** is a single saved question (dataset, dimensions, measures, filters, visualization) that is created as a draft in Graphite and then published to Metabase as a question. The **AI report assistant** turns a plain-language prompt into report recommendations built only from the workspace's Gold models; a recommendation becomes a draft report only after a person reviews and saves it. Members can also file a **custom report request** for the data team, and the workspace's **Metabase integration status** gates embedding and publishing.

Ground truth for this section: `src/mocks/handlers/analytics.ts` (14 routes), `src/services/reports.service.ts` (14 methods), `src/types/analytics.ts`, `src/types/mapping.ts` (`AiProviderInfo`), `src/types/common.ts`, `src/mocks/engine/integrations.ts` (`metabaseStatus`), `src/mocks/store.ts`, `src/mocks/router.ts`, `src/mocks/permissions.ts`, `src/mocks/seed/analytics.ts`. Every route has exactly one service method and every service method has exactly one route.

### 6.0 Conventions used in this section

- All paths are relative to `/api/v1`. JSON keys are snake_case. Timestamps are ISO 8601 UTC, for example `"2026-10-28T09:15:00Z"`. Calendar dates (`needed_by`) are `YYYY-MM-DD`. IDs are opaque prefixed strings: `ws_` workspace, `dsh_` dashboard, `rpt_` report, `rr_` report request, `sug_` suggestion, `rec_` recommendation, `mdl_` data model, `usr_` user.
- Every route requires a signed-in session (bearer token or HttpOnly session cookie). None is public.
- Errors use the standard envelope (`ApiErrorBody`, `src/types/common.ts`):

  ```json
  { "error": { "code": "validation_error", "message": "Some fields are invalid.", "field_errors": [{ "field": "measures.0.aggregation", "message": "Aggregation must be one of: sum, count, count_distinct, avg, min, max." }], "details": {}, "request_id": "4f0c..." } }
  ```

  `details` and `field_errors` are optional. The client shows `field_errors` on the matching form fields; `field` can be a dotted path with array indexes (`dimensions.2`, `filters.0.value`). **All validation in this section collects every failing field into one 422**, unlike some other sections that stop at the first error.
- Error codes shared by every endpoint (repeated in each table where they apply):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No valid session. Message: "Your session has expired. Please sign in again." The client returns to sign-in on any 401. |
  | 403 | `forbidden` | Not an active member of the workspace ("You are not a member of this workspace."), or the role lacks the permission ("Your role (viewer) does not include the \"reports:write\" permission."). |
  | 404 | `not_found` | Workspace, dashboard or report does not exist. Message pattern: `Dashboard "dsh_x" was not found.` |
  | 405 | `method_not_allowed` | Path exists but the method does not. |
  | 500 | `internal_error` | Unhandled server error. |

- **Order of checks**: route matching (an unknown path is `404 not_found` "No mock handler for ...", a known path with the wrong method is `405`), then session (401), resource lookup (404; for `/workspaces/{workspace_id}/...` routes this is the workspace), membership then permission (403), body or query validation (422), state conflicts (409). The two routes that take `workspace_id` in the body or query (`POST /ai/report-suggestions`, both `/integrations/metabase/*` routes) validate that `workspace_id` is present (422) **before** the 404/403 checks.
- **Membership** means an active membership; an `invited` member (seed: Meera Iyer) gets 403.
- **Permission denials are audited.** A 403 caused by a missing permission (not by non-membership) records audit `access.denied` with `status: "denied"` and `resource: { type: "permission", id: "<permission>", name: "<permission>" }`.
- **Role matrix** (`src/mocks/permissions.ts`) for permissions used here:

  | Permission | owner | admin | editor | viewer |
  |---|---|---|---|---|
  | `reports:write` | yes | yes | yes | no |
  | `reports:publish` | yes | yes | no | no |

  All other routes in this section need only active membership ("any workspace member"), viewers included.
- **Success status codes.** The mock transport does not model 2xx codes. This contract uses `200` for reads and actions, `201` for creates (report, report request, suggestion). The client accepts any 2xx.
- **No pagination.** Every list endpoint in this section returns a bare JSON array, sorted server-side. See the per-endpoint backend notes for recommended caps.
- **Boolean query values**: `true` or `1` mean true; any other present value means false. The client omits empty and null query values.
- **Example caller.** Examples assume the demo clock is `2026-10-28T09:15:00Z` and, unless stated otherwise, the caller is Priya Nair (`usr_priya`, editor in Acme), so `is_favorite` follows her seed favorites (dashboards `dsh_sales_pipeline` and `dsh_customer_segments`, report `rpt_rep_performance`). The default demo sign-in is Ananya Rao (owner), whose favorites differ.
- **No async runs.** No endpoint in this section starts a `Run`. (Metabase refresh after a pipeline run is a pipeline stage, specified in section 3.)
- **Honesty rules that constrain the backend contract** (`docs/frontend-architecture.md`): the backend, never the browser, generates Metabase embed URLs; a successful embed or publish is never simulated; AI output always names its provider and carries `simulated: true` only when no real provider was called.

### 6.1 Types

All shapes are the JSON bodies exactly as `src/types/analytics.ts` declares them.

**Enums**

```ts
type BusinessArea = 'sales' | 'finance' | 'operations' | 'marketing' | 'customer' | 'inventory'
type VisualizationType = 'line' | 'bar' | 'area' | 'table' | 'kpi' | 'pie' | 'pivot'
type DataLayer = 'bronze' | 'silver' | 'gold'
type Aggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max'
type FilterOperator = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'last_n_days'
type DashboardStatus = 'published' | 'draft'
type ReportStatus = 'draft' | 'in_review' | 'published'
type ReportOrigin = 'manual' | 'ai_suggestion'
type ReportRequestPriority = 'low' | 'normal' | 'high'
type ReportRequestStatus = 'submitted' | 'in_progress' | 'delivered' | 'declined'
type MetabaseConnectionStatus = 'not_configured' | 'connected' | 'unreachable' | 'auth_failed'
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'paused' | 'unknown'
```

**DatasetRef**

```ts
interface DatasetRef {
  model_id: string     // "mdl_g_fct_invoices"
  model_name: string   // "fct_invoices" (bare model name, no schema)
  layer: DataLayer
}
```

**Dashboard**

```ts
interface Dashboard {
  id: string                          // "dsh_..."
  workspace_id: string
  name: string
  description: string
  business_area: BusinessArea
  status: DashboardStatus
  metabase_dashboard_id: number | null   // null for drafts not yet in Metabase
  cards_count: number
  datasets: DatasetRef[]              // models the dashboard's cards read from; may be empty
  owner: string                       // display name
  updated_at: string
  last_viewed_at: string | null
  view_count_30d: number
  is_favorite: boolean                // per signed-in user, computed on every read
  preview: DashboardPreview | null    // catalog thumbnail values; null when not computed
}
interface DashboardPreview {
  kpis: { label: string; value: string; delta: number | null }[]   // value is pre-formatted ("INR 4.82 Cr"); delta is a fraction (0.064 = +6.4%)
  series: { label: string; value: number }[]
  series_label: string                // e.g. "Net revenue, INR Cr"
}
```

**Report**

```ts
interface Report {
  id: string                          // "rpt_..."
  workspace_id: string
  name: string                        // 3..120 chars, unique per workspace (case-insensitive)
  description: string                 // "" when not set; max 500
  business_area: BusinessArea
  status: ReportStatus
  origin: ReportOrigin
  visualization: VisualizationType
  dataset: DatasetRef                 // always a Silver or Gold model
  dimensions: string[]                // column refs, max 6
  measures: ReportMeasure[]           // 1..8
  filters: ReportFilter[]             // max 10
  metabase_question_id: number | null // set when published
  owner: string                       // display name of the creator
  updated_at: string
  last_viewed_at: string | null
  is_favorite: boolean                // per signed-in user
  suggestion?: ReportSuggestionProvenance | null   // always sent by the mock (null when absent); see below
}
interface ReportMeasure {
  name: string                        // display label, e.g. "Net revenue"
  expression: string                  // column ref ("net_amount", "dim_customer.customer_sk"), "*" or a free expression
  aggregation: Aggregation
}
interface ReportFilter {
  field: string                       // column ref
  operator: FilterOperator
  value: string                       // always a string; see value rules under POST /reports
}
interface ReportSuggestionProvenance {
  suggestion_id: string
  recommendation_id: string
  prompt: string                      // the normalised prompt the suggestion was generated from
  provider: AiProviderInfo
  confidence: number                  // recommendation confidence at suggestion time, 0..1
  suggested_at: string                // suggestion created_at
}
```

`suggestion` is non-null only when `origin` is `ai_suggestion` **and** the provenance is still known. A report with `origin: "ai_suggestion"` and `suggestion: null` is valid (seed: `rpt_payment_modes`); the UI then says the original suggestion details are not available.

**Column references** (dimensions, filter fields, identifier-like measure expressions) match `^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$` (case-insensitive). A bare `column` resolves against the report's dataset. `model.column` resolves against a Silver or Gold model of the same workspace with that bare name, for example `dim_customer.customer_name` or `dim_date.fiscal_year`; it expresses a join from the dataset to that model.

**ReportRequest**

```ts
interface ReportRequest {
  id: string                          // "rr_..."
  workspace_id: string
  title: string                       // 3..120
  description: string                 // 20..2000
  business_area: BusinessArea
  priority: ReportRequestPriority
  needed_by: string | null            // "YYYY-MM-DD"
  status: ReportRequestStatus         // "submitted" at creation
  requested_by: { id: string; name: string }
  created_at: string
}
```

**ReportSuggestion and ReportRecommendation**

```ts
interface ReportSuggestion {
  id: string                          // "sug_..."
  prompt: string                      // normalised: trimmed, runs of whitespace collapsed to one space
  provider: AiProviderInfo
  created_at: string
  recommendations: ReportRecommendation[]   // 0..4, in ranked order (best topic match first, not sorted by confidence)
}
interface ReportRecommendation {
  id: string                          // "rec_...", unique within the suggestion
  title: string
  description: string
  dataset: DatasetRef                 // always a Gold model of the workspace
  dimensions: string[]
  measures: ReportMeasure[]
  filters: ReportFilter[]
  visualization: VisualizationType
  confidence: number                  // 0.30..0.97, two decimals
  rationale: string                   // why this dataset and shape; includes cautions (quality, freshness, ambiguity)
}
interface AiProviderInfo {
  name: string                        // "Graphite mock suggestion engine" in demo
  model: string                       // "simulated" in demo
  simulated: boolean                  // true only when no real provider was called
}
```

**MetabaseStatus and EmbedSession**

```ts
interface MetabaseStatus {
  status: MetabaseConnectionStatus
  health: HealthStatus                // not_configured -> unknown; unreachable -> unhealthy (see backend notes for the rest)
  site_url: string | null             // null when not configured
  version: string | null              // Metabase version reported by the instance; null when unknown
  embedding_enabled: boolean          // embedding secret is set (and, live, static embedding is enabled in Metabase)
  last_checked_at: string | null      // time of the last test-connection for this workspace; null if never tested
  message: string | null              // human-readable explanation shown in the UI
}
interface EmbedSession {
  embed_url: string                   // signed, short-lived URL on the Metabase site origin
  expires_at: string
}
```

---

### 6.2 Dashboards

#### `GET /api/v1/workspaces/{workspace_id}/dashboards`

Lists the workspace's dashboards with optional search and filters, newest `updated_at` first.

- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace id. |

- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | none | Trimmed; case-insensitive substring match on `name`, `description`, `owner` or any `datasets[].model_name`. Blank is ignored. |
  | `business_area` | BusinessArea | no | none | Exact match. An empty value is ignored; any other unknown value: 422. |
  | `status` | DashboardStatus | no | none | `published` or `draft`. An empty value is ignored; any other unknown value: 422. The frontend does not send it today. |
  | `favorite` | boolean | no | none | `true`/`1` returns only the caller's favorites; any other present value (including an empty string) returns only non-favorites; absent returns both. The frontend sends only `favorite=true` (the favorites switch on the catalog) and otherwise omits it. |

- **Response:** `200`, `Dashboard[]` (not paginated), sorted by `updated_at` descending. `is_favorite` is computed for the caller.

  ```json
  [
    {
      "id": "dsh_sales_pipeline", "workspace_id": "ws_acme", "name": "Sales Pipeline Health",
      "description": "Open pipeline by stage, rep and expected close month, with win rates.",
      "business_area": "sales", "status": "published", "metabase_dashboard_id": 15, "cards_count": 11,
      "datasets": [
        { "model_id": "mdl_g_fct_sales_pipeline", "model_name": "fct_sales_pipeline", "layer": "gold" },
        { "model_id": "mdl_g_dim_sales_rep", "model_name": "dim_sales_rep", "layer": "gold" },
        { "model_id": "mdl_g_dim_customer", "model_name": "dim_customer", "layer": "gold" }
      ],
      "owner": "Priya Nair", "updated_at": "2026-10-27T09:15:00Z", "last_viewed_at": "2026-10-28T06:15:00Z",
      "view_count_30d": 204, "is_favorite": true,
      "preview": {
        "kpis": [
          { "label": "Open pipeline", "value": "INR 11.4 Cr", "delta": 0.083 },
          { "label": "Weighted", "value": "INR 5.1 Cr", "delta": 0.041 },
          { "label": "Win rate (90d)", "value": "31.6%", "delta": 0.018 }
        ],
        "series": [
          { "label": "Prospecting", "value": 3.2 }, { "label": "Qualification", "value": 2.9 }, { "label": "Proposal", "value": 2.4 },
          { "label": "Negotiation", "value": 1.6 }, { "label": "Closed won", "value": 1.3 }
        ],
        "series_label": "Pipeline by stage, INR Cr"
      }
    }
  ]
  ```

  The array above shows one of the six Acme dashboards; the full response also contains `dsh_exec_revenue`, `dsh_customer_segments`, `dsh_receivables`, `dsh_inventory` and `dsh_fulfilment` (whose only dataset is the Bronze table `orders`, so `datasets[].layer` can be `bronze`).

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member. |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | Message "Invalid list filters."; `business_area`: `Unknown business area "x". Use one of: sales, finance, operations, marketing, customer, inventory.`; `status`: `Unknown status "x". Use one of: published, draft.` Both can appear together. |

- **Side effects:** none.
- **Backend notes:** Dashboards are a catalog of Metabase dashboards; the backend must keep this table in sync with Metabase (name, `cards_count`, `metabase_dashboard_id`) and derive `datasets` from the cards' source tables mapped back to dbt models. `preview` values must be computed from Gold models by the backend and may be `null`; the UI labels them as summary values. Return an empty array for a workspace with no dashboards (Northwind). If the catalog can grow past a few hundred entries, add `page`/`page_size` with the standard `Paginated<T>` shape and coordinate the client change; today the client expects a bare array.

#### `GET /api/v1/dashboards/{dashboard_id}`

Returns one dashboard and records that the caller viewed it.

- **Permission:** any member of the dashboard's workspace.
- **Path params:** `dashboard_id` (string, required).
- **Response:** `200`, `Dashboard`, with `last_viewed_at` already set to the time of this request.

  ```json
  {
    "id": "dsh_customer_segments", "workspace_id": "ws_acme", "name": "Customer Segments",
    "description": "Segment mix, revenue concentration and repeat purchase behaviour. Draft pending the Customer 360 pipeline.",
    "business_area": "customer", "status": "draft", "metabase_dashboard_id": null, "cards_count": 4,
    "datasets": [{ "model_id": "mdl_g_dim_customer", "model_name": "dim_customer", "layer": "gold" }, { "model_id": "mdl_g_agg_monthly_revenue", "model_name": "agg_monthly_revenue", "layer": "gold" }],
    "owner": "Priya Nair", "updated_at": "2026-10-26T09:15:00Z", "last_viewed_at": "2026-10-28T09:15:00Z",
    "view_count_30d": 4, "is_favorite": true, "preview": null
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member of the dashboard's workspace. |
  | 404 | `not_found` | `Dashboard "dsh_x" was not found.` |

- **Side effects:** sets `last_viewed_at = now` and increments `view_count_30d` by 1. No audit event in the mock.
- **Backend notes:** The mock mutates the shared record on a GET. The backend should instead record a view event (user, dashboard, time) and derive `view_count_30d` as views in the trailing 30 days and `last_viewed_at` as **the caller's** last view; the catalog's "Favorites and recent" tab is personal and sorts by this value. The seed audit trail contains `dashboard.viewed` events, so the backend may also audit views (consider sampling or rate limiting). The frontend invalidates the dashboards list after each detail fetch so the recent list updates.

#### `POST /api/v1/dashboards/{dashboard_id}/favorite`

Adds the dashboard to, or removes it from, the caller's personal favorites.

- **Permission:** any member of the dashboard's workspace (viewers included).
- **Path params:** `dashboard_id` (string, required).
- **Request body:** `FavoriteRequest`

  ```ts
  { is_favorite: boolean }   // required; must be a JSON boolean (not "true", not 1)
  ```

- **Response:** `200`, the updated `Dashboard` from the caller's point of view.

  ```json
  { "id": "dsh_receivables", "name": "Receivables and Collections", "is_favorite": true, "status": "published", "metabase_dashboard_id": 18, "...": "other Dashboard fields" }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member. |
  | 404 | `not_found` | Dashboard does not exist. |
  | 422 | `validation_error` | `is_favorite`: "is_favorite must be true or false." |

- **Side effects:** audit `dashboard.favorited` or `dashboard.unfavorited` on `resource: { type: "dashboard", id, name }`, `status: "success"`, no `changes`. Idempotent: when the requested state already holds, nothing changes and **no** audit event is written; the response is still `200`.
- **Backend notes:** Favorites are per user and per workspace (key `user_id` + `workspace_id` + `dashboard_id`); never store a flag on the shared dashboard row. Removing a member should drop their favorites.

#### `POST /api/v1/dashboards/{dashboard_id}/embed-session`

Returns a signed, short-lived Metabase embed URL for a published dashboard.

- **Permission:** any member of the dashboard's workspace.
- **Path params:** `dashboard_id` (string, required).
- **Request body:** none.
- **Response:** `200`, `EmbedSession`.

  ```json
  { "embed_url": "https://metabase.acme-distributors.example/embed/dashboard/eyJhbGciOiJIUzI1NiJ9...#bordered=false&titled=false", "expires_at": "2026-10-28T09:25:00Z" }
  ```

  The mock never returns this success response (see Errors). The client only requests a session while `GET /integrations/metabase/status` reports `connected`, refetches it `max(10 s, expires_at - now - 60 s)` later, and refuses to load a URL whose scheme is not `https` (plain `http` only for `localhost`/`127.0.0.1`) or whose origin differs from `MetabaseStatus.site_url`.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member. |
  | 404 | `not_found` | Dashboard does not exist. |
  | 409 | `integration_unavailable` | Metabase status is not `connected`. Message is the status `message` (or "Metabase is not connected."). `details: { "integration": "metabase", "integration_status": "unreachable", "integration_message": "<status message>" }`. Checked first. |
  | 409 | `dashboard_not_published` | `status` is `draft` or `metabase_dashboard_id` is null: "This dashboard is a draft and has no published Metabase dashboard to embed." |
  | 409 | `integration_unavailable` | Mock only: reached when Metabase is connected; message "Embed URLs are signed by the backend and cannot be generated in demo mode." No `details`. The real backend returns `200` here. |

- **Side effects:** none.
- **Backend notes:** Sign a Metabase static-embedding JWT (HS256) with the workspace's embedding secret from the secrets vault: `{ "resource": { "dashboard": <metabase_dashboard_id> }, "params": { ... }, "exp": <unix seconds> }`, and return `<site_url>/embed/dashboard/<token>#bordered=false&titled=false`. Keep `exp` short (5 to 10 minutes) and set `expires_at` to the same instant. Lock tenant parameters (`params`) server-side so an embed can never show another workspace's data. Never log the token or the secret. Map Metabase failures to `409 integration_unavailable` with the `details` shape above so the UI shows the integration state rather than a generic error.

---

### 6.3 Reports

#### `GET /api/v1/workspaces/{workspace_id}/reports`

Lists the workspace's reports with optional search and filters, newest `updated_at` first.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `q` | string | no | none | Trimmed; case-insensitive substring match on `name`, `description`, `owner` or `dataset.model_name`. |
  | `business_area` | BusinessArea | no | none | Exact match. An empty value is ignored; any other unknown value: 422. |
  | `status` | ReportStatus | no | none | `draft`, `in_review` or `published`. An empty value is ignored; any other unknown value: 422. Not sent by the frontend today. |
  | `favorite` | boolean | no | none | Same semantics as the dashboards list (the frontend sends only `favorite=true`). |

- **Response:** `200`, `Report[]` (not paginated), sorted by `updated_at` descending; `is_favorite` per caller; `suggestion` included.

  ```json
  [
    {
      "id": "rpt_payment_modes", "workspace_id": "ws_acme", "name": "Collections by payment mode",
      "description": "Share of collections by NEFT, RTGS, UPI, cheque and cash.", "business_area": "finance",
      "status": "draft", "origin": "ai_suggestion", "visualization": "pie",
      "dataset": { "model_id": "mdl_g_fct_payments", "model_name": "fct_payments", "layer": "gold" },
      "dimensions": ["payment_mode"], "measures": [{ "name": "Collected", "expression": "amount", "aggregation": "sum" }],
      "filters": [], "metabase_question_id": null, "owner": "Priya Nair",
      "updated_at": "2026-10-27T07:15:00Z", "last_viewed_at": null, "is_favorite": false, "suggestion": null
    }
  ]
  ```

  The array above shows one of the seven Acme reports (the only draft, and the seed example of `origin: "ai_suggestion"` with `suggestion: null`).

- **Errors:** as for the dashboards list; the `status` message lists `draft, in_review, published`.
- **Side effects:** none.
- **Backend notes:** Same pagination caveat as dashboards. `owner` is a display name today; consider adding an owner id when reports gain edit permissions.

#### `POST /api/v1/workspaces/{workspace_id}/reports`

Creates a draft report from a manual definition or from a reviewed AI recommendation.

- **Permission:** `reports:write`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `CreateReportRequest`

  ```ts
  {
    name: string                 // required; trimmed; 3..120; unique per workspace, case-insensitive
    description?: string         // trimmed; max 500; missing or non-string is stored as ""
    business_area: BusinessArea  // required
    visualization: VisualizationType   // required
    dataset_model_id: string     // required; a Silver or Gold model id in this workspace
    dimensions: string[]         // required array (may be empty); max 6
    measures: ReportMeasure[]    // required; 1..8
    filters?: ReportFilter[]     // optional (default []); max 10
    suggestion_id?: string       // provenance; when either id is sent, both must resolve
    recommendation_id?: string
  }
  ```

  Validation (all failures returned together in one 422):
  - `name`: at least 3 and at most 120 characters after trimming; no other report in the workspace with the same name ignoring case.
  - `description`: at most 500 characters after trimming.
  - `business_area`, `visualization`: required, must be in the enum.
  - `dataset_model_id`: required; must be a model of this workspace; must not be in the `bronze` layer.
  - `dimensions`: must be an array of at most 6; each entry must be a non-empty string, not repeated, and a valid column reference (6.1) that exists in the resolved model. Column existence is checked only when the model's column list is known, and references are checked only when `dataset_model_id` resolved. The mock compares repeats before trimming (`"bucket"` and `" bucket"` are not flagged); the backend should compare trimmed values.
  - `measures`: array of 1..8; `name` and `expression` non-empty; `aggregation` in the enum. When `expression` is not `*` and looks like a column reference, it is resolved like a dimension; any other expression (for example `amount * 0.18`) is accepted without checking.
  - `filters`: omitted means `[]`; any other non-array value, including `null`, fails with "filters must be a list."; otherwise an array of at most 10; `field` non-empty and resolvable; `operator` in the enum; `value` a non-empty string after trimming. For `last_n_days`, `value` must match `^[1-9]\d{0,3}$` (1..9999). For `between`, exactly two non-empty comma-separated values (`2026-04-01,2026-09-30`). For `in`, a comma-separated list (not further checked).
  - Provenance, when `suggestion_id` or `recommendation_id` is present (any value other than omitted, so `null` counts as present and fails): the suggestion must exist, the recommendation must belong to it, and the recommendation's dataset must be a model of this workspace. The saved definition does **not** have to equal the recommendation: the user may edit it before saving.

  Stored values are trimmed (`dimensions`, measure `name`/`expression`, filter `field`/`value`).

  ```json
  {
    "name": "Customers with receivables over 60 days",
    "description": "Outstanding amount per customer in the 61-90 and 90+ ageing buckets.",
    "business_area": "finance", "visualization": "table", "dataset_model_id": "mdl_g_agg_receivables_aging",
    "dimensions": ["dim_customer.customer_name", "bucket"],
    "measures": [{ "name": "Outstanding", "expression": "outstanding_amount", "aggregation": "sum" }, { "name": "Invoices", "expression": "invoice_count", "aggregation": "sum" }],
    "filters": [{ "field": "bucket", "operator": "in", "value": "61-90,90+" }],
    "suggestion_id": "sug_p2k8d1qz", "recommendation_id": "rec_a7m3x0vb"
  }
  ```

- **Response:** `201`, `Report` with `status: "draft"`, `origin: "ai_suggestion"` when provenance resolved (otherwise `"manual"`), `metabase_question_id: null`, `owner` = caller's name, `updated_at` = now, `last_viewed_at: null`, `is_favorite: false`, `suggestion` = provenance or `null`.

  ```json
  {
    "id": "rpt_9c4hq2ne", "workspace_id": "ws_acme", "name": "Customers with receivables over 60 days",
    "description": "Outstanding amount per customer in the 61-90 and 90+ ageing buckets.", "business_area": "finance",
    "status": "draft", "origin": "ai_suggestion", "visualization": "table",
    "dataset": { "model_id": "mdl_g_agg_receivables_aging", "model_name": "agg_receivables_aging", "layer": "gold" },
    "dimensions": ["dim_customer.customer_name", "bucket"],
    "measures": [{ "name": "Outstanding", "expression": "outstanding_amount", "aggregation": "sum" }, { "name": "Invoices", "expression": "invoice_count", "aggregation": "sum" }],
    "filters": [{ "field": "bucket", "operator": "in", "value": "61-90,90+" }],
    "metabase_question_id": null, "owner": "Priya Nair", "updated_at": "2026-10-28T09:15:00Z", "last_viewed_at": null, "is_favorite": false,
    "suggestion": {
      "suggestion_id": "sug_p2k8d1qz", "recommendation_id": "rec_a7m3x0vb", "prompt": "Which distributors are slow to pay this fiscal year?",
      "provider": { "name": "Graphite mock suggestion engine", "model": "simulated", "simulated": true },
      "confidence": 0.82, "suggested_at": "2026-10-28T09:13:40Z"
    }
  }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not a member, or role lacks `reports:write` (viewer). Audited as `access.denied`. |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | Field messages include: `name` "Report name must be at least 3 characters." / "Report name must be 120 characters or fewer." / "A report with this name already exists in this workspace."; `description` "Description must be 500 characters or fewer."; `business_area` "Choose a business area."; `visualization` "Choose a visualization."; `dataset_model_id` "Choose the dataset the report reads from." / `Model "x" does not exist in this workspace.` / "Reports must read from a Silver or Gold model, not raw Bronze tables."; `dimensions` "dimensions must be a list of column references." / "Use at most 6 dimensions."; `dimensions.{i}` "Dimension cannot be empty." / `"x" is listed twice.` / `"x" is not a valid column reference. Use column or model.column.` / `Model "x" was not found in the Silver or Gold layer.` / `Column "x" does not exist in fct_invoices.`; `measures` "Add at least one measure." / "Use at most 8 measures."; `measures.{i}.name` "Measure name is required."; `measures.{i}.expression` "Measure expression is required." or a column-reference message; `measures.{i}.aggregation` "Aggregation must be one of: sum, count, count_distinct, avg, min, max."; `filters` "filters must be a list." / "Use at most 10 filters."; `filters.{i}.field` "Filter field is required." or a column-reference message; `filters.{i}.operator` "Operator must be one of: eq, neq, in, gt, gte, lt, lte, between, last_n_days."; `filters.{i}.value` "Filter value is required." / "Enter a whole number of days between 1 and 9999." / "Enter two values separated by a comma, e.g. 2026-04-01,2026-09-30."; `suggestion_id` "The suggestion this draft came from was not found. Generate new recommendations and try again." / "The suggestion belongs to a different workspace."; `recommendation_id` "The recommendation was not found in that suggestion." |

  The duplicate-name case is a 422 on `name`, not a 409.
- **Side effects:** audit `report.created` on `resource: { type: "report", id, name }` with `changes` for `name`, `status`, `dataset` (model name) and `visualization` (each `before: null`), and `metadata` `{ "origin": "manual" }` or `{ "origin": "ai_suggestion", "suggestion_id", "recommendation_id", "simulated_provider": <provider.simulated> }`. Nothing is created in Metabase.
- **Backend notes:** Validate against the warehouse catalog (dbt manifest/catalog), not a cached list. `model.column` references imply a join; the backend must confirm a relationship path from the dataset to that model (the mock does not). Free-form measure expressions must be parsed against an allowlist grammar or rejected: they will become SQL or MBQL and are an injection vector. Enforce the name uniqueness with a case-insensitive unique index to avoid races. Suggestions referenced by `suggestion_id` must be stored per workspace (the mock keeps only the last 50 suggestions globally); copy the provenance onto the report so it survives suggestion retention.

#### `GET /api/v1/reports/{report_id}`

Returns one report and records that the caller viewed it.

- **Permission:** any member of the report's workspace.
- **Path params:** `report_id` (string, required).
- **Response:** `200`, `Report`, with `last_viewed_at` set to now.

  ```json
  {
    "id": "rpt_overdue", "workspace_id": "ws_acme", "name": "Invoices overdue more than 60 days",
    "description": "Collection follow-up list with customer contact owner.", "business_area": "finance",
    "status": "published", "origin": "manual", "visualization": "table",
    "dataset": { "model_id": "mdl_g_fct_invoices", "model_name": "fct_invoices", "layer": "gold" },
    "dimensions": ["invoice_no", "dim_customer.customer_name"],
    "measures": [{ "name": "Outstanding", "expression": "outstanding_amount", "aggregation": "sum" }],
    "filters": [{ "field": "days_overdue", "operator": "gt", "value": "60" }],
    "metabase_question_id": 158, "owner": "Rahul Mehta", "updated_at": "2026-10-26T09:15:00Z",
    "last_viewed_at": "2026-10-28T09:15:00Z", "is_favorite": false, "suggestion": null
  }
  ```

- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (`Report "rpt_x" was not found.`).
- **Side effects:** sets `last_viewed_at = now` (no view counter for reports). No audit event.
- **Backend notes:** As for dashboards, store views per user and return the caller's `last_viewed_at`. The UI builds the "Open in Metabase" link as `<site_url>/question/<metabase_question_id>` only when the report is published, Metabase is `connected` and `metabase_question_id` is non-null, so the backend must set `metabase_question_id` whenever `status` is `published`.

#### `POST /api/v1/reports/{report_id}/favorite`

Adds the report to, or removes it from, the caller's personal favorites.

- **Permission:** any member of the report's workspace.
- **Path params:** `report_id` (string, required).
- **Request body:** `FavoriteRequest` `{ is_favorite: boolean }` (required JSON boolean).
- **Response:** `200`, the updated `Report` for the caller.

  ```json
  { "id": "rpt_gst_summary", "name": "GST collected by rate", "is_favorite": false, "status": "published", "...": "other Report fields" }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member. |
  | 404 | `not_found` | Report does not exist. |
  | 422 | `validation_error` | `is_favorite`: "is_favorite must be true or false." |

- **Side effects:** audit `report.favorited` or `report.unfavorited` (`resource.type: "report"`), only when the state changed. Idempotent.
- **Backend notes:** Same per-user storage as dashboard favorites.

#### `POST /api/v1/reports/{report_id}/publish`

Publishes a draft (or in-review) report to Metabase as a saved question.

- **Permission:** `reports:publish` (owner, admin).
- **Path params:** `report_id` (string, required).
- **Request body:** none.
- **Response:** `200`, the updated `Report` with `status: "published"`, `metabase_question_id` set and `updated_at` = now. The mock never reaches this response. Example caller: Ananya Rao (owner), since Priya's editor role lacks `reports:publish`.

  ```json
  { "id": "rpt_payment_modes", "status": "published", "metabase_question_id": 181, "updated_at": "2026-10-28T09:16:05Z", "...": "other Report fields" }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Report does not exist (checked before membership). |
  | 403 | `forbidden` | Not a member, or role lacks `reports:publish` (editor, viewer). Audited as `access.denied`. |
  | 409 | `already_published` | `status` is already `published`: `"<name>" is already published to Metabase.` `details: { "metabase_question_id": 158 }`. |
  | 409 | `integration_unavailable` | Metabase is not `connected`: "The report is saved as a draft. Publishing requires a connected Metabase instance." `details: { "integration": "metabase", "integration_status": "unreachable", "integration_message": "<status message>" }`. In the mock this is also returned when Metabase is connected (without `details`), because publishing is never simulated. |

  Both `draft` and `in_review` reports can be published; there is no review gate in the mock.
- **Side effects:** on refusal because Metabase is unavailable, audit `report.publish` with `status: "failure"` and `metadata: { "reason": "integration_unavailable", "integration": "metabase" }`; the frontend refreshes the audit log after a failed publish. The mock writes no success event.
- **Backend notes:** Use the workspace's Metabase API key (vault) to create a question in `default_collection_id` (Settings), translating the definition to MBQL or native SQL over the Silver/Gold schema. Make the call idempotent (lock the report row or store a publish attempt id) so a double click cannot create two Metabase questions. On success record `report.publish` with `status: "success"` and `changes` for `status` and `metabase_question_id`. Map Metabase 401/403 to `integration_unavailable` with `integration_status: "auth_failed"` and network errors to `"unreachable"`. Publishing can take several seconds; keep it synchronous with a timeout under the client's request timeout, or return a Run if it ever becomes long-running (that would be a contract change).

---

### 6.4 AI report recommendations

#### `POST /api/v1/ai/report-suggestions`

Generates report recommendations from a plain-language prompt, using only the workspace's Gold models.

- **Permission:** any member of `workspace_id` (viewers included). Saving a recommendation still needs `reports:write`.
- **Request body:** `ReportSuggestionRequest`

  ```ts
  {
    workspace_id: string         // required, non-empty; validated before membership
    prompt: string               // required; trimmed and whitespace-collapsed; 10..1000 chars after normalising
    business_area?: BusinessArea // optional hint; omit it rather than sending null (null fails the enum check)
  }
  ```

  ```json
  { "workspace_id": "ws_acme", "prompt": "Which distributors are slow to pay this fiscal year?", "business_area": "finance" }
  ```

- **Response:** `201`, `ReportSuggestion` with 0 to 4 recommendations in ranked order: the best-matching topic's templates first (those whose wording matches the prompt lead), then the strongest template of each secondary topic. The order is not sorted by `confidence`. Each recommendation's `dataset` is a Gold model of the workspace and every column it references exists. `confidence` is between 0.30 and 0.97.

  ```json
  {
    "id": "sug_p2k8d1qz", "prompt": "Which distributors are slow to pay this fiscal year?",
    "provider": { "name": "Graphite mock suggestion engine", "model": "simulated", "simulated": true },
    "created_at": "2026-10-28T09:13:40Z",
    "recommendations": [
      {
        "id": "rec_a7m3x0vb", "title": "Customers with receivables over 60 days",
        "description": "Outstanding amount per customer in the 61-90 and 90+ ageing buckets.",
        "dataset": { "model_id": "mdl_g_agg_receivables_aging", "model_name": "agg_receivables_aging", "layer": "gold" },
        "dimensions": ["dim_customer.customer_name", "bucket"],
        "measures": [{ "name": "Outstanding", "expression": "outstanding_amount", "aggregation": "sum" }, { "name": "Invoices", "expression": "invoice_count", "aggregation": "sum" }],
        "filters": [{ "field": "bucket", "operator": "in", "value": "61-90,90+" }],
        "visualization": "table", "confidence": 0.82,
        "rationale": "agg_receivables_aging already buckets outstanding balances per customer, so slow payers can be listed without recomputing ageing. Caution: agg_receivables_aging fails the freshness_agg_receivables_aging quality check (Last refreshed 31 hours ago; SLA is 24 hours. Downstream of the failed Finance pipeline run); recent activity may be missing."
      },
      {
        "id": "rec_q1t6n8wd", "title": "Average days to pay by month",
        "description": "Mean number of days between invoice and payment, per payment month.",
        "dataset": { "model_id": "mdl_g_fct_payments", "model_name": "fct_payments", "layer": "gold" },
        "dimensions": ["dim_date.month"],
        "measures": [{ "name": "Average days to pay", "expression": "days_to_pay", "aggregation": "avg" }, { "name": "Collected", "expression": "amount", "aggregation": "sum" }],
        "filters": [{ "field": "dim_date.fiscal_year", "operator": "eq", "value": "FY2026-27" }],
        "visualization": "line", "confidence": 0.85,
        "rationale": "fct_payments stores days_to_pay per payment and links to dim_date on the paid date, which shows whether collections are speeding up or slowing down. Filtered to FY2026-27 because the request mentions the fiscal year."
      },
      {
        "id": "rec_h5c2w9ky", "title": "Outstanding receivables by ageing bucket",
        "description": "Total outstanding balance in each ageing bucket.",
        "dataset": { "model_id": "mdl_g_agg_receivables_aging", "model_name": "agg_receivables_aging", "layer": "gold" },
        "dimensions": ["bucket"],
        "measures": [{ "name": "Outstanding", "expression": "outstanding_amount", "aggregation": "sum" }],
        "filters": [],
        "visualization": "bar", "confidence": 0.75,
        "rationale": "A single bar per bucket (0-30, 31-60, 61-90, 90+) is the standard view for credit control reviews. Caution: agg_receivables_aging fails the freshness_agg_receivables_aging quality check (Last refreshed 31 hours ago; SLA is 24 hours. Downstream of the failed Finance pipeline run); recent activity may be missing."
      },
      {
        "id": "rec_z3v7r1md", "title": "Collections by payment mode",
        "description": "Collected amount by NEFT, RTGS, UPI, cheque and cash.",
        "dataset": { "model_id": "mdl_g_fct_payments", "model_name": "fct_payments", "layer": "gold" },
        "dimensions": ["payment_mode"],
        "measures": [{ "name": "Collected", "expression": "amount", "aggregation": "sum" }],
        "filters": [{ "field": "dim_date.fiscal_year", "operator": "eq", "value": "FY2026-27" }],
        "visualization": "bar", "confidence": 0.72,
        "rationale": "payment_mode is standardised in Silver, so the split is reliable across ERP versions. Filtered to FY2026-27 because the request mentions the fiscal year."
      }
    ]
  }
  ```

  This is the complete mock response for that prompt: only the collections topic matches, so up to four of its templates are returned, the slow-payer template first because its wording ("which", "distributors", "slow") matches the prompt. The order is not by `confidence` (0.82 leads 0.85).

  Behaviour the frontend relies on (reproduce it with a real model):
  - `business_area` is a ranking hint: matched topics in that area are ranked first. Templates from secondary topics have their confidence lowered by 0.04.
  - Time phrases add filters: "this fiscal year", "YTD", "financial year" add `fiscal_year eq FY<yyyy>-<yy>` (Indian fiscal year starting 1 April) or `date gte <yyyy>-04-01`; "last N days", "last month" (30), "last quarter" (90) add `last_n_days`. The rationale states the filter added.
  - A dataset with a failing quality check lowers confidence by 0.08 and appends a "Caution: ..." sentence naming the check (seed: `fct_invoices` fails `unique_fct_invoices_invoice_id` with 14 duplicate invoice ids, so revenue recommendations on it warn "totals may be overstated until it passes"); a stale dataset lowers it by 0.05 with a staleness caution.
  - An ambiguous prompt returns one or two low-confidence generic recommendations (base confidence 0.56 and 0.48, before quality cautions) whose rationale says the request was ambiguous; with a `business_area` hint and no recognised topic, up to two of that area's templates are returned with confidence lowered by 0.18 and a rationale that starts by saying the result is based on the selected area.
  - An empty `recommendations` array is possible when no template can be built from the workspace's models; the UI handles it.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | `workspace_id`: "workspace_id is required." (checked before 404/403). |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not an active member. |
  | 422 | `validation_error` | `prompt`: "Describe the report in at least 10 characters." / "Keep the description under 1000 characters."; `business_area`: "Unknown business area." |
  | 409 | `no_gold_models` | The workspace has no Gold models (Northwind): "This workspace has no Gold models yet. Report suggestions are built from Gold models; connect a source and build Gold models first." The assistant page shows a dedicated empty state for this code. |

- **Side effects:** the suggestion is stored so `POST /workspaces/{workspace_id}/reports` can reference it by `suggestion_id`/`recommendation_id`. No audit event and no notification. Nothing becomes a report until a person saves it.
- **Backend notes:** Call the workspace's configured AI provider (Settings, AI provider) and return its real `name` and `model` with `simulated: false`; the mock always returns the simulated provider. Respect the provider's `data_sharing` setting: send only model and column metadata unless `metadata_and_samples` is allowed, never raw rows by default. Post-validate every recommendation against the catalog with the same rules as report creation and drop any that reference unknown models or columns; never let the model invent datasets. Decide what happens when the provider is `none` or disabled (see 6.8). Store suggestions per workspace with an owner and a retention period, and rate-limit per user (for example 20 per minute) because each call costs provider tokens. Set a server timeout and return `503`/`504` with a clear code if the provider is down; the client shows the message.

---

### 6.5 Custom report requests

#### `GET /api/v1/workspaces/{workspace_id}/report-requests`

Lists custom report requests filed in the workspace, newest first.

- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Query params:** none (the catalog filters requests client-side by area and text).
- **Response:** `200`, `ReportRequest[]` (not paginated), sorted by `created_at` descending.

  ```json
  [
    {
      "id": "rr_002", "workspace_id": "ws_acme", "title": "Warehouse-wise dead stock",
      "description": "Items with zero outward movement for 180 days, per warehouse, with value.",
      "business_area": "inventory", "priority": "normal", "needed_by": null, "status": "submitted",
      "requested_by": { "id": "usr_priya", "name": "Priya Nair" }, "created_at": "2026-10-26T09:15:00Z"
    },
    {
      "id": "rr_001", "workspace_id": "ws_acme", "title": "Distributor scheme payout tracker",
      "description": "Track quarterly scheme eligibility and payouts per distributor based on purchase slabs.",
      "business_area": "sales", "priority": "high", "needed_by": "2026-11-07", "status": "in_progress",
      "requested_by": { "id": "usr_karan", "name": "Karan Shah" }, "created_at": "2026-10-22T09:15:00Z"
    },
    {
      "id": "rr_003", "workspace_id": "ws_acme", "title": "Monthly MIS pack",
      "description": "P&L style monthly summary for the board, combining revenue, collections and stock value.",
      "business_area": "finance", "priority": "high", "needed_by": null, "status": "delivered",
      "requested_by": { "id": "usr_ananya", "name": "Ananya Rao" }, "created_at": "2026-09-28T09:15:00Z"
    }
  ]
  ```

- **Errors:** 401 `unauthenticated`; 403 `forbidden` (not a member); 404 `not_found` (workspace).
- **Side effects:** none.
- **Backend notes:** Add server-side filtering and pagination if request volume grows; the client currently filters the full list.

#### `POST /api/v1/workspaces/{workspace_id}/report-requests`

Files a request for a custom report with the data team.

- **Permission:** any workspace member (viewers included; requesting a report is the viewer's way to ask for new analytics).
- **Path params:** `workspace_id` (string, required).
- **Request body:** `CreateReportRequestRequest`

  ```ts
  {
    title: string                // required; trimmed; 3..120
    description: string          // required; trimmed; 20..2000 (the question, measures and breakdowns)
    business_area: BusinessArea  // required
    priority: 'low' | 'normal' | 'high'   // required
    needed_by?: string | null    // optional "YYYY-MM-DD"; "", null or omitted mean no date
  }
  ```

  `needed_by` must match `^\d{4}-\d{2}-\d{2}$`, parse as a date, and not be earlier than yesterday in UTC (one day of slack because the browser validates against the user's local date). All failures are returned together.

  ```json
  { "title": "Scheme payout by distributor tier", "description": "Quarterly scheme payouts per distributor tier, compared with purchase slabs and actual purchases.", "business_area": "sales", "priority": "normal", "needed_by": "2026-11-15" }
  ```

- **Response:** `201`, `ReportRequest` with `status: "submitted"`, `requested_by` = caller, `created_at` = now, `needed_by` = the date or `null`. Example caller: Karan Shah (viewer).

  ```json
  { "id": "rr_k2m9x4pa", "workspace_id": "ws_acme", "title": "Scheme payout by distributor tier", "description": "Quarterly scheme payouts per distributor tier, compared with purchase slabs and actual purchases.", "business_area": "sales", "priority": "normal", "needed_by": "2026-11-15", "status": "submitted", "requested_by": { "id": "usr_karan", "name": "Karan Shah" }, "created_at": "2026-10-28T09:15:00Z" }
  ```

- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 403 | `forbidden` | Not an active member. |
  | 404 | `not_found` | Workspace does not exist. |
  | 422 | `validation_error` | `title` "Title must be at least 3 characters." / "Title must be 120 characters or fewer."; `description` "Describe what you need in at least 20 characters: the question, measures and breakdowns." / "Description must be 2000 characters or fewer."; `business_area` "Choose a business area."; `priority` "Choose a priority."; `needed_by` "Use a date in YYYY-MM-DD format." / "The needed-by date cannot be in the past." |

- **Side effects:** audit `report_request.submitted` on `resource: { type: "report_request", id, name: <title> }` with `changes` for `title`, `business_area`, `priority`, `needed_by`. No notification in the mock.
- **Backend notes:** Notify the people who can act on requests (for example members with `reports:write`) through the notifications system; the mock does not. Status transitions (`in_progress`, `delivered`, `declined`) have no endpoint yet (see 6.8).

---

### 6.6 Metabase integration

The Metabase configuration itself (site URL, embedding secret, API key, default collection) is read and written through `/workspaces/{workspace_id}/integrations/metabase` in the Settings section. The two routes below report and test the connection.

#### `GET /api/v1/integrations/metabase/status`

Returns the current Metabase connection status for a workspace.

- **Permission:** any member of `workspace_id`.
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `workspace_id` | string | yes | none | Workspace whose integration to report. Missing or empty: 422 before the membership check. |

- **Response:** `200`, `MetabaseStatus`. Demo values: Acme (configured) is `unreachable`; Northwind is `not_configured`.

  ```json
  {
    "status": "unreachable", "health": "unhealthy", "site_url": "https://metabase.acme-distributors.example",
    "version": null, "embedding_enabled": true, "last_checked_at": null,
    "message": "Demo mode cannot reach Metabase at https://metabase.acme-distributors.example. Dashboards can be embedded once a live backend generates signed embed URLs."
  }
  ```

  Not configured: `{ "status": "not_configured", "health": "unknown", "site_url": null, "version": null, "embedding_enabled": false, "last_checked_at": null, "message": "Metabase is not configured for this workspace. Add the site URL and embedding secret in Settings." }`. A live connected instance would return for example `{ "status": "connected", "health": "healthy", "site_url": "https://metabase.acme-distributors.example", "version": "v0.50.12", "embedding_enabled": true, "last_checked_at": "2026-10-28T09:00:00Z", "message": null }`.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | `workspace_id`: "workspace_id is required." |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not an active member. |

- **Side effects:** none. The mock recomputes the status from configuration on every call; `last_checked_at` comes from the last `test-connection`.
- **Backend notes:** Do not call Metabase on every status read. Return the cached result of the last check (test-connection or a background health probe, for example every 5 minutes) with its `last_checked_at`. Status mapping: `connected` -> `healthy` (or `degraded` if embedding is disabled in Metabase while a secret is set), `unreachable` -> `unhealthy`, `auth_failed` -> `unhealthy`, `not_configured` -> `unknown`. `message` must never contain secrets. The client caches this for 60 seconds and gates embedding, "Open in Metabase" links and the publish notice on `status === "connected"`.

#### `POST /api/v1/integrations/metabase/test-connection`

Tests the workspace's Metabase connection now and returns the resulting status.

- **Permission:** any member of `workspace_id` in the mock (viewers included; see 6.8).
- **Request body:**

  ```ts
  { workspace_id: string }   // required, non-empty; validated before membership
  ```

- **Response:** `200`, `MetabaseStatus` with `last_checked_at` = now.

  ```json
  { "status": "unreachable", "health": "unhealthy", "site_url": "https://metabase.acme-distributors.example", "version": null, "embedding_enabled": true, "last_checked_at": "2026-10-28T09:15:00Z", "message": "Demo mode cannot reach Metabase at https://metabase.acme-distributors.example. Dashboards can be embedded once a live backend generates signed embed URLs." }
  ```

  A failed test is still a `200` with a non-`connected` status, not an error response.
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | `workspace_id`: "workspace_id is required." |
  | 404 | `not_found` | Workspace does not exist. |
  | 403 | `forbidden` | Not an active member. |

- **Side effects:** stores `{ checked_at, status }` per workspace (this becomes `last_checked_at` on every status read, including Settings > Integrations and System health, and for a `not_configured` workspace too). Saving a different `site_url` through `PUT /workspaces/{workspace_id}/integrations/metabase` (section 7) deletes the stored check, so `last_checked_at` returns to `null`. Audit `integration.metabase_tested` on `resource: { type: "integration", id: "metabase", name: "Metabase" }` with `status: "success"` when connected, otherwise `"failure"`, and `metadata: { "result": "<status>", "simulated": true }`. The real backend must omit `simulated` or send `false`.
- **Backend notes:** Call Metabase with the stored API key (for example `GET /api/session/properties` for version and embedding settings, and an authenticated `GET /api/user/current` or equivalent to confirm the key). Map a network failure or timeout (use about 10 s) to `unreachable`, HTTP 401/403 to `auth_failed`, success to `connected`, and report `embedding_enabled` from Metabase's static-embedding setting together with whether an embedding secret is stored. Rate-limit per workspace (for example once per 10 seconds) because the button is available on several screens. Never echo the API key or secret in `message`.

---

### 6.7 Cross-cutting backend notes for this section

- **Tenant isolation.** Dashboards, reports, suggestions and requests are always scoped to one workspace; every `{dashboard_id}` and `{report_id}` route resolves the workspace from the record and checks membership. A suggestion or recommendation from another workspace must never be accepted as provenance.
- **Per-user state.** `is_favorite` and (recommended) `last_viewed_at` are per user. The mock already keeps favorites per user and workspace; views are shared in the mock and should become per user.
- **Secrets.** The Metabase embedding secret and API key live in a vault and are only used server-side to sign embeds, publish questions and test the connection. They are never returned, logged or placed in audit metadata.
- **Never fake Metabase.** If the backend cannot reach Metabase, embed and publish must fail with `409 integration_unavailable` and the `details` shape above; never return a placeholder URL or set `metabase_question_id` without a real question.

### 6.8 Open questions

The open questions for this section are collected in [9.6](#96-analytics-metabase-and-ai-report-recommendations).

---

## 7. Workspace settings, members, connections and integrations

This section covers the per-workspace configuration that the rest of the product depends on. Each workspace has **Members** (users with a **Role**, active or invited) and one settings record with six parts: the PostgreSQL **warehouse destination** (Bronze, Silver and Gold schemas), the **dbt project** repository, the **Metabase** connection, the **AI provider**, the **scheduler defaults** and the **audit retention** policy. Each user also has **notification preferences** per workspace. Two read models, **integration status** and **system health**, summarise the state of these connections.

Source of truth for this section: `src/mocks/handlers/settings.ts`, `src/mocks/store.ts` (`requireWorkspace`, `requirePermission`, `recordAudit`, `diffChanges`), `src/mocks/router.ts`, `src/mocks/permissions.ts`, `src/mocks/engine/integrations.ts` (`metabaseStatus`), `src/mocks/seed/core.ts`, `src/services/settings.service.ts` and `src/types/settings.ts`. This section has 24 routes, and `settingsService` has 24 methods, one per route.

### 7.0 Conventions

Section 1.0 defines the base path (`/api/v1`), the bare success bodies, the `ApiErrorBody` error envelope, the role matrix and the common error names. This section uses those names:

| Name | Status | `error.code` | When |
|---|---|---|---|
| UNAUTH | 401 | `unauthenticated` | No valid session. |
| WS_404 | 404 | `not_found` | `Workspace "<id>" was not found.` |
| NOT_MEMBER | 403 | `forbidden` | `You are not a member of this workspace.` The caller has no `active` membership. An `invited` membership does not count. |
| PERM_403 | 403 | `forbidden` | `Your role (<role>) does not include the "<permission>" permission.` Also records the audit event `access.denied` (status `denied`, resource `{type:"permission", id:"<permission>", name:"<permission>"}`). |
| VALIDATION | 422 | `validation_error` | `Some fields are invalid.` plus `field_errors[]`. All field errors found in one pass are returned together. |
| SETTINGS_404 | 404 | `not_found` | `Workspace settings "<id>" was not found.` The workspace exists but has no settings record. This cannot happen when settings are created with the workspace, as `POST /workspaces` does. |

**Order of checks** in every workspace-scoped route of this section: UNAUTH, WS_404, NOT_MEMBER, PERM_403 (writes only), then SETTINGS_404 or the member lookup, then VALIDATION. The permission check always runs before the body is validated. State conflicts (409) are checked after validation, except in `PATCH .../members/{user_id}`, where `owner_immutable` is checked before the body (see that endpoint's table).

**Value types.** Numbers (`port`, `threads`, the scheduler and retention numbers, `default_collection_id`) must be JSON integers. A numeric string such as `"5432"` fails validation. Free-text string fields (host and names, URLs, branch, model, time zone, times, email addresses) are read with a trim, and a non-string value (number, `null`, object) is treated as `""`, so it fails a required-field rule or, for `site_url`, means "disconnect". Enum fields (`ssl_mode`, `role`, `provider`, `data_sharing`, `digest`) are matched exactly, without trimming. Secret fields follow the secrets table below.

**Permissions used.** Reads need only workspace membership, so viewers can read every GET in this section, including warehouse host and user names (see the backend notes on `GET .../destination`). Writes need `members:manage` (owner, admin) or `settings:manage` (owner, admin). Notification preferences are personal and need only membership.

**Write-only secrets** (`SecretState`, defined in `src/types/common.ts`). The secret fields are `password` (destination), `deploy_key` (dbt), `embedding_secret` and `api_key` (Metabase), and `api_key` (AI provider). The API never returns a secret value. Responses describe each secret as `{ "is_set": boolean, "updated_at": string | null }`. In a request, the key has three meanings:

| Request value | Effect |
|---|---|
| key omitted | Keep the stored value. |
| string that is not empty after trimming, at most 4096 characters long (the length is measured before trimming) | Replace the stored value. `is_set` becomes `true` and `updated_at` becomes now. |
| `null` | Clear the stored value. The result is `{ "is_set": false, "updated_at": null }`. |
| empty or whitespace-only string, or a non-string (number, boolean, object) | 422 on that field: `Enter a value, or leave the field out to keep the stored secret.` |
| string longer than 4096 characters | 422: `The value is too long.` |

The frontend never prefills a secret. It sends the key only when the user replaces or clears the value (`src/features/settings/lib/secrets.ts`).

**Full-replace PUTs.** Every `PUT` in this section replaces the whole non-secret part of the object, so the non-secret fields are required, with these exceptions: Metabase `default_collection_id` may be omitted (the stored value is kept); AI provider `model` and `endpoint_url` are needed only for the providers that use them; dbt `project_subdirectory` may be omitted, which saves `""` (the repository root, not the stored value). Secret fields follow the table above. Unknown keys are not applied. Server-owned fields (`engine`, `status`, `last_tested_at`, `last_compiled_at`) cannot be set by the client.

**Audit change lists.** Settings writes record an audit event whose `changes` array lists each field whose value differs, as `{ "field", "before", "after" }`. Secret fields are redacted: `before` is `"[secret]"` and `after` is `"[secret updated]"` or `"[secret cleared]"`. A secret that is sent always appears in `changes`, even when it is the same value. For destination, dbt and Metabase, the mock compares the keys present in the request body against the stored record, using the raw request values (only `host`, `database`, `username`, `repository_url`, `branch` and the normalised `site_url` are taken after trimming). As a result, an untrimmed value shows as a change, and an extra key that is not applied (for example `status`) still appears in `changes` when it differs from the stored value. The backend should compare the saved values instead. AI provider, scheduler, retention and notification preferences compare the saved values. The mock records the event even when `changes` is empty.

**Connection tests** return `200 ConnectionTestResponse` whether the test passes or fails. A failed test is `success: false` with a reason in `message`, not an error status. Errors are used only for permission, validation and "nothing to test" problems (the AI provider test returns 422 `ai_provider_not_configured`). In the mock, every destination test message ends with `(simulated: no database was contacted)` and every dbt test message ends with `(simulated: no repository was contacted)`. A real backend drops that suffix. The AI provider test returns a fixed "Not tested" message.

**Async runs.** No endpoint in this section starts a run. Connection tests run inline in the mock. A backend that runs them as background jobs must still answer the request with the result (see the per-endpoint notes for timeouts).

### 7.1 Types

TypeScript-style shapes. JSON keys are exactly as sent. `?` marks an optional key and `| null` marks a nullable key. `Role`, `Permission`, `User` and `ActorRef` are defined in section 1.1.

**Shared**

```ts
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'paused' | 'unknown'

interface SecretState {              // write-only secret; see 7.0
  is_set: boolean
  updated_at: string | null          // ISO 8601; when the value was last set
}

interface ConnectionTestResponse {
  success: boolean
  message: string                    // human-readable result or failure reason
  tested_at: string                  // ISO 8601
}
```

**Members and roles**

```ts
interface Member {
  user: User                         // { id, email, name, avatar_url }
  role: Role                         // 'owner' | 'admin' | 'editor' | 'viewer'
  status: 'active' | 'invited'
  joined_at: string | null           // null while invited
  last_active_at: string | null      // null while invited
}

interface InviteMemberRequest {
  email: string
  role: 'admin' | 'editor' | 'viewer'   // 'owner' is never assignable
}

interface UpdateMemberRequest {
  role: 'admin' | 'editor' | 'viewer'
}

interface RoleDefinition {
  role: Role
  description: string
  permissions: Permission[]          // the row of the role matrix in section 1.0
}
```

**Warehouse destination**

```ts
interface DestinationConfig {
  engine: 'postgres'                 // fixed
  host: string                       // '' when not configured
  port: number
  database: string
  username: string
  password: SecretState
  ssl_mode: 'disable' | 'require' | 'verify-full'
  bronze_schema: string
  silver_schema: string
  gold_schema: string
  status: HealthStatus               // result of the last stored-config test; 'unknown' after a connection change
  last_tested_at: string | null
}

interface UpdateDestinationRequest {
  host: string
  port: number
  database: string
  username: string
  password?: string | null           // write-only
  ssl_mode: 'disable' | 'require' | 'verify-full'
  bronze_schema: string
  silver_schema: string
  gold_schema: string
}
```

**dbt project**

```ts
interface DbtProjectConfig {
  repository_url: string             // '' when not configured
  branch: string
  project_subdirectory: string       // '' means the repository root
  dbt_version: string                // "<major>.<minor>", e.g. "1.10"
  target: string
  threads: number
  deploy_key: SecretState
  status: HealthStatus               // result of the last repository test; 'unknown' after a repository change
  last_compiled_at: string | null    // set by dbt runs, not by this section's endpoints
}

interface UpdateDbtProjectRequest {
  repository_url: string
  branch: string
  project_subdirectory: string
  dbt_version: string
  target: string
  threads: number
  deploy_key?: string | null         // write-only (SSH private key)
}
```

**Metabase**

```ts
type MetabaseConnectionStatus = 'not_configured' | 'connected' | 'unreachable' | 'auth_failed'

interface MetabaseConfig {
  site_url: string                   // '' when not configured; no trailing slash
  embedding_secret: SecretState
  api_key: SecretState
  default_collection_id: number | null
  status: MetabaseConnectionStatus
}

interface UpdateMetabaseConfigRequest {
  site_url: string                   // '' disconnects
  embedding_secret?: string | null   // write-only
  api_key?: string | null            // write-only
  default_collection_id?: number | null
}
```

**AI provider**

```ts
type AiProviderName = 'none' | 'openai' | 'anthropic' | 'azure_openai' | 'self_hosted'

interface AiProviderConfig {
  provider: AiProviderName
  model: string | null               // null when provider is 'none'
  endpoint_url: string | null        // set only for 'azure_openai' and 'self_hosted'
  api_key: SecretState
  data_sharing: 'metadata_only' | 'metadata_and_samples'   // what may be sent to the provider
  enabled: boolean                   // always false when provider is 'none'
  status: HealthStatus               // 'paused' when disabled; otherwise 'unknown' (the mock never verifies a key)
}

interface UpdateAiProviderRequest {
  provider: AiProviderName
  model?: string | null
  endpoint_url?: string | null
  api_key?: string | null            // write-only
  data_sharing: 'metadata_only' | 'metadata_and_samples'
  enabled: boolean
}
```

**Scheduler defaults, audit retention**

```ts
interface SchedulerDefaults {        // request and response shape
  default_timezone: string           // IANA zone
  max_concurrent_runs: number        // 1..20
  default_retry_attempts: number     // 0..10
  default_backoff_seconds: number    // 30..86400
  quiet_hours: { enabled: boolean; start: string; end: string }   // "HH:MM", 24-hour
}

interface AuditRetentionSettings {   // request and response shape
  retention_days: number             // 30..2555
  export_enabled: boolean
  include_ip_addresses: boolean
}
```

**Notification preferences**

```ts
type NotificationType =
  | 'pipeline_failed' | 'sync_completed' | 'repeated_retries'
  | 'quality_failed' | 'schema_changed' | 'stale_data'

interface NotificationChannelPrefs {
  in_app: boolean
  email: boolean
}

interface NotificationPreferences {  // request and response shape
  email_address: string
  digest: 'off' | 'daily' | 'weekly'
  events: Record<NotificationType, NotificationChannelPrefs>   // all six keys always present
}
```

**Status read models**

```ts
interface IntegrationStatus {
  key: 'warehouse' | 'dbt' | 'metabase' | 'ai_provider' | 'email' | 'scheduler'
  name: string
  status: HealthStatus
  configured: boolean
  message: string | null
  last_checked_at: string | null
}

interface SystemComponentHealth {
  component: string
  status: HealthStatus
  latency_ms: number | null
  message: string | null
  checked_at: string | null          // when the component was really last checked; null if never
}

interface SystemHealth {
  overall: HealthStatus              // the worst component status
  components: SystemComponentHealth[]
  version: string                    // backend build version; the mock returns "0.1.0-mock"
}
```

### 7.2 Members and roles

#### `GET /api/v1/workspaces/{workspace_id}/members`
Lists every member of the workspace, including pending invitations.
- **Permission:** any workspace member.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace id, e.g. `ws_acme`. |

- **Response:** `200 Member[]`, a plain array with no pagination. Sort order: `active` before `invited`, then by role (owner, admin, editor, viewer), then by `user.name`.
  ```json
  [
    { "user": { "id": "usr_ananya", "email": "ananya.rao@acme-distributors.example", "name": "Ananya Rao", "avatar_url": null }, "role": "owner", "status": "active", "joined_at": "2026-06-08T09:15:00Z", "last_active_at": "2026-10-28T09:12:00Z" },
    { "user": { "id": "usr_rahul", "email": "rahul.mehta@acme-distributors.example", "name": "Rahul Mehta", "avatar_url": null }, "role": "admin", "status": "active", "joined_at": "2026-06-10T09:15:00Z", "last_active_at": "2026-10-28T08:27:00Z" },
    { "user": { "id": "usr_priya", "email": "priya.nair@acme-distributors.example", "name": "Priya Nair", "avatar_url": null }, "role": "editor", "status": "active", "joined_at": "2026-07-24T09:15:00Z", "last_active_at": "2026-10-28T04:15:00Z" },
    { "user": { "id": "usr_karan", "email": "karan.shah@acme-distributors.example", "name": "Karan Shah", "avatar_url": null }, "role": "viewer", "status": "active", "joined_at": "2026-09-18T09:15:00Z", "last_active_at": "2026-10-27T07:15:00Z" },
    { "user": { "id": "usr_meera", "email": "meera.iyer@acme-distributors.example", "name": "Meera Iyer", "avatar_url": null }, "role": "editor", "status": "invited", "joined_at": null, "last_active_at": null }
  ]
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none.
- **Backend notes:** the members page filters and searches on the client, so the full list is needed. If workspaces can grow past a few hundred members, add `Paginated<Member>` with `q`, `role` and `status` filters and change the client at the same time. Decide whether viewers should see member email addresses.

#### `POST /api/v1/workspaces/{workspace_id}/invitations`
Invites a person by email with a role. Creates an `invited` membership.
- **Permission:** `members:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `InviteMemberRequest`.
  - `email` (string, required): trimmed and lowercased. It must match `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$` and be at most 254 characters. Messages: `Enter an email address.` / `Enter a valid email address.`
  - `role` (required): `admin`, `editor` or `viewer`. `owner` gives 422 `The owner role cannot be granted by invitation. Ownership transfers are handled by support.` Any other value gives 422 `Choose admin, editor or viewer.`
- **Response:** `201` is recommended; the mock returns `200 Member` with `status: "invited"`, `joined_at: null` and `last_active_at: null`. The client accepts either.
  ```json
  { "user": { "id": "usr_k3f9a2qd", "email": "vikram.das@acme-distributors.example", "name": "Vikram Das", "avatar_url": null }, "role": "viewer", "status": "invited", "joined_at": null, "last_active_at": null }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member, or no `members:manage` (records `access.denied`). |
  | 422 | `validation_error` | `email` or `role` is invalid (both reported together). |
  | 409 | `already_member` | A user with this email already has a membership in this workspace. The message is `<email> has already been invited to this workspace.` or `<email> is already a member of this workspace.` `details` is `{ "user_id": "usr_meera", "status": "invited" }`. The invite dialog shows this inline. |

- **Side effects:**
  - If no user has this email, a new `User` is created. Its `name` is derived from the local part of the email (`vikram.das` becomes `Vikram Das`).
  - Records `member.invited` with resource `{type:"member", id:<user id>, name:<email>}`, `changes: [{"field":"role","before":null,"after":"viewer"}]` and `metadata: {"email_delivery":"simulated"}`.
  - No notification. No email is sent in the mock.
- **Backend notes:**
  - Send the invitation email with a single-use, expiring token, and set `metadata.email_delivery` to the real outcome (for example `queued`).
  - There is no endpoint to accept, resend or expire an invitation, and the sign-in flow ignores `invited` memberships. The backend needs an accept flow that turns the membership `active` and sets `joined_at` (see the open questions).
  - Do not create a full user account before acceptance. Store a pending invitation and create or link the user on acceptance.
  - Rate-limit invitations per workspace and per inviter.

#### `PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}`
Changes the role of a member or a pending invitation.
- **Permission:** `members:manage`.
- **Path params:**

  | Name | Type | Required | Description |
  |---|---|---|---|
  | `workspace_id` | string | yes | Workspace id. |
  | `user_id` | string | yes | User id of the member, e.g. `usr_priya`. |

- **Request body:** `UpdateMemberRequest`. `role` (required) is `admin`, `editor` or `viewer`.
- **Response:** `200 Member` (the updated member).
  ```json
  { "user": { "id": "usr_priya", "email": "priya.nair@acme-distributors.example", "name": "Priya Nair", "avatar_url": null }, "role": "admin", "status": "active", "joined_at": "2026-07-24T09:15:00Z", "last_active_at": "2026-10-28T04:15:00Z" }
  ```
- **Errors** (in the order they are checked):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member, or no `members:manage` (records `access.denied`). |
  | 404 | `not_found` | `Member "<user_id>" was not found.` The user has no membership (active or invited) in this workspace. |
  | 409 | `owner_immutable` | The target is the owner: `The workspace owner role cannot be changed. Ownership transfers are handled by support.` |
  | 422 | `validation_error` | `role` is `owner` (field `role`: `The owner role cannot be assigned. Ownership transfers are handled by support.`) or not one of the three assignable roles (`Choose admin, editor or viewer.`). |
  | 409 | `self_role_change` | The caller targets themself: `You cannot change your own role. Ask another admin or the owner.` |

- **Side effects:** records `member.role_changed` with resource `{type:"member", id:<user id>, name:<user name>}` and `changes: [{"field":"role","before":"editor","after":"admin"}]`. Nothing is recorded when the role is unchanged.
- **Backend notes:**
  - An admin can promote any non-owner to admin and demote other admins. Decide whether that is intended.
  - A role change must take effect on the target user's next request. Invalidate cached permissions and do not embed the role in a long-lived token.

#### `DELETE /api/v1/workspaces/{workspace_id}/members/{user_id}`
Removes a member, or revokes a pending invitation.
- **Permission:** `members:manage`.
- **Path params:** `workspace_id`, `user_id` (strings, required).
- **Request body:** none.
- **Response:** `204 No Content`. The mock returns `null`, and the client ignores the body.
- **Errors** (in the order they are checked):

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | Not a member, or no `members:manage` (records `access.denied`). |
  | 404 | `not_found` | `Member "<user_id>" was not found.` The user has no membership (active or invited) in this workspace. |
  | 409 | `owner_immutable` | The target is the owner: `The workspace owner cannot be removed. Ownership transfers are handled by support.` |
  | 409 | `cannot_remove_self` | The caller targets themself: `You cannot remove yourself. Ask another admin or the owner.` |

- **Side effects:** deletes the membership. The user record is kept. Records `member.invitation_revoked` if the membership was `invited`, otherwise `member.removed`. The resource is `{type:"member", id:<user id>, name:<user name>}` and `changes` is `[{"field":"role","before":"editor","after":null}]`.
- **Backend notes:**
  - End the removed user's access to this workspace immediately: revoke workspace-scoped tokens and drop cached permissions.
  - Decide what happens to the user's per-workspace state (notification preferences, favorites, unread notifications). The mock leaves it in place.
  - Revoking an invitation must also invalidate its token.

#### `GET /api/v1/workspaces/{workspace_id}/roles`
Returns the four roles with their descriptions and permissions. The members page uses it to draw the roles matrix.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 RoleDefinition[]`, always in the order owner, admin, editor, viewer. The permission lists are the role matrix in section 1.0.
  ```json
  [
    { "role": "owner", "description": "Full control of the workspace, billing and membership.", "permissions": ["workspace:manage", "members:manage", "sources:write", "sources:sync", "pipelines:write", "pipelines:run", "transformations:write", "transformations:run", "mappings:review", "mappings:approve", "models:propose", "models:approve", "schedules:write", "reports:write", "reports:publish", "audit:export", "settings:manage"] },
    { "role": "admin", "description": "Manages connections, integrations, members and approvals.", "permissions": ["members:manage", "sources:write", "sources:sync", "pipelines:write", "pipelines:run", "transformations:write", "transformations:run", "mappings:review", "mappings:approve", "models:propose", "models:approve", "schedules:write", "reports:write", "reports:publish", "audit:export", "settings:manage"] },
    { "role": "editor", "description": "Builds transformations and reports, runs jobs and proposes changes.", "permissions": ["sources:sync", "pipelines:run", "transformations:write", "transformations:run", "mappings:review", "models:propose", "schedules:write", "reports:write"] },
    { "role": "viewer", "description": "Read-only access to dashboards, catalog and run history.", "permissions": [] }
  ]
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER.
- **Side effects:** none.
- **Backend notes:** generate this from the same table the backend uses for authorization, so the matrix shown never drifts from what is enforced. The client caches it for 5 minutes.

### 7.3 Warehouse destination (PostgreSQL)

The destination is the PostgreSQL database that dlt loads into (Bronze) and dbt builds in (Silver, Gold). There is one per workspace.

#### `GET /api/v1/workspaces/{workspace_id}/destination`
Returns the warehouse connection settings. The password is described, not returned.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 DestinationConfig`.
  ```json
  { "engine": "postgres", "host": "warehouse.acme-distributors.internal", "port": 5432, "database": "analytics", "username": "graphite_loader", "password": { "is_set": true, "updated_at": "2026-06-10T09:15:00Z" }, "ssl_mode": "require", "bronze_schema": "bronze", "silver_schema": "silver", "gold_schema": "gold", "status": "healthy", "last_tested_at": "2026-10-28T06:15:00Z" }
  ```
  For Northwind Retail (not configured), `host`, `database` and `username` are `""`, `password.is_set` is `false`, `status` is `"unknown"` and `last_tested_at` is `null`. The schemas default to `bronze`, `silver`, `gold`, the port to `5432` and `ssl_mode` to `require`.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.
- **Backend notes:** viewers can read the host, port, database and user name. Decide whether to keep that or return them only to holders of `settings:manage`. The connections page and the onboarding destination step both call this endpoint.

#### `PUT /api/v1/workspaces/{workspace_id}/destination`
Saves the warehouse connection settings.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateDestinationRequest`. Every field except `password` is required. Strings are trimmed before validation.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `host` | required; host name or IPv4 without scheme or port: `^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$` | `Enter the warehouse host name or IP address.` / `Enter a host name such as warehouse.example.com, without a scheme or port.` |
  | `port` | JSON integer 1..65535 (a string is rejected) | `Port must be a whole number between 1 and 65535.` |
  | `database` | required; `^[A-Za-z_][A-Za-z0-9_$-]{0,62}$` | `Enter the database name.` / `Use letters, numbers, underscores or hyphens (max 63 characters).` |
  | `username` | required; same pattern as `database` | `Enter the database user Graphite loads data as.` / same as `database` |
  | `ssl_mode` | `disable`, `require` or `verify-full` | `Choose disable, require or verify-full.` |
  | `bronze_schema`, `silver_schema`, `gold_schema` | required; `^[a-z][a-z0-9_]*$`, at most 63 characters; the three must all differ | `Enter a schema name.` / `Use lowercase letters, numbers and underscores, starting with a letter (max 63 characters).` / on the later duplicate field: `Must differ from the <bronze\|silver> schema. Each layer needs its own schema.` |
  | `password` | write-only secret (see 7.0) | see 7.0 |

  ```json
  { "host": "warehouse.acme-distributors.internal", "port": 5432, "database": "analytics", "username": "graphite_loader", "ssl_mode": "verify-full", "bronze_schema": "bronze", "silver_schema": "silver", "gold_schema": "gold" }
  ```
- **Response:** `200 DestinationConfig` (the saved configuration). When `host`, `port`, `database`, `username` or `ssl_mode` changes, or `password` is sent, `status` becomes `"unknown"`. `last_tested_at` keeps its old value. A change to the schema names alone keeps `status`.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION (fields above, including `password`).
- **Side effects:**
  - When the result has `host`, `database`, `username` and a stored password, sets the workspace onboarding step `destination` to `true`. It is never set back to `false`.
  - Records `settings.destination_updated` with resource `{type:"integration", id:"warehouse", name:"Warehouse (PostgreSQL)"}` and a change list (password redacted), for example `[{"field":"ssl_mode","before":"require","after":"verify-full"}]`.
- **Backend notes:**
  - Store the password in a secrets vault (or encrypt it with a per-tenant key). Keep only a reference and `updated_at` in the settings table. Never log the request body.
  - The onboarding step is set directly. The mock does not recompute `onboarding.completed_at` or record `workspace.onboarding_completed` here, unlike `PATCH /workspaces/{id}/onboarding`. The backend should run the same completion logic.
  - Renaming a schema does not move existing tables. Decide whether a rename while sources or models exist should be blocked (409) or should trigger a migration. The UI only shows a warning.
  - Decide whether saving should require a successful test first. The mock saves without testing.

#### `POST /api/v1/workspaces/{workspace_id}/destination/test-connection`
Tests the warehouse connection, either with the stored settings or with unsaved values from the form.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** either `{}` or a full `UpdateDestinationRequest`.
  - `{}` (no `host` key) tests the stored configuration and the stored password.
  - Any body with a `host` key is validated exactly like the PUT and tests those unsaved values. If `password` is omitted, the stored password is used. If it is `null`, the test runs with no password.
  - The settings form sends `{}` when the form is unchanged and the full values when it has edits. The onboarding step always sends the full values.
- **Response:** `200 ConnectionTestResponse`.
  ```json
  { "success": true, "message": "Connected to warehouse.acme-distributors.internal:5432/analytics as graphite_loader; schemas bronze, silver and gold are writable (simulated: no database was contacted)", "tested_at": "2026-10-28T09:15:00Z" }
  ```
  Failure examples from the mock:
  - No stored host: `No warehouse host is configured. Save the connection details, then test again ...`
  - Unreachable host: `Could not connect to <host>:<port>: connection refused ...`
  - No password: `Password authentication failed for user "<username>": no password is stored ...`
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION (only when unsaved values are sent).
- **Side effects:**
  - Testing the stored configuration (body `{}`) with a non-empty stored host sets `status` to `healthy` or `unhealthy` and `last_tested_at` to `tested_at`. Testing unsaved values changes nothing stored.
  - Records `settings.destination_tested` with resource `{type:"integration", id:"warehouse", name:"Warehouse (PostgreSQL)"}`, status `success` or `failure`, and `metadata: {"simulated": true, "unsaved_values": <bool>}`. A live backend should drop `simulated`.
- **Backend notes:**
  - The mock decides the outcome by rules: a host containing `fail` is refused and a missing password fails authentication. The backend must open a real connection with the given `ssl_mode`, verify that the user can create tables in each of the three schemas, and report the specific failure (DNS, timeout, TLS, authentication, missing privilege).
  - Use a short connect timeout (about 10 seconds). The client's default request timeout applies.
  - **Security:** when the body has a new `host` but omits `password`, the mock sends the stored password to that host. An admin could use this to send the stored password to a server they control. Require the password in the body when `host`, `port` or `username` differ from the stored values, or refuse with 422.
  - Never persist a password sent only for a test.
  - Rate-limit tests per workspace (for example 10 per minute). Each test opens a network connection.
  - Run the probe from the same network egress as the loaders, so a passing test means the pipelines can connect too.

### 7.4 dbt project

The Git repository that holds the workspace dbt project. The transformation runner checks it out to build Silver and Gold models.

#### `GET /api/v1/workspaces/{workspace_id}/integrations/dbt`
Returns the dbt project settings. The deploy key is described, not returned.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 DbtProjectConfig`.
  ```json
  { "repository_url": "https://git.example.com/acme/analytics-dbt.git", "branch": "main", "project_subdirectory": "dbt", "dbt_version": "1.10", "target": "prod", "threads": 4, "deploy_key": { "is_set": true, "updated_at": "2026-06-30T09:15:00Z" }, "status": "healthy", "last_compiled_at": "2026-10-28T08:37:00Z" }
  ```
  When not configured: `repository_url` and `project_subdirectory` are `""`, `deploy_key.is_set` is `false`, `status` is `"unknown"` and `last_compiled_at` is `null`. The other fields keep the defaults shown above.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.
- **Backend notes:** the onboarding transformation step reads this endpoint. The transformations pages read a different resource (`GET /workspaces/{id}/dbt-project`, section 4), which must stay consistent with this configuration.

#### `PUT /api/v1/workspaces/{workspace_id}/integrations/dbt`
Saves the dbt project settings.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateDbtProjectRequest`. Strings are trimmed.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `repository_url` | required; an `https://` URL, or an SSH address matching `^(?:ssh:\/\/[\w.-]+@[\w.-]+(?::\d+)?\/[\w./-]+\|[\w.-]+@[\w.-]+:[\w./-]+)$` | `Enter the Git repository URL of the dbt project.` / `Use an HTTPS URL (https://git.example.com/org/repo.git) or an SSH address (git@git.example.com:org/repo.git).` |
  | `branch` | required; at most 200 characters; valid Git ref name: `^(?!-)(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.lock)$` | `Enter the branch to deploy, for example main.` / `Enter a valid Git branch name.` |
  | `project_subdirectory` | optional; `""` or an omitted key saves `""` (the repository root; omitting does not keep the stored value). Otherwise a relative path of `[\w./-]` characters, not starting with `/` and with no `..` segment | `Use a relative path inside the repository, such as dbt or analytics/dbt.` |
  | `dbt_version` | `^\d+\.\d+$` (the UI offers `1.10`, `1.9`, `1.8`) | `Choose a dbt Core version such as 1.10.` |
  | `target` | required; `^[a-z][a-z0-9_]*$` | `Enter the dbt target, for example prod.` / `Use lowercase letters, numbers and underscores, starting with a letter.` |
  | `threads` | integer 1..16 | `Threads must be a whole number between 1 and 16.` |
  | `deploy_key` | write-only secret (see 7.0) | see 7.0 |

- **Response:** `200 DbtProjectConfig`. When `repository_url`, `branch` or `project_subdirectory` changes, or `deploy_key` is sent, `status` becomes `"unknown"`. A change to `dbt_version`, `target` or `threads` alone keeps `status`.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION.
- **Side effects:** records `settings.dbt_updated` with resource `{type:"integration", id:"dbt", name:"dbt project"}` and a change list (deploy key redacted). It does not change onboarding state.
- **Backend notes:**
  - Store the deploy key (an SSH private key) in the vault. Validate that it parses as a private key and reject passphrase-protected keys with a clear 422 message. The mock only checks that it is a non-empty string of at most 4096 characters, which is too short for some RSA keys. Consider raising the limit for this field.
  - Reject `dbt_version` values that the runner image does not support (422 on `dbt_version`). The mock accepts any `<major>.<minor>`.
  - HTTPS repositories without a deploy key are treated as public. Decide whether HTTPS token authentication is needed. The mock has no field for it.

#### `POST /api/v1/workspaces/{workspace_id}/integrations/dbt/test-connection`
Checks that the stored repository can be cloned and contains a dbt project.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** none. Only the stored configuration is tested. Unsaved values cannot be tested, unlike the destination test.
- **Response:** `200 ConnectionTestResponse`.
  ```json
  { "success": true, "message": "Checked out main and found dbt/dbt_project.yml; dbt 1.10 would run with target \"prod\" (simulated: no repository was contacted)", "tested_at": "2026-10-28T09:15:00Z" }
  ```
  Failure examples from the mock:
  - No repository: `No repository is configured. Save the dbt project settings, then test again ...`
  - Not found: `Could not reach <url>: repository not found or access denied ...`
  - SSH repository without a deploy key: `Permission denied (publickey): an SSH repository needs a deploy key ...`
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404.
- **Side effects:**
  - Sets `status` to `healthy` or `unhealthy`. This also happens when no repository is configured: the result is `unhealthy`.
  - `last_compiled_at` is not changed, and `DbtProjectConfig` has no `last_tested_at`, so the time of the last test is not stored.
  - Records `settings.dbt_tested` with resource `{type:"integration", id:"dbt", name:"dbt project"}`, status `success` or `failure`, and `metadata: {"simulated": true}`.
- **Backend notes:**
  - The mock decides the outcome by rules (a URL containing `fail` fails; SSH without a deploy key fails). The backend must do a shallow clone of `branch` with the deploy key, confirm `dbt_project.yml` exists under `project_subdirectory`, and preferably run `dbt parse` with the chosen version.
  - Cloning can take tens of seconds. Use a timeout of about 60 seconds, or return `202` with a job id and change the client to poll. The client currently expects the result in the response.
  - Consider adding `last_tested_at` to `DbtProjectConfig` (see the open questions).
  - Rate-limit per workspace.

### 7.5 Metabase

Configuration of the Metabase instance used for dashboards. The Metabase status and connection test endpoints are `GET /api/v1/integrations/metabase/status?workspace_id=` and `POST /api/v1/integrations/metabase/test-connection` (body `{ "workspace_id": "..." }`). They are served by the analytics handler (`src/mocks/handlers/analytics.ts`, `reportsService`) and documented in the analytics section. The Metabase settings page calls both.

#### `GET /api/v1/workspaces/{workspace_id}/integrations/metabase`
Returns the Metabase configuration. Secrets are described, not returned.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 MetabaseConfig`. `status` is computed on each read: `not_configured` when `site_url` is empty, otherwise `unreachable` in the mock (demo mode cannot reach Metabase). The mock never returns `connected` or `auth_failed`.
  ```json
  { "site_url": "https://metabase.acme-distributors.example", "embedding_secret": { "is_set": true, "updated_at": "2026-07-30T09:15:00Z" }, "api_key": { "is_set": true, "updated_at": "2026-07-30T09:15:00Z" }, "default_collection_id": 7, "status": "unreachable" }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none visible. The mock writes the computed status back to the stored record.
- **Backend notes:** return the status of the last real check (the same source as the analytics status endpoint). Do not contact Metabase on every read.

#### `PUT /api/v1/workspaces/{workspace_id}/integrations/metabase`
Saves the Metabase site URL, secrets and default collection, or disconnects Metabase.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateMetabaseConfigRequest`.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `site_url` | required key. Trimmed, and trailing slashes are removed. `""` disconnects; `null` or any non-string value is also treated as `""` and disconnects. Otherwise it must be an `https://` URL with a host name | `site_url is required (send an empty string to disconnect).` / `Enter an https:// URL, for example https://metabase.example.com.` |
  | `embedding_secret` | write-only secret (see 7.0) | see 7.0 |
  | `api_key` | write-only secret (see 7.0) | see 7.0 |
  | `default_collection_id` | optional. Omitted keeps the stored value, `null` clears it, otherwise an integer 1..2147483647 | `Collection id must be a positive whole number.` |

  ```json
  { "site_url": "https://metabase.acme-distributors.example/", "default_collection_id": 9 }
  ```
- **Response:** `200 MetabaseConfig` with the normalised `site_url` (no trailing slash) and the recomputed `status`.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION.
- **Side effects:**
  - If `site_url` changed, the stored result of the last Metabase connection test is discarded, so the status endpoint's `last_checked_at` becomes `null` until the next test.
  - Disconnecting (`site_url: ""`) keeps the stored secrets. Send `null` for each to clear them.
  - Records `settings.metabase_updated` with resource `{type:"integration", id:"metabase", name:"Metabase"}` and a change list (secrets redacted), for example `[{"field":"default_collection_id","before":7,"after":9}]`.
  - Does not change the onboarding step `analytics`.
- **Backend notes:**
  - Store `embedding_secret` and `api_key` in the vault. The embedding secret signs embed JWTs on the server. It must never reach the browser.
  - Decide whether disconnecting should also clear the secrets and disable published embeds.
  - Consider checking that `default_collection_id` exists in Metabase on save (422 on that field), or leave that to the connection test.

### 7.6 AI provider

Configuration of the LLM provider used for AI-assisted mapping suggestions. Off by default (`provider: "none"`) in both seeded workspaces.

#### `GET /api/v1/workspaces/{workspace_id}/integrations/ai-provider`
Returns the AI provider configuration. The API key is described, not returned.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 AiProviderConfig`.
  ```json
  { "provider": "none", "model": null, "endpoint_url": null, "api_key": { "is_set": false, "updated_at": null }, "data_sharing": "metadata_only", "enabled": false, "status": "unknown" }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.
- **Backend notes:** the AI mapping pages (list, new, provider notice) read this to tell users whether AI suggestions are available. Every member must be able to read it.

#### `PUT /api/v1/workspaces/{workspace_id}/integrations/ai-provider`
Chooses the AI provider, model, endpoint, key, data-sharing level and on/off switch.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `UpdateAiProviderRequest`. Strings are trimmed.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `provider` | required; `none`, `openai`, `anthropic`, `azure_openai` or `self_hosted` | `Choose none, openai, anthropic, azure_openai or self_hosted.` |
  | `model` | required unless `provider` is `none`; at most 120 characters. An unknown `provider` value also triggers this check | `Enter the model or deployment name to use.` / `The model name is too long.` |
  | `endpoint_url` | `azure_openai`: required, `https://` URL. `self_hosted`: required, `http://` or `https://` URL. Ignored (stored as `null`) for other providers | `Enter the Azure OpenAI resource endpoint.` / `Enter an https:// endpoint, for example https://your-resource.openai.azure.com.` / `Enter the base URL of the self-hosted model server.` / `Enter an http:// or https:// URL.` |
  | `api_key` | write-only secret (see 7.0) | see 7.0 |
  | `data_sharing` | required; `metadata_only` or `metadata_and_samples` | `Choose metadata_only or metadata_and_samples.` |
  | `enabled` | required boolean | `enabled must be true or false.` |

  Cross-field rules, applied after the checks above pass:
  - Changing `provider` discards the stored key, because a key from one provider is never valid for another. A key sent in the same request is kept.
  - `provider: "none"` clears the key, sets `model` to `null` and forces `enabled` to `false`.
  - If the result would be `enabled: true` with no stored key and the provider is not `self_hosted`, the request fails with 422 on `api_key`: `An API key is required to enable <OpenAI|Anthropic|Azure OpenAI>.` This is a second, separate 422, so it is not returned together with the field errors above.

  ```json
  { "provider": "anthropic", "model": "claude-sonnet-4-5", "api_key": "sk-ant-...", "data_sharing": "metadata_only", "enabled": true }
  ```
- **Response:** `200 AiProviderConfig`. `status` is `"paused"` when `enabled` is false and the provider is not `none`, and `"unknown"` otherwise. The mock never verifies a key, so it never reports `healthy`.
  ```json
  { "provider": "anthropic", "model": "claude-sonnet-4-5", "endpoint_url": null, "api_key": { "is_set": true, "updated_at": "2026-10-28T09:15:00Z" }, "data_sharing": "metadata_only", "enabled": true, "status": "unknown" }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION (fields above, or the `api_key` rule).
- **Side effects:** records `settings.ai_provider_updated` with resource `{type:"integration", id:"ai_provider", name:"AI provider"}`. `changes` compares the saved `provider`, `model`, `endpoint_url`, `data_sharing` and `enabled`, and includes `api_key` (redacted) when a key was sent or a stored key was discarded by a provider change. A discarded key that was not replaced shows as `"[secret cleared]"`. The redaction follows the request, not the result: a key sent together with `provider: "none"` is logged as `"[secret updated]"` although the key is cleared. The backend should log the actual outcome.
- **Backend notes:**
  - Store the key in the vault.
  - Enforce `data_sharing` in the code that builds prompts. `metadata_only` means table names, column names, types and profile statistics only, with no row values.
  - The AI mapping endpoints (section 4) must refuse to generate suggestions when the provider is `none` or disabled. The mock mapping handler never calls a provider and does not read this setting.
  - Restrict `self_hosted` endpoints to avoid server-side request forgery. Block private address ranges unless the deployment allows them, and use an outbound allowlist.
  - The model name is free text. Consider validating it against the provider's model list on save or in the test.

#### `POST /api/v1/workspaces/{workspace_id}/integrations/ai-provider/test-connection`
Tests the stored AI provider configuration.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** none.
- **Response:** `200 ConnectionTestResponse`. In the mock it is always a failure, because demo mode never sends data to a provider:
  ```json
  { "success": false, "message": "Not tested: demo mode never sends data to AI providers. Connect a live backend to verify the key.", "tested_at": "2026-10-28T09:15:00Z" }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 404 | `not_found` | Unknown workspace, or SETTINGS_404. |
  | 403 | `forbidden` | Not a member, or no `settings:manage` (records `access.denied`). |
  | 422 | `ai_provider_not_configured` | `provider` is `none`. Message `No AI provider is configured. Choose a provider and save before testing.`, with `field_errors: [{"field":"provider","message":"Choose a provider and save before testing."}]`. Note the code is not `validation_error`. |

- **Side effects:** records `settings.ai_provider_tested` with resource `{type:"integration", id:"ai_provider", name:"AI provider"}`, status `failure` and `metadata: {"simulated": true, "provider_contacted": false}`. The stored `status` is not changed.
- **Backend notes:**
  - Make a minimal call that sends no workspace data (for example, list models, or a one-token completion with a fixed prompt) and report authentication, quota, unknown model or network errors in `message`.
  - Set `status` to `healthy` or `unhealthy` from the result. Consider adding `last_tested_at` to `AiProviderConfig`.
  - Rate-limit tests per workspace, because each test costs provider tokens.

### 7.7 Scheduler defaults

#### `GET /api/v1/workspaces/{workspace_id}/settings/scheduler`
Returns the workspace defaults for schedules and runs.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 SchedulerDefaults`.
  ```json
  { "default_timezone": "Asia/Kolkata", "max_concurrent_runs": 3, "default_retry_attempts": 2, "default_backoff_seconds": 300, "quiet_hours": { "enabled": false, "start": "22:00", "end": "06:00" } }
  ```
  A workspace created through `POST /workspaces` starts with `default_timezone` set to the workspace timezone.
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.

#### `PUT /api/v1/workspaces/{workspace_id}/settings/scheduler`
Saves the scheduler defaults.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `SchedulerDefaults`. All fields are required.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `default_timezone` | a valid IANA zone (trimmed) | `Choose a valid IANA time zone, for example Asia/Kolkata.` |
  | `max_concurrent_runs` | integer 1..20 | `Enter a whole number between 1 and 20.` |
  | `default_retry_attempts` | integer 0..10 | `Enter a whole number between 0 and 10.` |
  | `default_backoff_seconds` | integer 30..86400 | `Enter a number of seconds between 30 and 86400 (24 hours).` |
  | `quiet_hours.enabled` | required boolean (the `quiet_hours` object must be present) | field `quiet_hours.enabled`: `quiet_hours.enabled must be true or false.` |
  | `quiet_hours.start`, `quiet_hours.end` | `^([01]\d\|2[0-3]):[0-5]\d$`; checked even when quiet hours are disabled | `Use 24-hour HH:MM, for example 22:00.` (start) / `Use 24-hour HH:MM, for example 06:00.` (end) |
  | cross-field | when `quiet_hours.enabled` is true, `start` must differ from `end`. An overnight window (start later than end) is allowed | field `quiet_hours.end`: `The end time must differ from the start time.` |

- **Response:** `200 SchedulerDefaults` (as saved).
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION. Field names in `field_errors` use dot paths for the nested object.
- **Side effects:** records `settings.scheduler_updated` with resource `{type:"settings", id:"scheduler", name:"Scheduler defaults"}`. `changes` compares the top-level keys, so a quiet-hours change appears as one change of `quiet_hours` with the whole object before and after.
- **Backend notes:** in the mock, only `default_retry_attempts` and `default_backoff_seconds` are used, as the retry policy of the schedule created for a new source. Existing schedules are not changed. The backend must also:
  - use `default_timezone` as the default for new schedules and sources;
  - enforce `max_concurrent_runs` as a workspace-wide cap on running jobs, with extra runs queued (schedules have their own per-schedule limit of 1..10);
  - hold scheduled (not manual) runs during quiet hours, interpreted in `default_timezone`, and start them when the window ends.

  Decide and document whether a change applies to existing schedules.

### 7.8 Audit retention

#### `GET /api/v1/workspaces/{workspace_id}/settings/audit-retention`
Returns the audit retention policy.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 AuditRetentionSettings`.
  ```json
  { "retention_days": 365, "export_enabled": true, "include_ip_addresses": true }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.

#### `PUT /api/v1/workspaces/{workspace_id}/settings/audit-retention`
Saves the audit retention policy.
- **Permission:** `settings:manage`.
- **Path params:** `workspace_id` (string, required).
- **Request body:** `AuditRetentionSettings`. All fields are required.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `retention_days` | integer 30..2555 | `Retention must be between 30 and 2555 days (7 years).` |
  | `export_enabled` | boolean | `export_enabled must be true or false.` |
  | `include_ip_addresses` | boolean | `include_ip_addresses must be true or false.` |

- **Response:** `200 AuditRetentionSettings` (as saved).
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 403 PERM_403 (`settings:manage`), 404 SETTINGS_404, 422 VALIDATION.
- **Side effects:**
  - Records `settings.audit_retention_updated` with resource `{type:"settings", id:"audit_retention", name:"Audit retention"}` and the changed fields.
  - The effect on the audit endpoints (section 1.8) is immediate. Events older than `retention_days` disappear from lists, facets and exports. `include_ip_addresses: false` returns `ip_address: null` on every event. `export_enabled: false` makes `GET .../audit-events/export` fail with 409 `audit_export_disabled`.
- **Backend notes:**
  - The mock only hides old events. The backend needs a scheduled purge job and must decide whether shortening the window deletes data at once or after a grace period. The UI asks for confirmation before shortening.
  - Decide whether `include_ip_addresses: false` stops collecting IP addresses or only hides them. The mock still records them.
  - Changing the retention policy should itself be kept for at least the maximum window, or be exempt from purging.
  - Consider limiting this endpoint to the owner, or to `audit:export`, since it controls evidence. It currently uses `settings:manage`.

### 7.9 Personal notification preferences

Preferences belong to the signed-in user and are stored per workspace. The path is under `/me`, and the workspace is a query parameter.

#### `GET /api/v1/me/notification-preferences`
Returns the caller's notification preferences for one workspace.
- **Permission:** authenticated, and an active member of the given workspace.
- **Query params:**

  | Name | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `workspace_id` | string | yes | — | Workspace the preferences apply to. |

- **Response:** `200 NotificationPreferences`. Lookup order: the caller's preferences for this workspace, then the caller's user-level preferences, then the defaults. The defaults are the user's email, `digest: "daily"`, `in_app: true` for every event, and `email: true` for every event except `sync_completed`.
  ```json
  { "email_address": "ananya.rao@acme-distributors.example", "digest": "daily", "events": { "pipeline_failed": { "in_app": true, "email": true }, "sync_completed": { "in_app": true, "email": false }, "repeated_retries": { "in_app": true, "email": true }, "quality_failed": { "in_app": true, "email": true }, "schema_changed": { "in_app": true, "email": true }, "stale_data": { "in_app": true, "email": true } } }
  ```
- **Errors:**

  | Status | Code | When |
  |---|---|---|
  | 401 | `unauthenticated` | No session. |
  | 422 | `validation_error` | `workspace_id` is missing (field `workspace_id`: `workspace_id is required.`). |
  | 404 | `not_found` | Unknown workspace. |
  | 403 | `forbidden` | The caller is not an active member. |

- **Side effects:** none.

#### `PUT /api/v1/me/notification-preferences`
Saves the caller's notification preferences for one workspace.
- **Permission:** authenticated, and an active member of the given workspace. No workspace permission is needed, so viewers can set their own preferences.
- **Query params:** `workspace_id` (string, required), as for GET.
- **Request body:** `NotificationPreferences`. All fields are required.

  | Field | Rule | Message on failure |
  |---|---|---|
  | `email_address` | required; trimmed; `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`; at most 254 characters | `Enter the address that receives email notifications.` / `Enter a valid email address.` |
  | `digest` | `off`, `daily` or `weekly` | `Choose off, daily or weekly.` |
  | `events.<type>` | all six `NotificationType` keys are required, each with boolean `in_app` and `email`. Unknown keys are ignored | field `events.<type>`: `Set in_app and email to true or false.` |

- **Response:** `200 NotificationPreferences` (as saved).
- **Errors:** as for GET, plus 422 VALIDATION for the body.
- **Side effects:**
  - Stores the preferences for this user and workspace only. The user-level fallback is not changed.
  - Records `user.notification_preferences_updated` in that workspace's audit trail, with resource `{type:"user", id:<user id>, name:<user name>}` and the changed top-level keys (`email_address`, `digest`, `events`).
  - In the mock, a new in-app notification is not created when the signed-in user has turned `in_app` off for its type. No email or digest is ever sent.
- **Backend notes:**
  - Apply the preferences per recipient when fanning out notifications. The mock checks only the signed-in demo user, because its inbox is shared.
  - Send email through the email integration and build daily or weekly digests.
  - `email_address` can differ from the account email. Verify a new address (confirmation link) before sending to it, so a user cannot direct workspace alerts to an address they do not control.
  - Decide whether a user-level default endpoint is needed. The mock seeds user-level preferences but has no route to change them.

### 7.10 Integration status and system health

#### `GET /api/v1/workspaces/{workspace_id}/integrations`
Summarises the state of every integration for the integrations page.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 IntegrationStatus[]`, always six entries in this order:

  | `key` | `name` | How the mock derives it |
  |---|---|---|
  | `warehouse` | `Warehouse (PostgreSQL)` | Configured when `host`, `database`, `username` and a password are stored. `status` is the destination `status`. `message` is `<host>:<port>/<database>. Last connection test passed.` (or `failed`, or `Not tested since the last change`). `last_checked_at` is `destination.last_tested_at`. Not configured: `status: "unknown"`, `Not configured. Add the PostgreSQL warehouse in Settings > Connections.` |
  | `dbt` | `dbt project` | Configured when `repository_url` is set. `message` is `<url> (<branch>). Repository reachable.` (or `Last repository check failed`, or `Not checked since the last change`). `last_checked_at` is `dbt.last_compiled_at`. Not configured: `status: "unknown"` (even after a failed test) and `Not configured. Connect the dbt project repository in Settings > dbt project.` |
  | `metabase` | `Metabase` | From the Metabase status (`GET /integrations/metabase/status`, analytics section): `status` is its `health`, `configured` is `status != "not_configured"`, and `last_checked_at` is the time of the last Metabase connection test. |
  | `ai_provider` | `AI provider` | Configured when `provider != "none"`. `message` is `<label> (<model>), enabled\|disabled. Keys cannot be verified in demo mode.` `last_checked_at` is `null`. Not configured: `No AI provider configured. AI-assisted features are unavailable until one is connected.` |
  | `email` | `Email delivery` | Placeholder: `status: "unknown"`, `configured: false`, `message: "Provided by the backend"`. |
  | `scheduler` | `Scheduler` | Placeholder, same as `email`. |

  Acme Distributors example:
  ```json
  [
    { "key": "warehouse", "name": "Warehouse (PostgreSQL)", "status": "healthy", "configured": true, "message": "warehouse.acme-distributors.internal:5432/analytics. Last connection test passed.", "last_checked_at": "2026-10-28T06:15:00Z" },
    { "key": "dbt", "name": "dbt project", "status": "healthy", "configured": true, "message": "https://git.example.com/acme/analytics-dbt.git (main). Repository reachable.", "last_checked_at": "2026-10-28T08:37:00Z" },
    { "key": "metabase", "name": "Metabase", "status": "unhealthy", "configured": true, "message": "Demo mode cannot reach Metabase at https://metabase.acme-distributors.example. Dashboards can be embedded once a live backend generates signed embed URLs.", "last_checked_at": null },
    { "key": "ai_provider", "name": "AI provider", "status": "unknown", "configured": false, "message": "No AI provider configured. AI-assisted features are unavailable until one is connected.", "last_checked_at": null },
    { "key": "email", "name": "Email delivery", "status": "unknown", "configured": false, "message": "Provided by the backend", "last_checked_at": null },
    { "key": "scheduler", "name": "Scheduler", "status": "unknown", "configured": false, "message": "Provided by the backend", "last_checked_at": null }
  ]
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none. No integration is contacted.
- **Backend notes:**
  - Fill in `email` (SMTP or provider state, last delivery result) and `scheduler` (last heartbeat).
  - Use real last-check times. The mock reports `dbt.last_compiled_at` as the dbt check time, because no test time is stored.
  - Build the response from stored state. Do not probe on request.

#### `GET /api/v1/workspaces/{workspace_id}/system-health`
Returns the health of the platform components that serve this workspace.
- **Permission:** any workspace member.
- **Path params:** `workspace_id` (string, required).
- **Response:** `200 SystemHealth`. The mock returns seven components in this order:
  - `API gateway`, `Scheduler` and `Worker queue` are placeholders: `status: "unknown"`, `message: "Simulated - no backend connected"`, `checked_at: null`.
  - `Warehouse (PostgreSQL)`, `dbt runner`, `Metabase` and `AI provider` carry the same status, message and check time as the matching `GET .../integrations` entries.

  `latency_ms` is always `null` in the mock. `overall` is the worst component status, using the order healthy < paused < unknown < degraded < unhealthy.
  ```json
  { "overall": "unhealthy", "version": "0.1.0-mock", "components": [
    { "component": "API gateway", "status": "unknown", "latency_ms": null, "message": "Simulated - no backend connected", "checked_at": null },
    { "component": "Scheduler", "status": "unknown", "latency_ms": null, "message": "Simulated - no backend connected", "checked_at": null },
    { "component": "Worker queue", "status": "unknown", "latency_ms": null, "message": "Simulated - no backend connected", "checked_at": null },
    { "component": "Warehouse (PostgreSQL)", "status": "healthy", "latency_ms": null, "message": "warehouse.acme-distributors.internal:5432/analytics. Last connection test passed.", "checked_at": "2026-10-28T06:15:00Z" },
    { "component": "dbt runner", "status": "healthy", "latency_ms": null, "message": "https://git.example.com/acme/analytics-dbt.git (main). Repository reachable.", "checked_at": "2026-10-28T08:37:00Z" },
    { "component": "Metabase", "status": "unhealthy", "latency_ms": null, "message": "Demo mode cannot reach Metabase at https://metabase.acme-distributors.example. Dashboards can be embedded once a live backend generates signed embed URLs.", "checked_at": null },
    { "component": "AI provider", "status": "unknown", "latency_ms": null, "message": "No AI provider configured. AI-assisted features are unavailable until one is connected.", "checked_at": null }
  ] }
  ```
- **Errors:** 401 UNAUTH, 404 WS_404, 403 NOT_MEMBER, 404 SETTINGS_404.
- **Side effects:** none.
- **Backend notes:**
  - The system health page refetches every 60 seconds while it is open.
  - Serve the result from a cache that a background checker refreshes (for example every 30 to 60 seconds), and fill `latency_ms` and `checked_at` from those checks. Do not probe external systems on each request.
  - Report the real build version in `version`.
  - Decide whether internal component names and messages should be shown to viewers.

### 7.11 Service coverage

Every `settingsService` method maps to exactly one route in `src/mocks/handlers/settings.ts`, and every route has exactly one service method (24 and 24).

| Service method | Route |
|---|---|
| `members` | `GET /workspaces/{id}/members` |
| `invite` | `POST /workspaces/{id}/invitations` |
| `updateMember` | `PATCH /workspaces/{id}/members/{user_id}` |
| `removeMember` | `DELETE /workspaces/{id}/members/{user_id}` |
| `roles` | `GET /workspaces/{id}/roles` |
| `destination` / `updateDestination` / `testDestination` | `GET` / `PUT /workspaces/{id}/destination`, `POST .../destination/test-connection` |
| `dbt` / `updateDbt` / `testDbt` | `GET` / `PUT /workspaces/{id}/integrations/dbt`, `POST .../integrations/dbt/test-connection` |
| `metabase` / `updateMetabase` | `GET` / `PUT /workspaces/{id}/integrations/metabase` |
| `aiProvider` / `updateAiProvider` / `testAiProvider` | `GET` / `PUT /workspaces/{id}/integrations/ai-provider`, `POST .../integrations/ai-provider/test-connection` |
| `scheduler` / `updateScheduler` | `GET` / `PUT /workspaces/{id}/settings/scheduler` |
| `auditRetention` / `updateAuditRetention` | `GET` / `PUT /workspaces/{id}/settings/audit-retention` |
| `notificationPreferences` / `updateNotificationPreferences` | `GET` / `PUT /me/notification-preferences?workspace_id=` |
| `integrations` | `GET /workspaces/{id}/integrations` |
| `systemHealth` | `GET /workspaces/{id}/system-health` |

The settings pages also call `reportsService.metabaseStatus` and `reportsService.testMetabase` (analytics section), `workspaceService.update` (section 1.4) and `sourcesService.list` (section 2) for the source connections list on the connections page.

### 7.12 Open questions

The open questions for this section are collected in [9.7](#97-workspace-settings-members-connections-and-integrations).

---

## 8. Cross-cutting backend responsibilities

The mock fakes everything below in the browser, with deterministic outcomes, seeded history and `simulated: true` markers. The real backend has to do the work. Each item names the endpoints that expose it. Sections 1 to 7 hold the field-level rules.

### 8.1 Ingestion workers (dlt)

- Run dlt pipelines that read Salesforce (REST or Bulk API) and PostgreSQL sources into each source's Bronze schema in the warehouse. Use full or incremental mode per table, with the stored cursor field and primary key, and persist dlt state (cursors) so that retries and the next run resume where the last one stopped.
- Commit per table, or roll back. A failed or cancelled load must never leave a half-merged Bronze table.
- Classify failures into `RunError` codes with a correct `retryable` flag. Examples: `source_auth_failed` (not retryable until the credentials change), `source_rate_limited` (retryable) and connection timeouts.
- Run connection tests and discovery against the real systems with a read-only role, an upstream timeout and no side effects.
- Endpoints:
  - `POST /api/v1/sources/{source_id}/sync`
  - `POST /api/v1/workspaces/{workspace_id}/sources` (`run_initial_sync`)
  - `POST /api/v1/pipelines/{pipeline_id}/runs`
  - `POST /api/v1/workspaces/{workspace_id}/sources/test-connection`
  - `POST /api/v1/workspaces/{workspace_id}/sources/discover`
  - `POST /api/v1/sources/{source_id}/test-connection`
  - `GET /api/v1/sources/{source_id}/schemas`
  - `GET /api/v1/sources/{source_id}/tables`
  - `GET /api/v1/sources/{source_id}/tables/{table}/preview`

### 8.2 Run orchestration

- Keep a durable run queue with workers for dlt, dbt and the Metabase API. Persist the stage and table progress that `GET /api/v1/runs/{run_id}` returns, and append log lines with stable `seq` numbers.
- Snapshot the run plan (stages, tables, selector) when the run is created. Report planned skips and post-failure skips with the `skip_reason` texts in 0.8.
- Make cancellation reach the worker process, which stops at a safe point. A retry re-executes for real, with the original plan.
- Apply the completion side effects exactly once per run (section 2.7). These are source sync bookkeeping and health, model freshness, transformation `last_run_*` fields, notifications and the `<kind>.run_<status>` audit event.
- Enforce the active-run guards atomically (0.7).
- Endpoints:
  - `GET /api/v1/runs/{run_id}`
  - `GET /api/v1/runs/{run_id}/logs`
  - `POST /api/v1/runs/{run_id}/retry`
  - `POST /api/v1/runs/{run_id}/cancel`
  - `GET /api/v1/workspaces/{workspace_id}/runs`
  - the per-resource run lists under sources, pipelines, schedules and transformations

### 8.3 dbt execution and the dbt project

- Clone the workspace's dbt repository with its deploy key, then run `dbt deps`, `parse` or `compile`, `run --select` and `test --select` against the warehouse target, in an isolated worker per workspace.
- Parse the manifest to fill transformations, their columns, dependencies, tests and lineage. Refresh it after each compile and after each save.
- Commit SQL and description edits to the configured branch with the user's commit message. Report push failures and protected branches as errors (see 9.4).
- When a dbt connection is saved and verified, create the `DbtProject` and parse its models (see 9.4).
- Endpoints:
  - `GET /api/v1/workspaces/{workspace_id}/dbt-project`
  - `GET /api/v1/workspaces/{workspace_id}/transformations`
  - `GET /api/v1/transformations/{transformation_id}`
  - `PATCH /api/v1/transformations/{transformation_id}`
  - `POST /api/v1/transformations/{transformation_id}/run`
  - `POST /api/v1/transformations/{transformation_id}/test`
  - `GET /api/v1/transformations/{transformation_id}/tests`
  - `GET`, `PUT` and `POST .../test-connection` on `/api/v1/workspaces/{workspace_id}/integrations/dbt`

### 8.4 Scheduler

- Fire every enabled schedule at its five-field cron occurrences in its IANA timezone, DST included, and create runs with `trigger: "schedule"` and the scheduler actor.
- Apply the overlap policies `skip`, `queue` and `cancel_running` with `max_concurrent_runs`, exactly as "Run now" does. Apply the retry policy (fixed or exponential backoff, up to `max_attempts`) to failures whose error is retryable.
- Skip paused and draft targets. Survive restarts without double-firing, and define a misfire policy (see section 3.4 and 9.3).
- Fire source sync schedules stored on the source (`schedule.frequency` and `cron`) in the same way.
- Apply the workspace defaults (`max_concurrent_runs`, `quiet_hours` and the retry defaults), whose semantics are still open (9.7).
- Use one cron library for validation, `next_run_at` and firing.
- Endpoints:
  - `GET` and `POST /api/v1/workspaces/{workspace_id}/schedules`
  - `POST /api/v1/workspaces/{workspace_id}/schedules/validate`
  - `GET`, `PATCH` and `DELETE /api/v1/schedules/{schedule_id}`
  - `GET /api/v1/schedules/{schedule_id}/runs`
  - `POST /api/v1/schedules/{schedule_id}/run`
  - `GET` and `PUT /api/v1/workspaces/{workspace_id}/settings/scheduler`
  - `PATCH /api/v1/sources/{source_id}` (`schedule`)

### 8.5 Data quality checks

- Run dbt tests (unique, not_null, relationships, accepted_values and custom tests) in the `quality_checks` stage of pipeline runs and in `dbt_test` runs.
- Store each result with its failing-row count and sample, so that the per-model checks, the workspace quality summary and the overview tiles show real results.
- An error-severity failure fails the run with a `quality_checks` error (the demo story is duplicate invoice IDs in `fct_invoices` for Finance and Receivables). A warn-severity failure does not fail the run.
- Endpoints:
  - `GET /api/v1/models/{model_id}/quality-checks`
  - `GET /api/v1/workspaces/{workspace_id}/quality-summary`
  - `GET /api/v1/transformations/{transformation_id}/tests`
  - `GET /api/v1/workspaces/{workspace_id}/overview`

### 8.6 Schema-change detection and freshness

- On each sync, compare the discovered source schema with the stored one. Record a schema change on the affected Bronze model (added, removed or retyped columns, as in the ERP Database `hsn_code` change), mark downstream impact, and raise a `schema_changed` notification. The mock only has seeded changes.
- Compute model freshness from the last successful load or build, and raise `stale_data` notifications when a freshness SLA is breached. Neither trigger exists in the mock (see 9.1).
- Endpoints:
  - `GET /api/v1/models/{model_id}`
  - `GET /api/v1/models/{model_id}/columns`
  - `POST /api/v1/models/{model_id}/schema-changes/{change_id}/acknowledge`
  - `GET /api/v1/workspaces/{workspace_id}/models`
  - `GET /api/v1/notifications`

### 8.7 Catalog, lineage, preview and schema proposals

- Build the model catalog, column profiles, relationships and lineage (source to Bronze to Silver to Gold to Metabase dashboard) from warehouse metadata, the dbt manifest and the Metabase API.
- Serve data previews as bounded samples (row and column caps, a statement timeout, a read-only role). Previews are never full extracts.
- Turn an applied schema proposal into real DDL or dbt changes, either as a direct commit or as a pull request (see 9.5).
- Endpoints:
  - `GET /api/v1/workspaces/{workspace_id}/models`
  - `GET /api/v1/models/{model_id}`
  - `GET /api/v1/models/{model_id}/preview`
  - `GET /api/v1/models/{model_id}/lineage`
  - `GET /api/v1/workspaces/{workspace_id}/lineage`
  - `GET /api/v1/models/{model_id}/relationships`
  - `GET /api/v1/workspaces/{workspace_id}/relationships`
  - the schema proposal endpoints in section 5.5, including `POST /api/v1/schema-proposals/{proposal_id}/apply`

### 8.8 Metabase integration and embedding

- Store the Metabase site URL, API key and embedding secret, and probe Metabase to report `connected`, `unreachable` or `not_configured`.
- Sign short-lived embed tokens server-side.
- Sync the dashboard catalog from Metabase (see 9.6).
- Create Metabase questions when a report is published.
- Refresh Metabase metadata and caches in the `metabase_refresh` stage, and skip that stage with its `skip_reason` when Metabase is not connected.
- Never fake a Metabase result: when Metabase cannot be reached, embed and publish fail with 409 `integration_unavailable`.
- Endpoints:
  - `GET /api/v1/integrations/metabase/status`
  - `POST /api/v1/integrations/metabase/test-connection`
  - `GET` and `PUT /api/v1/workspaces/{workspace_id}/integrations/metabase`
  - `POST /api/v1/dashboards/{dashboard_id}/embed-session`
  - `POST /api/v1/reports/{report_id}/publish`
  - `GET /api/v1/workspaces/{workspace_id}/dashboards`
  - `GET /api/v1/dashboards/{dashboard_id}`

### 8.9 AI provider calls with human review

- Call the provider configured for the workspace, in background jobs where generation can be slow. Respect `enabled` and `data_sharing`: `metadata_only` sends only table and column metadata and profiling statistics, and `metadata_and_samples` may add sample values.
- Record the provider and model on every suggestion, and never mark output as approved.
- Mapping suggestions must go through item-level review (accept, edit or reject) and an approval by a holder of `mappings:approve` before they can feed a schema proposal. Report recommendations become drafts only when a person saves them.
- Refuse generation when the provider is `none` or disabled. The error code is still open (9.4, 9.6, 9.7).
- Endpoints:
  - `POST /api/v1/ai/mapping-suggestions`
  - `GET /api/v1/ai/mapping-suggestions/{suggestion_id}`
  - `POST /api/v1/ai/mapping-suggestions/{suggestion_id}/review`
  - `GET /api/v1/workspaces/{workspace_id}/mapping-suggestions`
  - `POST /api/v1/ai/report-suggestions`
  - `GET`, `PUT` and `POST .../test-connection` on `/api/v1/workspaces/{workspace_id}/integrations/ai-provider`

### 8.10 Notification delivery

- Create notifications server-side, from run completions (`pipeline_failed`, `quality_failed`, `repeated_retries`, `sync_completed`) and from detectors (`schema_changed`, `stale_data`).
- Fan each one out to every member according to that member's own preferences: workspace-specific preferences first, then the user's defaults, and deliver when nothing is stored.
- Keep read state per recipient.
- Deliver the email channel and the daily or weekly digests through an email provider. `IntegrationStatus` reports it as `email`.
- Endpoints:
  - `GET /api/v1/notifications`
  - `PATCH /api/v1/notifications/{notification_id}`
  - `POST /api/v1/notifications/mark-all-read`
  - `GET` and `PUT /api/v1/me/notification-preferences`
  - `GET /api/v1/workspaces/{workspace_id}/integrations`

### 8.11 Audit retention and export

- Record audit events transactionally with each change (0.10). Purge events older than `retention_days` in a background job. Honour `include_ip_addresses`.
- Produce exports without the mock's demo markers. Exports past the 10,000-row cap may need an async export job (see 9.1).
- Endpoints:
  - `GET /api/v1/workspaces/{workspace_id}/audit-events`
  - `GET /api/v1/workspaces/{workspace_id}/audit-events/facets`
  - `GET /api/v1/workspaces/{workspace_id}/audit-events/export`
  - `GET` and `PUT /api/v1/workspaces/{workspace_id}/settings/audit-retention`

### 8.12 Per-user state

- Favorites are per user and workspace. The mock already keeps them that way, and the backend must too.
- Recently viewed dashboards and reports should be per-user view events, not a shared `last_viewed_at` (see 9.1 and 9.6).
- Notification read state is per recipient (8.10).
- Endpoints:
  - `POST /api/v1/dashboards/{dashboard_id}/favorite`
  - `POST /api/v1/reports/{report_id}/favorite`
  - `GET /api/v1/workspaces/{workspace_id}/dashboards`
  - `GET /api/v1/workspaces/{workspace_id}/reports`
  - `GET /api/v1/dashboards/{dashboard_id}`
  - `GET /api/v1/reports/{report_id}`
  - `GET /api/v1/workspaces/{workspace_id}/overview` (`recent_analytics`)

### 8.13 Identity, tenancy and secrets

- Real password verification (argon2id or bcrypt), session storage and rotation, and lockout.
- An invitation accept flow (9.7).
- Sign-up, password reset, password change and SSO have no routes in this contract (9.1, question 17).
- Membership and permission checks on every route (0.11).
- Tenant isolation for every resource resolved by ID.
- Secret storage in a vault (0.9) for source credentials, the warehouse password, the dbt deploy key, Metabase keys and the AI provider key.
- Endpoints: section 1.3 and 1.4, and section 7.2 to 7.6.

### 8.14 Health and integration status

- `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (readiness: database, queue and secrets store) for the deployment platform.
- Real probes of the warehouse, dbt, Metabase, the AI provider, email and the scheduler for `GET /api/v1/workspaces/{workspace_id}/integrations` and `GET /api/v1/workspaces/{workspace_id}/system-health`, cached briefly because the settings page polls every 60 seconds.

---

## 9. Open questions

These questions came up while each section was checked against the mock. Each one needs a backend or product decision before the API is final. Some decisions need a frontend change, and those are marked. Sections 1 to 7 describe the mock as it behaves today, so a decision here may change the matching endpoint block.

### 9.0 Cross-cutting

1. **Where the workspace goes in the request.** A few routes take the workspace as a query or body parameter: `GET /api/v1/notifications`, `POST /api/v1/notifications/mark-all-read`, `GET` and `PUT /api/v1/me/notification-preferences`, `/api/v1/integrations/metabase/status`, `/api/v1/integrations/metabase/test-connection`, `POST /api/v1/ai/mapping-suggestions` and `POST /api/v1/ai/report-suggestions`. Every other workspace resource carries it in the path. Should these move under `/api/v1/workspaces/{workspace_id}/` before the backend is built? This needs a frontend change. Without a decision, keep the paths as written.
2. **Revealing which IDs exist.** The lookup (404) comes before the membership check (403) in every section. A non-member can therefore tell whether a workspace, source, run, model or proposal ID exists. Section 5 returns 403 for a model in another workspace, and section 1 returns 404 before 403 for workspaces. Should the backend return 404 for every resource the caller cannot access? The client treats both the same way, so no client change is needed.
3. **Field path format.** Most 422 `field_errors` use dotted paths with numeric indexes (`changes.0.columns.2.data_type`). The AI mapping review uses bracket indexes (`decisions[2].overrides.target_field`). Pick one format, preferably dotted. The mapping review screen would then need a matching change.
4. **Pagination defaults and limits.** The default page size is 20 for most lists, 25 for workspace runs and audit events, and 10 for transformation runs. `page_size` is silently clamped to 500 almost everywhere, but audit events return 422 above 200. Most catalog lists (sources, pipelines, schedules, models, dashboards, reports, proposals, mapping sets) are bare, unpaginated arrays. Should the defaults and the over-limit behaviour be unified, and which bare lists need pagination before they grow? Adding pagination later is a frontend change.
5. **Idempotency keys.** Should trigger endpoints accept `Idempotency-Key`, so that a repeated request returns the first response? The client would start sending it.
6. **Optimistic concurrency.** No resource carries a version or `ETag`, so concurrent edits are last-write-wins. This matters most for transformation SQL committed to Git, settings objects saved with `PUT`, and schema proposals. Should `If-Match` or a `version` field be added?
7. **Long synchronous calls.** These calls are synchronous today, with a 20 second client timeout (120 seconds for the audit export): source discovery on large databases, the dbt clone test, AI report suggestions and large audit exports. Keep them synchronous with upstream timeouts, or move them to 202 plus polling? Moving them is a frontend change.
8. **Unconfigured AI provider.** Sections 4, 6 and 7 each ask how to refuse AI generation when the provider is `none` or disabled. Agree one status and code for both `POST /api/v1/ai/mapping-suggestions` and `POST /api/v1/ai/report-suggestions`, for example 409 `ai_provider_unavailable` with a link to Settings > AI provider.
9. **Success status codes.** The mock does not model 2xx codes. This contract recommends 200, 201, 202 and 204 as described in 0.3. Confirm, and in particular confirm that deletes return 204 with no body.
10. **Demo markers.** Confirm that the backend never sends the mock's demo markers for real work: `simulated: true` in audit metadata, `provider.simulated: true` on suggestions, "(simulated run ...)" in notification text, and the `DEMO EXPORT` header in audit exports.

### 9.1 Authentication, workspaces, search, overview, notifications and audit

1. **Methods with no frontend caller.** `workspaceService.getOnboarding` (`GET /api/v1/workspaces/{workspace_id}/onboarding`), `healthService.health` (`GET /api/v1/health`) and `healthService.ready` (`GET /api/v1/ready`) have handlers but no frontend caller. Keep `/health` and `/ready` for the deployment platform. Should the backend still build the onboarding read, or should the frontend drop `getOnboarding`, given that the same data comes from `Workspace.onboarding`?
2. **Failed sign-ins.** `auth.login_failed` appears in the seeded audit trail, but `POST /api/v1/auth/login` never records it on a 401. Should the backend record failed logins, and if so, in which workspace? The seed implies every workspace of the known user.
3. **Account enumeration.** The demo accepts any password and signs an unknown email in as `usr_ananya`. Confirm that the backend returns the same 401 "Incorrect email or password." for an unknown email and for a wrong password.
4. **Sliding or fixed session.** `GET /api/v1/auth/me` recomputes `expires_at` as now plus 8 hours on every call, which makes the session sliding. Is the session meant to slide, or to have a fixed expiry?
5. **Notification read state and preferences.** The mock stores read state per workspace, so one member marking a notification read marks it read for everyone. It also checks delivery preferences against whoever is signed in when a run settles. The contract recommends a per-recipient inbox with per-member preferences. This needs confirmation.
6. **Notification triggers.** `schema_changed` and `stale_data` notifications exist only in the seed, and no mock code path creates them. The backend needs triggers for both: schema drift detected on sync, and a freshness SLA breach. What is the freshness SLA, and is it per model or per workspace?
7. **Workspace slugs.** `POST /api/v1/workspaces` checks slug uniqueness across all tenants (409 `workspace_exists`). `PATCH /api/v1/workspaces/{workspace_id}` renames without any uniqueness check and never changes the slug. Is the slug meant to be globally unique and immutable?
8. **Industry validation.** The mock does not validate `industry` on create or update. The settings form limits it to 80 characters, and the create form offers a fixed list. Should the backend enforce a maximum of 80 characters, an enum, or nothing?
9. **Empty and read-only workspace updates.** `PATCH /api/v1/workspaces/{workspace_id}` records `workspace.updated` even when no field changed (`changes: []`). It also ignores `region`, `plan` and `slug` without an error. Should the backend skip empty audit events and return 422 for read-only fields?
10. **Workspace timezone.** A workspace timezone change does not update `settings.scheduler.default_timezone`. Is that intended?
11. **Onboarding completion.** Onboarding steps are also set by `POST /api/v1/workspaces/{workspace_id}/sources` (`steps.source`) and by `PUT /api/v1/workspaces/{workspace_id}/destination` (`steps.destination`). Neither path recomputes `completed_at` or records `workspace.onboarding_completed`. Only `PATCH /api/v1/workspaces/{workspace_id}/onboarding` does. Should the server derive completion in one place?
12. **Audit events on the overview.** The overview's `latest_audit_events` reads raw audit events. It ignores the workspace retention window and the `include_ip_addresses: false` redaction, which the audit endpoints apply. Should the overview apply the same retention view?
13. **Recent analytics.** The overview's `recent_analytics` uses a workspace-wide `last_viewed_at` on dashboards and reports. Should it be per user (see 9.6, question 9)?
14. **Search scoping.** In the mock, search returns transformations only when the workspace is `ws_acme`, because the seed transformations have no `workspace_id`. The backend must scope transformations by workspace, through the dbt project.
15. **Audit export.** The export is synchronous, with a 10,000-row cap and a 120 second client timeout. The jsonl metadata line, the txt header and the `audit.exported` metadata all carry demo markers (`"demo": true`, `DEMO EXPORT`). Confirm that the backend drops them, and decide whether larger exports should become an async job.
16. **Notification page size.** `GET /api/v1/notifications` silently clamps `page_size` to 500 (default 20), while `GET /api/v1/workspaces/{workspace_id}/audit-events` returns 422 above 200 (default 25). See 9.0, question 4.
17. **Account lifecycle outside this API.** The frontend has no screen or service method for sign-up, password reset, email verification, changing a password or single sign-on, so this contract defines no routes for them. The sign-in page offers only email and password. Decide whether these are handled by the backend (new routes plus frontend screens), by an external identity provider, or by support for the first release. Whatever is chosen must still end in the cookie session described in 0.2.

### 9.2 Data sources and runs

1. **Cron variants on source schedule presets.** Source schedule presets (`hourly`, `every_6_hours`, `daily`, `weekly`) accept any client-supplied cron that parses. The mock applies neither the 15 minute minimum interval nor a check that the cron matches the preset. Should the backend enforce both?
2. **Refreshing the table catalog.** The table list that `GET /api/v1/sources/{source_id}/tables` returns, and that `PATCH selected_tables` is validated against, is stored once at creation. Tables added to the source later can never be selected. Should the backend refresh it after each sync or on a schedule, or add an explicit re-discovery endpoint (a frontend change)?
3. **Sync next to a pipeline run.** Only `ingestion` runs block a new sync (409 `sync_in_progress`). An active pipeline run that reads the same source does not. Should a sync and a pipeline ingestion be allowed to load the same Bronze schema at the same time?
4. **Runs of multi-source pipelines.** A pipeline run has one `source_id`: the failing source, otherwise the pipeline's first source. `GET /api/v1/sources/{source_id}/runs` therefore shows a multi-source run (Customer 360) under one source only. Should it appear under every source it read? That would mean a `source_ids` array or a join table.
5. **Retry guards for other run kinds.** `POST /api/v1/runs/{run_id}/retry` checks target state only for pipeline runs. Should retries of ingestion runs apply the sync guards (`source_paused`, `sync_in_progress`), and retries of transformation runs apply their trigger rules, with the same error codes?
6. **Retrying an older attempt.** Nothing stops a retry of an older attempt when a newer attempt exists in the same chain. Should retries be limited to the latest attempt?
7. **Requested cancellations.** `Run` has no field for a requested but unfinished cancellation, such as `cancel_requested_at`. The mock settles cancellation before the next request, so a second cancel returns 409. The contract recommends 202 for a repeated cancel while the run is stopping. Add the field, so that the UI can show "Cancelling"? That would be a frontend change.
8. **Testing credentials on save.** `PATCH /api/v1/sources/{source_id}` with new credentials marks health `unknown` and lets the next sync verify them. Should the backend test on save, and should a failed test block the save?
9. **Slow discovery.** `POST /api/v1/workspaces/{workspace_id}/sources/discover` is synchronous. On large databases it may take longer than about 15 seconds. Should it become an async job (see 9.0, question 7)?

### 9.3 Pipelines and schedules

1. **Creating draft pipelines.** `POST /api/v1/workspaces/{workspace_id}/pipelines` cannot create a pipeline in `draft` status, yet the seed has a draft pipeline (Customer 360), and `PATCH` allows `draft -> active`. Should create accept `status: "draft"`?
2. **Two rules for "already running".** `POST /api/v1/pipelines/{pipeline_id}/runs` always returns 409 `run_in_progress` while any run of the pipeline is active. `POST /api/v1/schedules/{schedule_id}/run` applies the schedule's overlap policy (`skip`, `queue` or `cancel_running`) and `max_concurrent_runs`. The two entry points can therefore disagree for the same pipeline. Which rule wins?
3. **Deleting pipelines and schedules.** Should a deleted pipeline or schedule be soft-deleted, so that run history and audit links still resolve to a name? The mock keeps `schedule_id` on runs as a dangling reference.
4. **Unknown `target_type` filter.** `GET /api/v1/workspaces/{workspace_id}/schedules` ignores an unknown `target_type` filter. The pipelines list rejects unknown enum values with 422. Should the schedules list do the same?
5. **Skipped firings.** When the scheduler skips a firing because the target is paused or a draft, should it record a run with status `skipped`, so that the history explains the gap?
6. **Missed firings.** What is the misfire policy for occurrences missed while the scheduler was down: fire once, fire all, or skip?
7. **Wording for a deselected Metabase stage.** In the mock, the planned-skip reason for `metabase_refresh` is always "Metabase is not connected, so no dashboards were refreshed.", even when the stage was simply not selected. The contract asks the backend to say "Not selected for this run." in that case. Confirm.
8. **Validating `dbt_selector`.** The mock checks only the character set of `dbt_selector`. Should the backend validate it against the dbt project on save (`dbt ls --select`), which is slow and needs a parsed project, or only at the first run?

### 9.4 Transformations and AI business mapping

1. **Seeded review state the API cannot produce.** `map_erp_gold` is seeded `in_review` with 2 pending items (`jc_3`, `kc_4`), but `submit` is rejected while any item is pending. Either every item in the seed should be decided, or `submit` should allow pending items and only `approve` should require every item to be decided. The same seed set also has `jc_3` joining `public.customers` to `salesforce.Account`, a table of another source that is not in the set's `source_tables`. Its seeded audit events name it "ERP to Gold mappings", whereas the handler uses "ERP Database to Gold mappings".
2. **Several run kinds in one filter.** `GET /transformations/{id}/runs` reads `kind` as a single value and returns 422 for a comma-separated list. `RunListQuery.kind` in `src/types/runs.ts` allows an array and says it is sent comma-separated, but the API client sends an array as a repeated parameter, so only the first value is used. Decide on one format, and decide whether this endpoint should accept several kinds. No current screen sends more than one.
3. **Failed generation.** The mock never produces a `failed` set. The backend has to define when generation fails (provider error, timeout, output that cannot be parsed) and whether it records a reason (`MappingSuggestionSet` has no field for one), an audit event or a notification. The mock records nothing when generation completes or fails.
4. **AI provider settings.** `POST /ai/mapping-suggestions` ignores `enabled` and `data_sharing` from `/workspaces/{workspace_id}/integrations/ai-provider`. The backend needs an error code and status for a disabled or unconfigured provider, for example 409 `ai_provider_disabled`.
5. **Self-approval.** An admin or owner can approve a set they created or submitted. Product policy is needed.
6. **Mapping notifications.** `NotificationType` has no mapping type, yet the review page refreshes the notification list after a review. Decide whether approvers (on submit) and authors (on approve or reject) are notified.
7. **Git write failures and concurrency.** `PATCH /transformations/{id}` has no optimistic concurrency check and no error code for a failed push or a protected branch.
8. **Creating the dbt project.** In the mock, saving the dbt connection under Settings or onboarding does not create a `DbtProject`, so `GET /workspaces/{id}/dbt-project` stays 404 `dbt_not_configured` for Northwind Retail after its dbt step. The backend must create the project and parse its models when the connection is saved and verified, and define what `GET .../transformations` returns while the first parse is running.

### 9.5 Data models, data preview and schema proposals

1. `GET /workspaces/{workspace_id}/relationships` (`modelsService.workspaceRelationships`) has a handler but no frontend caller.
2. The proposals list handler supports `q`, but `modelsService.listProposals` exposes only `status`, and no screen passes `status` (filtering is client-side).
3. Applying a proposal does not change the catalog in the mock (no new models or columns). The contract above asks the backend to do so; confirm the intended mechanism (direct dbt commit or pull request).
4. A `schema_apply` run is cancelled or retried through the generic run endpoints, which require `transformations:run` (editors have it), while starting the apply requires `models:approve` (editors do not).
5. Retrying a failed or cancelled `schema_apply` run (`POST /runs/{run_id}/retry`) does not set the proposal back to `applying` or update `apply_run_id`, although a successful retry still marks the proposal `applied`.
6. Self-approval of a proposal is allowed; only the audit metadata records `self_review`.
7. `POST .../schema-proposals/validate` requires only membership, so viewers can call it.
8. Validate returns errors without field paths, while create and update return dotted field paths in a 422; the builder therefore only maps inline errors from create and update.
9. The seeded applied proposal `prop_sales_rep_sk` has `apply_run_id: null`.
10. The validator does not check `columns` on `add_relationship` changes, so unvalidated column names and types can be stored on such a change.

### 9.6 Analytics, Metabase and AI report recommendations

1. **Report lifecycle.** No endpoint updates, deletes or changes the status of a report. `in_review` exists in `ReportStatus` and in the list filter, but nothing sets it, and publish accepts both `draft` and `in_review`. Should the backend add `PATCH`/`DELETE /reports/{report_id}` and a review step before publish?
2. **Report request workflow.** Seed requests are `in_progress` and `delivered`, but no endpoint moves a request to `in_progress`, `delivered` or `declined`, or assigns it. Who changes these, and through which route?
3. **Dashboard catalog population.** No endpoint creates, registers or syncs dashboards. Decide whether the catalog is synced from Metabase by a job or registered by hand, and how `preview` values and `datasets` are computed.
4. **Publish success audit.** The mock only records `report.publish` with `status: "failure"`. This contract proposes `report.publish` with `status: "success"` for a real publish; confirm the action string (other report events use past tense, for example `report.created`).
5. **Test-connection permission.** `POST /integrations/metabase/test-connection` has no permission check: any member, including a viewer, can run it, and each run is audited and changes `last_checked_at` for everyone. Settings > Metabase only shows the button to members with `settings:manage`, but the analytics status strip (Test connection) and dashboard detail (Check again) show it to every member; report detail shows it only after a refused publish. Should the backend require `settings:manage`?
6. **Viewer access to the assistant and requests.** `POST /ai/report-suggestions` and `POST /workspaces/{workspace_id}/report-requests` are open to viewers (this contract assumes that is intended; saving a recommendation still needs `reports:write`). Confirm, especially for suggestions, which consume provider tokens.
7. **AI provider not configured.** The seed AI provider for both workspaces is `none`, yet the mock still returns simulated suggestions. Which status and code should the backend return when the provider is `none` or disabled (for example `409 ai_provider_unavailable`), and should the assistant page show a dedicated state for it?
8. **Path shape.** Metabase status and test take `workspace_id` as a query or body parameter under `/integrations/metabase/*`, and `/ai/report-suggestions` takes it in the body, while the Metabase configuration lives at `/workspaces/{workspace_id}/integrations/metabase`. Should these move under `/workspaces/{workspace_id}/` before the backend is built (a client change)?
9. **Reads that write.** `GET /dashboards/{dashboard_id}` and `GET /reports/{report_id}` change shared state in the mock (`last_viewed_at`, and `view_count_30d` for dashboards). Confirm the per-user view-event model recommended in 6.2 and 6.3, and whether views are audited (the seed audit trail contains `dashboard.viewed`).

### 9.7 Workspace settings, members, connections and integrations

1. **Invitation acceptance.** There is no route to accept, resend or expire an invitation, and sessions list only `active` memberships, so an invited user can never join. The backend needs an accept flow (token link, then `status: "active"` and `joined_at` set) and the frontend needs a screen for it.
2. **Onboarding completion on destination save.** `PUT .../destination` sets `onboarding.steps.destination = true` directly. It does not recompute `completed_at` or record `workspace.onboarding_completed`, unlike `PATCH /workspaces/{id}/onboarding`. The backend should reuse the onboarding completion logic.
3. **Test password reuse.** `POST .../destination/test-connection` with a new host and no password sends the stored password to the new host. Should the backend require the password whenever host, port or username differ from the stored values?
4. **Test timestamps.** `DbtProjectConfig` and `AiProviderConfig` have no `last_tested_at`, so the integrations page shows `last_compiled_at` for dbt and `null` for the AI provider. Add the field to both types?
5. **Destination visible to viewers.** All GETs in this section are open to viewers, including warehouse host and user names, the Metabase site URL and member email addresses. Confirm or restrict to `settings:manage`.
6. **Admin power over admins.** `members:manage` lets an admin demote or remove another admin. Confirm, or restrict admin-on-admin changes to the owner.
7. **AI provider gating.** The mock AI mapping handler does not check the AI provider setting. The backend must refuse mapping generation when the provider is `none` or disabled. Which error code should it use (for example 409 `ai_provider_disabled`)?
8. **Scheduler defaults scope.** Only the retry defaults are used by the mock. Confirm the backend semantics of `max_concurrent_runs` (workspace-wide cap) and `quiet_hours` (hold scheduled runs), and whether changes apply to existing schedules.
9. **Audit retention.** Should shortening `retention_days` purge immediately or after a grace period, and should `include_ip_addresses: false` stop collection or only hide the values?
10. **Long-running tests.** The dbt clone test may exceed a normal request timeout. Keep it synchronous with a long timeout, or switch to `202` plus polling (a frontend change)?

---

## Appendix A. Service method index

Every method of `frontend/src/services/*.service.ts` and the endpoint it calls. "Ref" is the endpoint's number within its section, the same number as the "Ref" column of [backend-api-checklist.md](backend-api-checklist.md) (for example Ref 1.4 is the fourth endpoint of section 1, not subsection 1.4). "Contract subsection" links to the subsection heading that holds the endpoint block. `reportsService` covers analytics (section 6), and `workspaceService.search` is the search endpoint (Ref 1.12, subsection 1.5).

| Service method | Endpoint | Ref | Contract subsection |
|---|---|---|---|
| `auditService.list` | `GET /api/v1/workspaces/{workspace_id}/audit-events` | 1.17 | [1.8](#18-audit) |
| `auditService.facets` | `GET /api/v1/workspaces/{workspace_id}/audit-events/facets` | 1.18 | [1.8](#18-audit) |
| `auditService.export` | `GET /api/v1/workspaces/{workspace_id}/audit-events/export` | 1.19 | [1.8](#18-audit) |
| `authService.login` | `POST /api/v1/auth/login` | 1.3 | [1.3](#13-authentication) |
| `authService.logout` | `POST /api/v1/auth/logout` | 1.4 | [1.3](#13-authentication) |
| `authService.me` | `GET /api/v1/auth/me` | 1.5 | [1.3](#13-authentication) |
| `healthService.health` | `GET /api/v1/health` | 1.1 | [1.2](#12-health) |
| `healthService.ready` | `GET /api/v1/ready` | 1.2 | [1.2](#12-health) |
| `mappingService.list` | `GET /api/v1/workspaces/{workspace_id}/mapping-suggestions` | 4.9 | [4.3](#43-ai-business-mapping) |
| `mappingService.create` | `POST /api/v1/ai/mapping-suggestions` | 4.10 | [4.3](#43-ai-business-mapping) |
| `mappingService.get` | `GET /api/v1/ai/mapping-suggestions/{suggestion_id}` | 4.11 | [4.3](#43-ai-business-mapping) |
| `mappingService.review` | `POST /api/v1/ai/mapping-suggestions/{suggestion_id}/review` | 4.12 | [4.3](#43-ai-business-mapping) |
| `modelsService.list` | `GET /api/v1/workspaces/{workspace_id}/models` | 5.1 | [5.2](#52-data-model-catalog) |
| `modelsService.get` | `GET /api/v1/models/{model_id}` | 5.2 | [5.2](#52-data-model-catalog) |
| `modelsService.columns` | `GET /api/v1/models/{model_id}/columns` | 5.3 | [5.2](#52-data-model-catalog) |
| `modelsService.preview` | `GET /api/v1/models/{model_id}/preview` | 5.5 | [5.3](#53-data-preview) |
| `modelsService.lineage` | `GET /api/v1/models/{model_id}/lineage` | 5.6 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.relationships` | `GET /api/v1/models/{model_id}/relationships` | 5.8 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.qualityChecks` | `GET /api/v1/models/{model_id}/quality-checks` | 5.10 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.acknowledgeSchemaChange` | `POST /api/v1/models/{model_id}/schema-changes/{change_id}/acknowledge` | 5.4 | [5.2](#52-data-model-catalog) |
| `modelsService.workspaceLineage` | `GET /api/v1/workspaces/{workspace_id}/lineage` | 5.7 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.workspaceRelationships` | `GET /api/v1/workspaces/{workspace_id}/relationships` | 5.9 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.qualitySummary` | `GET /api/v1/workspaces/{workspace_id}/quality-summary` | 5.11 | [5.4](#54-lineage-relationships-and-quality) |
| `modelsService.listProposals` | `GET /api/v1/workspaces/{workspace_id}/schema-proposals` | 5.12 | [5.5](#55-schema-proposals) |
| `modelsService.getProposal` | `GET /api/v1/schema-proposals/{proposal_id}` | 5.15 | [5.5](#55-schema-proposals) |
| `modelsService.validateProposal` | `POST /api/v1/workspaces/{workspace_id}/schema-proposals/validate` | 5.13 | [5.5](#55-schema-proposals) |
| `modelsService.createProposal` | `POST /api/v1/workspaces/{workspace_id}/schema-proposals` | 5.14 | [5.5](#55-schema-proposals) |
| `modelsService.updateProposal` | `PATCH /api/v1/schema-proposals/{proposal_id}` | 5.16 | [5.5](#55-schema-proposals) |
| `modelsService.reviewProposal` | `POST /api/v1/schema-proposals/{proposal_id}/review` | 5.18 | [5.5](#55-schema-proposals) |
| `modelsService.applyProposal` | `POST /api/v1/schema-proposals/{proposal_id}/apply` | 5.19 | [5.5](#55-schema-proposals) |
| `modelsService.deleteProposal` | `DELETE /api/v1/schema-proposals/{proposal_id}` | 5.17 | [5.5](#55-schema-proposals) |
| `notificationsService.list` | `GET /api/v1/notifications` | 1.14 | [1.7](#17-notifications) |
| `notificationsService.update` | `PATCH /api/v1/notifications/{notification_id}` | 1.15 | [1.7](#17-notifications) |
| `notificationsService.markAllRead` | `POST /api/v1/notifications/mark-all-read` | 1.16 | [1.7](#17-notifications) |
| `overviewService.get` | `GET /api/v1/workspaces/{workspace_id}/overview` | 1.13 | [1.6](#16-overview) |
| `pipelinesService.list` | `GET /api/v1/workspaces/{workspace_id}/pipelines` | 3.1 | [3.2](#32-pipelines) |
| `pipelinesService.get` | `GET /api/v1/pipelines/{pipeline_id}` | 3.3 | [3.2](#32-pipelines) |
| `pipelinesService.create` | `POST /api/v1/workspaces/{workspace_id}/pipelines` | 3.2 | [3.2](#32-pipelines) |
| `pipelinesService.update` | `PATCH /api/v1/pipelines/{pipeline_id}` | 3.4 | [3.2](#32-pipelines) |
| `pipelinesService.remove` | `DELETE /api/v1/pipelines/{pipeline_id}` | 3.5 | [3.2](#32-pipelines) |
| `pipelinesService.trigger` | `POST /api/v1/pipelines/{pipeline_id}/runs` | 3.6 | [3.2](#32-pipelines) |
| `pipelinesService.runs` | `GET /api/v1/pipelines/{pipeline_id}/runs` | 3.7 | [3.2](#32-pipelines) |
| `reportsService.dashboards` | `GET /api/v1/workspaces/{workspace_id}/dashboards` | 6.1 | [6.2](#62-dashboards) |
| `reportsService.dashboard` | `GET /api/v1/dashboards/{dashboard_id}` | 6.2 | [6.2](#62-dashboards) |
| `reportsService.favoriteDashboard` | `POST /api/v1/dashboards/{dashboard_id}/favorite` | 6.3 | [6.2](#62-dashboards) |
| `reportsService.embedSession` | `POST /api/v1/dashboards/{dashboard_id}/embed-session` | 6.4 | [6.2](#62-dashboards) |
| `reportsService.reports` | `GET /api/v1/workspaces/{workspace_id}/reports` | 6.5 | [6.3](#63-reports) |
| `reportsService.report` | `GET /api/v1/reports/{report_id}` | 6.7 | [6.3](#63-reports) |
| `reportsService.createReport` | `POST /api/v1/workspaces/{workspace_id}/reports` | 6.6 | [6.3](#63-reports) |
| `reportsService.favoriteReport` | `POST /api/v1/reports/{report_id}/favorite` | 6.8 | [6.3](#63-reports) |
| `reportsService.publishReport` | `POST /api/v1/reports/{report_id}/publish` | 6.9 | [6.3](#63-reports) |
| `reportsService.suggest` | `POST /api/v1/ai/report-suggestions` | 6.10 | [6.4](#64-ai-report-recommendations) |
| `reportsService.reportRequests` | `GET /api/v1/workspaces/{workspace_id}/report-requests` | 6.11 | [6.5](#65-custom-report-requests) |
| `reportsService.createReportRequest` | `POST /api/v1/workspaces/{workspace_id}/report-requests` | 6.12 | [6.5](#65-custom-report-requests) |
| `reportsService.metabaseStatus` | `GET /api/v1/integrations/metabase/status` | 6.13 | [6.6](#66-metabase-integration) |
| `reportsService.testMetabase` | `POST /api/v1/integrations/metabase/test-connection` | 6.14 | [6.6](#66-metabase-integration) |
| `runsService.listForWorkspace` | `GET /api/v1/workspaces/{workspace_id}/runs` | 2.15 | [2.7](#27-runs) |
| `runsService.get` | `GET /api/v1/runs/{run_id}` | 2.16 | [2.7](#27-runs) |
| `runsService.logs` | `GET /api/v1/runs/{run_id}/logs` | 2.17 | [2.7](#27-runs) |
| `runsService.retry` | `POST /api/v1/runs/{run_id}/retry` | 2.18 | [2.7](#27-runs) |
| `runsService.cancel` | `POST /api/v1/runs/{run_id}/cancel` | 2.19 | [2.7](#27-runs) |
| `schedulesService.list` | `GET /api/v1/workspaces/{workspace_id}/schedules` | 3.8 | [3.3](#33-schedules) |
| `schedulesService.get` | `GET /api/v1/schedules/{schedule_id}` | 3.11 | [3.3](#33-schedules) |
| `schedulesService.create` | `POST /api/v1/workspaces/{workspace_id}/schedules` | 3.10 | [3.3](#33-schedules) |
| `schedulesService.update` | `PATCH /api/v1/schedules/{schedule_id}` | 3.12 | [3.3](#33-schedules) |
| `schedulesService.remove` | `DELETE /api/v1/schedules/{schedule_id}` | 3.13 | [3.3](#33-schedules) |
| `schedulesService.runs` | `GET /api/v1/schedules/{schedule_id}/runs` | 3.14 | [3.3](#33-schedules) |
| `schedulesService.runNow` | `POST /api/v1/schedules/{schedule_id}/run` | 3.15 | [3.3](#33-schedules) |
| `schedulesService.validate` | `POST /api/v1/workspaces/{workspace_id}/schedules/validate` | 3.9 | [3.3](#33-schedules) |
| `settingsService.members` | `GET /api/v1/workspaces/{workspace_id}/members` | 7.1 | [7.2](#72-members-and-roles) |
| `settingsService.invite` | `POST /api/v1/workspaces/{workspace_id}/invitations` | 7.2 | [7.2](#72-members-and-roles) |
| `settingsService.updateMember` | `PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}` | 7.3 | [7.2](#72-members-and-roles) |
| `settingsService.removeMember` | `DELETE /api/v1/workspaces/{workspace_id}/members/{user_id}` | 7.4 | [7.2](#72-members-and-roles) |
| `settingsService.roles` | `GET /api/v1/workspaces/{workspace_id}/roles` | 7.5 | [7.2](#72-members-and-roles) |
| `settingsService.destination` | `GET /api/v1/workspaces/{workspace_id}/destination` | 7.6 | [7.3](#73-warehouse-destination-postgresql) |
| `settingsService.updateDestination` | `PUT /api/v1/workspaces/{workspace_id}/destination` | 7.7 | [7.3](#73-warehouse-destination-postgresql) |
| `settingsService.testDestination` | `POST /api/v1/workspaces/{workspace_id}/destination/test-connection` | 7.8 | [7.3](#73-warehouse-destination-postgresql) |
| `settingsService.dbt` | `GET /api/v1/workspaces/{workspace_id}/integrations/dbt` | 7.9 | [7.4](#74-dbt-project) |
| `settingsService.updateDbt` | `PUT /api/v1/workspaces/{workspace_id}/integrations/dbt` | 7.10 | [7.4](#74-dbt-project) |
| `settingsService.testDbt` | `POST /api/v1/workspaces/{workspace_id}/integrations/dbt/test-connection` | 7.11 | [7.4](#74-dbt-project) |
| `settingsService.metabase` | `GET /api/v1/workspaces/{workspace_id}/integrations/metabase` | 7.12 | [7.5](#75-metabase) |
| `settingsService.updateMetabase` | `PUT /api/v1/workspaces/{workspace_id}/integrations/metabase` | 7.13 | [7.5](#75-metabase) |
| `settingsService.aiProvider` | `GET /api/v1/workspaces/{workspace_id}/integrations/ai-provider` | 7.14 | [7.6](#76-ai-provider) |
| `settingsService.updateAiProvider` | `PUT /api/v1/workspaces/{workspace_id}/integrations/ai-provider` | 7.15 | [7.6](#76-ai-provider) |
| `settingsService.testAiProvider` | `POST /api/v1/workspaces/{workspace_id}/integrations/ai-provider/test-connection` | 7.16 | [7.6](#76-ai-provider) |
| `settingsService.scheduler` | `GET /api/v1/workspaces/{workspace_id}/settings/scheduler` | 7.17 | [7.7](#77-scheduler-defaults) |
| `settingsService.updateScheduler` | `PUT /api/v1/workspaces/{workspace_id}/settings/scheduler` | 7.18 | [7.7](#77-scheduler-defaults) |
| `settingsService.auditRetention` | `GET /api/v1/workspaces/{workspace_id}/settings/audit-retention` | 7.19 | [7.8](#78-audit-retention) |
| `settingsService.updateAuditRetention` | `PUT /api/v1/workspaces/{workspace_id}/settings/audit-retention` | 7.20 | [7.8](#78-audit-retention) |
| `settingsService.notificationPreferences` | `GET /api/v1/me/notification-preferences` | 7.21 | [7.9](#79-personal-notification-preferences) |
| `settingsService.updateNotificationPreferences` | `PUT /api/v1/me/notification-preferences` | 7.22 | [7.9](#79-personal-notification-preferences) |
| `settingsService.integrations` | `GET /api/v1/workspaces/{workspace_id}/integrations` | 7.23 | [7.10](#710-integration-status-and-system-health) |
| `settingsService.systemHealth` | `GET /api/v1/workspaces/{workspace_id}/system-health` | 7.24 | [7.10](#710-integration-status-and-system-health) |
| `sourcesService.connectors` | `GET /api/v1/connectors` | 2.1 | [2.2](#22-connector-catalog) |
| `sourcesService.list` | `GET /api/v1/workspaces/{workspace_id}/sources` | 2.2 | [2.3](#23-sources) |
| `sourcesService.get` | `GET /api/v1/sources/{source_id}` | 2.4 | [2.3](#23-sources) |
| `sourcesService.create` | `POST /api/v1/workspaces/{workspace_id}/sources` | 2.3 | [2.3](#23-sources) |
| `sourcesService.update` | `PATCH /api/v1/sources/{source_id}` | 2.5 | [2.3](#23-sources) |
| `sourcesService.remove` | `DELETE /api/v1/sources/{source_id}` | 2.6 | [2.3](#23-sources) |
| `sourcesService.testNewConnection` | `POST /api/v1/workspaces/{workspace_id}/sources/test-connection` | 2.7 | [2.4](#24-connection-testing-and-discovery) |
| `sourcesService.testConnection` | `POST /api/v1/sources/{source_id}/test-connection` | 2.9 | [2.4](#24-connection-testing-and-discovery) |
| `sourcesService.discover` | `POST /api/v1/workspaces/{workspace_id}/sources/discover` | 2.8 | [2.4](#24-connection-testing-and-discovery) |
| `sourcesService.schemas` | `GET /api/v1/sources/{source_id}/schemas` | 2.10 | [2.5](#25-source-tables-and-preview) |
| `sourcesService.tables` | `GET /api/v1/sources/{source_id}/tables` | 2.11 | [2.5](#25-source-tables-and-preview) |
| `sourcesService.previewTable` | `GET /api/v1/sources/{source_id}/tables/{table}/preview` | 2.12 | [2.5](#25-source-tables-and-preview) |
| `sourcesService.sync` | `POST /api/v1/sources/{source_id}/sync` | 2.13 | [2.6](#26-source-syncs) |
| `sourcesService.runs` | `GET /api/v1/sources/{source_id}/runs` | 2.14 | [2.6](#26-source-syncs) |
| `transformationsService.project` | `GET /api/v1/workspaces/{workspace_id}/dbt-project` | 4.1 | [4.2](#42-transformations) |
| `transformationsService.list` | `GET /api/v1/workspaces/{workspace_id}/transformations` | 4.2 | [4.2](#42-transformations) |
| `transformationsService.get` | `GET /api/v1/transformations/{transformation_id}` | 4.3 | [4.2](#42-transformations) |
| `transformationsService.update` | `PATCH /api/v1/transformations/{transformation_id}` | 4.4 | [4.2](#42-transformations) |
| `transformationsService.run` | `POST /api/v1/transformations/{transformation_id}/run` | 4.7 | [4.2](#42-transformations) |
| `transformationsService.test` | `POST /api/v1/transformations/{transformation_id}/test` | 4.8 | [4.2](#42-transformations) |
| `transformationsService.runs` | `GET /api/v1/transformations/{transformation_id}/runs` | 4.5 | [4.2](#42-transformations) |
| `transformationsService.tests` | `GET /api/v1/transformations/{transformation_id}/tests` | 4.6 | [4.2](#42-transformations) |
| `workspaceService.list` | `GET /api/v1/workspaces` | 1.6 | [1.4](#14-workspaces) |
| `workspaceService.create` | `POST /api/v1/workspaces` | 1.7 | [1.4](#14-workspaces) |
| `workspaceService.get` | `GET /api/v1/workspaces/{workspace_id}` | 1.8 | [1.4](#14-workspaces) |
| `workspaceService.update` | `PATCH /api/v1/workspaces/{workspace_id}` | 1.9 | [1.4](#14-workspaces) |
| `workspaceService.getOnboarding` | `GET /api/v1/workspaces/{workspace_id}/onboarding` | 1.10 | [1.4](#14-workspaces) |
| `workspaceService.updateOnboarding` | `PATCH /api/v1/workspaces/{workspace_id}/onboarding` | 1.11 | [1.4](#14-workspaces) |
| `workspaceService.search` | `GET /api/v1/workspaces/{workspace_id}/search` | 1.12 | [1.5](#15-search) |
