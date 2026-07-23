# InternJobs

InternJobs monitors official company hiring sources to help computer science students discover internships and new-grad roles before they miss them.

![InternJobs Discover page showing live roles from official company sources] (docs/images/internjobs-discover.png)

Unlike general job boards and community-maintained lists, InternJobs treats employer career systems as the source of truth. It preserves official publication dates, detects posting changes and closures, and keeps saved application history after a role disappears.

## Why I built it

Students often track dozens of companies through spreadsheets, GitHub lists, Discord servers, and individual career pages. This makes it easy to discover openings late, forget a company, or confuse an old listing with a newly published one.

InternJobs is designed to:

- monitor official employer hiring sources
- identify technical internships and explicit new-grad roles
- distinguish employer publication time from monitor discovery time
- organize followed companies, saved roles, and applications
- retain application history after official postings close

## Current features

### Official-source ingestion

Live monitoring is currently enabled for the official Greenhouse boards of:

- Cloudflare
- Figma
- Databricks

Every source is normalized into a shared internal job model. Ashby and Lever adapters are also implemented and tested, but are not yet enabled in the reviewed live-source catalog.

### Early-career classification

A deterministic classifier evaluates:

- internship and new-grad language
- software engineering, data science, ML/AI, networking, and infrastructure roles
- degree and graduation-year requirements
- United States eligibility
- compensation and work-style language

Postings are classified as included, excluded, or review-required so uncertain roles are not silently presented as valid matches.

### Posting lifecycle tracking

InternJobs tracks official postings across repeated source checks and supports:

- duplicate prevention
- idempotent updates
- content-change detection
- first-seen and last-seen timestamps
- closure confirmation across multiple successful scans
- reopen detection using stable source IDs
- preservation of saved and applied roles after closure

Failed, partial, malformed, protected, or suspiciously empty scans cannot close active jobs.

### Student workspace

The React interface includes:

- Discover
- Following
- My Roles
- search and filtering
- saved opportunities
- application-stage tracking
- role and company details
- official-source health information

## Engineering highlights

### Bulk-first ingestion

Large career boards can expose hundreds of unrelated senior positions. The ingestion pipeline performs one description-aware bulk request, classifies postings in memory, and requests individual job details only for possible student or early-career roles.

For the Databricks Greenhouse board, this reduced first-run requests from:

- **802 requests to 6**

Repeat scans normally require only the single bulk-board request when no qualifying posting has changed.

### Compact posting ledger

The database separates source monitoring from product-facing job records.

Every official posting receives a compact ledger entry containing its stable identity, content hash, classification state, observation timestamps, and lifecycle state. Full descriptions and normalized job data are stored only for included or review-required roles.

This reduced the live SQLite database from:

- **94 MB to 1.65 MB**
- **1,235 full records to 5 materialized relevant records**

All **1,235 official posting IDs** remain tracked for changes, closures, and reopenings.

### Timestamp integrity

InternJobs stores four separate timestamps:

- `source_published_at` — when the employer first published the role
- `source_updated_at` — when the employer last updated it
- `first_seen_at` — when InternJobs first detected it
- `last_seen_at` — the latest successful observation

This prevents an older posting discovered today from being incorrectly displayed as newly published.

## Architecture

```text
Official ATS boards
        ↓
Source adapters
        ↓
Classification and extraction
        ↓
Compact posting-state ledger
        ↓
Relevant job materialization
        ↓
Express API
        ↓
React interface
```

Monitoring runs independently from user-facing API requests so a slow or unavailable employer source cannot block the application.

## AI-assisted development

I used Codex as a default engineering collaborator for architecture exploration, implementation, debugging, test generation, and code review.

I retained ownership of product requirements, source policy, data modeling, and final implementation decisions. Changes were accepted only after inspecting the code, running the validation suite, and checking behavior against official ATS responses.

Human judgment was especially important when separating employer publication dates from discovery dates and preventing failed or suspicious scans from incorrectly closing valid roles.

## Technology

### Application

- React
- TypeScript
- Node.js
- Express
- SQLite
- Vite

### Data pipeline

- Greenhouse public Job Board API
- Ashby and Lever source adapters
- deterministic classification
- compensation and requirements extraction
- lifecycle and source-health monitoring
- append-only database migrations

### Quality

- Vitest
- Testing Library
- Supertest
- ESLint
- TypeScript type checking
- production build validation

The test suite contains more than **200 tests** covering classification, ingestion, lifecycle behavior, persistence, API responses, and interface rendering.

## Run locally

Requirements:

- Node.js 22 or newer
- npm

```bash
git clone https://github.com/Orbe1/official-job-monitor.git
cd official-job-monitor
npm ci
npm run dev
```

Open:

```text
http://127.0.0.1:5173/discover
```

Run the complete validation suite:

```bash
npm run check
```

This runs linting, type checking, automated tests, and the production build.

## Current status

InternJobs is a working local prototype using live public Greenhouse data.

Currently:

- SQLite is the configured database
- authentication uses a local development identity
- monitoring is explicit, local, and rate-limited
- notifications and email delivery remain development-only
- no public deployment is currently available

The next milestones are enabling reviewed Ashby sources, adding continuous integration, and creating a public read-only deployment.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Monitoring behavior](docs/MONITORING.md)
- [Implementation status](IMPLEMENTATION_STATUS.md)
