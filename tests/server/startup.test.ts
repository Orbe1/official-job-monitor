// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyMigrations } from "../../scripts/migrate";
import { openDatabase } from "../../src/server/database";
import { prepareServerRuntime } from "../../src/server/startup";

it("migrates a stale local database before reading and serializing nullable source timestamps", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internjobs-startup-migration-"));
  const databasePath = path.join(temporaryRoot, "stale-live.sqlite");
  const initialMigrations = path.join(temporaryRoot, "initial-migrations");
  fs.mkdirSync(initialMigrations);
  for (const filename of [
    "0001_initial_schema.sql",
    "0002_user_preferences.sql",
    "0003_source_scheduling.sql",
    "0004_active_relevant_jobs_enabled_sources.sql",
    "0005_effective_technical_category.sql",
  ]) {
    fs.copyFileSync(path.resolve("db", "migrations", filename), path.join(initialMigrations, filename));
  }

  const database = openDatabase({ filename: databasePath });
  try {
    applyMigrations(database, initialMigrations);
    const observedAt = "2026-07-22T01:48:18.091Z";
    database.prepare(`
      INSERT INTO users (
        id, email, name, initials, created_at, updated_at
      ) VALUES ('user-local-dev', 'local@internjobs.dev', 'Local Developer', 'LD', ?, ?)
    `).run(observedAt, observedAt);
    database.prepare(`
      INSERT INTO companies (
        id, slug, name, domain, career_url, initials, monitoring_state, created_at, updated_at
      ) VALUES ('company-cloudflare', 'cloudflare', 'Cloudflare', 'cloudflare.com',
        'https://www.cloudflare.com/careers/jobs/', 'C', 'healthy', ?, ?)
    `).run(observedAt, observedAt);
    database.prepare(`
      INSERT INTO sources (
        id, company_id, display_name, adapter_kind, official_url, health, created_at, updated_at
      ) VALUES ('cloudflare-greenhouse', 'company-cloudflare', 'Cloudflare Greenhouse', 'greenhouse',
        'https://boards.greenhouse.io/cloudflare', 'healthy', ?, ?)
    `).run(observedAt, observedAt);
    database.prepare(`
      INSERT INTO jobs (
        id, company_id, source_id, external_job_id, canonical_url, application_url,
        title, normalized_title, audience, technical_category, effective_technical_category,
        employment_type, country, posted_at, first_seen_at, last_seen_at,
        last_source_check_at, classification_confidence, source_confidence, created_at, updated_at
      ) VALUES (
        'job-cloudflare-8052785', 'company-cloudflare', 'cloudflare-greenhouse', '8052785',
        'https://boards.greenhouse.io/cloudflare/jobs/8052785',
        'https://boards.greenhouse.io/cloudflare/jobs/8052785',
        'Software Engineer Intern (Fall 2026) - Austin, TX',
        'software engineer intern fall 2026 austin tx', 'internship', 'software', 'software',
        'Intern', 'US', NULL, ?, ?, ?, 0.99, 1, ?, ?
      )
    `).run(observedAt, observedAt, observedAt, observedAt, observedAt);

    expect(() => prepareServerRuntime(database, {
      productionAuthRequested: false,
      applyPendingMigrations: false,
    })).toThrow("no such column: j.source_published_at");

    const runtime = prepareServerRuntime(database, {
      productionAuthRequested: false,
      applyPendingMigrations: true,
    });
    if (!runtime.bootstrap) throw new Error("Expected a local bootstrap payload.");

    expect(database.prepare(
      "SELECT name FROM schema_migrations WHERE name = '0006_greenhouse_source_timestamps.sql'",
    ).get()).toEqual({ name: "0006_greenhouse_source_timestamps.sql" });
    expect(database.prepare(`
      SELECT source_published_at, source_updated_at, source_publication_checked_at
      FROM jobs WHERE id = 'job-cloudflare-8052785'
    `).get()).toEqual({
      source_published_at: null,
      source_updated_at: null,
      source_publication_checked_at: null,
    });
    expect(runtime.bootstrap.jobs).toHaveLength(1);
    expect(runtime.bootstrap.jobs[0]).toMatchObject({
      externalJobId: "8052785",
      postedAt: null,
      sourcePublishedAt: null,
      sourceUpdatedAt: null,
      firstSeenAt: observedAt,
    });
    expect(() => JSON.stringify(runtime.bootstrap)).not.toThrow();
  } finally {
    database.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
