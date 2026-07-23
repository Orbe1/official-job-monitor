# Official-source monitoring

## Source policy

Only publicly accessible official employer career systems are eligible. An employer-owned careers page or its public ATS board can be authoritative. Aggregators, community lists, and user submissions may be discovery signals, but they cannot publish a verified active job by themselves.

Monitoring never attempts to bypass sign-in, CAPTCHAs, bot protection, access controls, or rate limits. A source that cannot be checked respectfully is marked unsupported or review-required.

## Greenhouse run pipeline

1. Claim one due enabled source.
2. Fetch the complete accessible Greenhouse board.
3. Validate transport and response shape before interpreting an empty result.
4. Normalize the bulk response in memory and run the conservative US student/early-career first pass.
5. Request individual job detail only for possible candidates, US review-required roles, or confirmed reopens that need publication metadata.
6. Apply deterministic final classification and public-product geography rules.
7. Detect duplicate IDs and suspicious structural or count changes.
8. In one transaction, update the all-ID compact ledger, materialize included/review roles, and persist run diagnostics, source health, and matching alerts.
9. Reschedule using the source interval plus jitter, or use exponential backoff after failure.

The bulk request retains `content=true` for now. That preserves description-aware review detection and current extraction behavior while eliminating irrelevant per-job requests and storage. Bulk payload reduction would require a separately tested source contract.

## Storage boundary

`source_posting_states` is authoritative for source completeness and lifecycle comparison. Every official ID receives a small row containing its content hash, decision state, source/check timestamps, first and last observation times, and closure-confirmation state.

The `jobs` table and its location, snapshot, description, and history children exist only for included or review-required roles. A previously materialized excluded role is retained when user activity or an Emerging link depends on it; this protects Tracker history.

## Lifecycle safety

A job is not closed because a request failed or because it is absent once. Only a complete successful run without suspicious flags can advance its missing confirmation count. The default policy requires two complete successful absences separated by the expected source interval.

Unexpected zero results, large count drops, partial responses, login-like content, bot protection, malformed data, or duplicate stable IDs suppress closure and open an incident. Failed or suspicious runs do not mutate posting availability.

If a closed stable posting ID returns, the compact state is reopened. A materialized role mirrors that lifecycle event, and publication detail may be refreshed to detect a clear republish. Saved or applied jobs remain in Tracker even when the official posting closes.

## HTTP behavior

- Descriptive User-Agent; operator contact is optional locally and required only in production mode.
- Abortable request timeout.
- Low global and per-host concurrency.
- Source-specific minimum request interval.
- At most two retries for transient failures, honoring `Retry-After` and adding jitter.
- Authentication, CAPTCHA, and bot-protection responses are not retried as ordinary transient errors.
- Tests and `monitor:run` use committed fixtures; live polling is explicit.

## Local live scope

`config/live-sources.json` is the reviewed source of truth and contains public identifiers only—never credentials, authenticated URLs, or private endpoints. The launcher is locked to exactly three enabled Greenhouse sources:

- `cloudflare-greenhouse`
- `figma-greenhouse`
- `databricks-greenhouse`

All other catalog entries remain disabled and are not fetched.

1. Run `npm run dev`.
2. The launcher creates or migrates `data/internjobs.live.sqlite`, rejects sample records, and synchronizes the catalog.
3. It refreshes a source when a successful proof is missing or `--refresh` is supplied.
4. Every enabled source must have a clean complete proof. At least one source must also have an active public US role before the UI starts.
5. Later launches reuse the stored proof unless explicitly refreshed.

When `MONITOR_CONTACT_EMAIL` or `--contact-email` is supplied locally, the address is appended to the outbound User-Agent and sent to Greenhouse. It is held only in process memory and is not stored in SQLite. With no local contact, the generic monitor User-Agent is sent without an address. `NODE_ENV=production` requires a valid non-reserved operator address before monitoring begins.

Unknown or ambiguous geography is stored as `UNKNOWN`, never silently treated as United States. Discover exposes only confidently classified US technical internships and explicit new-grad roles.
