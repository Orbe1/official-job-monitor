import { randomUUID } from "node:crypto";

import { isPubliclyRelevantPosting, shouldRetainFullPosting } from "../adapters";
import type {
  ExistingPostingState,
  LifecycleAction,
  NormalizedPosting,
} from "../adapters";
import { normalizeCountry, UNKNOWN_COUNTRY } from "../adapters/adapters/shared";
import type { AlertCriteria, AlertRule, TechnicalCategory } from "../shared/domain";
import { annualizedCompensation, matchesAlertCriteria } from "../workers/alerts";
import type { MonitorPersistence, MonitorRunRecord } from "../workers/monitor";
import type { SqliteDatabase } from "./database";

type SqlRow = Record<string, unknown>;
type PostingLifecycleAction = Extract<LifecycleAction, { posting: NormalizedPosting }>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function safeJson(value: unknown, fallback: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(fallback);
  }
}

function databaseAudience(posting: NormalizedPosting): "internship" | "new_grad" | "ambiguous" {
  return posting.classification.audience === "irrelevant" ? "ambiguous" : posting.classification.audience;
}

function classificationState(
  posting: NormalizedPosting,
): "included" | "review_required" | "excluded" {
  if (isPubliclyRelevantPosting(posting)) return "included";
  if (shouldRetainFullPosting(posting)) return "review_required";
  return "excluded";
}

function legacyTechnicalCategory(
  category: TechnicalCategory,
): Exclude<TechnicalCategory, "support" | "networking" | "data_science" | "product_management"> {
  if (category === "support" || category === "networking") return "infrastructure";
  if (category === "data_science") return "data";
  if (category === "product_management") return "software";
  return category;
}

function runStatus(record: MonitorRunRecord): MonitorRunRecord["outcome"] {
  if (record.outcome === "success" && record.diagnostics.suspiciousFlags.length > 0) return "degraded";
  return record.outcome;
}

function sourceHealth(record: MonitorRunRecord): "healthy" | "degraded" | "failing" | "unsupported" {
  const status = runStatus(record);
  if (status === "success") return "healthy";
  if (status === "degraded") return "degraded";
  if (status === "unsupported") return "unsupported";
  return "failing";
}

function parserStatus(record: MonitorRunRecord): "ok" | "warning" | "error" | "not_run" {
  if (record.outcome === "unsupported") return "not_run";
  if (record.outcome === "failed") return "error";
  if (record.outcome === "degraded" || record.diagnostics.warnings.length || record.diagnostics.suspiciousFlags.length) {
    return "warning";
  }
  return "ok";
}

/**
 * SQLite implementation of the worker persistence boundary. Every monitor run
 * is committed in one transaction, so a source run cannot be recorded without
 * its matching lifecycle changes. Closure advancement remains entirely driven
 * by LifecycleAction: preserved actions never mutate availability.
 */
export class SqliteMonitorPersistence implements MonitorPersistence {
  constructor(private readonly database: SqliteDatabase) {}

  existingPostings(sourceId: string): Promise<ExistingPostingState[]> {
    const rows = this.database
      .prepare(
         `SELECT state.id AS state_id, state.external_job_id, state.content_hash, state.availability,
                state.missing_successful_runs, state.first_seen_at, state.last_seen_at,
                state.closed_at, state.source_published_at, state.source_updated_at,
                state.source_publication_checked_at, state.closure_candidate_since,
                state.last_closure_confirmation_at, j.id AS job_id, j.is_relevant
         FROM source_posting_states state
         LEFT JOIN jobs j
           ON j.source_posting_state_id = state.id
         WHERE state.source_id = ?`,
      )
      .all(sourceId) as SqlRow[];
    return Promise.resolve(
      rows.map((row) => ({
        id: text(row.state_id),
        externalId: text(row.external_job_id),
        contentHash: text(row.content_hash),
        availability: text(row.availability) as ExistingPostingState["availability"],
        missingSuccessfulRuns: numberValue(row.missing_successful_runs),
        firstSeenAt: text(row.first_seen_at),
        lastSeenAt: text(row.last_seen_at),
        closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
        sourcePublishedAt: typeof row.source_published_at === "string" ? row.source_published_at : null,
        sourceUpdatedAt: typeof row.source_updated_at === "string" ? row.source_updated_at : null,
        sourcePublicationCheckedAt: typeof row.source_publication_checked_at === "string"
          ? row.source_publication_checked_at
          : null,
        isRelevant: numberValue(row.is_relevant) === 1,
        closureCandidateSince: typeof row.closure_candidate_since === "string" ? row.closure_candidate_since : null,
        lastClosureConfirmationAt: typeof row.last_closure_confirmation_at === "string"
          ? row.last_closure_confirmation_at
          : typeof row.closure_candidate_since === "string" ? row.closure_candidate_since : null,
      })),
    );
  }

  lifecyclePolicy(sourceId: string): Promise<{ closureConfirmationRuns: number; expectedIntervalMinutes: number } | null> {
    const source = this.database
      .prepare("SELECT closure_confirmation_runs, expected_interval_minutes FROM sources WHERE id = ?")
      .get(sourceId) as SqlRow | undefined;
    if (!source) return Promise.resolve(null);
    return Promise.resolve({
      closureConfirmationRuns: Math.max(2, numberValue(source.closure_confirmation_runs, 2)),
      expectedIntervalMinutes: Math.max(1, numberValue(source.expected_interval_minutes, 60)),
    });
  }

  commitRun(record: MonitorRunRecord, postings: NormalizedPosting[]): Promise<void> {
    this.database.transaction(() => {
      const source = this.database
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(record.sourceId) as SqlRow | undefined;
      if (!source) throw new Error(`Cannot persist monitor run for unknown source ${record.sourceId}.`);

      const effectiveStatus = runStatus(record);
      const diagnostics = record.diagnostics;
      const priorTotal = numberValue(source.total_jobs);
      const changedCount = record.actions.filter((action) => action.type === "changed").length;
      const newCount = record.actions.filter((action) => action.type === "discovered").length;
      const missingCount = record.actions.filter(
        (action) => action.type === "missing" || action.type === "closed" || action.type === "preserved",
      ).length;
      const closureEligible =
        record.outcome === "success" &&
        record.completeness === "complete" &&
        diagnostics.suspiciousFlags.length === 0;
      const lastHttpStatus = diagnostics.httpStatuses.at(-1) ?? null;
      const diagnosticMessages = [
        ...diagnostics.warnings,
        ...diagnostics.duplicateExternalIds.map((id) => `Duplicate external job ID: ${id}`),
      ];

      this.database
        .prepare(
          `INSERT INTO source_runs (
             id, source_id, started_at, completed_at, status, completeness,
             closure_eligible, http_status, transport_status, parser_status,
             parser_version, pages_retrieved, total_jobs, previous_total_jobs,
             relevant_jobs, new_jobs, changed_jobs, missing_jobs, duration_ms,
             response_hash, diagnostics_json, suspicious_flags_json, error_details,
             is_sample, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     NULL, ?, ?, ?, 0, ?)`,
        )
        .run(
          record.id,
          record.sourceId,
          record.startedAt,
          record.completedAt,
          effectiveStatus,
          record.completeness,
          Number(closureEligible),
          lastHttpStatus,
          record.outcome === "failed" ? "failed" : "completed",
          parserStatus(record),
          diagnostics.adapterVersion,
          diagnostics.pagesRetrieved,
          postings.length,
          priorTotal,
          record.relevantCount,
          newCount,
          changedCount,
          missingCount,
          diagnostics.durationMs,
          safeJson(diagnosticMessages, []),
          safeJson(diagnostics.suspiciousFlags, []),
          record.outcome === "failed" ? diagnosticMessages.join("; ") || "Adapter run failed." : null,
          record.startedAt,
        );

      for (const action of record.actions) this.applyAction(source, record, action);
      this.updateSourceSummary(source, record, postings.length, lastHttpStatus);
      this.recordIncidentIfNeeded(record);
      this.refreshCompanyHealth(text(source.company_id), record.completedAt);
    })();
    return Promise.resolve();
  }

  private applyAction(source: SqlRow, record: MonitorRunRecord, action: LifecycleAction): void {
    this.applyStateAction(record, action);

    if ("posting" in action) {
      if (shouldRetainFullPosting(action.posting)) {
        this.materializePosting(source, record, action);
      } else {
        this.compactExcludedJob(record.sourceId, action.externalId, action.at, record.completedAt);
      }
      return;
    }

    if (action.type === "missing" || action.type === "closed") {
      this.mirrorLifecycleToMaterializedJob(record, action);
    }
    // Preserved actions intentionally mutate neither the compact state nor a
    // materialized job. Failed, partial, and suspicious runs are source-health
    // evidence, never closure evidence.
  }

  private applyStateAction(record: MonitorRunRecord, action: LifecycleAction): void {
    if (action.type === "preserved") return;

    if (action.type === "discovered") {
      this.database.prepare(
        `INSERT INTO source_posting_states (
           id, source_id, external_job_id, content_hash, classification_state,
           source_published_at, source_updated_at, source_publication_checked_at,
           first_seen_at, last_seen_at, availability, missing_successful_runs,
           closure_candidate_since, last_closure_confirmation_at, closed_at,
           reopened_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0,
                   NULL, NULL, NULL, NULL, ?, ?)
         ON CONFLICT (source_id, external_job_id) DO UPDATE SET
           content_hash = excluded.content_hash,
           classification_state = excluded.classification_state,
           source_published_at = COALESCE(source_posting_states.source_published_at, excluded.source_published_at),
           source_updated_at = COALESCE(excluded.source_updated_at, source_posting_states.source_updated_at),
           source_publication_checked_at = COALESCE(source_posting_states.source_publication_checked_at, excluded.source_publication_checked_at),
           last_seen_at = excluded.last_seen_at,
           availability = 'active', missing_successful_runs = 0,
           closure_candidate_since = NULL, last_closure_confirmation_at = NULL,
           closed_at = NULL, updated_at = excluded.updated_at`,
      ).run(
        `source-posting-${randomUUID()}`,
        record.sourceId,
        action.externalId,
        action.posting.contentHash,
        classificationState(action.posting),
        action.posting.sourcePublishedAt ?? action.posting.postedAt,
        action.posting.sourceUpdatedAt,
        action.posting.sourcePublicationCheckedAt,
        action.at,
        action.at,
        action.at,
        record.completedAt,
      );
      return;
    }

    if (action.type === "seen" || action.type === "changed" || action.type === "reopened") {
      const sourcePublishedAt = action.posting.sourcePublishedAt ?? action.posting.postedAt;
      const reopened = action.type === "reopened";
      this.database.prepare(
        `UPDATE source_posting_states SET
           content_hash = ?, classification_state = ?,
           source_published_at = CASE
             WHEN ? = 1 AND ? IS NOT NULL THEN ?
             ELSE COALESCE(source_published_at, ?)
           END,
           source_updated_at = COALESCE(?, source_updated_at),
           source_publication_checked_at = CASE
             WHEN ? = 1 THEN COALESCE(?, source_publication_checked_at)
             ELSE COALESCE(source_publication_checked_at, ?)
           END,
           last_seen_at = ?, availability = 'active', missing_successful_runs = 0,
           closure_candidate_since = NULL, last_closure_confirmation_at = NULL,
           closed_at = NULL,
           reopened_at = CASE WHEN ? = 1 THEN ? ELSE reopened_at END,
           updated_at = ?
         WHERE id = ?`,
      ).run(
        action.posting.contentHash,
        classificationState(action.posting),
        Number(reopened),
        sourcePublishedAt,
        sourcePublishedAt,
        sourcePublishedAt,
        action.posting.sourceUpdatedAt,
        Number(reopened),
        action.posting.sourcePublicationCheckedAt,
        action.posting.sourcePublicationCheckedAt,
        action.at,
        Number(reopened),
        action.at,
        record.completedAt,
        action.id,
      );
      return;
    }

    if (action.type === "missing") {
      this.database.prepare(
        `UPDATE source_posting_states
         SET availability = 'closure_pending', missing_successful_runs = ?,
             closure_candidate_since = COALESCE(closure_candidate_since, ?),
             last_closure_confirmation_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(action.missingSuccessfulRuns, action.at, action.at, record.completedAt, action.id);
      return;
    }

    this.database.prepare(
      `UPDATE source_posting_states
       SET availability = 'closed', closed_at = ?, closure_candidate_since = NULL,
           last_closure_confirmation_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(action.at, action.at, record.completedAt, action.id);
  }

  private materializePosting(
    source: SqlRow,
    record: MonitorRunRecord,
    action: PostingLifecycleAction,
  ): void {
    const state = this.database.prepare(
      "SELECT id, first_seen_at FROM source_posting_states WHERE source_id = ? AND external_job_id = ?",
    ).get(record.sourceId, action.externalId) as SqlRow;
    const existing = this.database.prepare(
      "SELECT id FROM jobs WHERE source_posting_state_id = ?",
    ).get(state.id) as SqlRow | undefined;

    if (!existing) {
      // Materialized jobs reuse the authoritative ledger identity. Existing
      // consumers can continue treating lifecycle IDs as job IDs whenever a
      // full job exists, while excluded states remain ledger-only.
      const jobId = text(state.id);
      const firstSeenAt = text(state.first_seen_at, action.at);
      const reopened = action.type === "reopened";
      this.insertJob(jobId, text(state.id), source, action.posting, firstSeenAt, action.at, record.completedAt);
      if (reopened) {
        this.database.prepare("UPDATE jobs SET reopened_at = ? WHERE id = ?").run(action.at, jobId);
      }
      this.replaceLocations(jobId, action.posting, action.at);
      this.insertSnapshot(jobId, record, action.posting, reopened ? "reopened" : "first_seen", action.at);
      this.insertHistory(jobId, record, action.posting, reopened ? "reopened" : "first_seen", action.at);
      this.emitMatchingAlerts(source, jobId, action.posting, reopened, action.at);
      return;
    }

    const jobId = text(existing.id);
    if (action.type === "reopened") {
      this.updateSeenJob(jobId, action.posting, action.at, record.completedAt, true);
      this.replaceLocations(jobId, action.posting, action.at);
      this.insertSnapshot(jobId, record, action.posting, "reopened", action.at);
      this.insertHistory(jobId, record, action.posting, "reopened", action.at);
      this.emitMatchingAlerts(source, jobId, action.posting, true, action.at);
      return;
    }
    if (action.type === "changed") {
      this.updateSeenJob(jobId, action.posting, action.at, record.completedAt, false);
      this.replaceLocations(jobId, action.posting, action.at);
      this.insertSnapshot(jobId, record, action.posting, "changed", action.at);
      this.insertHistory(jobId, record, action.posting, "changed", action.at);
      return;
    }

    this.updateSeenJob(jobId, action.posting, action.at, record.completedAt, false);
    this.insertSnapshot(jobId, record, action.posting, "unchanged", action.at);
  }

  private compactExcludedJob(
    sourceId: string,
    externalId: string,
    observedAt: string,
    sourceCheckAt: string,
  ): void {
    const job = this.database.prepare(
      "SELECT id FROM jobs WHERE source_id = ? AND external_job_id = ?",
    ).get(sourceId, externalId) as SqlRow | undefined;
    if (!job) return;
    const jobId = text(job.id);
    const retained = this.database.prepare(
      `SELECT
         EXISTS(SELECT 1 FROM user_job_states WHERE job_id = ?) OR
         EXISTS(SELECT 1 FROM emerging_candidate_jobs WHERE job_id = ?) AS retained`,
    ).get(jobId, jobId) as SqlRow;
    if (numberValue(retained.retained) === 1) {
      this.database.prepare(
        `UPDATE jobs SET last_seen_at = ?, last_source_check_at = ?,
           availability = 'active', closed_at = NULL, is_relevant = 0,
           review_required = 0, missing_successful_runs = 0,
           closure_candidate_since = NULL, updated_at = ? WHERE id = ?`,
      ).run(observedAt, sourceCheckAt, observedAt, jobId);
      return;
    }

    this.database.prepare("DELETE FROM job_locations WHERE job_id = ?").run(jobId);
    this.database.prepare("DELETE FROM job_snapshots WHERE job_id = ?").run(jobId);
    this.database.prepare("DELETE FROM job_history_events WHERE job_id = ?").run(jobId);
    this.database.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
  }

  private mirrorLifecycleToMaterializedJob(
    record: MonitorRunRecord,
    action: Extract<LifecycleAction, { type: "missing" | "closed" }>,
  ): void {
    const job = this.database.prepare(
      "SELECT id, title, audience, first_seen_at FROM jobs WHERE source_posting_state_id = ?",
    ).get(action.id) as SqlRow | undefined;
    if (!job) return;
    const jobId = text(job.id);
    if (action.type === "missing") {
      this.database.prepare(
        `UPDATE jobs SET availability = 'closure_pending', missing_successful_runs = ?,
                closure_candidate_since = COALESCE(closure_candidate_since, ?), updated_at = ?
         WHERE id = ?`,
      ).run(action.missingSuccessfulRuns, action.at, action.at, jobId);
      this.insertLifecycleOnlySnapshot(jobId, record, "closure_candidate", action.at);
      this.insertHistoryFromRow(jobId, record, job, "closure_pending", action.at, null);
      return;
    }

    this.database.prepare(
      `UPDATE jobs SET availability = 'closed', closed_at = ?, closure_candidate_since = NULL,
              updated_at = ? WHERE id = ?`,
    ).run(action.at, action.at, jobId);
    this.insertLifecycleOnlySnapshot(jobId, record, "closed", action.at);
    this.insertHistoryFromRow(
      jobId,
      record,
      job,
      "closed",
      text(job.first_seen_at, action.at),
      action.at,
    );
  }

  private insertJob(
    id: string,
    sourcePostingStateId: string,
    source: SqlRow,
    posting: NormalizedPosting,
    firstSeenAt: string,
    observedAt: string,
    sourceCheckAt: string,
  ): void {
    const compensation = posting.compensation;
    const country = normalizeCountry(posting.country, posting.locationText);
    this.database
      .prepare(
        `INSERT INTO jobs (
           id, company_id, source_id, external_job_id, canonical_url, application_url,
           title, normalized_title, audience, technical_category, effective_technical_category, employment_type,
           description, responsibilities_json, requirements_json, preferred_qualifications_json,
           eligibility, graduation_requirements, work_authorization, location_text, country,
           work_arrangement, compensation_minimum, compensation_maximum, compensation_currency,
           compensation_period, compensation_display_text, compensation_is_estimate,
           compensation_source, posted_at, first_seen_at, last_seen_at, closed_at,
           reopened_at, last_source_check_at, availability, is_relevant,
           classification_confidence, source_confidence, snapshot_hash, identity_fingerprint,
           missing_successful_runs, closure_candidate_since, historical_context, is_sample,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, NULL, ?, ?, ?,
                   ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, NULL, ?, 'active', ?, ?, ?, ?, ?,
                   0, NULL, NULL, 0, ?, ?)`,
      )
      .run(
        id,
        text(source.company_id),
        text(source.id),
        posting.externalId,
        posting.canonicalUrl,
        posting.applicationUrl,
        posting.title,
        posting.normalizedTitle,
        databaseAudience(posting),
        legacyTechnicalCategory(posting.classification.technicalCategory),
        posting.classification.technicalCategory,
        posting.employmentType ?? "Not specified",
        posting.descriptionText,
        safeJson(posting.responsibilities, []),
        safeJson(posting.requirements, []),
        posting.eligibility,
        posting.graduationRequirements,
        posting.locationText,
        country,
        posting.workplaceType,
        compensation?.minimum ?? null,
        compensation?.maximum ?? null,
        compensation?.currency ?? "USD",
        compensation?.period ?? "unknown",
        compensation?.displayText ?? "Not disclosed",
        compensation ? "company" : "unknown",
        posting.sourcePublishedAt ?? posting.postedAt,
        firstSeenAt,
        observedAt,
        sourceCheckAt,
        Number(isPubliclyRelevantPosting(posting)),
        posting.classification.confidence,
        posting.sourceConfidence,
        posting.contentHash,
        `${text(source.id)}:${posting.externalId}`,
        observedAt,
        observedAt,
      );
    this.database
      .prepare(
        `UPDATE jobs
         SET source_published_at = ?, source_updated_at = ?,
             source_publication_checked_at = ?, source_posting_state_id = ?,
             review_required = ?
         WHERE id = ?`,
      )
      .run(
        posting.sourcePublishedAt ?? posting.postedAt,
        posting.sourceUpdatedAt,
        posting.sourcePublicationCheckedAt,
        sourcePostingStateId,
        Number(posting.classification.reviewRequired),
        id,
      );
  }

  private updateSeenJob(
    id: string,
    posting: NormalizedPosting,
    observedAt: string,
    sourceCheckAt: string,
    reopened: boolean,
  ): void {
    const compensation = posting.compensation;
    const country = normalizeCountry(posting.country, posting.locationText);
    this.database
      .prepare(
        `UPDATE jobs SET canonical_url = ?, application_url = ?, title = ?, normalized_title = ?,
           audience = ?, technical_category = ?, effective_technical_category = ?, employment_type = ?, description = ?,
           responsibilities_json = ?, requirements_json = ?, eligibility = ?,
           graduation_requirements = ?, location_text = ?, country = ?,
           work_arrangement = ?, compensation_minimum = ?, compensation_maximum = ?,
           compensation_currency = ?, compensation_period = ?, compensation_display_text = ?,
           compensation_is_estimate = 0, compensation_source = ?,
            posted_at = posted_at, last_seen_at = ?, closed_at = NULL,
           reopened_at = CASE WHEN ? = 1 THEN ? ELSE reopened_at END,
           last_source_check_at = ?, availability = 'active', is_relevant = ?, review_required = ?,
           classification_confidence = ?, source_confidence = ?, snapshot_hash = ?,
           missing_successful_runs = 0, closure_candidate_since = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        posting.canonicalUrl,
        posting.applicationUrl,
        posting.title,
        posting.normalizedTitle,
        databaseAudience(posting),
        legacyTechnicalCategory(posting.classification.technicalCategory),
        posting.classification.technicalCategory,
        posting.employmentType ?? "Not specified",
        posting.descriptionText,
        safeJson(posting.responsibilities, []),
        safeJson(posting.requirements, []),
        posting.eligibility,
        posting.graduationRequirements,
        posting.locationText,
        country,
        posting.workplaceType,
        compensation?.minimum ?? null,
        compensation?.maximum ?? null,
        compensation?.currency ?? "USD",
        compensation?.period ?? "unknown",
        compensation?.displayText ?? "Not disclosed",
        compensation ? "company" : "unknown",
        observedAt,
        Number(reopened),
        observedAt,
        sourceCheckAt,
        Number(isPubliclyRelevantPosting(posting)),
        Number(posting.classification.reviewRequired),
        posting.classification.confidence,
        posting.sourceConfidence,
        posting.contentHash,
        observedAt,
        id,
      );
    const sourcePublishedAt = posting.sourcePublishedAt ?? posting.postedAt;
    this.database
      .prepare(
        `UPDATE jobs
         SET source_published_at = CASE
               WHEN ? = 1 AND ? IS NOT NULL THEN ?
               ELSE COALESCE(source_published_at, ?)
             END,
             source_updated_at = COALESCE(?, source_updated_at),
             source_publication_checked_at = CASE
               WHEN ? = 1 THEN COALESCE(?, source_publication_checked_at)
               ELSE COALESCE(source_publication_checked_at, ?)
             END
         WHERE id = ?`,
      )
      .run(
        Number(reopened),
        sourcePublishedAt,
        sourcePublishedAt,
        sourcePublishedAt,
        posting.sourceUpdatedAt,
        Number(reopened),
        posting.sourcePublicationCheckedAt,
        posting.sourcePublicationCheckedAt,
        id,
      );
    this.database
      .prepare("UPDATE jobs SET posted_at = COALESCE(source_published_at, posted_at) WHERE id = ?")
      .run(id);
  }

  private replaceLocations(jobId: string, posting: NormalizedPosting, createdAt: string): void {
    this.database.prepare("DELETE FROM job_locations WHERE job_id = ?").run(jobId);
    if (!posting.locationText.trim()) return;
    this.database
      .prepare(
        `INSERT INTO job_locations (id, job_id, city, region, country, display_text, sort_order, created_at)
         VALUES (?, ?, NULL, NULL, ?, ?, 0, ?)`,
      )
      .run(
        `job-location-${randomUUID()}`,
        jobId,
        normalizeCountry(posting.country, posting.locationText) || UNKNOWN_COUNTRY,
        posting.locationText,
        createdAt,
      );
  }

  private insertSnapshot(
    jobId: string,
    record: MonitorRunRecord,
    posting: NormalizedPosting,
    changeKind: "first_seen" | "unchanged" | "changed" | "reopened",
    observedAt: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO job_snapshots (
           id, job_id, source_run_id, observed_at, snapshot_hash, change_kind,
           normalized_payload_json, raw_payload_json, parser_version, evidence_type,
           is_sample, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'first_party', 0, ?)`,
      )
      .run(
        `job-snapshot-${randomUUID()}`,
        jobId,
        record.id,
        observedAt,
        posting.contentHash,
        changeKind,
        safeJson(
          {
            externalId: posting.externalId,
            title: posting.title,
            normalizedTitle: posting.normalizedTitle,
            canonicalUrl: posting.canonicalUrl,
            applicationUrl: posting.applicationUrl,
            locationText: posting.locationText,
            country: posting.country,
            workplaceType: posting.workplaceType,
            employmentType: posting.employmentType,
            department: posting.department,
            descriptionText: posting.descriptionText,
            responsibilities: posting.responsibilities,
            requirements: posting.requirements,
            eligibility: posting.eligibility,
            graduationRequirements: posting.graduationRequirements,
            compensation: posting.compensation,
            postedAt: posting.postedAt,
            sourcePublishedAt: posting.sourcePublishedAt,
            sourceUpdatedAt: posting.sourceUpdatedAt,
            sourcePublicationCheckedAt: posting.sourcePublicationCheckedAt,
            classification: posting.classification,
            sourceConfidence: posting.sourceConfidence,
          },
          {},
        ),
        safeJson(posting.raw, null),
        record.diagnostics.adapterVersion,
        observedAt,
      );
  }

  private insertLifecycleOnlySnapshot(
    jobId: string,
    record: MonitorRunRecord,
    changeKind: "closure_candidate" | "closed",
    observedAt: string,
  ): void {
    const job = this.database
      .prepare("SELECT snapshot_hash, external_job_id, title, availability FROM jobs WHERE id = ?")
      .get(jobId) as SqlRow;
    this.database
      .prepare(
        `INSERT INTO job_snapshots (
           id, job_id, source_run_id, observed_at, snapshot_hash, change_kind,
           normalized_payload_json, raw_payload_json, parser_version, evidence_type,
           is_sample, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'first_party', 0, ?)`,
      )
      .run(
        `job-snapshot-${randomUUID()}`,
        jobId,
        record.id,
        observedAt,
        text(job.snapshot_hash, `lifecycle-${jobId}`),
        changeKind,
        safeJson(
          {
            externalId: text(job.external_job_id),
            title: text(job.title),
            lifecycleEvent: changeKind,
            availability: text(job.availability),
          },
          {},
        ),
        record.diagnostics.adapterVersion,
        observedAt,
      );
  }

  private insertHistory(
    jobId: string,
    record: MonitorRunRecord,
    posting: NormalizedPosting,
    eventType: "first_seen" | "changed" | "reopened",
    observedAt: string,
  ): void {
    this.insertHistoryFromRow(
      jobId,
      record,
      { title: posting.title, audience: databaseAudience(posting) },
      eventType,
      posting.sourcePublishedAt ?? posting.postedAt ?? observedAt,
      null,
    );
  }

  private insertHistoryFromRow(
    jobId: string,
    record: MonitorRunRecord,
    job: SqlRow,
    eventType: "first_seen" | "changed" | "closure_pending" | "closed" | "reopened",
    openedAt: string,
    closedAt: string | null,
  ): void {
    const observedDays = closedAt
      ? Math.max(0, Math.round((Date.parse(closedAt) - Date.parse(openedAt)) / 86_400_000))
      : null;
    this.database
      .prepare(
        `INSERT INTO job_history_events (
           id, job_id, source_run_id, event_type, title, audience, opened_at,
           closed_at, observed_days_open, observed_at, effective_at, evidence_type,
           source_label, metadata_json, is_sample, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'first_party',
                   'Direct InternJobs official-source observation', '{}', 0, ?)`,
      )
      .run(
        `job-history-${randomUUID()}`,
        jobId,
        record.id,
        eventType,
        text(job.title),
        text(job.audience, "ambiguous"),
        openedAt,
        closedAt,
        observedDays,
        record.completedAt,
        record.completedAt,
        record.completedAt,
      );
  }

  private updateSourceSummary(
    source: SqlRow,
    record: MonitorRunRecord,
    totalJobs: number,
    httpStatus: number | null,
  ): void {
    const health = sourceHealth(record);
    const succeeded = record.outcome === "success"
      && record.completeness === "complete"
      && record.diagnostics.suspiciousFlags.length === 0;
    const failed = record.outcome === "failed";
    const consecutiveFailures = succeeded ? 0 : numberValue(source.consecutive_failures) + 1;
    this.database
      .prepare(
        `UPDATE sources SET health = ?, last_attempt_at = ?,
           last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
           last_failure_at = CASE WHEN ? = 1 THEN ? ELSE last_failure_at END,
           http_status = ?, parser_status = ?, parser_version = ?, pages_retrieved = ?,
            previous_total_jobs = CASE WHEN ? = 1 THEN total_jobs ELSE previous_total_jobs END,
            total_jobs = CASE WHEN ? = 1 THEN ? ELSE total_jobs END,
            relevant_jobs = CASE WHEN ? = 1 THEN ? ELSE relevant_jobs END,
           last_new_role_at = CASE WHEN ? > 0 THEN ? ELSE last_new_role_at END,
           consecutive_failures = ?, duration_ms = ?, suspicious_flags_json = ?,
           error_details = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        health,
        record.completedAt,
        Number(succeeded),
        record.completedAt,
        Number(failed),
        record.completedAt,
        httpStatus,
        parserStatus(record),
         record.diagnostics.adapterVersion,
         record.diagnostics.pagesRetrieved,
         Number(succeeded),
         Number(succeeded),
         totalJobs,
         Number(succeeded),
         record.relevantCount,
        record.actions.filter((action) => action.type === "discovered").length,
        record.completedAt,
        consecutiveFailures,
        record.diagnostics.durationMs,
        safeJson(record.diagnostics.suspiciousFlags, []),
        failed ? record.diagnostics.warnings.join("; ") || "Adapter run failed." : null,
        record.completedAt,
        record.sourceId,
      );
  }

  private recordIncidentIfNeeded(record: MonitorRunRecord): void {
    const flags = record.diagnostics.suspiciousFlags;
    const effectiveStatus = runStatus(record);
    if (effectiveStatus === "success") return;
    const incidentType =
      flags[0] ?? (effectiveStatus === "unsupported" ? "unsupported_source" : `${effectiveStatus}_source_run`);
    const severity = flags.includes("unexpected_zero_results") || effectiveStatus === "failed" ? "critical" : "warning";
    const details = [
      ...record.diagnostics.warnings,
      ...flags.map((flag) => `Suspicious flag: ${flag}`),
    ].join("\n");
    this.database
      .prepare(
        `INSERT INTO source_incidents (
           id, source_id, source_run_id, incident_type, severity, status, title,
           details, opened_at, acknowledged_at, resolved_at, resolution_notes,
           is_sample, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL, NULL, 0, ?, ?)`,
      )
      .run(
        `source-incident-${randomUUID()}`,
        record.sourceId,
        record.id,
        incidentType,
        severity,
        `Monitoring run requires attention: ${incidentType.replaceAll("_", " ")}`,
        details || `Run outcome was ${effectiveStatus}.`,
        record.completedAt,
        record.completedAt,
        record.completedAt,
      );
  }

  private refreshCompanyHealth(companyId: string, updatedAt: string): void {
    const rows = this.database.prepare("SELECT health, enabled FROM sources WHERE company_id = ?").all(companyId) as SqlRow[];
    const activeHealth = rows.filter((row) => numberValue(row.enabled) === 1).map((row) => text(row.health));
    const healthOrder = ["failing", "degraded", "stale", "healthy"];
    const next =
      activeHealth.length === 0
        ? "unsupported"
        : (healthOrder.find((candidate) => activeHealth.includes(candidate)) ?? "unsupported");
    this.database
      .prepare("UPDATE companies SET monitoring_state = ?, updated_at = ? WHERE id = ?")
      .run(next, updatedAt, companyId);
  }

  private emitMatchingAlerts(
    source: SqlRow,
    jobId: string,
    posting: NormalizedPosting,
    reopened: boolean,
    matchedAt: string,
  ): void {
    if (
      !isPubliclyRelevantPosting(posting)
      || posting.classification.audience === "ambiguous"
      || posting.classification.audience === "irrelevant"
    ) return;
    const companyId = text(source.company_id);
    const company = this.database.prepare("SELECT name FROM companies WHERE id = ?").get(companyId) as SqlRow;
    const rules = this.database
      .prepare(
        `SELECT ar.*, u.email AS user_email
         FROM alert_rules ar JOIN users u ON u.id = ar.user_id
         WHERE ar.enabled = 1`,
      )
      .all() as SqlRow[];
    const followsByUser = new Map<string, ReadonlySet<string>>();

    for (const row of rules) {
      const userId = text(row.user_id);
      let followedCompanyIds = followsByUser.get(userId);
      if (!followedCompanyIds) {
        const followedRows = this.database
          .prepare("SELECT company_id FROM company_follows WHERE user_id = ?")
          .all(userId) as SqlRow[];
        followedCompanyIds = new Set(followedRows.map((follow) => text(follow.company_id)));
        followsByUser.set(userId, followedCompanyIds);
      }

      const channels = (() => {
        try {
          return JSON.parse(text(row.channels_json, "[]")) as Array<"in_app" | "email">;
        } catch {
          return [];
        }
      })();
      const rule: AlertRule = {
        id: text(row.id),
        name: text(row.name),
        enabled: numberValue(row.enabled) === 1,
        criteria: (() => {
          try {
            return JSON.parse(text(row.criteria_json, "{}")) as AlertCriteria;
          } catch {
            return {};
          }
        })(),
        channels,
        createdAt: text(row.created_at),
        lastMatchedAt: typeof row.last_matched_at === "string" ? row.last_matched_at : null,
      };
      const matches = matchesAlertCriteria(
        rule.criteria,
        {
          jobId,
          companyId,
          companyName: text(company.name),
          title: posting.title,
          audience: posting.classification.audience,
          technicalCategory: posting.classification.technicalCategory,
          locationText: posting.locationText,
          workArrangement: posting.workplaceType,
          compensationAnnualized: posting.compensation
            ? annualizedCompensation(posting.compensation)
            : null,
          firstSeenAt: matchedAt,
          reopened,
        },
        { now: matchedAt, followedCompanyIds },
      );
      if (!matches) continue;

      const notificationId = `notification-${randomUUID()}`;
      const notificationType = reopened ? "reopened_job" : "new_job";
      const actionLabel = reopened ? "reopened" : posting.sourcePublishedAt || posting.postedAt ? "posted" : "found";
      const title = reopened
        ? `${text(company.name)} role reopened`
        : `New ${text(company.name)} role ${actionLabel}`;
      const body = `${posting.title} was ${actionLabel} through the official monitored source. Matched alert: ${rule.name}.`;
      const hasDevelopmentEmail = channels.includes("email");
      this.database
        .prepare(
          `INSERT INTO notifications (
             id, user_id, alert_rule_id, job_id, company_id, type, title, body,
             created_at, read_at, delivery_status, data_json, is_sample
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0)`,
        )
        .run(
          notificationId,
          userId,
          rule.id,
          jobId,
          companyId,
          notificationType,
          title,
          body,
          matchedAt,
          hasDevelopmentEmail ? "development_email" : "in_app",
          safeJson({ sourceId: text(source.id), alertRuleId: rule.id, reopened, localDelivery: true }, {}),
        );

      if (channels.includes("in_app")) {
        this.database
          .prepare(
            `INSERT INTO notification_deliveries (
               id, notification_id, channel, provider, recipient, status, attempt_count,
               last_attempt_at, delivered_at, provider_message_id, error_details,
               payload_json, created_at, updated_at
             ) VALUES (?, ?, 'in_app', 'local', ?, 'delivered', 1, ?, ?, NULL, NULL, '{}', ?, ?)`,
          )
          .run(`delivery-${randomUUID()}`, notificationId, userId, matchedAt, matchedAt, matchedAt, matchedAt);
      }
      if (hasDevelopmentEmail) {
        this.database
          .prepare(
            `INSERT INTO notification_deliveries (
               id, notification_id, channel, provider, recipient, status, attempt_count,
               last_attempt_at, delivered_at, provider_message_id, error_details,
               payload_json, created_at, updated_at
             ) VALUES (?, ?, 'email', 'local_development', ?, 'development_only', 1,
                       ?, NULL, NULL, NULL, ?, ?, ?)`,
          )
          .run(
            `delivery-${randomUUID()}`,
            notificationId,
            text(row.user_email),
            matchedAt,
            safeJson({ localOnly: true, productionSent: false, title, body }, {}),
            matchedAt,
            matchedAt,
          );
      }
      this.database.prepare("UPDATE alert_rules SET last_matched_at = ?, updated_at = ? WHERE id = ?").run(matchedAt, matchedAt, rule.id);
    }
  }
}
