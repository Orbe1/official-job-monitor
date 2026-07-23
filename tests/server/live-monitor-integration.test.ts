// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { applyMigrations } from "../../scripts/migrate";
import { runSourceMonitor } from "../../src/workers/monitor";
import { openDatabase } from "../../src/server/database";
import {
  loadLiveSourceCatalog,
  parseLiveSourceCatalog,
  syncLiveSourceCatalog,
  toSourceAdapterConfig,
} from "../../src/server/live-sources";
import { SqliteMonitorPersistence } from "../../src/server/monitor-persistence";
import {
  assertApprovedLiveGreenhouseSources,
  greenhouseDiscoverProof,
} from "../../scripts/dev-live";
import { greenhouseFixtureHttp } from "../helpers/greenhouse-fixture-http";

it("persists an enabled official-source run end to end without sample data or duplicates", async () => {
  const database = openDatabase({ filename: ":memory:" });
  applyMigrations(database);
  const candidate = loadLiveSourceCatalog().find((entry) => entry.sourceId === "cloudflare-greenhouse");
  expect(candidate).toBeTruthy();
  const catalog = parseLiveSourceCatalog([{ ...candidate!, enabled: true }]);
  syncLiveSourceCatalog(database, catalog, "2026-07-17T12:00:00.000Z");

  const fixture = JSON.parse(
    fs.readFileSync(path.resolve("tests", "fixtures", "greenhouse.json"), "utf8"),
  ) as unknown;
  const requests: string[] = [];
  const http = greenhouseFixtureHttp(
    fixture as { jobs: Array<{ id?: number | string; updated_at?: string }>; meta?: { total?: number } },
    (url) => requests.push(url),
  );
  const persistence = new SqliteMonitorPersistence(database);
  const source = toSourceAdapterConfig(catalog[0]);
  expect(source.requestTimeoutMs).toBe(15_000);
  const times = [
    "2026-07-17T12:01:00.000Z",
    "2026-07-17T12:01:01.000Z",
    "2026-07-17T12:01:02.000Z",
    "2026-07-17T14:01:00.000Z",
    "2026-07-17T14:01:01.000Z",
    "2026-07-17T14:01:02.000Z",
  ];
  const now = () => new Date(times.shift()!);

  const first = await runSourceMonitor({ source, http, persistence, now });
  const second = await runSourceMonitor({ source, http, persistence, now });

  expect(first).toMatchObject({ outcome: "success", completeness: "complete", relevantCount: 1 });
  expect(second).toMatchObject({ outcome: "success", completeness: "complete", relevantCount: 1 });
  expect(count(database, "source_runs")).toBe(2);
  expect(count(database, "source_posting_states")).toBe(2);
  expect(count(database, "jobs")).toBe(1);
  expect(count(database, "job_locations")).toBe(1);
  expect(count(database, "job_snapshots")).toBe(2);
  expect(count(database, "job_history_events")).toBeGreaterThanOrEqual(1);
  expect(count(database, "jobs", "is_sample = 1")).toBe(0);
  expect(count(database, "jobs", "is_relevant = 1 AND country = 'US'")).toBe(1);
  expect(count(database, "jobs", "posted_at IS NOT NULL")).toBe(1);
  expect(count(database, "jobs", "source_published_at IS NOT NULL")).toBe(1);
  expect(count(database, "jobs", "source_updated_at IS NOT NULL")).toBe(1);
  expect(requests.filter((url) => /\/jobs\/\d+$/.test(new URL(url).pathname))).toHaveLength(1);
  expect(
    database.prepare(
      `SELECT source_published_at, source_updated_at, source_publication_checked_at,
              first_seen_at, last_seen_at
       FROM jobs WHERE external_job_id = '9001'`,
    ).get(),
  ).toEqual({
    source_published_at: "2026-07-01T15:30:00.000Z",
    source_updated_at: "2026-07-09T12:00:00.000Z",
    source_publication_checked_at: "2026-07-17T12:01:02.000Z",
    first_seen_at: "2026-07-17T12:01:01.000Z",
    last_seen_at: "2026-07-17T14:01:01.000Z",
  });
  expect(
    database.prepare("SELECT health, relevant_jobs FROM sources WHERE id = ?").get(source.sourceId),
  ).toEqual({ health: "healthy", relevant_jobs: 1 });
  expect(greenhouseDiscoverProof(database, source.sourceId)).toMatchObject({
    sourceId: "cloudflare-greenhouse",
    jobs: [{
      externalJobId: "9001",
      title: "Software Engineer Intern, Infrastructure",
      canonicalUrl: "https://boards.greenhouse.io/example/jobs/9001",
      applicationUrl: "https://boards.greenhouse.io/example/jobs/9001",
      sourcePublishedAt: "2026-07-01T15:30:00.000Z",
      firstSeenAt: "2026-07-17T12:01:01.000Z",
    }],
  });
  database.prepare("UPDATE companies SET domain = 'databricks.com' WHERE id = ?")
    .run(source.companyId);
  database.prepare(
    `UPDATE jobs
     SET canonical_url = 'https://databricks.com/company/careers/open-positions/job?gh_jid=9001',
         application_url = 'https://www.databricks.com/company/careers/open-positions/job?gh_jid=9001'
     WHERE source_id = ? AND external_job_id = '9001'`,
  ).run(source.sourceId);
  expect(greenhouseDiscoverProof(database, source.sourceId)?.jobs[0]).toMatchObject({
    canonicalUrl: "https://databricks.com/company/careers/open-positions/job?gh_jid=9001",
    applicationUrl: "https://www.databricks.com/company/careers/open-positions/job?gh_jid=9001",
  });
  database.prepare("UPDATE jobs SET is_relevant = 0 WHERE source_id = ?").run(source.sourceId);
  expect(greenhouseDiscoverProof(database, source.sourceId)).toMatchObject({
    sourceId: source.sourceId,
    jobs: [],
  });
  database.prepare("UPDATE jobs SET is_relevant = 1 WHERE source_id = ? AND external_job_id = '9001'")
    .run(source.sourceId);
  database.prepare(
    "UPDATE jobs SET application_url = 'https://databricks.com.evil.invalid/jobs/9001' WHERE source_id = ? AND external_job_id = '9001'",
  ).run(source.sourceId);
  expect(greenhouseDiscoverProof(database, source.sourceId)).toBeNull();
  database.close();
});

it("persists Figma role-content extraction idempotently while keeping detection time stable", async () => {
  const database = openDatabase({ filename: ":memory:" });
  applyMigrations(database);
  const candidate = loadLiveSourceCatalog().find((entry) => entry.sourceId === "figma-greenhouse");
  expect(candidate).toBeTruthy();
  const catalog = parseLiveSourceCatalog([{ ...candidate!, enabled: true }]);
  syncLiveSourceCatalog(database, catalog, "2026-07-22T12:00:00.000Z");

  const content = [
    "<div>",
    "&lt;p&gt;This is a full time role that can be held from one of our US hubs or remotely in the United States.&lt;/p&gt;",
    "&lt;p&gt;Equity, benefits, and annual bonus eligibility are separate from base salary.&lt;/p&gt;",
    "&lt;div&gt;Annual Base Salary Range:&lt;/div&gt;",
    "&lt;div&gt;&lt;span&gt;$170,000&lt;/span&gt;&lt;span&gt;&amp;mdash;&lt;/span&gt;&lt;span&gt;$178,000 USD&lt;/span&gt;&lt;/div&gt;",
    "</div>",
  ].join("");
  const board = {
    jobs: [{
      id: 5976930004,
      title: "Data Scientist, Core Data - PhD (2026)",
      updated_at: "2026-07-22T05:37:08-04:00",
      location: { name: "San Francisco, CA • New York, NY" },
      absolute_url: "https://boards.greenhouse.io/figma/jobs/5976930004",
      content,
      departments: [{ name: "Early Career" }],
      offices: [{ name: "US" }],
    }],
    meta: { total: 1 },
  };
  const requests: string[] = [];
  const http = greenhouseFixtureHttp(board, (url) => requests.push(url));
  const persistence = new SqliteMonitorPersistence(database);
  const source = toSourceAdapterConfig(catalog[0]);
  const times = [
    "2026-07-22T12:01:00.000Z",
    "2026-07-22T12:01:01.000Z",
    "2026-07-22T12:01:02.000Z",
    "2026-07-22T14:01:00.000Z",
    "2026-07-22T14:01:01.000Z",
    "2026-07-22T14:01:02.000Z",
  ];
  const now = () => new Date(times.shift()!);

  const first = await runSourceMonitor({ source, http, persistence, now });
  const second = await runSourceMonitor({ source, http, persistence, now });

  expect(first.actions.map((action) => action.type)).toEqual(["discovered"]);
  expect(second.actions.map((action) => action.type)).toEqual(["seen"]);
  expect(count(database, "jobs")).toBe(1);
  expect(requests.filter((url) => /\/jobs\/5976930004$/.test(new URL(url).pathname))).toHaveLength(1);
  expect(database.prepare(
    `SELECT technical_category, effective_technical_category,
            location_text, work_arrangement,
            compensation_minimum, compensation_maximum, compensation_currency,
            compensation_period, compensation_display_text, compensation_is_estimate,
            compensation_source, first_seen_at, last_seen_at
     FROM jobs WHERE external_job_id = '5976930004'`,
  ).get()).toEqual({
    technical_category: "data",
    effective_technical_category: "data_science",
    location_text: "San Francisco, CA • New York, NY",
    work_arrangement: "remote",
    compensation_minimum: 170_000,
    compensation_maximum: 178_000,
    compensation_currency: "USD",
    compensation_period: "year",
    compensation_display_text: "Annual Base Salary Range: $170,000 — $178,000 USD",
    compensation_is_estimate: 0,
    compensation_source: "company",
    first_seen_at: "2026-07-22T12:01:01.000Z",
    last_seen_at: "2026-07-22T14:01:01.000Z",
  });
  database.close();
});

it("locks the local live launcher to exactly the approved Greenhouse sources", () => {
  const catalog = loadLiveSourceCatalog();
  expect(() => assertApprovedLiveGreenhouseSources(catalog)).not.toThrow();
  expect(() =>
    assertApprovedLiveGreenhouseSources(
      parseLiveSourceCatalog(
        catalog.map((entry) => ({
          ...entry,
          enabled: entry.enabled || entry.sourceId === "stripe-greenhouse",
        })),
      ),
    ),
  ).toThrow(/locked to exactly cloudflare-greenhouse, figma-greenhouse, databricks-greenhouse/);
});

function count(
  database: ReturnType<typeof openDatabase>,
  table: string,
  where = "1 = 1",
): number {
  return (database.prepare(`SELECT count(*) AS count FROM ${table} WHERE ${where}`).get() as {
    count: number;
  }).count;
}
