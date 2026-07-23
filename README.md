# Official Job Monitor

Official Job Monitor is a full-stack platform that helps computer science students discover internships and early-career technical roles directly from official company hiring sources.

The platform monitors employer career boards, classifies relevant opportunities, extracts structured details such as compensation and eligibility, and keeps listings synchronized as companies publish, update, close, or reopen roles.

Built with React, TypeScript, Node.js, Express, and SQLite.

## Why I built it

Students often track dozens of companies across spreadsheets, GitHub lists, Discord servers, and individual career pages. Roles are easy to discover late, and many job boards mix student opportunities with hundreds of unrelated senior positions.

Official Job Monitor is designed around a different workflow:

- monitor companies directly;
- identify relevant internship and new-grad roles;
- preserve official posting dates separately from discovery dates;
- organize saved and applied roles;
- retain application history after postings close.

## Current features

### Live official job ingestion

The application currently integrates with official Greenhouse boards for:

- Cloudflare
- Figma
- Databricks

Each source is fetched from the employer’s public hiring system and normalized into a shared internal job model.

### Student and early-career classification

A deterministic classifier identifies:

- internships;
- explicit new-graduate roles;
- software engineering;
- data science;
- machine learning and AI;
- networking and infrastructure;
- technical support;
- technical product management.

The classifier also distinguishes included, excluded, and review-required roles so uncertain postings are not silently treated as valid matches.

### Structured job extraction

The ingestion pipeline extracts and preserves:

- official publication and update timestamps;
- location;
- remote and work-style language;
- compensation ranges;
- degree requirements;
- graduation-year requirements;
- internship or new-grad audience;
- technical category;
- source-specific decision reasoning.

Location-specific compensation ranges remain separate to avoid displaying misleading combined salary values.

### Reliable posting lifecycle

The monitor tracks each official posting across repeated scans.

It supports:

- idempotent updates;
- duplicate prevention;
- first-seen and last-seen timestamps;
- confirmed closure after repeated absences;
- reopen detection using stable source IDs;
- protection against failed, partial, malformed, or suspiciously empty scans;
- preservation of saved and applied roles after the official listing closes.

### Job discovery and tracking interface

The React interface includes:

- Discover
- Following
- Tracker
- Settings
- source-health diagnostics

Users can inspect role details, save opportunities, track application stages, and view official posting status.

Company logos and company-specific visual accents are used throughout the browsing experience, with accessible initials fallbacks when an asset is unavailable.

## Engineering highlights

### Compact two-level storage model

The system separates source monitoring from product-facing job records.

Every official posting receives a compact ledger entry containing only the information required for:

- source identity;
- content-change detection;
- classification state;
- first and last observation;
- closure confirmation;
- reopen handling.

Full descriptions, locations, compensation, snapshots, and normalized job data are stored only for included or review-required roles.

During the Databricks integration, this reduced the live SQLite database from approximately:

- **94 MB to 1.65 MB**
- **1,235 full job records to 5 materialized relevant records**

All 1,235 official posting IDs remain safely tracked through the compact ledger.

### Efficient large-board ingestion

Databricks currently exposes more than 800 postings through its Greenhouse board.

The initial implementation made one detail request for every posting. The optimized pipeline performs a description-aware first pass and requests individual details only for possible student or early-career candidates.

Databricks first-run requests were reduced from:

- **802 requests**
- to **6 requests**

Repeat scans normally require only the single bulk-board request when no qualifying posting has changed.

### Source timestamp integrity

The application keeps employer timestamps separate from internal monitoring timestamps:

- `source_published_at` — when the employer first published the role;
- `source_updated_at` — when the employer last updated it;
- `first_seen_at` — when Official Job Monitor first detected it;
- `last_seen_at` — the latest successful observation.

This prevents a newly discovered older posting from being incorrectly presented as newly published.

## Tech stack

### Frontend

- React
- TypeScript
- Vite
- React Router

### Backend

- Node.js
- Express
- TypeScript
- SQLite

### Data pipeline

- Greenhouse public job-board APIs
- deterministic classification
- requirements extraction
- compensation parsing
- work-style parsing
- source-health monitoring
- append-only database migrations

### Quality

- ESLint
- TypeScript type checking
- automated tests
- production build validation

The current test suite contains more than 200 tests covering classification, ingestion, lifecycle behavior, persistence, API responses, and interface rendering.

## Architecture

```text
Official Greenhouse board
        ↓
Bulk source adapter
        ↓
Classification and extraction
        ↓
Compact posting-state ledger
        ↓
Relevant role materialization
        ↓
Express API
        ↓
React interface
