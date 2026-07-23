# Deployment guide

## Local and personal use

Follow the root README; the default process environment already uses development identity and fixture monitoring. `.env.example` is the configuration reference. When overriding it, load those values through the shell, process manager, or hosting environment and retain `AUTH_MODE=development` plus `MONITOR_MODE=fixture` for local evaluation. The SQLite file and local delivery artifacts live under `data/` and are intentionally ignored by Git.

## Private hosted evaluation

A single-instance container may mount a durable volume at `/app/data` and run the built API/client. This is suitable only for a controlled evaluation with one process and a small number of invited users. Put TLS and access control in front of it. Do not expose development auth to the public internet.

## Public beta prerequisites

- Implement and test the PostgreSQL repository/migration path.
- Configure OIDC or another maintained authentication provider and disable development identity.
- Run web and worker as separate services from the same revision.
- Set a real monitor user agent/contact and review every enabled live source.
- Add a managed email provider only after bounce, complaint, retry, and unsubscribe behavior is implemented.
- Configure centralized structured logs, error reporting, worker heartbeat alerts, and source-health paging.
- Use managed PostgreSQL backups with point-in-time recovery and perform a restore drill.
- Establish retention, privacy, terms, abuse, and security-response policies.

## Release procedure

1. Run `npm ci` and `npm run check` from a clean checkout.
2. Back up the database and verify free space.
3. Run append-only migrations once as a release job.
4. Deploy the API/client, check `/api/health`, then deploy the worker.
5. Confirm worker heartbeat without enabling new sources.
6. Enable or resume sources in small batches and inspect suspicious-change flags.
7. Roll back application code if needed; never roll migrations backward by deleting user data.

## Required secrets

Production database, auth client secret, and delivery provider credentials belong in the hosting platform secret store. They must never be baked into the image, checked into Git, logged, or returned by a health endpoint.
