// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { applyMigrations } from "../../scripts/migrate";
import { openDatabase } from "../../src/server/database";

it("adds effective technical categories without rebuilding existing jobs or children", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internjobs-category-migration-"));
  const databasePath = path.join(temporaryRoot, "migration.sqlite");
  const initialMigrations = path.join(temporaryRoot, "initial-migrations");
  fs.mkdirSync(initialMigrations);
  for (const filename of [
    "0001_initial_schema.sql",
    "0002_user_preferences.sql",
    "0003_source_scheduling.sql",
    "0004_active_relevant_jobs_enabled_sources.sql",
  ]) {
    fs.copyFileSync(path.resolve("db", "migrations", filename), path.join(initialMigrations, filename));
  }

  const database = openDatabase({ filename: databasePath });
  try {
    applyMigrations(database, initialMigrations);
    const observedAt = "2026-07-22T00:00:00.000Z";
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
    database.prepare(`
      INSERT INTO jobs (
        id, company_id, source_id, external_job_id, canonical_url, application_url,
        title, normalized_title, audience, technical_category, employment_type,
        posted_at,
        first_seen_at, last_seen_at, last_source_check_at,
        classification_confidence, source_confidence, created_at, updated_at
      ) VALUES (
        'job-test', 'company-test', 'source-test', 'external-test',
        'https://test.invalid/jobs/1', 'https://test.invalid/jobs/1',
        'Software Engineer Intern', 'software engineer intern', 'internship', 'software', 'Intern',
        '2026-07-20T09:00:00.000Z', ?, ?, ?, 0.97, 0.98, ?, ?
      )
    `).run(observedAt, observedAt, observedAt, observedAt, observedAt);
    database.prepare(`
      INSERT INTO job_snapshots (
        id, job_id, observed_at, snapshot_hash, change_kind,
        normalized_payload_json, parser_version, created_at
      ) VALUES ('snapshot-test', 'job-test', ?, 'hash', 'first_seen', '{}', 'test', ?)
    `).run(observedAt, observedAt);

    const result = applyMigrations(database);

    expect(result.applied).toEqual([
      "0005_effective_technical_category.sql",
      "0006_greenhouse_source_timestamps.sql",
      "0007_data_science_technical_category.sql",
      "0008_compact_source_posting_states.sql",
      "0009_product_management_technical_category.sql",
    ]);
    expect(database.prepare(
      `SELECT id, technical_category, effective_technical_category,
              source_published_at, source_updated_at, review_required,
              source_posting_state_id
       FROM jobs WHERE id = 'job-test'`,
    ).get()).toEqual({
      id: "job-test",
      technical_category: "software",
      effective_technical_category: "software",
      source_published_at: "2026-07-20T09:00:00.000Z",
      source_updated_at: null,
      review_required: 0,
      source_posting_state_id: "job-test",
    });
    expect(database.prepare(
      `SELECT id, source_id, external_job_id, classification_state
       FROM source_posting_states WHERE id = 'job-test'`,
    ).get()).toEqual({
      id: "job-test",
      source_id: "source-test",
      external_job_id: "external-test",
      classification_state: "included",
    });
    expect(database.prepare("SELECT job_id FROM job_snapshots WHERE id = 'snapshot-test'").get())
      .toEqual({ job_id: "job-test" });
    expect(database.prepare(
      "SELECT code FROM technical_category_codes WHERE code = 'data_science'",
    ).get()).toEqual({ code: "data_science" });
    expect(database.prepare(
      "SELECT code FROM technical_category_codes WHERE code = 'product_management'",
    ).get()).toEqual({ code: "product_management" });
    expect(database.pragma("foreign_key_check")).toEqual([]);
  } finally {
    database.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
