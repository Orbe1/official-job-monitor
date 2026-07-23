# Operations, backup, and recovery

## Health signals

Monitor API readiness, request error rate, database write failures, worker heartbeat, due-source backlog, source success age, consecutive failures, run duration, count deltas, suspicious empty responses, unclassified student roles, notification backlog, and delivery failures.

The administrator source-health view is available through **Profile → Developer tools**, not primary student navigation. It is a diagnostic product surface and not a replacement for infrastructure alerting.

## Local backup

Stop the API/worker or use SQLite's online backup capability before copying the database. Back up the main database and validate it with `PRAGMA integrity_check`. Store backups outside the project directory and test a restore into a new path. Copying a database while WAL writes are active can produce an incomplete backup.

## Managed database backup

For PostgreSQL, enable encrypted automated backups and point-in-time recovery. Document retention and access. Run quarterly restore drills into an isolated environment and compare company/job/user counts plus a sample of snapshots and application histories.

## Incident response

- Source suddenly zero: pause closure advancement, open an incident, inspect response shape and public career page.
- Parser schema change: disable only the affected source, preserve active jobs, update fixture and parser, then run reconciliation.
- Suspected credential leak: revoke at the provider, rotate, audit logs, and redeploy; do not merely edit `.env`.
- Incorrect mass closure: disable monitor writes, restore availability from lifecycle events/snapshot, fix the confirmation guard, and notify affected users if alerts were sent.
- Database corruption: stop writes, preserve the damaged files for analysis, restore the newest validated backup, and replay only auditable events.

## Rate-limit review

Every source configuration must record expected interval and support status. Adding a company is an operational change: test with fixtures, make one respectful live check, inspect headers and pagination, then enable at a conservative interval. Do not increase frequency to compensate for parser failures.
