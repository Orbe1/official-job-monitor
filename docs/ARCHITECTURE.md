# Architecture

InternJobs is a TypeScript application with four explicit layers:

```text
React client -> Express API -> repositories/services -> SQLite local database
                                      |
                              monitor orchestration
                                      |
                          official-source adapters
```

The client never talks directly to an ATS and never owns durable user state. The API resolves a viewer through an authentication interface, validates mutations, and calls repositories. Monitoring is a separate command/process so a source timeout cannot hold a user request open.

## Why this stack

The original app was a useful static interaction prototype but tied user state to one browser and had no lifecycle or monitoring boundary. React and Vite retain its fast master-detail behavior. Express keeps the HTTP surface small and worker-compatible. SQLite provides a real relational, transactional, zero-credential local product; raw migrations make the schema auditable.

SQLite is the implemented local/private-beta database. A public multi-instance deployment should add the documented PostgreSQL repository before launch. Domain identifiers, repository boundaries, ISO timestamps, and JSON serialization are intentionally database-neutral, but PostgreSQL support must be tested rather than assumed.

## Student information architecture

The student shell intentionally keeps primary navigation to three work areas:

- `/discover` provides **Monitored** and **Discovery** feeds. Monitored companies are checked continuously against official hiring sources. Discovery roles retain official application links, but their companies are not continuously monitored.
- `/watch` is **Following**-first and owns per-company alert frequency. Curated groups are demoted to compact browse filters rather than a competing primary workspace.
- `/tracker` is a list-first saved-role and application-stage workspace. It includes closed roles with user activity without conflating posting availability and application stage.

`/companies/:slug` resolves into Watch with the shared company selection active. Discover, Watch, and Tracker all reuse one full-height opportunity inspector with role and company modes: a nonmodal rail only on wide screens, an overlay on laptop/tablet widths, and a full-screen surface on mobile. In role mode, the header arrow or company identity switches the existing shell to company mode; company mode has no Back target, and selecting a current opening switches the same shell to role mode. Apply, Save, tracker, Follow, alerts, current roles, conservative observed history, last-successful-check, and source-trust behavior therefore stay consistent. Its presentation-only brand theme is produced by `src/client/companyTheme.ts`; it never changes domain data, semantic action colors, or monitoring behavior.

The five-step onboarding overlay is mounted once at the workspace level. It persists role focus, technical interests, location/remote preferences, initial follows, and default notification frequency through the viewer-scoped API.

Settings and administrator source health are secondary destinations in the profile menu. `/admin/sources` is rendered only for an administrator and is deliberately absent from primary student navigation.

## Request boundaries

- `GET /api/health` is the only unauthenticated readiness route.
- Viewer-scoped bootstrap data includes active opportunities, tracked closed jobs, preferences, company/watch information, alerts, notifications, Discovery data, and non-sensitive source freshness.
- Viewer-scoped writes include onboarding/preferences, follows, saves, application stages, notes, alert rules, and notification state.
- Administrator writes cover Emerging verification and promotion. Source health is currently an administrator read/diagnostic surface, not a general student feature.
- Development mode resolves the seeded user server-side. It is labeled in the UI and must not be exposed publicly.

## Domain identity

- A source belongs to one company; a company may own multiple official sources.
- A posting is primarily identified by `(source_id, external_job_id)`.
- Canonical and application URLs are attributes, never the only identity.
- Snapshots retain run/lifecycle evidence; the normalized content hash distinguishes unchanged observations from content changes.
- User application stage and official posting availability are separate fields.

## Production evolution

Before public beta, implement and integration-test a PostgreSQL repository against the same service contract; configure real OIDC authentication; deploy web and worker processes independently; enable provider-backed email only after delivery/webhook testing; and add managed logs, alerting, backups, and restore drills.
