// @vitest-environment node

import type { Express } from "express";
import request from "supertest";

import type { BootstrapPayload, Viewer } from "../../src/shared/domain";
import {
  StaticIdentityProvider,
  UnconfiguredProductionIdentityProvider,
} from "../../src/server/auth";
import { createApp } from "../../src/server/app";
import type { SqliteDatabase } from "../../src/server/database";
import { createSeededTestDatabase, type SeededTestDatabase } from "./test-database";

describe("database-backed API", () => {
  let fixture: SeededTestDatabase;
  let database: SqliteDatabase;
  let app: Express;

  beforeAll(() => {
    fixture = createSeededTestDatabase("api");
    database = fixture.database;
    app = createApp({ database, enableRateLimit: false, logger: false });
  });

  afterAll(() => fixture?.cleanup());

  it("returns a complete, honestly labeled bootstrap payload", async () => {
    const response = await request(app).get("/api/bootstrap").expect(200);
    const payload = response.body as BootstrapPayload;

    expect(payload.viewer).toMatchObject({
      id: "user-local-dev",
      mode: "development",
      isAdmin: true,
    });
    expect(payload.dataMode).toBe("seeded_local");
    expect(payload.jobs.filter((job) => job.availability === "active")).toHaveLength(27);
    expect(payload.companies.length).toBeGreaterThanOrEqual(20);
    expect(payload.groups.length).toBeGreaterThanOrEqual(9);
    expect(payload.sources.length).toBeGreaterThanOrEqual(20);
    expect(payload.alerts).toHaveLength(4);
    expect(payload.notifications.length).toBeGreaterThanOrEqual(5);
    expect(payload.emerging.length).toBeGreaterThanOrEqual(4);
    expect(payload.preferences).toMatchObject({ onboardingCompleted: false, opportunityFocus: "both" });
    expect(payload.companies.some((company) => company.monitoringMode === "discovery")).toBe(true);

    const foundCopyJob = payload.jobs.find((job) => job.postedAt === null);
    expect(foundCopyJob?.firstSeenAt).toBeTruthy();
    expect(foundCopyJob).toMatchObject({ sourcePublishedAt: null, sourceUpdatedAt: null });
    const publishedJob = payload.jobs.find((job) => job.sourcePublishedAt !== null);
    expect(publishedJob).toMatchObject({
      postedAt: publishedJob?.sourcePublishedAt,
      sourceUpdatedAt: null,
    });
    expect(publishedJob?.sourcePublishedAt).not.toBe(publishedJob?.firstSeenAt);
    expect(payload.companies.every((company) => company.logoUrl || company.initials)).toBe(true);
    expect(payload.sources.find((source) => source.id === "figma-greenhouse")?.adapterKind).toBe("greenhouse");
    expect(payload.sources.find((source) => source.id === "benchling-ashby")?.adapterKind).toBe("ashby");
    expect(payload.sources.find((source) => source.id === "palantir-lever")?.adapterKind).toBe("lever");
  });

  it("keeps a closed role with user activity in Tracker data", async () => {
    const payload = (await request(app).get("/api/bootstrap").expect(200)).body as BootstrapPayload;
    const trackedClosed = payload.jobs.find((job) => job.availability === "closed");

    expect(trackedClosed).toMatchObject({
      id: "job-stripe-2025-backend-ng-closed",
      availability: "closed",
      userState: { saved: true, stage: "rejected" },
    });
    expect(payload.jobs.some((job) => job.id === "job-apple-2025-ml-intern-closed")).toBe(false);
  });

  it("persists company follows idempotently", async () => {
    await request(app)
      .put("/api/companies/company-figma/follow")
      .send({ followed: true })
      .expect(200)
      .expect(({ body }) => expect(body.company.followed).toBe(true));

    await request(app)
      .put("/api/companies/company-figma/follow")
      .send({ followed: true })
      .expect(200);

    expect(
      (database.prepare("SELECT count(*) AS count FROM company_follows WHERE user_id = ? AND company_id = ?")
        .get("user-local-dev", "company-figma") as { count: number }).count,
    ).toBe(1);

    await request(app)
      .put("/api/companies/company-figma/follow")
      .send({ followed: false })
      .expect(200)
      .expect(({ body }) => expect(body.company.followed).toBe(false));
  });

  it("persists concise onboarding preferences", async () => {
    await request(app)
      .put("/api/preferences")
      .send({
        onboardingCompleted: true,
        opportunityFocus: "internship",
        technicalInterests: ["software", "infrastructure", "networking", "support", "product_management"],
        preferredLocations: ["Seattle", "New York"],
        remotePreferred: true,
        defaultNotificationFrequency: "daily",
      })
      .expect(200)
      .expect(({ body }) => expect(body.preferences).toMatchObject({
        onboardingCompleted: true,
        opportunityFocus: "internship",
        technicalInterests: ["software", "infrastructure", "networking", "support", "product_management"],
        preferredLocations: ["Seattle", "New York"],
        remotePreferred: true,
        defaultNotificationFrequency: "daily",
      }));

    const payload = (await request(app).get("/api/bootstrap").expect(200)).body as BootstrapPayload;
    expect(payload.preferences.defaultNotificationFrequency).toBe("daily");
  });

  it("updates application state and records state changes without storing note content in events", async () => {
    const jobId = "job-ramp-backend-intern-26";
    const appliedAt = "2026-07-10T20:00:00.000Z";
    const nextActionAt = "2026-07-17T20:00:00.000Z";
    const note = "Private follow-up note <script>alert('not markup')</script>";

    await request(app)
      .put(`/api/jobs/${jobId}/state`)
      .send({ saved: true, stage: "applied", notes: note, appliedAt, nextActionAt })
      .expect(200)
      .expect(({ body }) => {
        expect(body.userState).toMatchObject({ saved: true, stage: "applied", notes: note, appliedAt, nextActionAt });
      });

    await request(app)
      .put(`/api/jobs/${jobId}/state`)
      .send({ stage: "interview" })
      .expect(200)
      .expect(({ body }) => expect(body.userState.stage).toBe("interview"));

    const events = database
      .prepare("SELECT event_type, from_stage, to_stage, notes, metadata_json FROM application_events WHERE user_id = ? AND job_id = ? ORDER BY occurred_at")
      .all("user-local-dev", jobId) as Array<Record<string, unknown>>;
    expect(events.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(["saved", "stage_changed", "note_updated", "next_action_set", "application_date_set"]),
    );
    expect(events.every((event) => event.notes === null)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(note);
  });

  it("keeps bookmark state independent while normalizing the saved pseudo-stage", async () => {
    const jobId = "job-figma-product-eng-intern-26";
    await request(app)
      .put(`/api/jobs/${jobId}/state`)
      .send({ saved: true, stage: "saved" })
      .expect(200)
      .expect(({ body }) => expect(body.userState).toMatchObject({ saved: true, stage: "saved" }));

    await request(app)
      .put(`/api/jobs/${jobId}/state`)
      .send({ saved: false })
      .expect(200)
      .expect(({ body }) => expect(body.userState).toMatchObject({ saved: false, stage: null }));
  });

  it("creates, patches, and deletes validated alert rules", async () => {
    const created = await request(app)
      .post("/api/alerts")
      .send({
        name: "Remote internships at Figma",
        criteria: {
          audiences: ["internship"],
          companyIds: ["company-figma"],
          workArrangements: ["remote", "hybrid"],
          deliveryFrequency: "daily",
        },
        channels: ["in_app", "email"],
      })
      .expect(201);
    const id = created.body.alert.id as string;
    expect(created.body.alert.enabled).toBe(true);

    await request(app)
      .patch(`/api/alerts/${id}`)
      .send({ name: "Figma student roles" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.alert.name).toBe("Figma student roles");
        expect(body.alert.enabled).toBe(true);
        expect(body.alert.criteria.companyIds).toEqual(["company-figma"]);
        expect(body.alert.criteria.deliveryFrequency).toBe("daily");
      });

    await request(app)
      .post("/api/alerts")
      .send({ name: "Unknown", criteria: { companyIds: ["company-does-not-exist"] }, channels: ["in_app"] })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("UNKNOWN_ALERT_COMPANIES"));

    await request(app).delete(`/api/alerts/${id}`).expect(204);
    await request(app).patch(`/api/alerts/${id}`).send({ enabled: false }).expect(404);
  });

  it("marks only the current user's notification read or unread", async () => {
    await request(app)
      .patch("/api/notifications/notification-local-data/read")
      .send({ read: true })
      .expect(200)
      .expect(({ body }) => expect(body.notification.readAt).toEqual(expect.any(String)));

    await request(app)
      .patch("/api/notifications/notification-local-data/read")
      .send({ read: false })
      .expect(200)
      .expect(({ body }) => expect(body.notification.readAt).toBeNull());

    database
      .prepare(
        `INSERT INTO users (id, auth_subject, email, name, initials, mode, is_admin, is_sample, created_at, updated_at)
         VALUES ('user-test-other', NULL, 'other@test.invalid', 'Other User', 'OU', 'authenticated', 0, 0, ?, ?)`,
      )
      .run(new Date().toISOString(), new Date().toISOString());
    const otherViewer: Viewer = {
      id: "user-test-other",
      name: "Other User",
      email: "other@test.invalid",
      initials: "OU",
      mode: "authenticated",
      isAdmin: false,
    };
    const otherApp = createApp({
      database,
      identityProvider: new StaticIdentityProvider(otherViewer),
      enableRateLimit: false,
      logger: false,
    });
    await request(otherApp)
      .patch("/api/notifications/notification-local-data/read")
      .send({ read: true })
      .expect(404);
  });

  it("supports submit, admin review, and promotion while enforcing the admin boundary", async () => {
    const submitted = await request(app)
      .post("/api/emerging")
      .send({
        companyName: "Test Systems",
        companyDomain: "www.test-systems.example",
        reason: "Multiple independent compensation and student-role signals warrant official review.",
        discoverySource: "Local integration test submission",
        evidence: ["A secondary list mentioned a technical internship; official verification is still required."],
      })
      .expect(201);
    const candidateId = submitted.body.candidate.id as string;
    expect(submitted.body.candidate).toMatchObject({
      companyDomain: "test-systems.example",
      reviewStatus: "pending",
    });

    const nonAdminViewer: Viewer = {
      id: "user-test-other",
      name: "Other User",
      email: "other@test.invalid",
      initials: "OU",
      mode: "authenticated",
      isAdmin: false,
    };
    const nonAdminApp = createApp({
      database,
      identityProvider: new StaticIdentityProvider(nonAdminViewer),
      enableRateLimit: false,
      logger: false,
    });
    await request(nonAdminApp)
      .post(`/api/emerging/${candidateId}/reviews`)
      .send({ status: "verified", officialVerificationSource: "https://test-systems.example/careers" })
      .expect(403);

    await request(app)
      .post(`/api/emerging/${candidateId}/reviews`)
      .send({
        status: "verified",
        officialVerificationSource: "https://test-systems.example/careers",
        confidence: 0.88,
        notes: "Official public careers source verified; no unverified role was published.",
      })
      .expect(200)
      .expect(({ body }) => expect(body.candidate.reviewStatus).toBe("verified"));

    await request(app)
      .post(`/api/emerging/${candidateId}/promote`)
      .send({ categoryTags: ["High-Growth Startups"], groupIds: ["group-high-growth"] })
      .expect(200)
      .expect(({ body }) => {
        expect(body.candidate.reviewStatus).toBe("promoted");
        expect(body.company.domain).toBe("test-systems.example");
        expect(body.company.monitoringState).toBe("stale");
      });

    const source = database
      .prepare("SELECT enabled, health, error_details FROM sources WHERE company_id = (SELECT company_id FROM emerging_candidates WHERE id = ?)")
      .get(candidateId) as Record<string, unknown>;
    expect(source).toMatchObject({ enabled: 0, health: "unsupported" });
    expect(source.error_details).toContain("adapter configuration");
  });

  it("returns stable validation errors and fails closed when production auth is unconfigured", async () => {
    await request(app)
      .put("/api/jobs/job-ramp-backend-intern-26/state")
      .send({ stage: "hired" })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe("VALIDATION_ERROR"));

    const productionApp = createApp({
      database,
      identityProvider: new UnconfiguredProductionIdentityProvider(),
      enableRateLimit: false,
      logger: false,
    });
    await request(productionApp)
      .get("/api/bootstrap")
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe("PRODUCTION_AUTH_NOT_CONFIGURED"));
  });
});
