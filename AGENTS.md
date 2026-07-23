# InternJobs contributor guide

## Product boundary

InternJobs monitors official employer hiring sources for United States CS internships and true early-career technical roles. It is deliberately not a general job board. Official company career systems and official ATS boards are the source of truth; third-party lists are discovery or reconciliation signals only.

## Non-negotiable behavior

- Preserve the distinction between `posted_at` (company supplied) and `first_seen_at` (InternJobs observed).
- If `posted_at` is absent, UI copy says “Found …”, never “Posted: Unknown”.
- Never close jobs after a failed source run or a single absence. Source success and closure confirmation are separate facts.
- An unexpected empty source is a health incident, not evidence that every job closed.
- Keep jobs with user activity visible in Tracker after the official posting closes.
- Do not bypass authentication, CAPTCHAs, bot controls, or rate limits. Unsupported sources must fail visibly.
- Compensation is an estimate or historical signal, not a guaranteed offer.
- Development auth, local email delivery, and fixtures must be labeled honestly.

## Working conventions

- TypeScript is the shared language across the React client, API, workers, adapters, scripts, and tests.
- Run `npm run check` before a checkpoint; run `npm run test` for behavioral changes.
- Database migrations are append-only. Seed data must be repeatable.
- Source adapters implement the shared contract and return diagnostics even when parsing succeeds with warnings.
- UI changes must preserve keyboard use, visible focus, responsive behavior, and the dense scanning model.
- Do not commit `.env`, local database files, monitoring payloads, or secrets.

## Important paths

- `src/client/`: React product UI
- `src/server/`: HTTP API, persistence, auth boundary, services
- `src/shared/`: cross-runtime domain types and constants
- `src/adapters/`: official-source adapter implementations
- `src/workers/`: monitoring orchestration and scheduler
- `db/migrations/`: relational schema
- `scripts/`: seed, monitor, and operational commands
- `tests/fixtures/`: static official-source-shaped parser fixtures
- `PROJECT_CONTEXT.md`: architectural decisions and live milestone checklist
- `IMPLEMENTATION_STATUS.md`: exact implemented/mock/blocked readiness record

## Local commands

See `README.md` and `package.json`. The expected entrypoint is `npm run dev`; use `npm.cmd` on PowerShell systems that block the `npm.ps1` shim.
