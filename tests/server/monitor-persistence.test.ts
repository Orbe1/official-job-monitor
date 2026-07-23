// @vitest-environment node

import type { AdapterDiagnostics, NormalizedPosting } from "../../src/adapters";
import { SqliteMonitorPersistence } from "../../src/server/monitor-persistence";
import type { MonitorRunRecord } from "../../src/workers/monitor";
import { createSeededTestDatabase, type SeededTestDatabase } from "./test-database";

function posting(externalId: string): NormalizedPosting {
  return {
    externalId,
    title: "Software Engineering Intern — Persistence Test",
    normalizedTitle: "software engineering intern persistence test",
    canonicalUrl: `https://boards.greenhouse.io/figma/jobs/${externalId}`,
    applicationUrl: `https://boards.greenhouse.io/figma/jobs/${externalId}#app`,
    locationText: "San Francisco, CA",
    country: "US",
    workplaceType: "hybrid",
    employmentType: "Internship",
    department: "Engineering",
    descriptionText: "Public official-source-shaped test description.",
    responsibilities: ["Build and test production software."],
    requirements: ["Currently pursuing a technical degree."],
    eligibility: "Currently pursuing a BS or MS in Computer Science or a related engineering field.",
    graduationRequirements: "Graduating in Fall 2027 or Spring 2028.",
    compensation: {
      minimum: 45,
      maximum: 65,
      currency: "USD",
      period: "hour",
      displayText: "$45–$65/hour",
    },
    postedAt: null,
    sourcePublishedAt: null,
    sourceUpdatedAt: null,
    sourcePublicationCheckedAt: null,
    raw: { id: externalId, fixture: true },
    contentHash: `hash-${externalId}`,
    classification: {
      relevant: true,
      audience: "internship",
      technicalCategory: "software",
      confidence: 0.98,
      reasons: ["internship title", "software role"],
      reviewRequired: false,
    },
    sourceConfidence: 0.99,
  };
}

function diagnostics(overrides: Partial<AdapterDiagnostics> = {}): AdapterDiagnostics {
  return {
    adapter: "greenhouse",
    adapterVersion: "test-v1",
    startedAt: "2026-07-10T20:00:00.000Z",
    completedAt: "2026-07-10T20:00:01.000Z",
    durationMs: 1_000,
    pagesRetrieved: 1,
    httpStatuses: [200],
    totalJobs: 1,
    warnings: [],
    suspiciousFlags: [],
    duplicateExternalIds: [],
    ...overrides,
  };
}

describe("SqliteMonitorPersistence", () => {
  let fixture: SeededTestDatabase;

  beforeEach(() => {
    fixture = createSeededTestDatabase("monitor");
  });

  afterEach(() => fixture?.cleanup());

  it("atomically persists a discovered role, run, snapshot, history, and source summary", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const normalized = posting("live-persistence-test-1");
    fixture.database
      .prepare(
        `INSERT INTO company_follows (user_id, company_id, followed_at)
         VALUES ('user-local-dev', 'company-figma', '2026-07-10T19:59:00.000Z')
         ON CONFLICT DO NOTHING`,
      )
      .run();
    const record: MonitorRunRecord = {
      id: "monitor-run-persistence-test-1",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:00:00.000Z",
      completedAt: "2026-07-10T20:00:01.000Z",
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [
        {
          type: "discovered",
          externalId: normalized.externalId,
          posting: normalized,
          at: "2026-07-10T20:00:01.000Z",
        },
      ],
    };

    await persistence.commitRun(record, [normalized]);
    const state = await persistence.existingPostings("figma-greenhouse");
    const created = state.find((item) => item.externalId === normalized.externalId);
    expect(created).toMatchObject({ availability: "active", missingSuccessfulRuns: 0 });

    expect(
      fixture.database.prepare("SELECT status, completeness, closure_eligible FROM source_runs WHERE id = ?").get(record.id),
    ).toMatchObject({ status: "success", completeness: "complete", closure_eligible: 1 });
    expect(
      fixture.database.prepare("SELECT count(*) AS count FROM job_snapshots WHERE job_id = ?").get(created?.id) as {
        count: number;
      },
    ).toMatchObject({ count: 1 });
    expect(
      fixture.database.prepare("SELECT event_type, evidence_type FROM job_history_events WHERE job_id = ?").get(created?.id),
    ).toMatchObject({ event_type: "first_seen", evidence_type: "first_party" });
    expect(
      fixture.database.prepare(
        "SELECT eligibility, graduation_requirements FROM jobs WHERE id = ?",
      ).get(created?.id),
    ).toEqual({
      eligibility: normalized.eligibility,
      graduation_requirements: normalized.graduationRequirements,
    });
    const notification = fixture.database
      .prepare("SELECT id, type, delivery_status, is_sample FROM notifications WHERE job_id = ? AND alert_rule_id = ?")
      .get(created?.id, "alert-followed-new-roles") as Record<string, unknown>;
    expect(notification).toMatchObject({ type: "new_job", delivery_status: "development_email", is_sample: 0 });
    expect(
      fixture.database
        .prepare("SELECT channel, status FROM notification_deliveries WHERE notification_id = ? ORDER BY channel")
        .all(notification.id),
    ).toEqual([
      { channel: "email", status: "development_only" },
      { channel: "in_app", status: "delivered" },
    ]);
  });

  it("stores precise categories while preserving the legacy SQLite category", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const normalized = {
      ...posting("technical-support-category"),
      classification: {
        ...posting("technical-support-category").classification,
        technicalCategory: "support" as const,
      },
    };
    const observedAt = "2026-07-10T20:10:01.000Z";

    await persistence.commitRun({
      id: "monitor-run-precise-category",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:10:00.000Z",
      completedAt: observedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "discovered",
        externalId: normalized.externalId,
        posting: normalized,
        at: observedAt,
      }],
    }, [normalized]);

    expect(
      fixture.database
        .prepare("SELECT technical_category, effective_technical_category FROM jobs WHERE external_job_id = ?")
        .get(normalized.externalId),
    ).toEqual({
      technical_category: "infrastructure",
      effective_technical_category: "support",
    });
  });

  it("stores product management precisely with the broad legacy software fallback", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const normalized = {
      ...posting("product-management-category"),
      classification: {
        ...posting("product-management-category").classification,
        technicalCategory: "product_management" as const,
      },
    };
    const observedAt = "2026-07-10T20:15:01.000Z";

    await persistence.commitRun({
      id: "monitor-run-product-management-category",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:15:00.000Z",
      completedAt: observedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "discovered",
        externalId: normalized.externalId,
        posting: normalized,
        at: observedAt,
      }],
    }, [normalized]);

    expect(
      fixture.database
        .prepare("SELECT technical_category, effective_technical_category FROM jobs WHERE external_job_id = ?")
        .get(normalized.externalId),
    ).toEqual({
      technical_category: "software",
      effective_technical_category: "product_management",
    });
  });

  it("stores an excluded posting only in the compact source ledger", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const excluded = {
      ...posting("compact-excluded-role"),
      title: "Senior Software Engineer",
      normalizedTitle: "senior software engineer",
      descriptionText: "Requires eight years of professional experience.",
      raw: { id: "compact-excluded-role", completeDescription: "must not persist" },
      classification: {
        relevant: false,
        audience: "irrelevant" as const,
        technicalCategory: "software" as const,
        confidence: 0.96,
        reasons: ["Experienced-level requirement or title"],
        reviewRequired: false,
      },
    };
    const firstObservedAt = "2026-07-10T20:20:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-compact-excluded-first",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:20:00.000Z",
      completedAt: firstObservedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 0,
      actions: [{
        type: "discovered",
        externalId: excluded.externalId,
        posting: excluded,
        at: firstObservedAt,
      }],
    }, [excluded]);

    const state = (await persistence.existingPostings("figma-greenhouse"))
      .find((item) => item.externalId === excluded.externalId)!;
    expect(fixture.database.prepare(
      `SELECT classification_state, first_seen_at, last_seen_at
       FROM source_posting_states WHERE id = ?`,
    ).get(state.id)).toEqual({
      classification_state: "excluded",
      first_seen_at: firstObservedAt,
      last_seen_at: firstObservedAt,
    });
    expect(fixture.database.prepare(
      "SELECT count(*) AS count FROM jobs WHERE external_job_id = ?",
    ).get(excluded.externalId)).toEqual({ count: 0 });
    expect(fixture.database.prepare(
      `SELECT count(*) AS count FROM job_snapshots
       WHERE normalized_payload_json LIKE '%must not persist%' OR raw_payload_json LIKE '%must not persist%'`,
    ).get()).toEqual({ count: 0 });

    const secondObservedAt = "2026-07-10T22:20:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-compact-excluded-second",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T22:20:00.000Z",
      completedAt: secondObservedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 0,
      actions: [{
        type: "seen",
        id: state.id,
        externalId: excluded.externalId,
        posting: excluded,
        at: secondObservedAt,
      }],
    }, [excluded]);

    expect(fixture.database.prepare(
      `SELECT first_seen_at, last_seen_at FROM source_posting_states WHERE id = ?`,
    ).get(state.id)).toEqual({ first_seen_at: firstObservedAt, last_seen_at: secondObservedAt });
    expect(fixture.database.prepare(
      "SELECT count(*) AS count FROM jobs WHERE external_job_id = ?",
    ).get(excluded.externalId)).toEqual({ count: 0 });

    const missingAt = "2026-07-11T00:20:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-compact-excluded-missing",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-11T00:20:00.000Z",
      completedAt: missingAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics({ totalJobs: 0 }),
      relevantCount: 0,
      actions: [{
        type: "missing",
        id: state.id,
        externalId: excluded.externalId,
        missingSuccessfulRuns: 1,
        at: missingAt,
      }],
    }, []);
    expect(fixture.database.prepare(
      `SELECT availability, missing_successful_runs, last_closure_confirmation_at
       FROM source_posting_states WHERE id = ?`,
    ).get(state.id)).toEqual({
      availability: "closure_pending",
      missing_successful_runs: 1,
      last_closure_confirmation_at: missingAt,
    });

    const closedAt = "2026-07-11T02:20:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-compact-excluded-closed",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-11T02:20:00.000Z",
      completedAt: closedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics({ totalJobs: 0 }),
      relevantCount: 0,
      actions: [{
        type: "closed",
        id: state.id,
        externalId: excluded.externalId,
        at: closedAt,
      }],
    }, []);
    expect(fixture.database.prepare(
      "SELECT availability, closed_at FROM source_posting_states WHERE id = ?",
    ).get(state.id)).toEqual({ availability: "closed", closed_at: closedAt });

    const reopenedAt = "2026-07-11T04:20:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-compact-excluded-reopened",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-11T04:20:00.000Z",
      completedAt: reopenedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 0,
      actions: [{
        type: "reopened",
        id: state.id,
        externalId: excluded.externalId,
        posting: excluded,
        at: reopenedAt,
      }],
    }, [excluded]);
    expect(fixture.database.prepare(
      `SELECT availability, first_seen_at, last_seen_at, closed_at, reopened_at
       FROM source_posting_states WHERE id = ?`,
    ).get(state.id)).toEqual({
      availability: "active",
      first_seen_at: firstObservedAt,
      last_seen_at: reopenedAt,
      closed_at: null,
      reopened_at: reopenedAt,
    });
    expect(fixture.database.prepare(
      "SELECT count(*) AS count FROM jobs WHERE external_job_id = ?",
    ).get(excluded.externalId)).toEqual({ count: 0 });
  });

  it("materializes a previously excluded ledger ID once classification becomes includable without duplicating it", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const initial = {
      ...posting("reclassified-product-role"),
      title: "Associate Product Manager, New Grad",
      normalizedTitle: "associate product manager new grad",
      classification: {
        relevant: false,
        audience: "irrelevant" as const,
        technicalCategory: "software" as const,
        confidence: 0.92,
        reasons: ["No supported technical-role signal"],
        reviewRequired: false,
      },
    };
    const firstSeenAt = "2026-07-10T20:40:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-reclassification-excluded",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:40:00.000Z",
      completedAt: firstSeenAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 0,
      actions: [{
        type: "discovered",
        externalId: initial.externalId,
        posting: initial,
        at: firstSeenAt,
      }],
    }, [initial]);

    const state = (await persistence.existingPostings("figma-greenhouse"))
      .find((item) => item.externalId === initial.externalId)!;
    expect(fixture.database.prepare(
      "SELECT count(*) AS count FROM jobs WHERE external_job_id = ?",
    ).get(initial.externalId)).toEqual({ count: 0 });

    const included = {
      ...initial,
      classification: {
        relevant: true,
        audience: "new_grad" as const,
        technicalCategory: "product_management" as const,
        confidence: 0.92,
        reasons: [
          "Mandatory technical degree and hands-on technical product evidence",
          "New-graduate/early-career terminology in title",
        ],
        reviewRequired: false,
      },
    };
    const reclassifiedAt = "2026-07-10T22:40:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-reclassification-included",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T22:40:00.000Z",
      completedAt: reclassifiedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "seen",
        id: state.id,
        externalId: included.externalId,
        posting: included,
        at: reclassifiedAt,
      }],
    }, [included]);

    expect(fixture.database.prepare(
      `SELECT id, first_seen_at, last_seen_at, is_relevant,
              effective_technical_category
       FROM jobs WHERE external_job_id = ?`,
    ).all(included.externalId)).toEqual([{
      id: state.id,
      first_seen_at: firstSeenAt,
      last_seen_at: reclassifiedAt,
      is_relevant: 1,
      effective_technical_category: "product_management",
    }]);
    expect(fixture.database.prepare(
      "SELECT classification_state FROM source_posting_states WHERE id = ?",
    ).get(state.id)).toEqual({ classification_state: "included" });

    const repeatAt = "2026-07-11T00:40:01.000Z";
    await persistence.commitRun({
      id: "monitor-run-reclassification-repeat",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-11T00:40:00.000Z",
      completedAt: repeatAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "seen",
        id: state.id,
        externalId: included.externalId,
        posting: included,
        at: repeatAt,
      }],
    }, [included]);

    expect(fixture.database.prepare(
      "SELECT count(*) AS count FROM jobs WHERE external_job_id = ?",
    ).get(included.externalId)).toEqual({ count: 1 });
    expect(fixture.database.prepare(
      "SELECT first_seen_at, last_seen_at FROM jobs WHERE external_job_id = ?",
    ).get(included.externalId)).toEqual({ first_seen_at: firstSeenAt, last_seen_at: repeatAt });
  });

  it("keeps observation time separate while preserving publication until a confirmed reopen", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const firstObservedAt = "2026-07-10T20:00:01.000Z";
    const firstPosting = {
      ...posting("greenhouse-source-timestamps"),
      postedAt: "2026-07-01T15:30:00.000Z",
      sourcePublishedAt: "2026-07-01T15:30:00.000Z",
      sourceUpdatedAt: "2026-07-09T12:00:00.000Z",
      sourcePublicationCheckedAt: firstObservedAt,
    };
    await persistence.commitRun({
      id: "monitor-run-source-timestamps-first",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:00:00.000Z",
      completedAt: firstObservedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "discovered",
        externalId: firstPosting.externalId,
        posting: firstPosting,
        at: firstObservedAt,
      }],
    }, [firstPosting]);

    const stored = (await persistence.existingPostings("figma-greenhouse"))
      .find((candidate) => candidate.externalId === firstPosting.externalId)!;
    const secondObservedAt = "2026-07-11T20:00:01.000Z";
    const secondPosting = {
      ...firstPosting,
      postedAt: "2026-07-05T10:00:00.000Z",
      sourcePublishedAt: "2026-07-05T10:00:00.000Z",
      sourceUpdatedAt: "2026-07-11T18:00:00.000Z",
      sourcePublicationCheckedAt: "2026-07-11T20:00:00.000Z",
    };
    await persistence.commitRun({
      id: "monitor-run-source-timestamps-seen",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-11T20:00:00.000Z",
      completedAt: secondObservedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "seen",
        id: stored.id,
        externalId: secondPosting.externalId,
        posting: secondPosting,
        at: secondObservedAt,
      }],
    }, [secondPosting]);

    expect(fixture.database.prepare(
      `SELECT posted_at, source_published_at, source_updated_at,
              source_publication_checked_at, first_seen_at, last_seen_at
       FROM jobs WHERE id = ?`,
    ).get(stored.id)).toEqual({
      posted_at: "2026-07-01T15:30:00.000Z",
      source_published_at: "2026-07-01T15:30:00.000Z",
      source_updated_at: "2026-07-11T18:00:00.000Z",
      source_publication_checked_at: firstObservedAt,
      first_seen_at: firstObservedAt,
      last_seen_at: secondObservedAt,
    });

    const reopenedObservedAt = "2026-07-15T20:00:01.000Z";
    const republished = {
      ...secondPosting,
      postedAt: "2026-07-15T09:00:00.000Z",
      sourcePublishedAt: "2026-07-15T09:00:00.000Z",
      sourceUpdatedAt: "2026-07-15T09:30:00.000Z",
      sourcePublicationCheckedAt: reopenedObservedAt,
    };
    await persistence.commitRun({
      id: "monitor-run-source-timestamps-reopened",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-15T20:00:00.000Z",
      completedAt: reopenedObservedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics(),
      relevantCount: 1,
      actions: [{
        type: "reopened",
        id: stored.id,
        externalId: republished.externalId,
        posting: republished,
        at: reopenedObservedAt,
      }],
    }, [republished]);

    expect(fixture.database.prepare(
      `SELECT posted_at, source_published_at, source_updated_at,
              source_publication_checked_at, first_seen_at, last_seen_at
       FROM jobs WHERE id = ?`,
    ).get(stored.id)).toEqual({
      posted_at: "2026-07-15T09:00:00.000Z",
      source_published_at: "2026-07-15T09:00:00.000Z",
      source_updated_at: "2026-07-15T09:30:00.000Z",
      source_publication_checked_at: reopenedObservedAt,
      first_seen_at: firstObservedAt,
      last_seen_at: reopenedObservedAt,
    });
  });

  it("keeps excluded postings compact while retaining a US review-required role", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const unknown = {
      ...posting("unknown-country-intern"),
      country: null,
      locationText: "Remote - Americas",
    };
    const nonUs = {
      ...posting("canada-intern"),
      country: "CA",
      locationText: "Toronto, Ontario, Canada",
    };
    const ambiguous = {
      ...posting("ambiguous-us-role"),
      classification: {
        ...posting("ambiguous-us-role").classification,
        relevant: true,
        audience: "ambiguous" as const,
        confidence: 0.68,
        reviewRequired: true,
      },
    };
    const postings = [unknown, nonUs, ambiguous];
    const observedAt = "2026-07-10T20:30:01.000Z";
    const record: MonitorRunRecord = {
      id: "monitor-run-private-scope",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T20:30:00.000Z",
      completedAt: observedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics({ totalJobs: postings.length }),
      relevantCount: 0,
      actions: postings.map((item) => ({
        type: "discovered" as const,
        externalId: item.externalId,
        posting: item,
        at: observedAt,
      })),
    };

    await persistence.commitRun(record, postings);

    expect(fixture.database.prepare(
      `SELECT external_job_id, country, is_relevant, review_required FROM jobs
       WHERE external_job_id IN (?, ?, ?) ORDER BY external_job_id`,
    ).all("unknown-country-intern", "canada-intern", "ambiguous-us-role")).toEqual([
      { external_job_id: "ambiguous-us-role", country: "US", is_relevant: 0, review_required: 1 },
    ]);
    expect(fixture.database.prepare(
      `SELECT external_job_id, classification_state, availability
       FROM source_posting_states
       WHERE external_job_id IN (?, ?, ?) ORDER BY external_job_id`,
    ).all("unknown-country-intern", "canada-intern", "ambiguous-us-role")).toEqual([
      { external_job_id: "ambiguous-us-role", classification_state: "review_required", availability: "active" },
      { external_job_id: "canada-intern", classification_state: "excluded", availability: "active" },
      { external_job_id: "unknown-country-intern", classification_state: "excluded", availability: "active" },
    ]);
    expect(fixture.database.prepare(
      `SELECT j.external_job_id, jl.country FROM job_locations jl
       JOIN jobs j ON j.id = jl.job_id
       WHERE j.external_job_id IN (?, ?, ?) ORDER BY j.external_job_id`,
    ).all("unknown-country-intern", "canada-intern", "ambiguous-us-role")).toEqual([
      { external_job_id: "ambiguous-us-role", country: "US" },
    ]);
    expect(fixture.database.prepare(
      `SELECT count(*) AS count FROM notifications n
       JOIN jobs j ON j.id = n.job_id
       WHERE j.external_job_id IN (?, ?, ?)`,
    ).get("unknown-country-intern", "canada-intern", "ambiguous-us-role")).toEqual({ count: 0 });
  });

  it("reads source-specific closure policy and exposes persisted confirmation timing", async () => {
    fixture.database.prepare(
      `UPDATE sources SET closure_confirmation_runs = 3, expected_interval_minutes = 120
       WHERE id = 'figma-greenhouse'`,
    ).run();
    const persistence = new SqliteMonitorPersistence(fixture.database);
    expect(await persistence.lifecyclePolicy("figma-greenhouse")).toEqual({
      closureConfirmationRuns: 3,
      expectedIntervalMinutes: 120,
    });

    const existing = (await persistence.existingPostings("figma-greenhouse"))[0];
    const observedAt = "2026-07-10T22:00:01.000Z";
    const record: MonitorRunRecord = {
      id: "monitor-run-closure-confirmation-state",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T22:00:00.000Z",
      completedAt: observedAt,
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics({ totalJobs: 0 }),
      relevantCount: 0,
      actions: [{
        type: "missing",
        id: existing.id,
        externalId: existing.externalId,
        missingSuccessfulRuns: 1,
        at: observedAt,
      }],
    };

    await persistence.commitRun(record, []);
    expect((await persistence.existingPostings("figma-greenhouse")).find((item) => item.id === existing.id)).toMatchObject({
      availability: "closure_pending",
      missingSuccessfulRuns: 1,
      closureCandidateSince: observedAt,
      lastClosureConfirmationAt: observedAt,
    });
  });

  it("records an incident but preserves jobs after a suspicious empty source run", async () => {
    const persistence = new SqliteMonitorPersistence(fixture.database);
    const existing = (await persistence.existingPostings("figma-greenhouse"))[0];
    expect(existing).toBeTruthy();
    const sourceBaseline = fixture.database
      .prepare("SELECT total_jobs, relevant_jobs, last_success_at FROM sources WHERE id = ?")
      .get("figma-greenhouse");
    const record: MonitorRunRecord = {
      id: "monitor-run-suspicious-empty",
      sourceId: "figma-greenhouse",
      startedAt: "2026-07-10T21:00:00.000Z",
      completedAt: "2026-07-10T21:00:01.000Z",
      outcome: "success",
      completeness: "complete",
      diagnostics: diagnostics({
        completedAt: "2026-07-10T21:00:01.000Z",
        totalJobs: 0,
        suspiciousFlags: ["unexpected_zero_results"],
      }),
      relevantCount: 0,
      actions: [
        {
          type: "preserved",
          id: existing.id,
          externalId: existing.externalId,
          reason: "Suspicious run: unexpected_zero_results",
          at: "2026-07-10T21:00:01.000Z",
        },
      ],
    };

    await persistence.commitRun(record, []);

    expect(fixture.database.prepare("SELECT availability, closed_at FROM jobs WHERE id = ?").get(existing.id)).toMatchObject({
      availability: existing.availability,
      closed_at: existing.closedAt,
    });
    expect(fixture.database.prepare("SELECT status, closure_eligible FROM source_runs WHERE id = ?").get(record.id)).toMatchObject({
      status: "degraded",
      closure_eligible: 0,
    });
    expect(
      fixture.database.prepare("SELECT incident_type, severity, status FROM source_incidents WHERE source_run_id = ?").get(record.id),
    ).toMatchObject({ incident_type: "unexpected_zero_results", severity: "critical", status: "open" });
    expect(
      fixture.database
        .prepare("SELECT total_jobs, relevant_jobs, last_success_at FROM sources WHERE id = ?")
        .get("figma-greenhouse"),
    ).toEqual(sourceBaseline);
  });
});
