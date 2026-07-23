// @vitest-environment node
import { inferCountry, normalizeCountry, rawPosting } from "../../src/adapters/adapters/shared";
import { isPubliclyRelevantPosting, normalizeAndDedupe, normalizePosting } from "../../src/adapters/normalize";
import type { RawPosting } from "../../src/adapters/types";

const posting: RawPosting = {
  externalId: " 42 ",
  title: " Software Engineer Intern ",
  canonicalUrl: "https://example.com/42",
  applicationUrl: "https://example.com/42/apply",
  locationText: "Seattle, WA, US",
  country: "US",
  workplaceType: "hybrid",
  employmentType: "Intern",
  department: "Engineering",
  descriptionText: "<p>Build APIs &amp; tools.</p><script>alert(1)</script>",
  responsibilities: ["<li>Ship code</li>"],
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

it("normalizes untrusted source text and produces a stable hash", () => {
  const first = normalizePosting(posting);
  const second = normalizePosting({ ...posting, raw: { volatile: true } });
  const timestampOnly = normalizePosting({
    ...posting,
    sourcePublishedAt: "2026-07-01T15:30:00.000Z",
    sourceUpdatedAt: "2026-07-09T12:00:00.000Z",
  });
  expect(first.externalId).toBe("42");
  expect(first.descriptionText).toBe("Build APIs & tools.");
  expect(first.contentHash).toBe(second.contentHash);
  expect(first.contentHash).toBe(timestampOnly.contentHash);
});

it("deduplicates stable external IDs and reports the anomaly", () => {
  const result = normalizeAndDedupe([posting, { ...posting, title: "Duplicate" }]);
  expect(result.postings).toHaveLength(1);
  expect(result.duplicateExternalIds).toEqual(["42"]);
});

describe("country scope", () => {
  it.each([
    ["Seattle, WA", "US"],
    ["Austin, Texas", "US"],
    ["Remote - United States", "US"],
    ["Washington, D.C., U.S.", "US"],
    ["Toronto, Ontario, Canada", "CA"],
    ["Tbilisi, Georgia", "UNKNOWN"],
    ["Remote - Americas", "UNKNOWN"],
    ["", "UNKNOWN"],
  ])("infers %s as %s without defaulting to the US", (location, expected) => {
    expect(inferCountry(location)).toBe(expected);
  });

  it("honors a supplied non-US country before location inference", () => {
    expect(normalizeCountry("Canada", "Ontario, CA")).toBe("CA");
    expect(normalizeCountry("Georgia", "Tbilisi, Georgia")).toBe("GEORGIA");
    expect(rawPosting({
      externalId: "unknown-country",
      title: "Software Engineer Intern",
      canonicalUrl: "https://example.com/unknown-country",
      locationText: "Location not specified",
    }).country).toBe("UNKNOWN");
  });

  it("publishes only confirmed-US, confidently classified roles", () => {
    const confirmedUs = normalizePosting(posting);
    const unknown = normalizePosting({ ...posting, country: null, locationText: "Remote - Americas" });
    const nonUs = normalizePosting({ ...posting, country: "CA", locationText: "Toronto, Canada" });
    const ambiguous = normalizePosting({
      ...posting,
      title: "Backend Software Engineer",
      employmentType: "Full time",
      descriptionText: "0 to 2 years of experience building APIs.",
    });

    expect(isPubliclyRelevantPosting(confirmedUs)).toBe(true);
    expect(isPubliclyRelevantPosting(unknown)).toBe(false);
    expect(isPubliclyRelevantPosting(nonUs)).toBe(false);
    expect(ambiguous.classification).toMatchObject({ audience: "ambiguous", relevant: false, reviewRequired: true });
    expect(isPubliclyRelevantPosting(ambiguous)).toBe(false);
  });
});
