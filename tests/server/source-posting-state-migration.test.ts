// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyMigrations } from "../../scripts/migrate";
import { openDatabase } from "../../src/server/database";

it("backfills compact posting states, preserves review and tracked jobs, and prunes safe exclusions", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internjobs-posting-state-migration-"));
  const databasePath = path.join(temporaryRoot, "migration.sqlite");
  const priorMigrations = path.join(temporaryRoot, "prior-migrations");
  fs.mkdirSync(priorMigrations);
  for (const filename of [
    "0001_initial_schema.sql",
    "0002_user_preferences.sql",
    "0003_source_scheduling.sql",
    "0004_active_relevant_jobs_enabled_sources.sql",
    "0005_effective_technical_category.sql",
    "0006_greenhouse_source_timestamps.sql",
    "0007_data_science_technical_category.sql",
  ]) {
    fs.copyFileSync(path.resolve("db", "migrations", filename), path.join(priorMigrations, filename));
  }

  const database = openDatabase({ filename: databasePath });
  try {
    applyMigrations(database, priorMigrations);
    const observedAt = "2026-07-22T12:00:00.000Z";
    database.prepare(`
      INSERT INTO users (
        id, auth_subject, email, name, initials, created_at, updated_at
      ) VALUES ('user-test', 'development:test', 'test@local.invalid',
        'Test User', 'TU', ?, ?)
    `).run(observedAt, observedAt);
    database.prepare(`
      INSERT INTO companies (
        id, slug, name, domain, career_url, initials, created_at, updated_at
      ) VALUES ('company-test', 'test', 'Test', 'test.invalid',
        'https://test.invalid/careers', 'T', ?, ?)
    `).run(observedAt, observedAt);
    database.prepare(`
      INSERT INTO sources (
        id, company_id, display_name, adapter_kind, official_url, created_at, updated_at
      ) VALUES ('source-test', 'company-test', 'Test source', 'greenhouse',
        'https://test.invalid/careers', ?, ?)
    `).run(observedAt, observedAt);

    const insertJob = database.prepare(`
      INSERT INTO jobs (
        id, company_id, source_id, external_job_id, canonical_url, application_url,
        title, normalized_title, audience, technical_category, effective_technical_category,
        employment_type, description, first_seen_at, last_seen_at,
        last_source_check_at, is_relevant, classification_confidence,
        source_confidence, snapshot_hash, created_at, updated_at
      ) VALUES (?, 'company-test', 'source-test', ?, ?, ?, ?, ?, 'ambiguous',
        'software', 'software', 'Full time', ?, ?, ?, ?, 0, 0.92, 0.98, ?, ?, ?)
    `);
    for (const role of [
      { id: "job-excluded", review: false },
      { id: "job-review", review: true },
      { id: "job-tracked", review: false },
    ]) {
      const externalId = role.id.replace("job-", "external-");
      const url = `https://test.invalid/jobs/${externalId}`;
      insertJob.run(
        role.id,
        externalId,
        url,
        url,
        `Role ${externalId}`,
        `role ${externalId}`,
        `Complete description for ${externalId}`,
        observedAt,
        observedAt,
        observedAt,
        `hash-${externalId}`,
        observedAt,
        observedAt,
      );
      database.prepare(`
        INSERT INTO job_snapshots (
          id, job_id, observed_at, snapshot_hash, change_kind,
          normalized_payload_json, raw_payload_json, parser_version, created_at
        ) VALUES (?, ?, ?, ?, 'first_seen', ?, ?, 'test', ?)
      `).run(
        `snapshot-${role.id}`,
        role.id,
        observedAt,
        `hash-${externalId}`,
        JSON.stringify({ classification: { reviewRequired: role.review } }),
        JSON.stringify({ completeDescription: externalId }),
        observedAt,
      );
    }
    database.prepare(`
      INSERT INTO user_job_states (
        user_id, job_id, saved, stage, notes, created_at, updated_at
      ) VALUES ('user-test', 'job-tracked', 1, 'saved', '', ?, ?)
    `).run(observedAt, observedAt);

    expect(applyMigrations(database).applied).toEqual([
      "0008_compact_source_posting_states.sql",
      "0009_product_management_technical_category.sql",
    ]);

    expect(database.prepare(
      `SELECT external_job_id, classification_state
       FROM source_posting_states ORDER BY external_job_id`,
    ).all()).toEqual([
      { external_job_id: "external-excluded", classification_state: "excluded" },
      { external_job_id: "external-review", classification_state: "review_required" },
      { external_job_id: "external-tracked", classification_state: "excluded" },
    ]);
    expect(database.prepare(
      "SELECT id, review_required FROM jobs ORDER BY id",
    ).all()).toEqual([
      { id: "job-review", review_required: 1 },
      { id: "job-tracked", review_required: 0 },
    ]);
    expect(database.prepare(
      "SELECT count(*) AS count FROM job_snapshots WHERE job_id = 'job-excluded'",
    ).get()).toEqual({ count: 0 });
    expect(database.prepare(
      "SELECT job_id FROM user_job_states WHERE user_id = 'user-test'",
    ).get()).toEqual({ job_id: "job-tracked" });
    expect(database.pragma("foreign_key_check")).toEqual([]);
  } finally {
    database.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
