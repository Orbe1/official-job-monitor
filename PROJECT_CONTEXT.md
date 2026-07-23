# InternJobs project context

Last updated: 2026-07-17

## Product promise

Follow high-paying CS companies and learn shortly after they publish internships or new-grad roles on their official hiring systems.

## Current decision record

The original repository was a dependency-free HTML/CSS/JavaScript prototype with 11 sample roles and `localStorage` tracking. It was preserved as Git commit `ec9fc1b` before migration.

The implementation is migrating to a TypeScript full-stack application:

- React + Vite for a fast, dense client workspace.
- Express for a small explicit API and worker-compatible service layer.
- SQLite for zero-credential local development, behind repository/service interfaces designed for a PostgreSQL production deployment.
- Raw, versioned SQL migrations to keep the schema inspectable.
- Vitest plus fixture and API tests.
- A development identity provider and local notification delivery with honest production adapter boundaries.

This choice keeps local setup practical while supporting background monitors, relational history, durable user state, and a later managed Postgres/auth deployment without tying the domain model to a browser or vendor.

## Milestone checklist

### Phase 0 — assessment and protection

- [x] Read the attached product brief and structural design reference.
- [x] Inventory and read every existing project file.
- [x] Preserve the original prototype in Git (`ec9fc1b`).
- [x] Establish architecture, contributor guidance, and status documentation.
- [x] Verify scaffold run/test commands.

### Phase 1 — product-quality frontend

- [ ] Persistent compact navigation and dense Explore workspace.
- [ ] Search, sorting, practical filters, selected row, and right detail rail.
- [ ] Watchlists, company pages, Emerging, Tracker, Alerts, notifications, and source health.
- [ ] Realistic labeled seed data, logos with fallbacks, and historical views.
- [ ] Desktop, tablet, and mobile visual QA.

### Phases 2–3 — architecture and adapters

- [x] TypeScript client/server/shared boundaries.
- [x] Relational migrations and repeatable seed pipeline.
- [x] Database-backed follows, saves, applications, notes, alerts, and notifications.
- [x] Auth-capable request boundary with clearly labeled development identity.
- [x] Shared adapter contract, classification, normalization, dedupe, and diagnostics.

### Phases 4–5 — direct monitoring and lifecycle

- [x] Supported Greenhouse, Ashby, and Lever adapters; experimental adapters remain disabled for the live pilot.
- [x] Monitoring runs, snapshots, first/last seen, confirmed closure, and reopening.
- [x] Retry/backoff, timeouts, source limits, suspicious-change detection, and incidents.
- [x] Local durable scheduler and fixture/live one-shot monitoring commands.
- [x] Clean live database is the default development UI; the seeded fixture UI requires `dev:sample`.
- [ ] Fixture coverage for pagination, failures, empty sources, duplicates, and changes.

### Phases 6–7 — user and Emerging workflows

- [ ] Company following and watchlists.
- [ ] Saved jobs, application stages, notes, and dates.
- [ ] Alert-rule model, in-app notifications, and development email delivery.
- [ ] Emerging submission, review, official verification, and promotion workflow.

### Phases 8–10 — quality and readiness

- [ ] Unit, integration, fixture, and UI interaction tests.
- [ ] Lint, typecheck, build, accessibility, and responsive checks.
- [ ] Environment template, local data setup, deployment/worker/monitoring docs.
- [ ] Security, rate-limit, privacy, backup, and recovery review.
- [ ] Final browser exercise, regression repair, and honest readiness audit.

## Data and lifecycle invariants

1. Jobs prefer `(source_id, external_job_id)` identity; canonical URLs are not the only key.
2. A successful run records every seen job and its source snapshot hash.
3. Missing jobs become closure candidates; they close only after the configured number of successful confirming runs.
4. A failed, protected, login-shaped, malformed, or suspiciously empty response never advances closure confirmation.
5. Reappearance of the stable identity reopens the existing job and records `reopened_at`.
6. Explore returns active relevant roles; Tracker may include closed roles with user activity.
7. External discoveries remain pending until an official source is verified.

## Handoff

Continue with the first unchecked item, run the nearest relevant verification, then update this file and `IMPLEMENTATION_STATUS.md`. Never infer that credentials-backed production auth or delivery works from local adapters.
