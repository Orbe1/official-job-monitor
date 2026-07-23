import crypto from "node:crypto";

import type BetterSqlite3 from "better-sqlite3";

import { isDirectExecution, openDatabase, resolveDatabasePath } from "./database";
import { applyMigrations } from "./migrate";
import {
  SAMPLE_COMPANIES,
  SAMPLE_GROUPS,
  SAMPLE_JOBS,
  SAMPLE_SEED_TIMESTAMP,
  SAMPLE_SOURCES,
  SAMPLE_USER_ID,
  type SeedJob,
  type SeedSource,
} from "./seed-data";

type SqlValue = string | number | bigint | Buffer | null;
type SqlRow = Record<string, SqlValue>;

export interface SeedResult {
  databasePath: string;
  users: number;
  companies: number;
  sources: number;
  activeJobs: number;
  closedJobs: number;
  sourceRuns: number;
  incidents: number;
  notifications: number;
  emergingCandidates: number;
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertSqlIdentifier(identifier: string): void {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier in seed data: ${identifier}`);
  }
}

function upsertRows(
  database: BetterSqlite3.Database,
  table: string,
  conflictColumns: string[],
  rows: SqlRow[],
): void {
  if (rows.length === 0) {
    return;
  }

  assertSqlIdentifier(table);
  conflictColumns.forEach(assertSqlIdentifier);

  const columns = Object.keys(rows[0]);
  columns.forEach(assertSqlIdentifier);

  for (const row of rows) {
    const rowColumns = Object.keys(row);
    if (rowColumns.length !== columns.length || rowColumns.some((column, index) => column !== columns[index])) {
      throw new Error(`Inconsistent columns while seeding ${table}`);
    }
  }

  const mutableColumns = columns.filter((column) => !conflictColumns.includes(column));
  const conflictAction =
    mutableColumns.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${mutableColumns.map((column) => `${column} = excluded.${column}`).join(", ")}`;
  const statement = database.prepare(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ` +
      `ON CONFLICT (${conflictColumns.join(", ")}) ${conflictAction}`,
  );

  for (const row of rows) {
    statement.run(...columns.map((column) => row[column]));
  }
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function companyId(slug: string): string {
  return `company-${slug}`;
}

function sourceId(slug: string): string {
  const liveRegistryIds: Record<string, string> = {
    benchling: "benchling-ashby",
    figma: "figma-greenhouse",
    palantir: "palantir-lever",
  };
  return liveRegistryIds[slug] ?? `source-${slug}`;
}

function sampleUrl(job: SeedJob): string {
  return `https://example.invalid/internjobs-local-sample/${encodeURIComponent(job.id)}`;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function completedAt(startedAt: string | null, durationMs: number | null): string | null {
  if (!startedAt) {
    return null;
  }

  return new Date(Date.parse(startedAt) + (durationMs ?? 0)).toISOString();
}

function sourceRunStatus(source: SeedSource): "success" | "degraded" | "failed" | "unsupported" {
  switch (source.health) {
    case "healthy":
    case "stale":
      return "success";
    case "degraded":
      return "degraded";
    case "failing":
      return "failed";
    case "unsupported":
      return "unsupported";
  }
}

function sourceRunCompleteness(source: SeedSource): "complete" | "partial" | "unknown" {
  if (source.health === "healthy" || source.health === "stale") {
    return "complete";
  }
  return source.health === "degraded" ? "partial" : "unknown";
}

function sourceDiagnostics(source: SeedSource): string[] {
  if (source.health === "healthy") {
    return ["Local sample run completed from a static official-source-shaped fixture."];
  }

  if (source.health === "stale") {
    return ["The last sample run succeeded, but the expected monitoring interval has elapsed."];
  }

  return [source.errorDetails ?? `Local sample source is ${source.health}.`];
}

function latestSourceRunRows(): SqlRow[] {
  return SAMPLE_SOURCES.map((source) => {
    const status = sourceRunStatus(source);
    const completeness = sourceRunCompleteness(source);
    const closureEligible = status === "success" && completeness === "complete";
    return {
      id: `run-${source.id}-latest`,
      source_id: source.id,
      started_at: source.lastAttemptAt ?? SAMPLE_SEED_TIMESTAMP,
      completed_at: completedAt(source.lastAttemptAt, source.durationMs),
      status,
      completeness,
      closure_eligible: Number(closureEligible),
      http_status: source.httpStatus,
      transport_status: source.httpStatus === null ? null : "http",
      parser_status: source.parserStatus,
      parser_version: source.parserVersion,
      pages_retrieved: source.pagesRetrieved,
      total_jobs: source.totalJobs,
      previous_total_jobs: source.previousTotalJobs,
      relevant_jobs: source.relevantJobs,
      new_jobs: source.health === "healthy" && source.lastNewRoleAt?.startsWith("2026-07-09") ? 1 : 0,
      changed_jobs: source.health === "healthy" ? 1 : 0,
      missing_jobs: 0,
      duration_ms: source.durationMs,
      response_hash: source.health === "healthy" || source.health === "stale" ? stableHash({ source: source.id, total: source.totalJobs }) : null,
      diagnostics_json: json(sourceDiagnostics(source)),
      suspicious_flags_json: json(source.suspiciousFlags),
      error_details: source.errorDetails,
      is_sample: 1,
      created_at: source.lastAttemptAt ?? SAMPLE_SEED_TIMESTAMP,
    };
  });
}

function priorSourceRunRows(): SqlRow[] {
  return [
    {
      id: "run-source-apple-prior-success",
      source_id: "source-apple",
      started_at: "2026-07-08T14:45:00.000Z",
      completed_at: "2026-07-08T14:45:01.120Z",
      status: "success",
      completeness: "complete",
      closure_eligible: 1,
      http_status: 200,
      transport_status: "http",
      parser_status: "ok",
      parser_version: "sample-fixture-v1",
      pages_retrieved: 6,
      total_jobs: 142,
      previous_total_jobs: 140,
      relevant_jobs: 2,
      new_jobs: 1,
      changed_jobs: 0,
      missing_jobs: 0,
      duration_ms: 1120,
      response_hash: stableHash({ source: "source-apple", at: "2026-07-08", total: 142 }),
      diagnostics_json: json(["Prior successful sample run used as the last trustworthy closure observation."]),
      suspicious_flags_json: "[]",
      error_details: null,
      is_sample: 1,
      created_at: "2026-07-08T14:45:00.000Z",
    },
    {
      id: "run-source-anthropic-prior-success",
      source_id: "source-anthropic",
      started_at: "2026-07-07T12:10:00.000Z",
      completed_at: "2026-07-07T12:10:00.590Z",
      status: "success",
      completeness: "complete",
      closure_eligible: 1,
      http_status: 200,
      transport_status: "http",
      parser_status: "ok",
      parser_version: "sample-fixture-v1",
      pages_retrieved: 1,
      total_jobs: 71,
      previous_total_jobs: 70,
      relevant_jobs: 1,
      new_jobs: 0,
      changed_jobs: 1,
      missing_jobs: 0,
      duration_ms: 590,
      response_hash: stableHash({ source: "source-anthropic", at: "2026-07-07", total: 71 }),
      diagnostics_json: json(["Prior successful sample run remains authoritative while backoff is active."]),
      suspicious_flags_json: "[]",
      error_details: null,
      is_sample: 1,
      created_at: "2026-07-07T12:10:00.000Z",
    },
    {
      id: "run-source-google-prior-success",
      source_id: "source-google",
      started_at: "2026-06-30T13:20:00.000Z",
      completed_at: "2026-06-30T13:20:02.030Z",
      status: "success",
      completeness: "complete",
      closure_eligible: 1,
      http_status: 200,
      transport_status: "http",
      parser_status: "ok",
      parser_version: "sample-fixture-v1",
      pages_retrieved: 7,
      total_jobs: 315,
      previous_total_jobs: 311,
      relevant_jobs: 1,
      new_jobs: 1,
      changed_jobs: 0,
      missing_jobs: 0,
      duration_ms: 2030,
      response_hash: stableHash({ source: "source-google", at: "2026-06-30", total: 315 }),
      diagnostics_json: json(["Historical sample success recorded before this source was marked unsupported."]),
      suspicious_flags_json: "[]",
      error_details: null,
      is_sample: 1,
      created_at: "2026-06-30T13:20:00.000Z",
    },
    {
      id: "run-source-cloudflare-parser-warning",
      source_id: "source-cloudflare",
      started_at: "2026-07-02T11:00:00.000Z",
      completed_at: "2026-07-02T11:00:00.410Z",
      status: "degraded",
      completeness: "partial",
      closure_eligible: 0,
      http_status: 200,
      transport_status: "http",
      parser_status: "warning",
      parser_version: "sample-fixture-v0",
      pages_retrieved: 1,
      total_jobs: 118,
      previous_total_jobs: 130,
      relevant_jobs: 0,
      new_jobs: 0,
      changed_jobs: 0,
      missing_jobs: 0,
      duration_ms: 410,
      response_hash: stableHash({ source: "source-cloudflare", at: "2026-07-02", parser: "v0" }),
      diagnostics_json: json(["Sample parser warning: location fields were absent; closure processing was skipped."]),
      suspicious_flags_json: json(["common_field_missing"]),
      error_details: "Sample parser version could not find a formerly common location field.",
      is_sample: 1,
      created_at: "2026-07-02T11:00:00.000Z",
    },
  ];
}

function successfulRunIdForJob(job: SeedJob): string | null {
  if (job.availability === "closed") {
    return null;
  }

  const priorRuns: Record<string, string> = {
    apple: "run-source-apple-prior-success",
    anthropic: "run-source-anthropic-prior-success",
    google: "run-source-google-prior-success",
  };
  return priorRuns[job.companySlug] ?? `run-${sourceId(job.companySlug)}-latest`;
}

function daysBetween(openedAt: string, closedAt: string): number {
  return Math.max(0, Math.round((Date.parse(closedAt) - Date.parse(openedAt)) / 86_400_000));
}

function seedRows(database: BetterSqlite3.Database): void {
  upsertRows(database, "users", ["id"], [
    {
      id: SAMPLE_USER_ID,
      auth_subject: "development:local-user",
      email: "student@local.internjobs.invalid",
      name: "Local Student",
      initials: "LS",
      mode: "development",
      is_admin: 1,
      is_sample: 1,
      created_at: "2026-07-01T12:00:00.000Z",
      updated_at: SAMPLE_SEED_TIMESTAMP,
    },
  ]);

  upsertRows(
    database,
    "companies",
    ["id"],
    SAMPLE_COMPANIES.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      domain: item.domain,
      career_url: item.careerUrl,
      logo_url: item.logoUrl,
      initials: item.initials,
      category_tags_json: json(item.categoryTags),
      supported_role_types_json: json(["internship", "new_grad"]),
      compensation_signal: item.compensationSignal,
      compensation_disclaimer: item.compensationSignal
        ? "Estimate or historical signal only; compensation depends on role, level, location, and employer terms."
        : null,
      priority_tier: item.priorityTier,
      monitoring_state: item.monitoringState,
      is_sample: 1,
      created_at: "2026-07-01T12:00:00.000Z",
      updated_at: SAMPLE_SEED_TIMESTAMP,
    })),
  );

  upsertRows(
    database,
    "watchlist_groups",
    ["id"],
    SAMPLE_GROUPS.map((group, index) => ({
      id: group.id,
      owner_user_id: group.ownerUserId ?? null,
      slug: group.slug,
      name: group.name,
      description: group.description,
      group_type: group.ownerUserId ? "personal" : "curated",
      compensation_signal: Number(group.compensationSignal),
      sort_order: index,
      is_sample: 1,
      created_at: "2026-07-01T12:00:00.000Z",
      updated_at: SAMPLE_SEED_TIMESTAMP,
    })),
  );

  upsertRows(
    database,
    "watchlist_group_companies",
    ["group_id", "company_id"],
    SAMPLE_GROUPS.flatMap((group) =>
      group.companySlugs.map((slug, index) => ({
        group_id: group.id,
        company_id: companyId(slug),
        sort_order: index,
        added_at: "2026-07-01T12:00:00.000Z",
      })),
    ),
  );

  upsertRows(
    database,
    "sources",
    ["id"],
    SAMPLE_SOURCES.map((source) => ({
      id: source.id,
      company_id: companyId(source.companySlug),
      display_name: source.displayName,
      adapter_kind: source.adapterKind,
      official_url: source.officialUrl,
      config_json: json({ sample: true, networkEnabled: false, board: source.companySlug }),
      enabled: Number(source.enabled),
      health: source.health,
      expected_interval_minutes: source.expectedIntervalMinutes,
      minimum_request_interval_ms: 1500,
      request_timeout_ms: 15_000,
      closure_confirmation_runs: 2,
      last_attempt_at: source.lastAttemptAt,
      last_success_at: source.lastSuccessAt,
      last_failure_at: source.lastFailureAt,
      http_status: source.httpStatus,
      parser_status: source.parserStatus,
      parser_version: source.parserVersion,
      pages_retrieved: source.pagesRetrieved,
      total_jobs: source.totalJobs,
      previous_total_jobs: source.previousTotalJobs,
      relevant_jobs: source.relevantJobs,
      last_new_role_at: source.lastNewRoleAt,
      consecutive_failures: source.consecutiveFailures,
      duration_ms: source.durationMs,
      suspicious_flags_json: json(source.suspiciousFlags),
      error_details: source.errorDetails,
      is_sample: 1,
      created_at: "2026-07-01T12:00:00.000Z",
      updated_at: SAMPLE_SEED_TIMESTAMP,
    })),
  );

  upsertRows(database, "source_runs", ["id"], [...latestSourceRunRows(), ...priorSourceRunRows()]);

  upsertRows(database, "source_incidents", ["id"], [
    {
      id: "incident-apple-unexpected-empty",
      source_id: "source-apple",
      source_run_id: "run-source-apple-latest",
      incident_type: "unexpected_empty",
      severity: "critical",
      status: "open",
      title: "Unexpected empty Apple sample source",
      details: "The local sample run returned zero jobs after 142. Existing jobs remain available because the run is not closure-eligible.",
      opened_at: "2026-07-10T14:45:03.000Z",
      acknowledged_at: null,
      resolved_at: null,
      resolution_notes: null,
      is_sample: 1,
      created_at: "2026-07-10T14:45:03.000Z",
      updated_at: "2026-07-10T14:45:03.000Z",
    },
    {
      id: "incident-anthropic-rate-limit",
      source_id: "source-anthropic",
      source_run_id: "run-source-anthropic-latest",
      incident_type: "rate_limited",
      severity: "warning",
      status: "acknowledged",
      title: "Anthropic sample source is backing off",
      details: "The sample source returned HTTP 429. InternJobs does not bypass the limit and does not advance closure confirmation.",
      opened_at: "2026-07-10T12:10:01.000Z",
      acknowledged_at: "2026-07-10T12:20:00.000Z",
      resolved_at: null,
      resolution_notes: null,
      is_sample: 1,
      created_at: "2026-07-10T12:10:01.000Z",
      updated_at: "2026-07-10T12:20:00.000Z",
    },
    {
      id: "incident-two-sigma-stale",
      source_id: "source-two-sigma",
      source_run_id: "run-source-two-sigma-latest",
      incident_type: "success_interval_exceeded",
      severity: "warning",
      status: "open",
      title: "Two Sigma sample source is stale",
      details: "The last run succeeded, but no newer run arrived within the expected interval. Job availability is preserved.",
      opened_at: "2026-07-10T10:00:00.000Z",
      acknowledged_at: null,
      resolved_at: null,
      resolution_notes: null,
      is_sample: 1,
      created_at: "2026-07-10T10:00:00.000Z",
      updated_at: "2026-07-10T10:00:00.000Z",
    },
    {
      id: "incident-cloudflare-parser-resolved",
      source_id: "source-cloudflare",
      source_run_id: "run-source-cloudflare-parser-warning",
      incident_type: "common_field_missing",
      severity: "warning",
      status: "resolved",
      title: "Cloudflare sample parser field changed",
      details: "A sample fixture omitted location fields. A parser update restored the field on the next run.",
      opened_at: "2026-07-02T11:00:00.410Z",
      acknowledged_at: "2026-07-02T11:15:00.000Z",
      resolved_at: "2026-07-03T11:00:00.000Z",
      resolution_notes: "Updated the sample parser mapping; no jobs were closed during the partial run.",
      is_sample: 1,
      created_at: "2026-07-02T11:00:00.410Z",
      updated_at: "2026-07-03T11:00:00.000Z",
    },
    {
      id: "incident-google-unsupported",
      source_id: "source-google",
      source_run_id: "run-source-google-latest",
      incident_type: "unsupported_access",
      severity: "info",
      status: "acknowledged",
      title: "Google sample source marked unsupported",
      details: "The local scenario records access controls and disables monitoring instead of attempting a bypass.",
      opened_at: "2026-07-10T13:20:01.000Z",
      acknowledged_at: "2026-07-10T13:25:00.000Z",
      resolved_at: null,
      resolution_notes: null,
      is_sample: 1,
      created_at: "2026-07-10T13:20:01.000Z",
      updated_at: "2026-07-10T13:25:00.000Z",
    },
  ]);

  upsertRows(
    database,
    "source_posting_states",
    ["id"],
    SAMPLE_JOBS.map((job) => ({
      id: job.id,
      source_id: sourceId(job.companySlug),
      external_job_id: job.externalJobId,
      content_hash: stableHash({ job: job.id, title: job.title, lastSeenAt: job.lastSeenAt }),
      classification_state: "included",
      source_published_at: job.postedAt,
      source_updated_at: null,
      source_publication_checked_at: job.postedAt ? job.firstSeenAt : null,
      first_seen_at: job.firstSeenAt,
      last_seen_at: job.lastSeenAt,
      availability: job.availability,
      missing_successful_runs: 0,
      closure_candidate_since: null,
      last_closure_confirmation_at: null,
      closed_at: job.closedAt,
      reopened_at: job.reopenedAt,
      created_at: job.firstSeenAt,
      updated_at: job.closedAt ?? SAMPLE_SEED_TIMESTAMP,
    })),
  );

  upsertRows(
    database,
    "jobs",
    ["id"],
    SAMPLE_JOBS.map((job) => ({
      id: job.id,
      company_id: companyId(job.companySlug),
      source_id: sourceId(job.companySlug),
      external_job_id: job.externalJobId,
      canonical_url: sampleUrl(job),
      application_url: sampleUrl(job),
      title: job.title,
      normalized_title: job.normalizedTitle,
      audience: job.audience,
      technical_category: job.technicalCategory,
      effective_technical_category: job.technicalCategory,
      employment_type: job.employmentType,
      description: job.description,
      responsibilities_json: json(job.responsibilities),
      requirements_json: json(job.requirements),
      preferred_qualifications_json: json(job.preferredQualifications),
      eligibility: job.eligibility,
      graduation_requirements: job.graduationRequirements,
      work_authorization: job.workAuthorization,
      location_text: job.locations.map((item) => item.displayText).join(" · "),
      country: "US",
      work_arrangement: job.workArrangement,
      compensation_minimum: job.compensationMinimum,
      compensation_maximum: job.compensationMaximum,
      compensation_currency: "USD",
      compensation_period: job.compensationPeriod,
      compensation_display_text: job.compensationDisplayText,
      compensation_is_estimate: Number(job.compensationIsEstimate),
      compensation_source: job.compensationSource,
      posted_at: job.postedAt,
      source_published_at: job.postedAt,
      source_updated_at: null,
      source_publication_checked_at: job.postedAt ? job.firstSeenAt : null,
      first_seen_at: job.firstSeenAt,
      last_seen_at: job.lastSeenAt,
      closed_at: job.closedAt,
      reopened_at: job.reopenedAt,
      last_source_check_at: job.lastSourceCheckAt,
      availability: job.availability,
      is_relevant: 1,
      review_required: 0,
      classification_confidence: job.classificationConfidence,
      source_confidence: job.sourceConfidence,
      snapshot_hash: stableHash({ job: job.id, title: job.title, lastSeenAt: job.lastSeenAt }),
      identity_fingerprint: stableHash({ source: sourceId(job.companySlug), external: job.externalJobId }),
      source_posting_state_id: job.id,
      missing_successful_runs: 0,
      closure_candidate_since: null,
      historical_context: job.historicalContext,
      is_sample: 1,
      created_at: job.firstSeenAt,
      updated_at: job.closedAt ?? SAMPLE_SEED_TIMESTAMP,
    })),
  );

  upsertRows(
    database,
    "job_locations",
    ["id"],
    SAMPLE_JOBS.flatMap((job) =>
      job.locations.map((item, index) => ({
        id: `location-${job.id}-${index + 1}`,
        job_id: job.id,
        city: item.city ?? null,
        region: item.region ?? null,
        country: item.country,
        display_text: item.displayText,
        sort_order: index,
        created_at: job.firstSeenAt,
      })),
    ),
  );

  const snapshotRows: SqlRow[] = [];
  for (const job of SAMPLE_JOBS) {
    const normalizedPayload = {
      externalJobId: job.externalJobId,
      title: job.title,
      audience: job.audience,
      technicalCategory: job.technicalCategory,
      postedAt: job.postedAt,
      sourcePublishedAt: job.postedAt,
      sourceUpdatedAt: null,
      sourcePublicationCheckedAt: job.postedAt ? job.firstSeenAt : null,
      locations: job.locations,
      sample: true,
    };
    snapshotRows.push({
      id: `snapshot-${job.id}-first`,
      job_id: job.id,
      source_run_id: null,
      observed_at: job.firstSeenAt,
      snapshot_hash: stableHash({ ...normalizedPayload, observation: "first" }),
      change_kind: "first_seen",
      normalized_payload_json: json(normalizedPayload),
      raw_payload_json: json({ localFixture: true, externalJobId: job.externalJobId }),
      parser_version: "sample-fixture-v1",
      evidence_type: "first_party",
      is_sample: 1,
      created_at: job.firstSeenAt,
    });

    const terminalKind = job.availability === "closed" ? "closed" : job.reopenedAt ? "reopened" : "unchanged";
    const terminalObservedAt = job.closedAt ?? job.reopenedAt ?? job.lastSeenAt;
    snapshotRows.push({
      id: `snapshot-${job.id}-${terminalKind}`,
      job_id: job.id,
      source_run_id: successfulRunIdForJob(job),
      observed_at: terminalObservedAt,
      snapshot_hash: stableHash({ ...normalizedPayload, observation: terminalKind, at: terminalObservedAt }),
      change_kind: terminalKind,
      normalized_payload_json: json(normalizedPayload),
      raw_payload_json: json({ localFixture: true, lifecycle: terminalKind }),
      parser_version: "sample-fixture-v1",
      evidence_type: "first_party",
      is_sample: 1,
      created_at: terminalObservedAt,
    });
  }
  upsertRows(database, "job_snapshots", ["id"], snapshotRows);

  const historyRows: SqlRow[] = [];
  for (const job of SAMPLE_JOBS) {
    historyRows.push({
      id: `history-${job.id}-first-seen`,
      job_id: job.id,
      source_run_id: null,
      event_type: "first_seen",
      title: job.title,
      audience: job.audience,
      opened_at: job.postedAt ?? job.firstSeenAt,
      closed_at: null,
      observed_days_open: null,
      observed_at: job.firstSeenAt,
      effective_at: job.firstSeenAt,
      evidence_type: "first_party",
      source_label: "InternJobs local sample observation",
      metadata_json: json({ postedAtProvided: job.postedAt !== null, sample: true }),
      is_sample: 1,
      created_at: job.firstSeenAt,
    });

    if (job.closedAt) {
      historyRows.push({
        id: `history-${job.id}-closed`,
        job_id: job.id,
        source_run_id: null,
        event_type: "closed",
        title: job.title,
        audience: job.audience,
        opened_at: job.postedAt ?? job.firstSeenAt,
        closed_at: job.closedAt,
        observed_days_open: daysBetween(job.postedAt ?? job.firstSeenAt, job.closedAt),
        observed_at: job.closedAt,
        effective_at: job.closedAt,
        evidence_type: "first_party",
        source_label: "InternJobs local sample observation",
        metadata_json: json({ confirmationRuns: 2, sample: true }),
        is_sample: 1,
        created_at: job.closedAt,
      });
    }

    if (job.reopenedAt) {
      historyRows.push({
        id: `history-${job.id}-reopened`,
        job_id: job.id,
        source_run_id: successfulRunIdForJob(job),
        event_type: "reopened",
        title: job.title,
        audience: job.audience,
        opened_at: job.postedAt ?? job.firstSeenAt,
        closed_at: null,
        observed_days_open: null,
        observed_at: job.reopenedAt,
        effective_at: job.reopenedAt,
        evidence_type: "first_party",
        source_label: "InternJobs local sample observation",
        metadata_json: json({ matchedBy: "stable_external_job_id", sample: true }),
        is_sample: 1,
        created_at: job.reopenedAt,
      });
    }

    job.historicalCycles.forEach((cycle, index) => {
      historyRows.push({
        id: `history-${job.id}-cycle-${index + 1}`,
        job_id: job.id,
        source_run_id: null,
        event_type: "historical_cycle",
        title: job.title,
        audience: job.audience,
        opened_at: cycle.openedAt,
        closed_at: cycle.closedAt,
        observed_days_open: cycle.closedAt ? daysBetween(cycle.openedAt, cycle.closedAt) : null,
        observed_at: cycle.closedAt ?? cycle.openedAt,
        effective_at: cycle.openedAt,
        evidence_type: cycle.evidenceType,
        source_label: cycle.sourceLabel,
        metadata_json: json({ predictive: false, sample: true }),
        is_sample: 1,
        created_at: cycle.openedAt,
      });
    });
  }
  upsertRows(database, "job_history_events", ["id"], historyRows);

  const followedCompanySlugs = ["nvidia", "microsoft", "stripe", "databricks", "anthropic", "jane-street", "ramp", "anduril"];
  upsertRows(
    database,
    "company_follows",
    ["user_id", "company_id"],
    followedCompanySlugs.map((slug, index) => ({
      user_id: SAMPLE_USER_ID,
      company_id: companyId(slug),
      followed_at: new Date(Date.parse("2026-07-01T12:00:00.000Z") + index * 60_000).toISOString(),
    })),
  );

  const userJobStates: SqlRow[] = [
    { user_id: SAMPLE_USER_ID, job_id: "job-nvidia-2026-swe-intern", saved: 1, stage: "saved", notes: "Review the GPU platform team details before applying.", applied_at: null, next_action_at: "2026-07-12T17:00:00.000Z", created_at: "2026-07-07T17:00:00.000Z", updated_at: "2026-07-09T19:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-stripe-backend-ng-26", saved: 1, stage: "applied", notes: "Submitted with distributed systems résumé version.", applied_at: "2026-07-05T20:00:00.000Z", next_action_at: "2026-07-14T16:00:00.000Z", created_at: "2026-07-03T18:00:00.000Z", updated_at: "2026-07-05T20:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-databricks-swe-intern-26", saved: 1, stage: "online_assessment", notes: "Assessment due this weekend.", applied_at: "2026-07-06T19:00:00.000Z", next_action_at: "2026-07-12T23:00:00.000Z", created_at: "2026-07-05T18:00:00.000Z", updated_at: "2026-07-09T15:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-jane-street-swd-intern-26", saved: 1, stage: "interview", notes: "Technical interview — revisit probability and systems fundamentals.", applied_at: "2026-06-22T16:00:00.000Z", next_action_at: "2026-07-15T18:00:00.000Z", created_at: "2026-06-20T15:00:00.000Z", updated_at: "2026-07-10T15:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-microsoft-campus-swe-intern-26", saved: 1, stage: "offer", notes: "Development sample offer state; no real offer is implied.", applied_at: "2026-07-02T18:00:00.000Z", next_action_at: "2026-07-18T18:00:00.000Z", created_at: "2026-07-01T16:00:00.000Z", updated_at: "2026-07-10T14:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-stripe-2025-backend-ng-closed", saved: 1, stage: "rejected", notes: "Closed historical sample remains visible because it has user activity.", applied_at: "2025-07-14T18:00:00.000Z", next_action_at: null, created_at: "2025-07-12T18:00:00.000Z", updated_at: "2025-08-12T18:00:00.000Z" },
    { user_id: SAMPLE_USER_ID, job_id: "job-google-swe-intern-2026", saved: 1, stage: "saved", notes: "Source is unsupported in the local scenario; verify availability directly.", applied_at: null, next_action_at: null, created_at: "2026-06-29T17:00:00.000Z", updated_at: "2026-07-01T17:00:00.000Z" },
  ];
  upsertRows(database, "user_job_states", ["user_id", "job_id"], userJobStates);

  upsertRows(database, "application_events", ["id"], [
    { id: "application-event-nvidia-saved", user_id: SAMPLE_USER_ID, job_id: "job-nvidia-2026-swe-intern", event_type: "saved", from_stage: null, to_stage: "saved", notes: null, occurred_at: "2026-07-07T17:00:00.000Z", metadata_json: "{}", created_at: "2026-07-07T17:00:00.000Z" },
    { id: "application-event-stripe-applied", user_id: SAMPLE_USER_ID, job_id: "job-stripe-backend-ng-26", event_type: "stage_changed", from_stage: "saved", to_stage: "applied", notes: "Submitted application.", occurred_at: "2026-07-05T20:00:00.000Z", metadata_json: "{}", created_at: "2026-07-05T20:00:00.000Z" },
    { id: "application-event-databricks-applied", user_id: SAMPLE_USER_ID, job_id: "job-databricks-swe-intern-26", event_type: "stage_changed", from_stage: "saved", to_stage: "applied", notes: null, occurred_at: "2026-07-06T19:00:00.000Z", metadata_json: "{}", created_at: "2026-07-06T19:00:00.000Z" },
    { id: "application-event-databricks-oa", user_id: SAMPLE_USER_ID, job_id: "job-databricks-swe-intern-26", event_type: "stage_changed", from_stage: "applied", to_stage: "online_assessment", notes: "Assessment invitation received in local sample flow.", occurred_at: "2026-07-09T15:00:00.000Z", metadata_json: json({ dueAt: "2026-07-12T23:00:00.000Z" }), created_at: "2026-07-09T15:00:00.000Z" },
    { id: "application-event-jane-interview", user_id: SAMPLE_USER_ID, job_id: "job-jane-street-swd-intern-26", event_type: "stage_changed", from_stage: "online_assessment", to_stage: "interview", notes: "Interview scheduled.", occurred_at: "2026-07-10T15:00:00.000Z", metadata_json: "{}", created_at: "2026-07-10T15:00:00.000Z" },
    { id: "application-event-microsoft-offer", user_id: SAMPLE_USER_ID, job_id: "job-microsoft-campus-swe-intern-26", event_type: "stage_changed", from_stage: "interview", to_stage: "offer", notes: "Development-only fixture state.", occurred_at: "2026-07-10T14:00:00.000Z", metadata_json: json({ sample: true }), created_at: "2026-07-10T14:00:00.000Z" },
    { id: "application-event-closed-stripe-rejected", user_id: SAMPLE_USER_ID, job_id: "job-stripe-2025-backend-ng-closed", event_type: "stage_changed", from_stage: "interview", to_stage: "rejected", notes: "Historical local fixture.", occurred_at: "2025-08-12T18:00:00.000Z", metadata_json: json({ sample: true }), created_at: "2025-08-12T18:00:00.000Z" },
  ]);

  upsertRows(database, "alert_rules", ["id"], [
    { id: "alert-followed-new-roles", user_id: SAMPLE_USER_ID, name: "New roles at followed companies", enabled: 1, criteria_json: json({ followedCompaniesOnly: true, newlyFoundWithinHours: 24 }), channels_json: json(["in_app", "email"]), created_at: "2026-07-02T12:00:00.000Z", updated_at: "2026-07-02T12:00:00.000Z", last_matched_at: "2026-07-09T20:10:00.000Z", is_sample: 1 },
    { id: "alert-chicago-quant-intern", user_id: SAMPLE_USER_ID, name: "Chicago quant internships", enabled: 1, criteria_json: json({ audiences: ["internship"], technicalCategories: ["quant"], locations: ["Chicago, IL"] }), channels_json: json(["in_app"]), created_at: "2026-07-02T12:10:00.000Z", updated_at: "2026-07-02T12:10:00.000Z", last_matched_at: "2026-07-01T13:16:00.000Z", is_sample: 1 },
    { id: "alert-200k-new-grad", user_id: SAMPLE_USER_ID, name: "$200k+ new-grad signals", enabled: 1, criteria_json: json({ audiences: ["new_grad"], minimumCompensation: 200000 }), channels_json: json(["in_app", "email"]), created_at: "2026-07-02T12:20:00.000Z", updated_at: "2026-07-02T12:20:00.000Z", last_matched_at: "2026-07-09T17:00:00.000Z", is_sample: 1 },
    { id: "alert-reopened", user_id: SAMPLE_USER_ID, name: "Reopened roles", enabled: 0, criteria_json: json({ reopenedOnly: true }), channels_json: json(["in_app"]), created_at: "2026-07-02T12:30:00.000Z", updated_at: "2026-07-08T12:30:00.000Z", last_matched_at: null, is_sample: 1 },
  ]);

  upsertRows(database, "notifications", ["id"], [
    { id: "notification-local-data", user_id: SAMPLE_USER_ID, alert_rule_id: null, job_id: null, company_id: null, type: "system", title: "Local sample data is active", body: "These companies, roles, monitoring runs, alerts, and deliveries are development fixtures—not verified live postings.", created_at: "2026-07-10T16:00:00.000Z", read_at: null, delivery_status: "in_app", data_json: json({ dataMode: "seeded_local" }), is_sample: 1 },
    { id: "notification-nvidia-new", user_id: SAMPLE_USER_ID, alert_rule_id: "alert-followed-new-roles", job_id: "job-nvidia-2026-systems-ng", company_id: "company-nvidia", type: "new_job", title: "Sample new NVIDIA role found", body: "Found a local sample Systems Software Engineer — New College Graduate role. No official posted date was supplied in the fixture.", created_at: "2026-07-09T17:01:00.000Z", read_at: null, delivery_status: "development_email", data_json: json({ sample: true }), is_sample: 1 },
    { id: "notification-scale-new", user_id: SAMPLE_USER_ID, alert_rule_id: "alert-followed-new-roles", job_id: "job-scale-ai-ml-platform-ng-26", company_id: "company-scale-ai", type: "new_job", title: "Sample ML platform role found", body: "Found a local sample early-career ML platform role.", created_at: "2026-07-09T20:11:00.000Z", read_at: "2026-07-10T08:00:00.000Z", delivery_status: "in_app", data_json: json({ sample: true }), is_sample: 1 },
    { id: "notification-cloudflare-reopened", user_id: SAMPLE_USER_ID, alert_rule_id: "alert-reopened", job_id: "job-cloudflare-edge-intern-26", company_id: "company-cloudflare", type: "reopened_job", title: "Sample Cloudflare role reopened", body: "A sample posting with the same stable external ID returned after an earlier disappearance.", created_at: "2026-07-09T12:02:00.000Z", read_at: null, delivery_status: "in_app", data_json: json({ sample: true, matchedBy: "stable_external_job_id" }), is_sample: 1 },
    { id: "notification-apple-health", user_id: SAMPLE_USER_ID, alert_rule_id: null, job_id: null, company_id: "company-apple", type: "source_health", title: "Apple sample source needs review", body: "The latest sample run returned zero jobs after 142. Existing postings were not closed.", created_at: "2026-07-10T14:46:00.000Z", read_at: null, delivery_status: "in_app", data_json: json({ incidentId: "incident-apple-unexpected-empty", sample: true }), is_sample: 1 },
    { id: "notification-anthropic-health", user_id: SAMPLE_USER_ID, alert_rule_id: null, job_id: null, company_id: "company-anthropic", type: "source_health", title: "Anthropic sample source is backing off", body: "A sample HTTP 429 response triggered respectful backoff; no closure evidence was recorded.", created_at: "2026-07-10T12:11:00.000Z", read_at: "2026-07-10T12:20:00.000Z", delivery_status: "in_app", data_json: json({ incidentId: "incident-anthropic-rate-limit", sample: true }), is_sample: 1 },
  ]);

  upsertRows(database, "notification_deliveries", ["id"], [
    { id: "delivery-local-data-in-app", notification_id: "notification-local-data", channel: "in_app", provider: "local", recipient: SAMPLE_USER_ID, status: "delivered", attempt_count: 1, last_attempt_at: "2026-07-10T16:00:00.000Z", delivered_at: "2026-07-10T16:00:00.000Z", provider_message_id: null, error_details: null, payload_json: json({ sample: true }), created_at: "2026-07-10T16:00:00.000Z", updated_at: "2026-07-10T16:00:00.000Z" },
    { id: "delivery-nvidia-in-app", notification_id: "notification-nvidia-new", channel: "in_app", provider: "local", recipient: SAMPLE_USER_ID, status: "delivered", attempt_count: 1, last_attempt_at: "2026-07-09T17:01:00.000Z", delivered_at: "2026-07-09T17:01:00.000Z", provider_message_id: null, error_details: null, payload_json: json({ sample: true }), created_at: "2026-07-09T17:01:00.000Z", updated_at: "2026-07-09T17:01:00.000Z" },
    { id: "delivery-nvidia-dev-email", notification_id: "notification-nvidia-new", channel: "email", provider: "development_log", recipient: "student@local.internjobs.invalid", status: "development_only", attempt_count: 1, last_attempt_at: "2026-07-09T17:01:02.000Z", delivered_at: null, provider_message_id: "dev-email-sample-001", error_details: null, payload_json: json({ localOnly: true, productionSent: false }), created_at: "2026-07-09T17:01:01.000Z", updated_at: "2026-07-09T17:01:02.000Z" },
    { id: "delivery-apple-health-in-app", notification_id: "notification-apple-health", channel: "in_app", provider: "local", recipient: SAMPLE_USER_ID, status: "delivered", attempt_count: 1, last_attempt_at: "2026-07-10T14:46:00.000Z", delivered_at: "2026-07-10T14:46:00.000Z", provider_message_id: null, error_details: null, payload_json: json({ sample: true }), created_at: "2026-07-10T14:46:00.000Z", updated_at: "2026-07-10T14:46:00.000Z" },
  ]);

  upsertRows(database, "emerging_candidates", ["id"], [
    { id: "emerging-scale-promoted", company_id: "company-scale-ai", submitted_by_user_id: SAMPLE_USER_ID, company_name: "Scale AI", company_domain: "scale.com", logo_url: null, candidate_kind: "company", reason: "Multiple compensation and AI infrastructure signals led to official-source review.", discovery_source: "Curated administrator sample", official_verification_source: "https://scale.com/careers", discovered_at: "2026-05-10T16:00:00.000Z", verified_at: "2026-05-12T16:00:00.000Z", review_status: "promoted", confidence: 0.98, review_notes: "Sample promotion completed after an official careers page review.", promoted_at: "2026-05-13T16:00:00.000Z", is_sample: 1, created_at: "2026-05-10T16:00:00.000Z", updated_at: "2026-05-13T16:00:00.000Z" },
    { id: "emerging-harvey-verified", company_id: null, submitted_by_user_id: SAMPLE_USER_ID, company_name: "Harvey", company_domain: "harvey.ai", logo_url: null, candidate_kind: "company", reason: "High-signal AI company with an official technical careers source in this sample workflow.", discovery_source: "Sample compensation disclosure review", official_verification_source: "https://www.harvey.ai/careers", discovered_at: "2026-06-20T16:00:00.000Z", verified_at: "2026-06-22T16:00:00.000Z", review_status: "verified", confidence: 0.91, review_notes: "Official careers source verified; no sample student posting is being claimed.", promoted_at: null, is_sample: 1, created_at: "2026-06-20T16:00:00.000Z", updated_at: "2026-06-22T16:00:00.000Z" },
    { id: "emerging-cursor-pending", company_id: null, submitted_by_user_id: SAMPLE_USER_ID, company_name: "Cursor", company_domain: "cursor.com", logo_url: null, candidate_kind: "company", reason: "User submission cites a growing engineering organization and compensation signal.", discovery_source: "Local sample user submission", official_verification_source: null, discovered_at: "2026-07-08T18:00:00.000Z", verified_at: null, review_status: "pending", confidence: 0.72, review_notes: "Needs an official-source check before any active role can be presented.", promoted_at: null, is_sample: 1, created_at: "2026-07-08T18:00:00.000Z", updated_at: "2026-07-08T18:00:00.000Z" },
    { id: "emerging-cognition-rejected", company_id: null, submitted_by_user_id: SAMPLE_USER_ID, company_name: "Cognition", company_domain: "cognition.ai", logo_url: null, candidate_kind: "posting", reason: "A secondary list claimed a student role, but the local sample review found no official verification.", discovery_source: "Sample secondary list", official_verification_source: null, discovered_at: "2026-07-01T18:00:00.000Z", verified_at: null, review_status: "rejected", confidence: 0.24, review_notes: "Rejected as an active listing because no official posting was verified.", promoted_at: null, is_sample: 1, created_at: "2026-07-01T18:00:00.000Z", updated_at: "2026-07-03T18:00:00.000Z" },
  ]);

  upsertRows(database, "emerging_evidence", ["id"], [
    { id: "evidence-scale-curated", candidate_id: "emerging-scale-promoted", evidence_type: "manual", source_name: "Curated administrator sample", source_url: null, description: "Independent compensation and company-growth signals prompted review.", is_official: 0, discovered_at: "2026-05-10T16:00:00.000Z", verified_at: null, details_json: json({ sample: true }), is_sample: 1, created_at: "2026-05-10T16:00:00.000Z" },
    { id: "evidence-scale-official", candidate_id: "emerging-scale-promoted", evidence_type: "official_source", source_name: "Scale AI careers", source_url: "https://scale.com/careers", description: "Official careers source verified in the sample review workflow.", is_official: 1, discovered_at: "2026-05-12T16:00:00.000Z", verified_at: "2026-05-12T16:00:00.000Z", details_json: json({ sample: true, activeStudentRoleClaimed: false }), is_sample: 1, created_at: "2026-05-12T16:00:00.000Z" },
    { id: "evidence-harvey-comp", candidate_id: "emerging-harvey-verified", evidence_type: "compensation", source_name: "Sample compensation review", source_url: null, description: "A high compensation signal triggered investigation; it is not a guaranteed offer.", is_official: 0, discovered_at: "2026-06-20T16:00:00.000Z", verified_at: null, details_json: json({ sample: true }), is_sample: 1, created_at: "2026-06-20T16:00:00.000Z" },
    { id: "evidence-harvey-official", candidate_id: "emerging-harvey-verified", evidence_type: "official_source", source_name: "Harvey careers", source_url: "https://www.harvey.ai/careers", description: "Official company careers page verified; no specific student role is asserted.", is_official: 1, discovered_at: "2026-06-22T16:00:00.000Z", verified_at: "2026-06-22T16:00:00.000Z", details_json: json({ sample: true }), is_sample: 1, created_at: "2026-06-22T16:00:00.000Z" },
    { id: "evidence-cursor-user", candidate_id: "emerging-cursor-pending", evidence_type: "user_submission", source_name: "Local sample user", source_url: null, description: "User suggested the company for official-source review.", is_official: 0, discovered_at: "2026-07-08T18:00:00.000Z", verified_at: null, details_json: json({ sample: true }), is_sample: 1, created_at: "2026-07-08T18:00:00.000Z" },
    { id: "evidence-cognition-secondary", candidate_id: "emerging-cognition-rejected", evidence_type: "secondary_list", source_name: "Sample secondary job list", source_url: null, description: "Unverified secondary claim; retained only as investigation evidence.", is_official: 0, discovered_at: "2026-07-01T18:00:00.000Z", verified_at: null, details_json: json({ sample: true }), is_sample: 1, created_at: "2026-07-01T18:00:00.000Z" },
  ]);

  upsertRows(database, "emerging_reviews", ["id"], [
    { id: "review-scale-promoted", candidate_id: "emerging-scale-promoted", reviewer_user_id: SAMPLE_USER_ID, decision: "promoted", notes: "Official source verified in this local fixture; promoted to the sample watchlist.", official_verification_source: "https://scale.com/careers", confidence: 0.98, reviewed_at: "2026-05-13T16:00:00.000Z", created_at: "2026-05-13T16:00:00.000Z" },
    { id: "review-harvey-verified", candidate_id: "emerging-harvey-verified", reviewer_user_id: SAMPLE_USER_ID, decision: "verified", notes: "Company source verified, but no student posting is claimed.", official_verification_source: "https://www.harvey.ai/careers", confidence: 0.91, reviewed_at: "2026-06-22T16:00:00.000Z", created_at: "2026-06-22T16:00:00.000Z" },
    { id: "review-cursor-pending", candidate_id: "emerging-cursor-pending", reviewer_user_id: SAMPLE_USER_ID, decision: "pending", notes: "Awaiting official-source verification.", official_verification_source: null, confidence: 0.72, reviewed_at: "2026-07-08T18:10:00.000Z", created_at: "2026-07-08T18:10:00.000Z" },
    { id: "review-cognition-rejected", candidate_id: "emerging-cognition-rejected", reviewer_user_id: SAMPLE_USER_ID, decision: "rejected", notes: "No official student posting found; secondary evidence is insufficient.", official_verification_source: null, confidence: 0.24, reviewed_at: "2026-07-03T18:00:00.000Z", created_at: "2026-07-03T18:00:00.000Z" },
  ]);

  upsertRows(database, "emerging_candidate_jobs", ["candidate_id", "job_id"], [
    { candidate_id: "emerging-scale-promoted", job_id: "job-scale-ai-ml-platform-ng-26", linked_at: "2026-07-09T20:10:00.000Z", link_reason: "Sample role observed after the candidate was promoted to the curated registry." },
  ]);
}

function scalarCount(database: BetterSqlite3.Database, sql: string): number {
  const row = database.prepare<[], { count: number }>(sql).get();
  return row?.count ?? 0;
}

export function seedDatabase(explicitDatabasePath?: string): SeedResult {
  const databasePath = resolveDatabasePath(explicitDatabasePath);
  const database = openDatabase(databasePath);

  try {
    applyMigrations(database);
    database.transaction(() => seedRows(database))();

    return {
      databasePath,
      users: scalarCount(database, "SELECT count(*) AS count FROM users WHERE is_sample = 1"),
      companies: scalarCount(database, "SELECT count(*) AS count FROM companies WHERE is_sample = 1"),
      sources: scalarCount(database, "SELECT count(*) AS count FROM sources WHERE is_sample = 1"),
      activeJobs: scalarCount(database, "SELECT count(*) AS count FROM jobs WHERE is_sample = 1 AND availability = 'active'"),
      closedJobs: scalarCount(database, "SELECT count(*) AS count FROM jobs WHERE is_sample = 1 AND availability = 'closed'"),
      sourceRuns: scalarCount(database, "SELECT count(*) AS count FROM source_runs WHERE is_sample = 1"),
      incidents: scalarCount(database, "SELECT count(*) AS count FROM source_incidents WHERE is_sample = 1"),
      notifications: scalarCount(database, "SELECT count(*) AS count FROM notifications WHERE is_sample = 1"),
      emergingCandidates: scalarCount(database, "SELECT count(*) AS count FROM emerging_candidates WHERE is_sample = 1"),
    };
  } finally {
    database.close();
  }
}

if (isDirectExecution(import.meta.url)) {
  try {
    const result = seedDatabase();
    console.log(
      `Seeded LOCAL SAMPLE DATA at ${result.databasePath}: ` +
        `${result.companies} companies, ${result.activeJobs} active jobs, ${result.closedJobs} closed jobs, ` +
        `${result.sourceRuns} source runs, and ${result.emergingCandidates} Emerging candidates.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
