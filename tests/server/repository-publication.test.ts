// @vitest-environment node

import { InternJobsRepository } from "../../src/server/repository";
import { createSeededTestDatabase, type SeededTestDatabase } from "./test-database";

describe("job publication boundary", () => {
  let fixture: SeededTestDatabase;

  beforeEach(() => {
    fixture = createSeededTestDatabase("repository-publication");
  });

  afterEach(() => fixture.cleanup());

  it("publishes enabled-source jobs and withholds disabled-source jobs without user state", () => {
    const repository = new InternJobsRepository(fixture.database);
    const enabledJobId = "job-amazon-sde-intern-2026";

    expect(repository.listJobs("user-local-dev").some((job) => job.id === enabledJobId)).toBe(true);
    expect(
      fixture.database.prepare("SELECT 1 FROM active_relevant_jobs WHERE id = ?").get(enabledJobId),
    ).toBeTruthy();

    fixture.database.prepare("UPDATE sources SET enabled = 0 WHERE id = ?").run("source-amazon");

    expect(repository.listJobs("user-local-dev").some((job) => job.id === enabledJobId)).toBe(false);
    expect(
      fixture.database.prepare("SELECT 1 FROM active_relevant_jobs WHERE id = ?").get(enabledJobId),
    ).toBeUndefined();
  });

  it("retains a disabled-source job when the viewer has user activity", () => {
    const repository = new InternJobsRepository(fixture.database);
    const disabledTrackedJobId = "job-google-swe-intern-2026";

    expect(
      fixture.database.prepare("SELECT enabled FROM sources WHERE id = ?").get("source-google"),
    ).toEqual({ enabled: 0 });
    expect(
      fixture.database.prepare("SELECT 1 FROM active_relevant_jobs WHERE id = ?").get(disabledTrackedJobId),
    ).toBeUndefined();

    expect(repository.listJobs("user-local-dev").find((job) => job.id === disabledTrackedJobId)).toMatchObject({
      id: disabledTrackedJobId,
      userState: { saved: true, stage: "saved" },
    });
  });

  it("hydrates the additive effective technical category", () => {
    const repository = new InternJobsRepository(fixture.database);
    const jobId = "job-amazon-sde-intern-2026";
    fixture.database
      .prepare("UPDATE jobs SET effective_technical_category = 'networking' WHERE id = ?")
      .run(jobId);

    expect(repository.listJobs("user-local-dev").find((job) => job.id === jobId)).toMatchObject({
      technicalCategory: "networking",
    });
    expect(fixture.database.pragma("foreign_key_check")).toEqual([]);
  });

  it("hydrates canonical source timestamps while retaining the postedAt compatibility alias", () => {
    const repository = new InternJobsRepository(fixture.database);
    const jobId = "job-amazon-sde-intern-2026";
    fixture.database.prepare(
      `UPDATE jobs
       SET posted_at = '2026-06-01T12:00:00.000Z',
           source_published_at = '2026-06-02T13:00:00.000Z',
           source_updated_at = '2026-06-05T14:00:00.000Z'
       WHERE id = ?`,
    ).run(jobId);

    expect(repository.listJobs("user-local-dev").find((job) => job.id === jobId)).toMatchObject({
      postedAt: "2026-06-02T13:00:00.000Z",
      sourcePublishedAt: "2026-06-02T13:00:00.000Z",
      sourceUpdatedAt: "2026-06-05T14:00:00.000Z",
    });
  });
});
