// @vitest-environment node
import greenhouseFixture from "../fixtures/greenhouse.json";
import { FixtureHttpClient } from "../../src/workers/fixture-http";
import { MemoryMonitorPersistence, runSourceMonitor } from "../../src/workers/monitor";
import { greenhouseFixtureHttp } from "../helpers/greenhouse-fixture-http";

it("runs fetch, normalization, classification, lifecycle, and persistence as one vertical slice", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  const requests: string[] = [];
  const http = greenhouseFixtureHttp(greenhouseFixture, (url) => requests.push(url));
  const times = [
    "2026-07-10T12:00:00.000Z",
    "2026-07-10T12:00:01.000Z",
    "2026-07-10T12:00:02.000Z",
    "2026-07-10T14:00:00.000Z",
    "2026-07-10T14:00:01.000Z",
    "2026-07-10T14:00:02.000Z",
  ];
  const now = () => new Date(times.shift()!);
  const record = await runSourceMonitor({
    source,
    http,
    persistence,
    now,
  });
  const second = await runSourceMonitor({ source, http, persistence, now });

  expect(record.outcome).toBe("success");
  expect(second.outcome).toBe("success");
  expect(record.relevantCount).toBe(1);
  expect(record.actions.filter((action) => action.type === "discovered")).toHaveLength(2);
  expect(second.actions.every((action) => action.type === "seen")).toBe(true);
  expect(persistence.runs).toHaveLength(2);
  expect(requests.filter((url) => new URL(url).pathname.endsWith("/jobs"))).toHaveLength(2);
  expect(requests.filter((url) => /\/jobs\/\d+$/.test(new URL(url).pathname))).toHaveLength(1);
  expect(await persistence.existingPostings("g")).toContainEqual(expect.objectContaining({
    externalId: "9001",
    sourcePublishedAt: "2026-07-01T15:30:00.000Z",
    sourceUpdatedAt: "2026-07-09T12:00:00.000Z",
    firstSeenAt: "2026-07-10T12:00:01.000Z",
    lastSeenAt: "2026-07-10T14:00:01.000Z",
  }));
});

it("re-fetches Greenhouse publication metadata only after a confirmed reopen", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "g-reopen", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  let publishedAt = "2026-07-01T15:30:00Z";
  let detailRequests = 0;
  const http = new FixtureHttpClient((_method, url) => {
    const detailId = new URL(url).pathname.match(/\/jobs\/([^/]+)$/)?.[1];
    if (!detailId) return greenhouseFixture;
    detailRequests += 1;
    return { id: Number(detailId), first_published: publishedAt, updated_at: "2026-07-09T12:00:00Z" };
  });

  await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-10T12:00:00.000Z") });
  expect(detailRequests).toBe(1);
  const stored = persistence.postings.get(source.sourceId)!;
  const first = stored.find((posting) => posting.externalId === "9001")!;
  first.availability = "closed";
  first.closedAt = "2026-07-11T12:00:00.000Z";
  publishedAt = "2026-07-12T09:15:00Z";

  const reopened = await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-12T12:00:00.000Z") });
  expect(detailRequests).toBe(2);
  expect(reopened.actions.filter((action) => action.type === "reopened")).toHaveLength(1);
  expect((await persistence.existingPostings(source.sourceId)).find((posting) => posting.externalId === "9001"))
    .toMatchObject({ sourcePublishedAt: "2026-07-12T09:15:00.000Z", availability: "active" });
});

it("persists bulk jobs and records a one-time check when Greenhouse detail fails", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "g-detail-failure", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  const board = { ...greenhouseFixture, jobs: [greenhouseFixture.jobs[0]], meta: { total: 1 } };
  let detailRequests = 0;
  const http = new FixtureHttpClient((_method, url) => {
    if (/\/jobs\/9001$/.test(new URL(url).pathname)) {
      detailRequests += 1;
      throw new Error("detail unavailable");
    }
    return board;
  });

  const first = await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-10T12:00:00.000Z") });
  const second = await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-10T14:00:00.000Z") });

  expect(first).toMatchObject({ outcome: "degraded", completeness: "partial" });
  expect(first.diagnostics.suspiciousFlags).toContain("source_timestamp_detail_failed");
  expect(first.actions.filter((action) => action.type === "discovered")).toHaveLength(1);
  expect(second).toMatchObject({ outcome: "success", completeness: "complete" });
  expect(detailRequests).toBe(1);
  expect(await persistence.existingPostings(source.sourceId)).toContainEqual(expect.objectContaining({
    externalId: "9001",
    sourcePublishedAt: null,
    sourcePublicationCheckedAt: "2026-07-10T12:00:00.000Z",
  }));
});

it("uses the Greenhouse bulk pass to limit first-run details and makes no repeat detail requests", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = {
    sourceId: "databricks-shaped",
    companyId: "databricks",
    companyName: "Databricks",
    kind: "greenhouse" as const,
    officialUrl: "https://www.databricks.com/company/careers/open-positions",
    boardToken: "databricks",
  };
  const jobs = [
    {
      id: 1,
      title: "PhD GenAI Research Scientist Intern",
      content: `<h2>Job description</h2><p>Design and evaluate new methods for adapting LLMs and AI systems.</p>
        <h2>Your qualifications and qualities:</h2><h3>Required:</h3><ul>
        <li>Pursuing a PhD in computer science or related fields (electrical engineering, neuroscience, physics, math, etc.).</li>
        <li>Research experience in and proficiency with the fundamentals of deep learning.</li>
        <li>Proficient software engineering skills, including with PyTorch.</li></ul>
        <div>SF Bay Area Hourly Rate</div><div>$54 — $60 USD</div>`,
      location: { name: "San Francisco, California" },
    },
    {
      id: 2,
      title: "Associate Product Manager, New Grad (2027 Start)",
      content: `<h2>The impact you will have</h2><p>Prototype and test ideas, then build and ship platform features.</p>
        <h2>What we look for:</h2><ul>
        <li>You will graduate in Fall 2026 or Spring 2027 with a bachelors or masters degree in computer science or related engineering practice</li>
        <li>Pursuing a bachelor's or master's in computer science or a related engineering field</li>
        <li>Hands-on experience with SQL and Python.</li></ul>
        <div>Local Pay Range</div><div>$133,000 — $150,000 USD</div>`,
      location: { name: "Bellevue, Washington; Mountain View, California; San Francisco, California" },
    },
    {
      id: 3,
      title: "Product Management Intern (Summer 2027)",
      content: `<h2>The impact you will have</h2><p>Prototype and test ideas, then build and ship platform features.</p>
        <h2>What we look for:</h2><ul>
        <li>Pursuing a bachelor's or master's in computer science or a related engineering field graduating in Fall 2027 or Spring 2028</li>
        <li>Hands-on experience with SQL and Python.</li></ul>
        <p>This is a 12 week program in either San Francisco, Mountain View, or Bellevue.</p>
        <div>SF Bay Area Hourly Rate</div><div>$54 — $56 USD</div>
        <div>Bellevue, Washington Hourly Rate</div><div>$51.50 — $53.50 USD</div>`,
      location: { name: "Bellevue, Washington; Mountain View, California; San Francisco, California" },
    },
    {
      id: 4,
      title: "Systems PhD - Software Engineer",
      content: `<h2>Job description</h2><p>Build database and distributed systems.</p>
        <h2>What we look for:</h2><ul><li>PhD in databases or systems</li></ul>
        <div>Local Pay Range</div><div>$150,000 — $190,000 USD</div>`,
      location: { name: "Mountain View, California; San Francisco, California" },
    },
    {
      id: 5,
      title: "Systems PhD - Software Engineer",
      content: `<h2>Job description</h2><p>Build database and distributed systems.</p>
        <h2>What we look for:</h2><ul><li>PhD in databases or systems</li></ul>
        <div>Local Pay Range</div><div>$140,000 — $180,000 USD</div>`,
      location: { name: "Bellevue, Washington; Seattle, Washington" },
    },
    { id: 6, title: "Senior Software Engineer", content: "Requires 8+ years of experience.", location: { name: "San Francisco, California" } },
  ].map((job) => ({
    ...job,
    updated_at: "2026-07-22T12:00:00Z",
    absolute_url: `https://www.databricks.com/company/careers/open-positions/${job.id}`,
    departments: [{ name: "Engineering" }],
  }));
  const requests: string[] = [];
  const http = new FixtureHttpClient((_method, url) => {
    requests.push(url);
    const detailId = new URL(url).pathname.match(/\/jobs\/(\d+)$/)?.[1];
    if (detailId) {
      return {
        id: Number(detailId),
        first_published: "2026-07-01T12:00:00Z",
        updated_at: "2026-07-22T12:00:00Z",
      };
    }
    return { jobs, meta: { total: jobs.length } };
  });

  const first = await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-22T13:00:00.000Z") });
  const second = await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-22T15:00:00.000Z") });

  const bulkRequests = requests.filter((url) => new URL(url).pathname.endsWith("/jobs"));
  const detailRequests = requests.filter((url) => /\/jobs\/\d+$/.test(new URL(url).pathname));
  expect(bulkRequests).toHaveLength(2);
  expect(detailRequests).toHaveLength(5);
  expect(new Set(detailRequests.map((url) => new URL(url).pathname.split("/").at(-1)))).toEqual(
    new Set(["1", "2", "3", "4", "5"]),
  );
  expect(first.relevantCount).toBe(2);
  expect(second.relevantCount).toBe(2);
  expect(second.actions).toHaveLength(jobs.length);
  expect(second.actions.every((action) => action.type === "seen")).toBe(true);

  const audited = new Map(first.actions.flatMap((action) => (
    "posting" in action ? [[action.externalId, action.posting] as const] : []
  )));
  expect(audited.get("1")).toMatchObject({
    eligibility: "Pursuing a PhD in computer science or related fields (electrical engineering, neuroscience, physics, math, etc.).",
    graduationRequirements: null,
    workplaceType: "unspecified",
    compensation: { minimum: 54, maximum: 60, period: "hour" },
    classification: {
      relevant: false,
      audience: "internship",
      technicalCategory: "machine_learning",
      reviewRequired: true,
      reasons: ["Technical internship is explicitly PhD-only; review against undergraduate scope"],
    },
  });
  expect(audited.get("2")).toMatchObject({
    graduationRequirements: "You will graduate in Fall 2026 or Spring 2027 with a bachelors or masters degree in computer science or related engineering practice",
    workplaceType: "unspecified",
    compensation: { minimum: 133_000, maximum: 150_000, period: "year" },
    classification: {
      relevant: true,
      audience: "new_grad",
      technicalCategory: "product_management",
      reviewRequired: false,
    },
  });
  expect(audited.get("3")).toMatchObject({
    graduationRequirements: "Pursuing a bachelor's or master's in computer science or a related engineering field graduating in Fall 2027 or Spring 2028",
    workplaceType: "unspecified",
    compensation: {
      minimum: null,
      maximum: null,
      period: "hour",
      displayText: "SF Bay Area Hourly Rate: $54 — $56 USD • Bellevue, Washington Hourly Rate: $51.50 — $53.50 USD",
    },
    classification: {
      relevant: true,
      audience: "internship",
      technicalCategory: "product_management",
      reviewRequired: false,
    },
  });
  for (const id of ["4", "5"]) {
    expect(audited.get(id)).toMatchObject({
      eligibility: "PhD in databases or systems",
      graduationRequirements: null,
      classification: {
        relevant: false,
        audience: "irrelevant",
        technicalCategory: "software",
        reviewRequired: false,
        reasons: ["Technical role lacks student or early-career evidence"],
      },
    });
  }
});

it("enriches an unchecked ledger ID when a later bulk title becomes a possible candidate", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "g-transition", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  let title = "Senior Research Scientist";
  let detailRequests = 0;
  const http = new FixtureHttpClient((_method, url) => {
    if (/\/jobs\/7001$/.test(new URL(url).pathname)) {
      detailRequests += 1;
      return { id: 7001, first_published: "2026-07-01T12:00:00Z", updated_at: "2026-07-22T12:00:00Z" };
    }
    return {
      jobs: [{
        id: 7001,
        title,
        updated_at: "2026-07-22T12:00:00Z",
        location: { name: "San Francisco, California" },
        absolute_url: "https://boards.greenhouse.io/example/jobs/7001",
        content: "Research role.",
      }],
      meta: { total: 1 },
    };
  });

  await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-22T13:00:00.000Z") });
  expect(detailRequests).toBe(0);
  title = "PhD GenAI Research Scientist Intern";
  await runSourceMonitor({ source, http, persistence, now: () => new Date("2026-07-22T15:00:00.000Z") });
  expect(detailRequests).toBe(1);
  expect((await persistence.existingPostings(source.sourceId))[0]).toMatchObject({
    sourcePublishedAt: "2026-07-01T12:00:00.000Z",
    sourcePublicationCheckedAt: "2026-07-22T15:00:00.000Z",
  });
});

it("turns an unexpected empty board into a degraded preserving run", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  await runSourceMonitor({ source, http: greenhouseFixtureHttp(greenhouseFixture), persistence, now: () => new Date("2026-07-09T12:00:00.000Z") });
  const empty = await runSourceMonitor({ source, http: new FixtureHttpClient(() => ({ jobs: [], meta: { total: 0 } })), persistence, now: () => new Date("2026-07-10T12:00:00.000Z") });
  expect(empty.outcome).toBe("degraded");
  expect(empty.diagnostics.suspiciousFlags).toContain("unexpected_zero_results");
  expect(empty.actions.every((action) => action.type === "preserved")).toBe(true);
  expect((await persistence.existingPostings("g")).every((posting) => posting.availability === "active")).toBe(true);
});

it("treats an empty first observation as a health incident instead of a valid baseline", async () => {
  const persistence = new MemoryMonitorPersistence();
  const empty = await runSourceMonitor({
    source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
    http: new FixtureHttpClient(() => ({ jobs: [], meta: { total: 0 } })),
    persistence,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });

  expect(empty).toMatchObject({ outcome: "degraded", completeness: "complete" });
  expect(empty.diagnostics.suspiciousFlags).toContain("unexpected_zero_results");
  expect(empty.actions).toEqual([]);
});

it("counts only confirmed-US confident roles while retaining the full source board", async () => {
  const persistence = new MemoryMonitorPersistence();
  const source = { sourceId: "scope", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
  const jobs = [
    { id: 1, title: "Software Engineer Intern", location: { name: "Seattle, WA" }, absolute_url: "https://boards.greenhouse.io/example/jobs/1", content: "Student internship building backend software." },
    { id: 2, title: "Software Engineer Intern", location: { name: "Remote - Americas" }, absolute_url: "https://boards.greenhouse.io/example/jobs/2", content: "Student internship building backend software." },
    { id: 3, title: "Software Engineer Intern", location: { name: "Toronto, Canada" }, absolute_url: "https://boards.greenhouse.io/example/jobs/3", content: "Student internship building backend software." },
    { id: 4, title: "Backend Software Engineer", location: { name: "New York, NY" }, absolute_url: "https://boards.greenhouse.io/example/jobs/4", content: "0 to 2 years of experience building APIs." },
  ];

  const record = await runSourceMonitor({
    source,
    http: greenhouseFixtureHttp({ jobs, meta: { total: jobs.length } }),
    persistence,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });

  expect(record.relevantCount).toBe(1);
  expect(record.actions.filter((action) => action.type === "discovered")).toHaveLength(4);
  expect(await persistence.existingPostings(source.sourceId)).toHaveLength(4);
});
