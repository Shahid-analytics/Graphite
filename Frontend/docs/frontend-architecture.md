# Graphite frontend architecture

Graphite is the control panel for an end-to-end BI platform for MSMEs:

```
Salesforce / PostgreSQL / other sources
  -> ingestion (dlt) -> PostgreSQL Bronze
  -> dbt -> PostgreSQL Silver and Gold
  -> data quality checks -> Metabase dashboards and reports
```

The frontend configures and monitors that workflow. All processing (ingestion, dbt,
scheduling, AI calls, Metabase embedding, audit persistence, authorization) belongs to
the backend, which is developed separately. This repository contains **no backend code**.

## Stack

| Concern | Choice |
|---|---|
| Framework | React 19, TypeScript 6 (strict), Vite 8 |
| Styling | Tailwind CSS v4 with design tokens in `frontend/src/styles/index.css` |
| Components | shadcn/ui-style primitives on Radix (`frontend/src/components/ui`) |
| Routing | React Router 8 data router with route-level code splitting |
| Server state | TanStack Query 5 |
| Forms | react-hook-form + zod |
| Charts | Recharts |
| Icons | lucide-react (outline icons only, never emoji) |
| Toasts | sonner |
| Command menu | cmdk |
| Cron | cron-parser (next runs, validation) and cronstrue (descriptions) |

## Running

```bash
cd frontend
cp .env.example .env.local   # optional; defaults to mock mode
npm install
npm run dev                  # http://localhost:5173
npm run build                # type-check (tsc -b) and production build
npm run typecheck
npm run lint
npm test                     # vitest unit tests
```

Demo sign-in: any email and any password. The password `wrong` demonstrates the failure
path. Signing in as `rahul.mehta@acme-distributors.example`, `priya.nair@...` or
`karan.shah@...` gives the admin, editor and viewer roles; the demo banner can also
preview any role.

## Directory layout

```
frontend/src/
  app/            router, layouts (shell, guards, error pages), navigation config
  components/
    ui/           primitives (button, dialog, select, table, tabs, ...)
    layout/       PageHeader, Section
    feedback/     EmptyState, ErrorState, skeletons, Notice
    tables/       DataTable (sort, paginate), TableToolbar, SearchInput, FilterSelect
    dialogs/      ConfirmDialog
    data/         StatTile, KeyValueGrid, TimeAgo, HelpTip, CopyButton, CodeBlock
    status/       RunStatusBadge, HealthIndicator, FreshnessBadge, LayerBadge,
                  SimulatedBadge, ConfidenceMeter, NotificationIcon
    lineage/      LineageGraph (SVG DAG)
    runs/         useRun (polling), runKeys
    navigation/   sidebar, command palette, notifications popover, menus
    logo/         Logo, LogoMark (hexagonal lattice SVG)
    demo/         DemoBanner (mock mode indicator)
  features/<area>/  routes.tsx, pages/, components/, queries.ts
  services/       api-client.ts, api-error.ts and one typed service per domain
  mocks/          mock API: router, store, seed data, run simulator, handlers
  hooks/          useAuth, useWorkspace, usePermission
  lib/            config, format, cron, toast, query-client, resource-links
  types/          API contract types shared with the FastAPI backend
```

## Mock and live modes

`VITE_API_MODE` selects the transport at build time.

- `mock` (default): every service call is served by `src/mocks/mock-api.ts`, an
  in-browser implementation of the REST API with simulated latency. The mock bundle
  is loaded lazily and is the only place mock data lives.
- `live`: every call goes to `VITE_API_BASE_URL` with `fetch`, a timeout
  (`VITE_API_TIMEOUT_MS`), `credentials: 'include'` for the session cookie and an
  optional in-memory bearer token. Errors are normalised into `ApiError`.

**Live mode never falls back to mock data.** A failed live call surfaces as an error
state with a retry option.

While mock mode is active, a dashed "Demo mode" banner is always visible. Simulated
results (runs, AI suggestions, sample rows, exports) also carry a `SimulatedBadge`.

### Mock API internals

- `mocks/router.ts`: Express-style route table, `httpError` helpers, pagination and sort helpers.
- `mocks/store.ts`: the in-memory `db`, demo session, `requireWorkspace` and
  `requirePermission` (enforce the role matrix in `mocks/permissions.ts`),
  `recordAudit`, `pushNotification`, run settlement side effects and derived views.
- `mocks/seed/*`: a coherent dataset for "Acme Distributors" (Salesforce plus ERP
  PostgreSQL) and an empty "Northwind Retail" workspace used to show onboarding
  and empty states. Timestamps are relative to page load.
- `mocks/engine/runs.ts`: the run simulator. A run created with `createSimRun`
  progresses through its stages based on wall-clock time; polling `GET /runs/{id}`
  shows queued, running and terminal states. `settleRuns()` runs before every mock
  request and applies side effects (source sync status, notifications, audit
  events) once per run.
- `mocks/engine/sample-rows.ts` and `mocks/engine/lineage.ts`: preview rows and
  lineage graphs.
- `mocks/handlers/<domain>.ts`: one file per domain, each exporting `routes`.

Secrets are never stored by the mock: handlers convert secret config values into
`SecretState` (`{ is_set, updated_at }`) and discard the value.

### Backend API contract

The FastAPI backend implements [backend-api-contract.md](backend-api-contract.md), which
was written from the mock handlers and the typed services. It covers every endpoint, the
shared conventions and the open questions. [backend-api-checklist.md](backend-api-checklist.md)
lists the same endpoints with priorities and a status column. Update both when a handler
or service changes.

## Conventions

### Data access

- Pages never call `fetch` or import from `mocks/`. They call `services/*.service.ts`
  through TanStack Query hooks, usually defined in `features/<area>/queries.ts`.
- Query keys start with the domain: `['sources', workspaceId, ...]`,
  `['pipelines', ...]`, `['runs', runId]`. Mutations invalidate by domain prefix.
- Every query renders explicit loading (skeleton), error (`ErrorState` with retry)
  and empty (`EmptyState` with a call to action) states.
- Long-running operations return a `Run` (HTTP 202). Use `useRun(runId)` to poll
  every 2 seconds until the status is terminal, and link to `/w/:ws/runs/:runId`.
- Mutations report success with `toastSuccess` and failure with `toastError(error)`.
  Inline field errors come from `ApiError.fieldErrors` (HTTP 422).

### Permissions

The backend enforces authorization. The frontend reads `workspace.permissions`
through `usePermission('sources:write')` and disables or hides controls, with a
tooltip explaining the missing permission. The mock API also returns 403 so both
paths are exercised.

### Routes

All workspace pages live under `/w/:workspaceId`. `lib/resource-links.ts` defines the
canonical route for each resource type; notifications, search, lineage and audit
events link through it.

| Resource | Route |
|---|---|
| Overview | `/w/:ws` |
| Source | `/w/:ws/sources/:sourceId` (wizard: `sources/new`) |
| Pipeline | `/w/:ws/pipelines/:pipelineId` (create: `pipelines/new`) |
| Run | `/w/:ws/runs/:runId` |
| Transformation | `/w/:ws/transformations/:transformationId` |
| AI mapping set | `/w/:ws/transformations/mapping/:setId` (new: `mapping/new`) |
| Data model | `/w/:ws/models/:modelId` |
| Schema proposal | `/w/:ws/models/proposals/:proposalId` (new: `proposals/new`) |
| Data preview | `/w/:ws/preview?model=:modelId` |
| Schedule | `/w/:ws/schedules/:scheduleId` (create: `schedules/new`) |
| Dashboard | `/w/:ws/analytics/dashboards/:dashboardId` |
| Report | `/w/:ws/analytics/reports/:reportId` |
| AI report assistant | `/w/:ws/analytics/assistant` |
| Audit trail | `/w/:ws/audit` |
| Notifications | `/w/:ws/notifications` |
| Settings | `/w/:ws/settings/:section` |
| Onboarding | `/w/:ws/onboarding` (full-screen) |

### Design rules

- Grayscale: white backgrounds, `surface` and `surface-2` greys, near-black primary.
  Colour (`success`, `warning`, `danger`, `info`, `running`) is used only for status.
- Fine 1px borders, `shadow-xs` on cards, `rounded-md` controls, `rounded-lg` cards.
- Compact metric tiles (`StatTile`), not oversized cards. No gradients, glass effects
  or decorative animation.
- No emoji anywhere. Icons come from `lucide-react`.
- Every page starts with `PageHeader`; detail pages pass `breadcrumbs`.
- Tables use `DataTable` and hide secondary columns on mobile (`hideOnMobile`).
- Destructive actions go through `ConfirmDialog`.
- Use `HelpTip` to explain technical terms (Bronze, incremental cursor, surrogate key).
- Layouts must work from 360px wide upward. Use `grid` with responsive columns and
  avoid fixed widths.
- Accessibility: semantic elements, labelled controls (`FormField` wires labels and
  errors), visible focus, `aria-live` for run progress, keyboard-operable rows.

### Honesty rules

- Never present mock values as production data. The demo banner and `SimulatedBadge`
  mark simulated content.
- Never claim an AI provider was called. AI output shows the provider
  (`simulated: true` in mock mode) and must pass an explicit review step before it
  is considered approved.
- Never simulate a successful Metabase embed or publish. In mock mode the Metabase
  integration reports `unreachable` (Acme) or `not_configured` (Northwind), and the
  UI shows the integration state instead.
- Never imply a real pipeline ran. Runs created in the demo are labelled simulated.
- Secrets are entered in password fields, sent once, cleared from form state after
  submit and never logged, persisted to browser storage or echoed back.

## Live-update mechanism

The frontend polls: run detail and logs every 2 seconds while a run is active, lists
with active runs every 2 to 5 seconds, and the notification count every 30 seconds.
Server-Sent Events are a recommended future optimisation (see section 0.8 of the
[backend API contract](backend-api-contract.md)), but the
frontend does not depend on them.
