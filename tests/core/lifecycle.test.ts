// @vitest-environment node
import { normalizePosting } from "../../src/adapters/normalize";
import { planLifecycle, type ExistingPostingState } from "../../src/adapters/lifecycle";
import type { RawPosting } from "../../src/adapters/types";

const baseRaw: RawPosting = {
  externalId: "job-1",
  title: "Software Engineer Intern",
  canonicalUrl: "https://example.com/jobs/1",
  applicationUrl: "https://example.com/jobs/1/apply",
  locationText: "New York, NY, US",
  country: "US",
  workplaceType: "hybrid",
  employmentType: "Intern",
  department: "Engineering",
  descriptionText: "Student internship building backend software.",
  responsibilities: [],
  requirements: [],
  eligibility: null,
  graduationRequirements: null,
  compensation: null,
  postedAt: null,
  sourcePublishedAt: null,
  sourceUpdatedAt: null,
  sourcePublicationCheckedAt: null,
  raw: {},
};

const existing: ExistingPostingState = {
  id: "internal-1",
  externalId: "job-1",
  contentHash: normalizePosting(baseRaw).contentHash,
  availability: "active",
  missingSuccessfulRuns: 0,
  firstSeenAt: "2026-07-01T00:00:00.000Z",
  lastSeenAt: "2026-07-08T00:00:00.000Z",
  closedAt: null,
  sourcePublishedAt: null,
  sourceUpdatedAt: null,
  sourcePublicationCheckedAt: null,
  isRelevant: true,
  closureCandidateSince: null,
  lastClosureConfirmationAt: null,
};

describe("posting lifecycle planner", () => {
  it("requires two complete successful absences before closure", () => {
    const first = planLifecycle({ existing: [existing], incoming: [], run: { outcome: "success", completeness: "complete", suspiciousFlags: [] }, now: "2026-07-09T00:00:00.000Z" });
    expect(first).toEqual([expect.objectContaining({ type: "missing", missingSuccessfulRuns: 1 })]);
    const second = planLifecycle({ existing: [{ ...existing, missingSuccessfulRuns: 1, availability: "closure_pending", closureCandidateSince: "2026-07-09T00:00:00.000Z", lastClosureConfirmationAt: "2026-07-09T00:00:00.000Z" }], incoming: [], run: { outcome: "success", completeness: "complete", suspiciousFlags: [] }, now: "2026-07-10T00:00:00.000Z" });
    expect(second).toEqual([expect.objectContaining({ type: "closed" })]);
  });

  it("uses the source threshold and separates confirmations by its polling interval", () => {
    const pending = {
      ...existing,
      availability: "closure_pending" as const,
      missingSuccessfulRuns: 1,
      closureCandidateSince: "2026-07-09T09:00:00.000Z",
      lastClosureConfirmationAt: "2026-07-09T09:00:00.000Z",
    };
    const run = { outcome: "success" as const, completeness: "complete" as const, suspiciousFlags: [] };

    expect(planLifecycle({
      existing: [pending], incoming: [], run, now: "2026-07-09T09:59:59.000Z",
      closeAfterSuccessfulAbsences: 3, expectedIntervalMinutes: 60,
    })[0]).toMatchObject({ type: "preserved", reason: "Closure confirmation interval has not elapsed" });

    expect(planLifecycle({
      existing: [pending], incoming: [], run, now: "2026-07-09T10:00:00.000Z",
      closeAfterSuccessfulAbsences: 3, expectedIntervalMinutes: 60,
    })[0]).toMatchObject({ type: "missing", missingSuccessfulRuns: 2 });

    expect(planLifecycle({
      existing: [{ ...pending, missingSuccessfulRuns: 2, lastClosureConfirmationAt: "2026-07-09T10:00:00.000Z" }],
      incoming: [], run, now: "2026-07-09T11:00:00.000Z",
      closeAfterSuccessfulAbsences: 3, expectedIntervalMinutes: 60,
    })[0]).toMatchObject({ type: "closed" });
  });

  it.each([
    { outcome: "failed" as const, completeness: "unknown" as const, suspiciousFlags: [] },
    { outcome: "success" as const, completeness: "partial" as const, suspiciousFlags: [] },
    { outcome: "success" as const, completeness: "complete" as const, suspiciousFlags: ["unexpected_zero_results"] },
  ])("preserves jobs on untrusted runs", (run) => {
    expect(planLifecycle({ existing: [existing], incoming: [], run, now: "2026-07-10T00:00:00.000Z" })[0]).toMatchObject({ type: "preserved" });
  });

  it("records content changes and reopens stable IDs", () => {
    const changed = normalizePosting({ ...baseRaw, descriptionText: "Updated student internship building distributed backend software." });
    expect(planLifecycle({ existing: [existing], incoming: [changed], run: { outcome: "success", completeness: "complete", suspiciousFlags: [] }, now: "2026-07-10T00:00:00.000Z" })[0]).toMatchObject({ type: "changed", externalId: "job-1" });
    expect(planLifecycle({ existing: [{ ...existing, availability: "closed", closedAt: "2026-07-09T00:00:00.000Z" }], incoming: [changed], run: { outcome: "success", completeness: "complete", suspiciousFlags: [] }, now: "2026-07-10T00:00:00.000Z" })[0]).toMatchObject({ type: "reopened", externalId: "job-1" });
  });
});
