import { randomUUID } from "node:crypto";

import type {
  AdapterKind,
  AlertCriteria,
  AlertRule,
  ApplicationStage,
  BootstrapPayload,
  CompanySummary,
  EmergingCandidate,
  EmergingReviewStatus,
  HistoricalOpening,
  Job,
  JobAudience,
  JobLocation,
  MonitoringRun,
  Notification,
  SourceHealthStatus,
  SourceSummary,
  TechnicalCategory,
  UserJobState,
  UserPreferences,
  Viewer,
  WatchlistGroup,
  WorkArrangement,
} from "../shared/domain";
import type { SqliteDatabase } from "./database";
import { conflict, HttpError, notFound } from "./http-errors";
import type {
  CreateAlertInput,
  CreateEmergingInput,
  PromoteEmergingInput,
  ReviewEmergingInput,
  UpdateAlertInput,
  UserJobStateInput,
  UpdateUserPreferencesInput,
} from "./schemas";

type SqlRow = Record<string, unknown>;

const EMPTY_USER_STATE: UserJobState = {
  saved: false,
  stage: null,
  notes: "",
  appliedAt: null,
  nextActionAt: null,
  updatedAt: null,
};

function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numericValue(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === 1 || value === true;
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeDomain(input: string): string {
  const candidate = input.trim().toLowerCase();
  try {
    const parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    const hostname = parsed.hostname.replace(/^www\./, "");
    if (!hostname.includes(".") || hostname.length > 253) throw new Error("invalid hostname");
    return hostname;
  } catch {
    throw new HttpError(400, "INVALID_COMPANY_DOMAIN", "Company domain must be a valid hostname.");
  }
}

function makeSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "emerging-company"
  );
}

function makeInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function adapterKind(value: unknown): AdapterKind {
  const candidate = textValue(value);
  if (
    candidate === "greenhouse" ||
    candidate === "ashby" ||
    candidate === "lever" ||
    candidate === "workday" ||
    candidate === "smartrecruiters" ||
    candidate === "custom"
  ) {
    return candidate;
  }
  // The database anticipates iCIMS, while the current shared contract groups
  // it under custom until a first-class iCIMS adapter is exposed to the client.
  return "custom";
}

function mapUserState(row: SqlRow | undefined, prefix = ""): UserJobState {
  if (!row || row[`${prefix}updated_at`] == null) return { ...EMPTY_USER_STATE };
  return {
    saved: booleanValue(row[`${prefix}saved`]),
    stage: nullableText(row[`${prefix}stage`]) as ApplicationStage | null,
    notes: textValue(row[`${prefix}notes`]),
    appliedAt: nullableText(row[`${prefix}applied_at`]),
    nextActionAt: nullableText(row[`${prefix}next_action_at`]),
    updatedAt: nullableText(row[`${prefix}updated_at`]),
  };
}

export class InternJobsRepository {
  constructor(private readonly database: SqliteDatabase) {}

  getBootstrap(viewer: Viewer): BootstrapPayload {
    const companies = this.listCompanies(viewer.id);
    return {
      viewer,
      jobs: this.listJobs(viewer.id, companies),
      companies,
      groups: this.listGroups(viewer.id),
      sources: this.listSources(),
      monitoringRuns: this.listMonitoringRuns(),
      alerts: this.listAlerts(viewer.id),
      notifications: this.listNotifications(viewer.id),
      emerging: this.listEmergingCandidates(viewer),
      preferences: this.getUserPreferences(viewer.id),
      generatedAt: nowIso(),
      dataMode: this.dataMode(),
    };
  }

  private dataMode(): BootstrapPayload["dataMode"] {
    const row = this.database
      .prepare(
        `SELECT
           EXISTS(SELECT 1 FROM jobs WHERE is_sample = 1)
             OR EXISTS(SELECT 1 FROM sources WHERE is_sample = 1)
             OR EXISTS(SELECT 1 FROM companies WHERE is_sample = 1) AS has_sample,
           EXISTS(SELECT 1 FROM sources WHERE is_sample = 0) AS has_live_sources`,
      )
      .get() as SqlRow;
    if (booleanValue(row.has_sample)) return "seeded_local";
    return booleanValue(row.has_live_sources) ? "live_database" : "empty_database";
  }

  listCompanies(userId: string): CompanySummary[] {
    const rows = this.database
      .prepare(
        `SELECT c.*, CASE WHEN cf.user_id IS NULL THEN 0 ELSE 1 END AS followed,
                CASE WHEN EXISTS(SELECT 1 FROM sources s WHERE s.company_id = c.id AND s.enabled = 1)
                     THEN 'continuous' ELSE 'discovery' END AS monitoring_mode
         FROM companies c
         LEFT JOIN company_follows cf ON cf.company_id = c.id AND cf.user_id = ?
         ORDER BY c.priority_tier, c.name COLLATE NOCASE`,
      )
      .all(userId) as SqlRow[];
    const groups = this.database
      .prepare("SELECT company_id, group_id FROM watchlist_group_companies")
      .all() as SqlRow[];
    const groupIdsByCompany = new Map<string, string[]>();
    for (const group of groups) {
      const companyId = textValue(group.company_id);
      const current = groupIdsByCompany.get(companyId) ?? [];
      current.push(textValue(group.group_id));
      groupIdsByCompany.set(companyId, current);
    }
    return rows.map((row) => this.mapCompany(row, groupIdsByCompany.get(textValue(row.id)) ?? []));
  }

  private getCompany(userId: string, companyId: string): CompanySummary | null {
    const row = this.database
      .prepare(
        `SELECT c.*, CASE WHEN cf.user_id IS NULL THEN 0 ELSE 1 END AS followed,
                CASE WHEN EXISTS(SELECT 1 FROM sources s WHERE s.company_id = c.id AND s.enabled = 1)
                     THEN 'continuous' ELSE 'discovery' END AS monitoring_mode
         FROM companies c
         LEFT JOIN company_follows cf ON cf.company_id = c.id AND cf.user_id = ?
         WHERE c.id = ?`,
      )
      .get(userId, companyId) as SqlRow | undefined;
    if (!row) return null;
    const groupRows = this.database
      .prepare("SELECT group_id FROM watchlist_group_companies WHERE company_id = ? ORDER BY sort_order, group_id")
      .all(companyId) as SqlRow[];
    return this.mapCompany(
      row,
      groupRows.map((group) => textValue(group.group_id)),
    );
  }

  private mapCompany(row: SqlRow, groupIds: string[]): CompanySummary {
    return {
      id: textValue(row.id),
      slug: textValue(row.slug),
      name: textValue(row.name),
      domain: textValue(row.domain),
      careerUrl: textValue(row.career_url),
      logoUrl: nullableText(row.logo_url),
      initials: textValue(row.initials),
      categoryTags: jsonValue<string[]>(row.category_tags_json, []),
      compensationSignal: nullableText(row.compensation_signal),
      compensationDisclaimer: nullableText(row.compensation_disclaimer),
      priorityTier: numericValue(row.priority_tier, 3),
      followed: booleanValue(row.followed),
      groupIds,
      monitoringState: textValue(row.monitoring_state, "stale") as SourceHealthStatus,
      monitoringMode: textValue(row.monitoring_mode, "discovery") as "continuous" | "discovery",
    };
  }

  getUserPreferences(userId: string): UserPreferences {
    const row = this.database
      .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
      .get(userId) as SqlRow | undefined;
    if (!row) {
      return {
        onboardingCompleted: false,
        opportunityFocus: "both",
        technicalInterests: [],
        preferredLocations: [],
        remotePreferred: false,
        defaultNotificationFrequency: "immediate",
        lastVisitAt: null,
      };
    }
    return {
      onboardingCompleted: booleanValue(row.onboarding_completed),
      opportunityFocus: textValue(row.opportunity_focus, "both") as UserPreferences["opportunityFocus"],
      technicalInterests: jsonValue<TechnicalCategory[]>(row.technical_interests_json, []),
      preferredLocations: jsonValue<string[]>(row.preferred_locations_json, []),
      remotePreferred: booleanValue(row.remote_preferred),
      defaultNotificationFrequency: textValue(row.default_notification_frequency, "immediate") as UserPreferences["defaultNotificationFrequency"],
      lastVisitAt: nullableText(row.last_visit_at),
    };
  }

  updateUserPreferences(userId: string, input: UpdateUserPreferencesInput): UserPreferences {
    const current = this.getUserPreferences(userId);
    const next: UserPreferences = {
      onboardingCompleted: input.onboardingCompleted ?? current.onboardingCompleted,
      opportunityFocus: input.opportunityFocus ?? current.opportunityFocus,
      technicalInterests: uniqueStrings(input.technicalInterests ?? current.technicalInterests) as TechnicalCategory[],
      preferredLocations: uniqueStrings(input.preferredLocations ?? current.preferredLocations),
      remotePreferred: input.remotePreferred ?? current.remotePreferred,
      defaultNotificationFrequency: input.defaultNotificationFrequency ?? current.defaultNotificationFrequency,
      lastVisitAt: input.lastVisitAt === undefined ? current.lastVisitAt : input.lastVisitAt,
    };
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO user_preferences (
           user_id, onboarding_completed, opportunity_focus, technical_interests_json,
           preferred_locations_json, remote_preferred, default_notification_frequency,
           last_visit_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           onboarding_completed = excluded.onboarding_completed,
           opportunity_focus = excluded.opportunity_focus,
           technical_interests_json = excluded.technical_interests_json,
           preferred_locations_json = excluded.preferred_locations_json,
           remote_preferred = excluded.remote_preferred,
           default_notification_frequency = excluded.default_notification_frequency,
           last_visit_at = excluded.last_visit_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        Number(next.onboardingCompleted),
        next.opportunityFocus,
        JSON.stringify(next.technicalInterests),
        JSON.stringify(next.preferredLocations),
        Number(next.remotePreferred),
        next.defaultNotificationFrequency,
        next.lastVisitAt,
        timestamp,
        timestamp,
      );
    return this.getUserPreferences(userId);
  }

  listGroups(userId: string): WatchlistGroup[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM watchlist_groups
         WHERE owner_user_id IS NULL OR owner_user_id = ?
         ORDER BY group_type, sort_order, name COLLATE NOCASE`,
      )
      .all(userId) as SqlRow[];
    const memberships = this.database
      .prepare(
        `SELECT wgc.group_id, wgc.company_id
         FROM watchlist_group_companies wgc
         JOIN watchlist_groups wg ON wg.id = wgc.group_id
         WHERE wg.owner_user_id IS NULL OR wg.owner_user_id = ?
         ORDER BY wgc.sort_order, wgc.company_id`,
      )
      .all(userId) as SqlRow[];
    const companyIdsByGroup = new Map<string, string[]>();
    for (const membership of memberships) {
      const groupId = textValue(membership.group_id);
      const current = companyIdsByGroup.get(groupId) ?? [];
      current.push(textValue(membership.company_id));
      companyIdsByGroup.set(groupId, current);
    }
    return rows.map((row) => ({
      id: textValue(row.id),
      name: textValue(row.name),
      description: textValue(row.description),
      compensationSignal: booleanValue(row.compensation_signal),
      companyIds: companyIdsByGroup.get(textValue(row.id)) ?? [],
    }));
  }

  listJobs(userId: string, companies = this.listCompanies(userId)): Job[] {
    const rows = this.database
      .prepare(
        `SELECT j.*, s.display_name AS source_name, s.official_url AS source_url,
                ujs.saved AS user_saved, ujs.stage AS user_stage, ujs.notes AS user_notes,
                ujs.applied_at AS user_applied_at, ujs.next_action_at AS user_next_action_at,
                ujs.updated_at AS user_updated_at
         FROM jobs j
         JOIN sources s ON s.id = j.source_id
         LEFT JOIN user_job_states ujs ON ujs.job_id = j.id AND ujs.user_id = ?
         WHERE (j.availability = 'active' AND j.is_relevant = 1 AND s.enabled = 1)
            OR ujs.user_id IS NOT NULL
         ORDER BY COALESCE(j.source_published_at, j.posted_at, j.first_seen_at) DESC, j.id`,
      )
      .all(userId) as SqlRow[];
    if (rows.length === 0) return [];

    const jobIds = rows.map((row) => textValue(row.id));
    const locationRows = this.database
      .prepare(
        `SELECT * FROM job_locations WHERE job_id IN (${placeholders(jobIds)}) ORDER BY job_id, sort_order, id`,
      )
      .all(...jobIds) as SqlRow[];
    const locationsByJob = new Map<string, JobLocation[]>();
    for (const location of locationRows) {
      const jobId = textValue(location.job_id);
      const current = locationsByJob.get(jobId) ?? [];
      current.push({
        ...(location.city == null ? {} : { city: textValue(location.city) }),
        ...(location.region == null ? {} : { region: textValue(location.region) }),
        country: textValue(location.country, "UNKNOWN"),
        displayText: textValue(location.display_text),
      });
      locationsByJob.set(jobId, current);
    }

    const historyRows = this.database
      .prepare(
        `SELECT * FROM job_history_events
         WHERE job_id IN (${placeholders(jobIds)}) AND event_type IN ('historical_cycle', 'closed')
         ORDER BY job_id, opened_at DESC, id`,
      )
      .all(...jobIds) as SqlRow[];
    const historyByJob = new Map<string, HistoricalOpening[]>();
    for (const history of historyRows) {
      const jobId = textValue(history.job_id);
      const current = historyByJob.get(jobId) ?? [];
      current.push({
        id: textValue(history.id),
        title: textValue(history.title),
        audience: textValue(history.audience) as JobAudience,
        openedAt: textValue(history.opened_at),
        closedAt: nullableText(history.closed_at),
        observedDaysOpen: nullableNumber(history.observed_days_open),
        evidenceType: textValue(history.evidence_type) as "first_party" | "secondary_archive",
        sourceLabel: textValue(history.source_label),
      });
      historyByJob.set(jobId, current);
    }

    const companyById = new Map(companies.map((company) => [company.id, company]));
    return rows.flatMap((row) => {
      const company = companyById.get(textValue(row.company_id));
      if (!company) return [];
      const id = textValue(row.id);
      const sourcePublishedAt = nullableText(row.source_published_at) ?? nullableText(row.posted_at);
      return [
        {
          id,
          companyId: company.id,
          company,
          sourceId: textValue(row.source_id),
          externalJobId: textValue(row.external_job_id),
          canonicalUrl: textValue(row.canonical_url),
          applicationUrl: textValue(row.application_url),
          title: textValue(row.title),
          normalizedTitle: textValue(row.normalized_title),
          audience: textValue(row.audience) as JobAudience,
          technicalCategory: textValue(
            row.effective_technical_category,
            textValue(row.technical_category),
          ) as TechnicalCategory,
          employmentType: textValue(row.employment_type),
          description: textValue(row.description),
          responsibilities: jsonValue<string[]>(row.responsibilities_json, []),
          requirements: jsonValue<string[]>(row.requirements_json, []),
          preferredQualifications: jsonValue<string[]>(row.preferred_qualifications_json, []),
          eligibility: nullableText(row.eligibility),
          graduationRequirements: nullableText(row.graduation_requirements),
          workAuthorization: nullableText(row.work_authorization),
          locations: locationsByJob.get(id) ?? [],
          locationText: textValue(row.location_text),
          country: textValue(row.country, "UNKNOWN"),
          workArrangement: textValue(row.work_arrangement, "unspecified") as WorkArrangement,
          compensation: {
            minimum: nullableNumber(row.compensation_minimum),
            maximum: nullableNumber(row.compensation_maximum),
            currency: textValue(row.compensation_currency, "USD"),
            period: textValue(row.compensation_period, "unknown") as "hour" | "year" | "month" | "unknown",
            displayText: textValue(row.compensation_display_text, "Not disclosed"),
            isEstimate: booleanValue(row.compensation_is_estimate),
            source: textValue(row.compensation_source, "unknown") as "company" | "historical" | "unknown",
          },
          postedAt: sourcePublishedAt,
          sourcePublishedAt,
          sourceUpdatedAt: nullableText(row.source_updated_at),
          firstSeenAt: textValue(row.first_seen_at),
          lastSeenAt: textValue(row.last_seen_at),
          closedAt: nullableText(row.closed_at),
          reopenedAt: nullableText(row.reopened_at),
          availability: textValue(row.availability) as "active" | "closure_pending" | "closed",
          classificationConfidence: numericValue(row.classification_confidence),
          sourceConfidence: numericValue(row.source_confidence),
          sourceName: textValue(row.source_name),
          sourceUrl: textValue(row.source_url),
          lastSourceCheckAt: textValue(row.last_source_check_at),
          historicalContext: nullableText(row.historical_context),
          history: historyByJob.get(id) ?? [],
          userState: mapUserState(row, "user_"),
          isSample: booleanValue(row.is_sample),
        },
      ];
    });
  }

  listSources(): SourceSummary[] {
    const rows = this.database
      .prepare(
        `SELECT s.*, c.name AS company_name
         FROM sources s JOIN companies c ON c.id = s.company_id
         ORDER BY CASE s.health WHEN 'failing' THEN 0 WHEN 'degraded' THEN 1 WHEN 'stale' THEN 2 ELSE 3 END,
                  c.name COLLATE NOCASE, s.display_name COLLATE NOCASE`,
      )
      .all() as SqlRow[];
    return rows.map((row) => ({
      id: textValue(row.id),
      companyId: textValue(row.company_id),
      companyName: textValue(row.company_name),
      adapterKind: adapterKind(row.adapter_kind),
      displayName: textValue(row.display_name),
      officialUrl: textValue(row.official_url),
      health: textValue(row.health) as SourceHealthStatus,
      enabled: booleanValue(row.enabled),
      expectedIntervalMinutes: numericValue(row.expected_interval_minutes),
      lastAttemptAt: nullableText(row.last_attempt_at),
      lastSuccessAt: nullableText(row.last_success_at),
      lastFailureAt: nullableText(row.last_failure_at),
      httpStatus: nullableNumber(row.http_status),
      parserStatus: textValue(row.parser_status) as "ok" | "warning" | "error" | "not_run",
      parserVersion: textValue(row.parser_version),
      pagesRetrieved: numericValue(row.pages_retrieved),
      totalJobs: numericValue(row.total_jobs),
      previousTotalJobs: numericValue(row.previous_total_jobs),
      relevantJobs: numericValue(row.relevant_jobs),
      lastNewRoleAt: nullableText(row.last_new_role_at),
      consecutiveFailures: numericValue(row.consecutive_failures),
      durationMs: nullableNumber(row.duration_ms),
      suspiciousFlags: jsonValue<string[]>(row.suspicious_flags_json, []),
      errorDetails: nullableText(row.error_details),
    }));
  }

  listMonitoringRuns(limit = 100): MonitoringRun[] {
    const rows = this.database
      .prepare("SELECT * FROM source_runs ORDER BY started_at DESC, id LIMIT ?")
      .all(limit) as SqlRow[];
    return rows.map((row) => {
      const diagnostics = jsonValue<string[]>(row.diagnostics_json, []);
      const flags = jsonValue<string[]>(row.suspicious_flags_json, []).map((flag) => `Suspicious: ${flag}`);
      return {
        id: textValue(row.id),
        sourceId: textValue(row.source_id),
        startedAt: textValue(row.started_at),
        completedAt: nullableText(row.completed_at),
        status: textValue(row.status) as MonitoringRun["status"],
        completeness: textValue(row.completeness) as MonitoringRun["completeness"],
        totalJobs: numericValue(row.total_jobs),
        relevantJobs: numericValue(row.relevant_jobs),
        newJobs: numericValue(row.new_jobs),
        changedJobs: numericValue(row.changed_jobs),
        missingJobs: numericValue(row.missing_jobs),
        durationMs: nullableNumber(row.duration_ms),
        diagnostics: [...diagnostics, ...flags],
      };
    });
  }

  listAlerts(userId: string): AlertRule[] {
    const rows = this.database
      .prepare("SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC, id")
      .all(userId) as SqlRow[];
    return rows.map((row) => this.mapAlert(row));
  }

  private mapAlert(row: SqlRow): AlertRule {
    return {
      id: textValue(row.id),
      name: textValue(row.name),
      enabled: booleanValue(row.enabled),
      criteria: jsonValue<AlertCriteria>(row.criteria_json, {}),
      channels: jsonValue<Array<"in_app" | "email">>(row.channels_json, ["in_app"]),
      createdAt: textValue(row.created_at),
      lastMatchedAt: nullableText(row.last_matched_at),
    };
  }

  listNotifications(userId: string): Notification[] {
    const rows = this.database
      .prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id")
      .all(userId) as SqlRow[];
    return rows.map((row) => this.mapNotification(row));
  }

  private mapNotification(row: SqlRow): Notification {
    return {
      id: textValue(row.id),
      type: textValue(row.type) as Notification["type"],
      title: textValue(row.title),
      body: textValue(row.body),
      createdAt: textValue(row.created_at),
      readAt: nullableText(row.read_at),
      jobId: nullableText(row.job_id),
      companyId: nullableText(row.company_id),
      deliveryStatus: textValue(row.delivery_status) as Notification["deliveryStatus"],
    };
  }

  listEmergingCandidates(viewer: Viewer): EmergingCandidate[] {
    const rows = this.database
      .prepare(
        viewer.isAdmin
          ? "SELECT * FROM emerging_candidates ORDER BY confidence DESC, discovered_at DESC, id"
          : `SELECT * FROM emerging_candidates
             WHERE review_status IN ('verified', 'promoted') OR submitted_by_user_id = ?
             ORDER BY confidence DESC, discovered_at DESC, id`,
      )
      .all(...(viewer.isAdmin ? [] : [viewer.id])) as SqlRow[];
    return this.mapEmergingRows(rows);
  }

  private mapEmergingRows(rows: SqlRow[]): EmergingCandidate[] {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => textValue(row.id));
    const evidenceRows = this.database
      .prepare(
        `SELECT candidate_id, description FROM emerging_evidence
         WHERE candidate_id IN (${placeholders(ids)})
         ORDER BY candidate_id, is_official DESC, discovered_at DESC, id`,
      )
      .all(...ids) as SqlRow[];
    const roleRows = this.database
      .prepare(
        `SELECT candidate_id, job_id FROM emerging_candidate_jobs
         WHERE candidate_id IN (${placeholders(ids)}) ORDER BY candidate_id, linked_at, job_id`,
      )
      .all(...ids) as SqlRow[];
    const evidenceByCandidate = new Map<string, string[]>();
    const rolesByCandidate = new Map<string, string[]>();
    for (const evidence of evidenceRows) {
      const id = textValue(evidence.candidate_id);
      evidenceByCandidate.set(id, [...(evidenceByCandidate.get(id) ?? []), textValue(evidence.description)]);
    }
    for (const role of roleRows) {
      const id = textValue(role.candidate_id);
      rolesByCandidate.set(id, [...(rolesByCandidate.get(id) ?? []), textValue(role.job_id)]);
    }
    return rows.map((row) => {
      const id = textValue(row.id);
      return {
        id,
        companyName: textValue(row.company_name),
        companyDomain: textValue(row.company_domain),
        logoUrl: nullableText(row.logo_url),
        reason: textValue(row.reason),
        discoverySource: textValue(row.discovery_source),
        officialVerificationSource: nullableText(row.official_verification_source),
        discoveredAt: textValue(row.discovered_at),
        verifiedAt: nullableText(row.verified_at),
        reviewStatus: textValue(row.review_status) as EmergingReviewStatus,
        confidence: numericValue(row.confidence),
        evidence: evidenceByCandidate.get(id) ?? [],
        roleIds: rolesByCandidate.get(id) ?? [],
        reviewNotes: nullableText(row.review_notes),
      };
    });
  }

  private getEmergingCandidate(id: string): EmergingCandidate | null {
    const row = this.database.prepare("SELECT * FROM emerging_candidates WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? (this.mapEmergingRows([row])[0] ?? null) : null;
  }

  setCompanyFollow(userId: string, companyId: string, followed: boolean): CompanySummary {
    if (!this.database.prepare("SELECT 1 FROM companies WHERE id = ?").get(companyId)) {
      throw notFound("Company");
    }
    if (followed) {
      this.database
        .prepare("INSERT INTO company_follows (user_id, company_id, followed_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
        .run(userId, companyId, nowIso());
    } else {
      this.database.prepare("DELETE FROM company_follows WHERE user_id = ? AND company_id = ?").run(userId, companyId);
    }
    const company = this.getCompany(userId, companyId);
    if (!company) throw notFound("Company");
    return company;
  }

  updateUserJobState(userId: string, jobId: string, input: UserJobStateInput): UserJobState {
    if (!this.database.prepare("SELECT 1 FROM jobs WHERE id = ?").get(jobId)) throw notFound("Job");
    return this.database.transaction(() => {
      const previousRow = this.database
        .prepare("SELECT * FROM user_job_states WHERE user_id = ? AND job_id = ?")
        .get(userId, jobId) as SqlRow | undefined;
      const previous = mapUserState(previousRow);
      let saved = input.saved ?? previous.saved;
      let stage = input.stage === undefined ? previous.stage : input.stage;
      const notes = input.notes ?? previous.notes;
      let appliedAt = input.appliedAt === undefined ? previous.appliedAt : input.appliedAt;
      const nextActionAt = input.nextActionAt === undefined ? previous.nextActionAt : input.nextActionAt;
      const timestamp = nowIso();

      if (input.saved === false && input.stage === undefined && stage === "saved") stage = null;
      if (stage === "saved") saved = true;
      if (stage === "applied" && input.appliedAt === undefined && !appliedAt) appliedAt = timestamp;

      const hasState = saved || stage !== null || notes !== "" || appliedAt !== null || nextActionAt !== null;
      if (!hasState) {
        if (previousRow) {
          this.database.prepare("DELETE FROM user_job_states WHERE user_id = ? AND job_id = ?").run(userId, jobId);
        }
        return { ...EMPTY_USER_STATE };
      }

      this.database
        .prepare(
          `INSERT INTO user_job_states (
             user_id, job_id, saved, stage, notes, applied_at, next_action_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, job_id) DO UPDATE SET
             saved = excluded.saved, stage = excluded.stage, notes = excluded.notes,
             applied_at = excluded.applied_at, next_action_at = excluded.next_action_at,
             updated_at = excluded.updated_at`,
        )
        .run(userId, jobId, Number(saved), stage, notes, appliedAt, nextActionAt, timestamp, timestamp);

      const addEvent = (
        eventType: "saved" | "stage_changed" | "note_updated" | "next_action_set" | "application_date_set",
        metadata: Record<string, unknown>,
        fromStage: ApplicationStage | null = null,
        toStage: ApplicationStage | null = null,
      ) => {
        this.database
          .prepare(
            `INSERT INTO application_events (
               id, user_id, job_id, event_type, from_stage, to_stage, notes,
               occurred_at, metadata_json, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
          )
          .run(
            `application-event-${randomUUID()}`,
            userId,
            jobId,
            eventType,
            fromStage,
            toStage,
            timestamp,
            JSON.stringify(metadata),
            timestamp,
          );
      };

      if (saved !== previous.saved) addEvent("saved", { saved });
      if (stage !== previous.stage) addEvent("stage_changed", {}, previous.stage, stage);
      if (notes !== previous.notes) addEvent("note_updated", { noteLength: notes.length });
      if (nextActionAt !== previous.nextActionAt) addEvent("next_action_set", { nextActionAt });
      if (appliedAt !== previous.appliedAt) addEvent("application_date_set", { appliedAt });

      const nextRow = this.database
        .prepare("SELECT * FROM user_job_states WHERE user_id = ? AND job_id = ?")
        .get(userId, jobId) as SqlRow;
      return mapUserState(nextRow);
    })();
  }

  private validateAlertCriteria(criteria: AlertCriteria): void {
    const companyIds = uniqueStrings(criteria.companyIds ?? []);
    if (companyIds.length === 0) return;
    const rows = this.database
      .prepare(`SELECT id FROM companies WHERE id IN (${placeholders(companyIds)})`)
      .all(...companyIds) as SqlRow[];
    const found = new Set(rows.map((row) => textValue(row.id)));
    const missing = companyIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new HttpError(400, "UNKNOWN_ALERT_COMPANIES", "Alert criteria include unknown companies.", { missing });
    }
  }

  createAlert(userId: string, input: CreateAlertInput): AlertRule {
    this.validateAlertCriteria(input.criteria);
    const id = `alert-${randomUUID()}`;
    const timestamp = nowIso();
    this.database
      .prepare(
        `INSERT INTO alert_rules (
           id, user_id, name, enabled, criteria_json, channels_json,
           created_at, updated_at, last_matched_at, is_sample
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      )
      .run(
        id,
        userId,
        input.name,
        Number(input.enabled),
        JSON.stringify(input.criteria),
        JSON.stringify(uniqueStrings(input.channels)),
        timestamp,
        timestamp,
      );
    return this.getAlert(userId, id);
  }

  private getAlert(userId: string, id: string): AlertRule {
    const row = this.database
      .prepare("SELECT * FROM alert_rules WHERE id = ? AND user_id = ?")
      .get(id, userId) as SqlRow | undefined;
    if (!row) throw notFound("Alert rule");
    return this.mapAlert(row);
  }

  updateAlert(userId: string, id: string, input: UpdateAlertInput): AlertRule {
    const existingRow = this.database
      .prepare("SELECT * FROM alert_rules WHERE id = ? AND user_id = ?")
      .get(id, userId) as SqlRow | undefined;
    if (!existingRow) throw notFound("Alert rule");
    const existing = this.mapAlert(existingRow);
    const criteria = input.criteria ?? existing.criteria;
    this.validateAlertCriteria(criteria);
    this.database
      .prepare(
        `UPDATE alert_rules SET name = ?, enabled = ?, criteria_json = ?, channels_json = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        input.name ?? existing.name,
        Number(input.enabled ?? existing.enabled),
        JSON.stringify(criteria),
        JSON.stringify(uniqueStrings(input.channels ?? existing.channels)),
        nowIso(),
        id,
        userId,
      );
    return this.getAlert(userId, id);
  }

  deleteAlert(userId: string, id: string): void {
    const result = this.database.prepare("DELETE FROM alert_rules WHERE id = ? AND user_id = ?").run(id, userId);
    if (result.changes === 0) throw notFound("Alert rule");
  }

  setNotificationRead(userId: string, id: string, read: boolean): Notification {
    const result = this.database
      .prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?")
      .run(read ? nowIso() : null, id, userId);
    if (result.changes === 0) throw notFound("Notification");
    const row = this.database.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(id, userId) as SqlRow;
    return this.mapNotification(row);
  }

  createEmergingCandidate(userId: string, input: CreateEmergingInput): EmergingCandidate {
    const domain = normalizeDomain(input.companyDomain);
    const duplicate = this.database
      .prepare(
        `SELECT id FROM emerging_candidates
         WHERE company_domain = ? COLLATE NOCASE AND review_status <> 'rejected'
         ORDER BY discovered_at DESC LIMIT 1`,
      )
      .get(domain) as SqlRow | undefined;
    if (duplicate) {
      throw conflict("An active Emerging candidate already exists for this company domain.", {
        candidateId: textValue(duplicate.id),
      });
    }

    const id = `emerging-${randomUUID()}`;
    const timestamp = nowIso();
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO emerging_candidates (
             id, company_id, submitted_by_user_id, company_name, company_domain, logo_url,
             candidate_kind, reason, discovery_source, official_verification_source,
             discovered_at, verified_at, review_status, confidence, review_notes,
             promoted_at, is_sample, created_at, updated_at
           ) VALUES (?, NULL, ?, ?, ?, NULL, 'company', ?, ?, NULL, ?, NULL,
                     'pending', ?, NULL, NULL, 0, ?, ?)`,
        )
        .run(
          id,
          userId,
          input.companyName,
          domain,
          input.reason,
          input.discoverySource,
          timestamp,
          input.evidence.length > 0 ? 0.35 : 0.2,
          timestamp,
          timestamp,
        );
      const insertEvidence = this.database.prepare(
        `INSERT INTO emerging_evidence (
           id, candidate_id, evidence_type, source_name, source_url, description,
           is_official, discovered_at, verified_at, details_json, is_sample, created_at
         ) VALUES (?, ?, 'user_submission', ?, NULL, ?, 0, ?, NULL, '{}', 0, ?)`,
      );
      const evidence = input.evidence.length > 0 ? input.evidence : [input.reason];
      for (const description of evidence) {
        insertEvidence.run(
          `emerging-evidence-${randomUUID()}`,
          id,
          input.discoverySource,
          description,
          timestamp,
          timestamp,
        );
      }
    })();
    const candidate = this.getEmergingCandidate(id);
    if (!candidate) throw notFound("Emerging candidate");
    return candidate;
  }

  reviewEmergingCandidate(userId: string, id: string, input: ReviewEmergingInput): EmergingCandidate {
    const current = this.database.prepare("SELECT * FROM emerging_candidates WHERE id = ?").get(id) as SqlRow | undefined;
    if (!current) throw notFound("Emerging candidate");
    if (textValue(current.review_status) === "promoted") {
      throw conflict("A promoted candidate cannot be reviewed again.");
    }
    const timestamp = nowIso();
    const confidence = input.confidence ?? numericValue(current.confidence);
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE emerging_candidates SET review_status = ?, official_verification_source = ?,
             verified_at = ?, confidence = ?, review_notes = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.status,
          input.status === "verified" ? input.officialVerificationSource : null,
          input.status === "verified" ? timestamp : null,
          confidence,
          input.notes ?? null,
          timestamp,
          id,
        );
      this.database
        .prepare(
          `INSERT INTO emerging_reviews (
             id, candidate_id, reviewer_user_id, decision, notes,
             official_verification_source, confidence, reviewed_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `emerging-review-${randomUUID()}`,
          id,
          userId,
          input.status,
          input.notes ?? "",
          input.officialVerificationSource ?? null,
          confidence,
          timestamp,
          timestamp,
        );
      if (input.status === "verified" && input.officialVerificationSource) {
        this.database
          .prepare(
            `INSERT INTO emerging_evidence (
               id, candidate_id, evidence_type, source_name, source_url, description,
               is_official, discovered_at, verified_at, details_json, is_sample, created_at
             ) VALUES (?, ?, 'official_source', 'Official company hiring source', ?,
                       'Verified against the official public hiring source.', 1, ?, ?, '{}', 0, ?)`,
          )
          .run(`emerging-evidence-${randomUUID()}`, id, input.officialVerificationSource, timestamp, timestamp, timestamp);
      }
    })();
    const candidate = this.getEmergingCandidate(id);
    if (!candidate) throw notFound("Emerging candidate");
    return candidate;
  }

  promoteEmergingCandidate(
    userId: string,
    id: string,
    input: PromoteEmergingInput,
  ): { candidate: EmergingCandidate; company: CompanySummary } {
    const current = this.database.prepare("SELECT * FROM emerging_candidates WHERE id = ?").get(id) as SqlRow | undefined;
    if (!current) throw notFound("Emerging candidate");
    if (textValue(current.review_status) !== "verified") {
      throw conflict("Only an officially verified Emerging candidate can be promoted.");
    }
    const officialUrl = nullableText(current.official_verification_source);
    if (!officialUrl) throw conflict("Promotion requires an official verification source.");
    const domain = textValue(current.company_domain);
    const timestamp = nowIso();

    const companyId = this.database.transaction(() => {
      const existing = this.database
        .prepare("SELECT id FROM companies WHERE domain = ? COLLATE NOCASE")
        .get(domain) as SqlRow | undefined;
      let nextCompanyId = existing ? textValue(existing.id) : "";
      if (!nextCompanyId) {
        const name = input.name ?? textValue(current.company_name);
        const requestedSlug = input.slug ?? makeSlug(name);
        let slug = requestedSlug;
        let suffix = 2;
        while (this.database.prepare("SELECT 1 FROM companies WHERE slug = ? COLLATE NOCASE").get(slug)) {
          slug = `${requestedSlug}-${suffix++}`;
        }
        nextCompanyId = `company-${randomUUID()}`;
        this.database
          .prepare(
            `INSERT INTO companies (
               id, slug, name, domain, career_url, logo_url, initials,
               category_tags_json, supported_role_types_json, compensation_signal,
               compensation_disclaimer, priority_tier, monitoring_state, is_sample,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '["internship","new_grad"]', NULL,
                       'Compensation is not yet verified; signals are estimates, not guaranteed offers.',
                       ?, 'stale', ?, ?, ?)`,
          )
          .run(
            nextCompanyId,
            slug,
            name,
            domain,
            input.careerUrl ?? officialUrl,
            input.logoUrl === undefined ? nullableText(current.logo_url) : input.logoUrl,
            makeInitials(name),
            JSON.stringify(input.categoryTags ?? ["Emerging", "Manual review"]),
            input.priorityTier ?? 3,
            numericValue(current.is_sample),
            timestamp,
            timestamp,
          );

        this.database
          .prepare(
            `INSERT INTO sources (
               id, company_id, display_name, adapter_kind, official_url, config_json,
               enabled, health, expected_interval_minutes, minimum_request_interval_ms,
               request_timeout_ms, closure_confirmation_runs, parser_status, parser_version,
               suspicious_flags_json, error_details, is_sample, created_at, updated_at
             ) VALUES (?, ?, 'Promoted official source', 'custom', ?, '{}', 0, 'unsupported',
                       1440, 1000, 15000, 2, 'not_run', 'unconfigured', '[]',
                       'Official source verified manually; monitoring adapter configuration is still required.',
                       ?, ?, ?)`,
          )
          .run(
            `source-${randomUUID()}`,
            nextCompanyId,
            officialUrl,
            numericValue(current.is_sample),
            timestamp,
            timestamp,
          );
      }

      for (const groupId of uniqueStrings(input.groupIds ?? [])) {
        if (!this.database.prepare("SELECT 1 FROM watchlist_groups WHERE id = ?").get(groupId)) {
          throw new HttpError(400, "UNKNOWN_WATCHLIST_GROUP", `Watchlist group ${groupId} does not exist.`);
        }
        this.database
          .prepare(
            `INSERT INTO watchlist_group_companies (group_id, company_id, sort_order, added_at)
             VALUES (?, ?, 0, ?) ON CONFLICT DO NOTHING`,
          )
          .run(groupId, nextCompanyId, timestamp);
      }

      this.database
        .prepare(
          `UPDATE emerging_candidates SET company_id = ?, review_status = 'promoted', promoted_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(nextCompanyId, timestamp, timestamp, id);
      this.database
        .prepare(
          `INSERT INTO emerging_reviews (
             id, candidate_id, reviewer_user_id, decision, notes,
             official_verification_source, confidence, reviewed_at, created_at
           ) VALUES (?, ?, ?, 'promoted', 'Promoted to the curated company registry.', ?, ?, ?, ?)`,
        )
        .run(
          `emerging-review-${randomUUID()}`,
          id,
          userId,
          officialUrl,
          numericValue(current.confidence),
          timestamp,
          timestamp,
        );
      return nextCompanyId;
    })();

    const candidate = this.getEmergingCandidate(id);
    const company = this.getCompany(userId, companyId);
    if (!candidate || !company) throw new Error("Promotion transaction completed without readable records.");
    return { candidate, company };
  }
}
