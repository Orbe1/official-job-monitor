# Official Job Monitor

Official Job Monitor is a local-first prototype for finding United States computer-science internships and true early-career technical roles from official employer hiring sources. The current interface is branded **InternJobs**.

This is not a general job board and is not a hosted production service. Official employer career pages and their public ATS boards are the source of truth.

## What works today

- A React and Vite student interface with Discover, Following, Tracker, Settings, and an administrator source-health view.
- An Express API backed by local SQLite.
- Deterministic classification for US technical internships and explicit new-graduate roles.
- Company-level logos with accessible initials fallbacks.
- Official Greenhouse ingestion for exactly three enabled companies: Cloudflare, Figma, and Databricks.
- Official publication timestamps from Greenhouse job details, kept separate from the time this application first observed a posting.
- Deterministic extraction for supported compensation and work-style language.
- Saved-role and application-stage tracking that remains available after an official posting closes.
- Source-run diagnostics, suspicious-run incidents, idempotent updates, and closure confirmation across multiple successful checks.

The live catalog may contain disabled research candidates, but only these sources are fetched:

| Company | Official source | Local state |
| --- | --- | --- |
| Cloudflare | Greenhouse | Enabled |
| Figma | Greenhouse | Enabled |
| Databricks | Greenhouse | Enabled |

No other ATS is enabled in the live workflow.

## Local setup

Requirements:

- Node.js 22 or newer
- npm

From the project root:

```powershell
npm.cmd ci
npm.cmd run dev
```

Use `npm` instead of `npm.cmd` on shells where the PowerShell shim is not blocked. Open [http://127.0.0.1:5173/discover](http://127.0.0.1:5173/discover).

`npm run dev` uses `data/internjobs.live.sqlite`. It applies append-only migrations, synchronizes the reviewed source catalog, obtains a successful proof for each enabled Greenhouse source when needed, and then starts the API and client. Pass `--refresh` to request a new observation before startup:

```powershell
npm.cmd run dev -- --refresh
```

The first live scan can take longer because selected candidate IDs receive a one-time Greenhouse detail request. Repeat scans reuse their stored publication-check state.

### Sample workspace

The fixture workspace is separate from live observations:

```powershell
npm.cmd run db:reset
npm.cmd run dev:sample
```

This creates `data/internjobs.sqlite` with clearly labeled sample records. Live monitoring uses `data/internjobs.live.sqlite`; neither database is committed.

## Ingestion and storage model

Each Greenhouse scan has two stages:

1. One complete bulk-board response is normalized in memory and used for deterministic classification plus a conservative student/early-career first pass.
2. Individual Greenhouse job-detail requests are made only for possible US student or early-career candidates, US roles requiring review, and confirmed reopens that need publication metadata.

SQLite intentionally separates source coverage from product records:

- `source_posting_states` contains one compact row for every official posting ID. It stores the content hash, decision state, source/check timestamps, first and last observation times, and closure-confirmation state.
- `jobs`, locations, descriptions, normalized snapshots, and role history are materialized only for included or review-required postings.
- An excluded posting with user activity is retained so Tracker never loses the student's history.

This keeps complete-board idempotency and closure safety without storing hundreds of irrelevant descriptions or making hundreds of repeat detail requests.

## Timestamp semantics

- `source_published_at` is the employer-provided Greenhouse `first_published` value when available.
- `source_updated_at` is Greenhouse's source update timestamp.
- `first_seen_at` is when Official Job Monitor first detected the posting ID.
- `last_seen_at` is the most recent successful observation.

The UI displays **Posted** when an official publication date exists and **Found** for the application's observation timestamp or fallback. A missing employer date is never rendered as “Posted: Unknown.”

## Lifecycle safety

- Failed, partial, protected, malformed, or suspiciously empty runs cannot close postings.
- A single successful absence cannot close a posting.
- Closure requires the configured number of complete successful absences separated by the source interval.
- Reappearing stable IDs reopen the existing posting state.
- Saved or progressed roles remain visible in Tracker after closure.
- No monitoring code attempts to bypass authentication, CAPTCHAs, bot controls, or rate limits.

## Useful commands

```text
npm run dev                    Start the live local workspace
npm run dev:sample             Start the fixture workspace
npm run live:bootstrap         Migrate and synchronize the reviewed live catalog
npm run monitor:live           Run persistent live monitoring
npm run monitor:live:preview   Fetch live sources without persistence
npm run worker:live            Run the local SQLite scheduler
npm run db:migrate             Apply append-only migrations
npm run db:reset               Recreate and seed the sample database
npm run test                   Run the test suite
npm run lint                   Run ESLint
npm run typecheck              Run TypeScript checks
npm run build                  Build the client
npm run check                  Run lint, typecheck, tests, and build
```

To scan Databricks explicitly:

```powershell
npm.cmd run monitor:live -- --source databricks-greenhouse --db data/internjobs.live.sqlite
```

## Local development boundaries

- Authentication is a seeded local development identity, not production authentication.
- In-app notifications and development email delivery records are stored locally; no real email is sent.
- `MONITOR_CONTACT_EMAIL` is optional locally. When supplied, it is appended to the outbound HTTP User-Agent and sent to the official source; it is not stored in SQLite. Production-mode monitoring requires a valid operator contact.
- SQLite, logs, environment files, test output, and generated local data are ignored by Git.
- There is no deployment configuration, managed database, production identity provider, hosted scheduler, or provider-backed email implementation.

See [Monitoring](docs/MONITORING.md) for source and failure-handling policy. Company logo assets retain their respective trademark ownership; provenance is recorded in [public/company-logos/README.md](public/company-logos/README.md).
