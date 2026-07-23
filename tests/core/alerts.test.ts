// @vitest-environment node
import { annualizedCompensation, matchesAlertCriteria, matchingAlertRules, type AlertCandidate } from "../../src/workers/alerts";
import type { AlertRule } from "../../src/shared/domain";

const candidate: AlertCandidate = {
  jobId: "job-1",
  companyId: "company-nvidia",
  companyName: "NVIDIA",
  title: "CUDA Systems Software Intern",
  audience: "internship",
  technicalCategory: "embedded",
  locationText: "Santa Clara, CA, United States",
  workArrangement: "hybrid",
  compensationAnnualized: 156_000,
  firstSeenAt: "2026-07-10T10:00:00.000Z",
  reopened: false,
};

const context = { now: "2026-07-10T12:00:00.000Z", followedCompanyIds: new Set(["company-nvidia"]) };

it("matches combined company, audience, location, compensation, and freshness criteria", () => {
  expect(matchesAlertCriteria({
    audiences: ["internship"],
    followedCompaniesOnly: true,
    locations: ["Santa Clara"],
    minimumCompensation: 150_000,
    newlyFoundWithinHours: 4,
  }, candidate, context)).toBe(true);
});

it("requires reopen events for reopened-only rules", () => {
  expect(matchesAlertCriteria({ reopenedOnly: true }, candidate, context)).toBe(false);
  expect(matchesAlertCriteria({ reopenedOnly: true }, { ...candidate, reopened: true }, context)).toBe(true);
});

it("returns enabled matching rules only", () => {
  const rules: AlertRule[] = [
    { id: "1", name: "NVIDIA", enabled: true, criteria: { companyIds: ["company-nvidia"] }, channels: ["in_app"], createdAt: context.now, lastMatchedAt: null },
    { id: "2", name: "Disabled", enabled: false, criteria: {}, channels: ["in_app"], createdAt: context.now, lastMatchedAt: null },
    { id: "3", name: "New grad", enabled: true, criteria: { audiences: ["new_grad"] }, channels: ["in_app"], createdAt: context.now, lastMatchedAt: null },
  ];
  expect(matchingAlertRules(rules, candidate, context).map((rule) => rule.id)).toEqual(["1"]);
});

it("annualizes hourly and monthly compensation without guessing unknown periods", () => {
  expect(annualizedCompensation({ maximum: 75, minimum: 60, period: "hour" })).toBe(156_000);
  expect(annualizedCompensation({ maximum: 12_000, minimum: null, period: "month" })).toBe(144_000);
  expect(annualizedCompensation({ maximum: 200_000, minimum: null, period: "unknown" })).toBeNull();
});
