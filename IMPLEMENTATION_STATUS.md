# Implementation status

Last updated: 2026-07-22

## Implemented locally

- React, Express, TypeScript, and SQLite local application with a seeded development identity.
- Separate live and sample SQLite workspaces.
- Reviewed Greenhouse monitoring enabled only for Cloudflare, Figma, and Databricks.
- Bulk-first Greenhouse classification with selective one-time job-detail enrichment.
- Compact all-ID source posting state plus full materialization only for included and review-required roles.
- Official publication/update timestamps kept separate from InternJobs first/last observation times.
- Deterministic technical, internship, new-grad, geography, compensation, and work-style processing for covered patterns.
- Idempotent source runs, duplicate detection, safe reopen behavior, and multi-run closure confirmation.
- Failed, partial, malformed, protected, and suspiciously empty runs suppress closure.
- Discover, Following, Tracker, Settings, onboarding, shared role/company inspector, and administrator source-health view.
- Company-level curated logos for the three enabled sources.
- Local follows, application state, alerts, notifications, and development-only email records.

## Development-only boundaries

- SQLite is the only configured database.
- Authentication is a local seeded identity.
- No real email is sent.
- Live polling is explicit, local, and rate limited.
- Fixtures remain available through `npm run dev:sample` and deterministic tests.

## Not implemented or configured

- Public deployment or hosting.
- Production authentication.
- Managed PostgreSQL.
- Provider-backed email or push notifications.
- Hosted scheduling, centralized observability, or managed backups.
- Additional enabled companies or ATS integrations beyond the three Greenhouse boards.

## Claims intentionally not made

- Complete company or job coverage.
- Instant detection.
- Production readiness.
- Permission to access anything beyond public official hiring sources.
- Guaranteed compensation or hiring forecasts.
