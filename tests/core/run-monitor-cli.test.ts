// @vitest-environment node
import path from "node:path";

import type { NormalizedPosting } from "../../src/adapters";
import type { MonitorRunRecord } from "../../src/workers/monitor";
import {
  buildQualifyingPreviewPostingSamples,
  buildPreviewPostingSamples,
  monitorRunFailed,
  parseMonitorCliOptions,
  previewAcceptanceIssues,
} from "../../src/workers/run-monitor";

const originalMode = process.env.MONITOR_MODE;
const originalLiveDatabasePath = process.env.INTERNJOBS_LIVE_DB_PATH;

afterEach(() => {
  if (originalMode === undefined) delete process.env.MONITOR_MODE;
  else process.env.MONITOR_MODE = originalMode;
  if (originalLiveDatabasePath === undefined) delete process.env.INTERNJOBS_LIVE_DB_PATH;
  else process.env.INTERNJOBS_LIVE_DB_PATH = originalLiveDatabasePath;
});

it("keeps the existing monitor command in offline fixture mode by default", () => {
  delete process.env.MONITOR_MODE;
  delete process.env.INTERNJOBS_LIVE_DB_PATH;

  const options = parseMonitorCliOptions([]);

  expect(options).toMatchObject({ live: false, preview: false, source: "all" });
  expect(options.databasePath).toBe(path.resolve("data", "internjobs.live.sqlite"));
});

it("parses an explicit non-persisting live source preview", () => {
  const options = parseMonitorCliOptions([
    "--preview",
    "--source",
    "cloudflare-greenhouse",
    "--db",
    "tmp/pilot.sqlite",
    "--catalog=config/custom-live-sources.json",
  ]);

  expect(options).toEqual({
    live: true,
    preview: true,
    source: "cloudflare-greenhouse",
    databasePath: path.resolve("tmp", "pilot.sqlite"),
    catalogPath: path.resolve("config", "custom-live-sources.json"),
  });
});

it("rejects unknown live-monitor options instead of silently ignoring them", () => {
  expect(() => parseMonitorCliOptions(["--unsafe-scrape"])).toThrow(
    "Unknown monitor option --unsafe-scrape",
  );
});

it("rejects a fresh empty live preview even when the adapter reports complete success", () => {
  const result = monitorRecord({ totalJobs: 0 });

  expect(previewAcceptanceIssues(result)).toEqual(["empty_board"]);
  expect(monitorRunFailed(result, true)).toBe(true);
  expect(monitorRunFailed(result, false)).toBe(false);
});

it("emits only five bounded posting identity and classification samples", () => {
  const postings = Array.from({ length: 7 }, (_, index) => posting(index + 1));

  const samples = buildPreviewPostingSamples(postings);

  expect(samples).toHaveLength(5);
  expect(samples[0]).toEqual({
    externalId: "stable-1",
    title: "Software Engineering Intern 1",
    canonicalUrl: "https://jobs.example.com/stable-1",
    applicationUrl: "http://apply.example.com/stable-1",
    country: "US",
    classification: {
      audience: "internship",
      confidence: 0.98,
      reviewRequired: false,
    },
    https: {
      canonicalUrl: true,
      applicationUrl: false,
    },
  });
  expect(samples[0]).not.toHaveProperty("descriptionText");
  expect(samples[0]).not.toHaveProperty("raw");
});

it("separately samples only confirmed-US publicly relevant postings", () => {
  const withheld = posting(1);
  withheld.country = "UNKNOWN";
  const qualifying = Array.from({ length: 6 }, (_, index) => posting(index + 2));

  const samples = buildQualifyingPreviewPostingSamples([withheld, ...qualifying]);

  expect(samples).toHaveLength(5);
  expect(samples.map((sample) => sample.externalId)).toEqual([
    "stable-2",
    "stable-3",
    "stable-4",
    "stable-5",
    "stable-6",
  ]);
  expect(samples.every((sample) => sample.country === "US")).toBe(true);
});

function monitorRecord(input: { totalJobs: number }): MonitorRunRecord {
  return {
    id: "run-preview",
    sourceId: "source-preview",
    startedAt: "2026-07-18T00:00:00.000Z",
    completedAt: "2026-07-18T00:00:01.000Z",
    outcome: "success",
    completeness: "complete",
    relevantCount: 0,
    actions: [],
    diagnostics: {
      adapter: "greenhouse",
      adapterVersion: "test",
      startedAt: "2026-07-18T00:00:00.000Z",
      completedAt: "2026-07-18T00:00:01.000Z",
      durationMs: 1_000,
      pagesRetrieved: 1,
      httpStatuses: [200],
      totalJobs: input.totalJobs,
      warnings: [],
      suspiciousFlags: [],
      duplicateExternalIds: [],
    },
  };
}

function posting(index: number): NormalizedPosting {
  return {
    externalId: `stable-${index}`,
    title: `Software Engineering Intern ${index}`,
    normalizedTitle: `software engineering intern ${index}`,
    canonicalUrl: `https://jobs.example.com/stable-${index}`,
    applicationUrl: `http://apply.example.com/stable-${index}`,
    locationText: "Austin, TX",
    country: "US",
    workplaceType: "hybrid",
    employmentType: "Internship",
    department: "Engineering",
    descriptionText: "Intentionally excluded from preview output.",
    responsibilities: [],
    requirements: [],
    eligibility: null,
    graduationRequirements: null,
    compensation: null,
    postedAt: null,
    sourcePublishedAt: null,
    sourceUpdatedAt: null,
    sourcePublicationCheckedAt: null,
    raw: { secretRawPayload: true },
    classification: {
      audience: "internship",
      technicalCategory: "software",
      relevant: true,
      confidence: 0.98,
      reviewRequired: false,
      reasons: ["internship_title", "technical_keywords"],
    },
    sourceConfidence: 0.98,
    contentHash: `hash-${index}`,
  };
}
