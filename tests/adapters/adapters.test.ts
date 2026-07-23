// @vitest-environment node
import ashbyFixture from "../fixtures/ashby.json";
import greenhouseFixture from "../fixtures/greenhouse.json";
import leverFixture from "../fixtures/lever.json";
import { AshbyAdapter } from "../../src/adapters/adapters/ashby";
import { GreenhouseAdapter } from "../../src/adapters/adapters/greenhouse";
import { LeverAdapter } from "../../src/adapters/adapters/lever";
import { WorkdayAdapter } from "../../src/adapters/adapters/workday";
import { SmartRecruitersAdapter } from "../../src/adapters/adapters/smartrecruiters";
import { CustomJsonAdapter } from "../../src/adapters/adapters/custom-json";
import { FixtureHttpClient } from "../../src/workers/fixture-http";
import { normalizeAndDedupe } from "../../src/adapters/normalize";

describe("official ATS adapter fixtures", () => {
  it("parses a complete Greenhouse board with stable IDs", async () => {
    const adapter = new GreenhouseAdapter();
    const result = await adapter.fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
      http: new FixtureHttpClient(() => greenhouseFixture),
    });
    expect(result).toMatchObject({ outcome: "success", completeness: "complete" });
    expect(result.postings.map((job) => job.externalId)).toEqual(["9001", "9002"]);
    expect(result.postings.every((job) => job.postedAt === null)).toBe(true);
    expect(result.postings.map((job) => job.sourceUpdatedAt)).toEqual([
      "2026-07-09T12:00:00.000Z",
      "2026-07-08T12:00:00.000Z",
    ]);
  });

  it("reads Greenhouse first_published only from an individual official job endpoint", async () => {
    const adapter = new GreenhouseAdapter();
    const source = { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse" as const, officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" };
    const requests: string[] = [];
    const http = new FixtureHttpClient((_method, url) => {
      requests.push(url);
      return /\/jobs\/9001$/.test(new URL(url).pathname)
        ? { id: 9001, first_published: "2026-07-01T15:30:00Z", updated_at: "2026-07-09T12:00:00Z" }
        : greenhouseFixture;
    });
    const bulk = await adapter.fetchAll({ source, http });
    const posting = normalizeAndDedupe(bulk.postings).postings[0];
    const detail = await adapter.fetchSourceTimestamps!({ source, http }, [posting]);

    expect(requests).toEqual([
      "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true",
      "https://boards-api.greenhouse.io/v1/boards/example/jobs/9001",
    ]);
    expect(detail).toMatchObject({
      failedExternalIds: [],
      metadata: [{
        externalId: "9001",
        sourcePublishedAt: "2026-07-01T15:30:00.000Z",
        sourceUpdatedAt: "2026-07-09T12:00:00.000Z",
      }],
    });
  });

  it("prefers Greenhouse office or posting metadata geography over generic workplace labels", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
      http: new FixtureHttpClient(() => ({
        jobs: [
          {
            ...greenhouseFixture.jobs[0],
            id: 9101,
            location: { name: "In-Office" },
            offices: [{ name: "Austin", location: "Austin, TX, United States" }],
            metadata: [{ name: "Job Posting Location", value: ["Austin, US"] }],
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9102,
            location: { name: "Remote" },
            offices: [],
            metadata: [{ name: "Job Posting Location", value: ["Remote (US)"] }],
          },
        ],
        meta: { total: 2 },
      })),
    });

    expect(result.postings[0]).toMatchObject({ locationText: "Austin, TX, United States", country: "US", workplaceType: "onsite" });
    expect(result.postings[1]).toMatchObject({ locationText: "Remote (US)", country: "US", workplaceType: "remote" });
  });

  it("extracts Figma-style role pay and explicit US remote eligibility from encoded Greenhouse content", async () => {
    const content = [
      "<div>",
      "&lt;p&gt;Build causal models for the Core Data team.&lt;/p&gt;",
      "&lt;p&gt;This is a full time role that can be held from one of our US hubs or remotely in the United States.&lt;/p&gt;",
      "&lt;p&gt;Equity, benefits, and annual bonus eligibility are governed by separate plans.&lt;/p&gt;",
      "&lt;div class=&quot;title&quot;&gt;Annual Base Salary Range:&lt;/div&gt;",
      "&lt;div class=&quot;pay-range&quot;&gt;&lt;span&gt;$170,000&lt;/span&gt;&lt;span&gt;&amp;mdash;&lt;/span&gt;&lt;span&gt;$178,000 USD&lt;/span&gt;&lt;/div&gt;",
      "</div>",
    ].join("");
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Figma", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/figma", boardToken: "figma" },
      http: new FixtureHttpClient(() => ({
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
      })),
    });

    expect(result.postings[0]).toMatchObject({
      externalId: "5976930004",
      locationText: "San Francisco, CA • New York, NY",
      country: "US",
      workplaceType: "remote",
      compensation: {
        minimum: 170_000,
        maximum: 178_000,
        currency: "USD",
        period: "year",
        displayText: "Annual Base Salary Range: $170,000 — $178,000 USD",
      },
    });
  });

  it("rejects Greenhouse boilerplate money and remote wording while honoring an explicit workplace label", async () => {
    const boilerplate = [
      "<p>Partner with remote teams and receive a $500 work-from-home stipend.</p>",
      "<p>For roles that are available to be filled remotely in the United States, pay depends on location.</p>",
      "<p>Benefits may include a $2,000 learning allowance, equity, and a bonus.</p>",
    ].join("");
    const explicitRoleRemote = "<p>This role may be based remotely within the U.S.</p>";
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Figma", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/figma", boardToken: "figma" },
      http: new FixtureHttpClient(() => ({
        jobs: [
          {
            ...greenhouseFixture.jobs[0],
            id: 9201,
            location: { name: "San Francisco, CA" },
            content: boilerplate,
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9202,
            location: { name: "Hybrid" },
            offices: [{ name: "New York", location: "New York, NY, United States" }],
            content: explicitRoleRemote,
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9203,
            content: "<div>Annual Base Salary Range:</div><div>$170,000 — $178,000 USD plus a $10,000 bonus</div>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9204,
            location: { name: "San Francisco, CA" },
            content: "<p>This role may be filled in San Francisco, with interviews conducted remotely in the United States.</p>",
          },
        ],
        meta: { total: 4 },
      })),
    });

    expect(result.postings[0]).toMatchObject({ workplaceType: "unspecified", compensation: null });
    expect(result.postings[1]).toMatchObject({
      locationText: "New York, NY, United States",
      workplaceType: "hybrid",
    });
    expect(result.postings[2]?.compensation).toBeNull();
    expect(result.postings[3]?.workplaceType).toBe("unspecified");
  });

  it("recognizes bounded US-remote role clauses and uses their scope only when location country is unknown", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Figma", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/figma", boardToken: "figma" },
      http: new FixtureHttpClient(() => ({
        jobs: [
          {
            ...greenhouseFixture.jobs[0],
            id: 9205,
            location: { name: "Remote" },
            offices: [],
            metadata: null,
            content: "<p>This role is fully remote within the United States.</p>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9206,
            location: { name: "Remote" },
            offices: [],
            metadata: null,
            content: "<p>This is a fully remote role within the U.S.</p>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9207,
            location: { name: "Flexible" },
            offices: [],
            metadata: [{ name: "Job Posting Location", value: ["Remote (US)"] }],
            content: "<p>Partner with remote teams and customers.</p>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9208,
            location: { name: "Toronto, Ontario, Canada" },
            content: "<p>This role is fully remote within the United States.</p>",
          },
        ],
        meta: { total: 4 },
      })),
    });

    expect(result.postings[0]).toMatchObject({ locationText: "Remote", country: "US", workplaceType: "remote" });
    expect(result.postings[1]).toMatchObject({ locationText: "Remote", country: "US", workplaceType: "remote" });
    expect(result.postings[2]).toMatchObject({ locationText: "Remote (US)", country: "US", workplaceType: "remote" });
    expect(result.postings[3]).toMatchObject({ country: "CA", workplaceType: "remote" });
  });

  it("parses only a bounded labeled hourly Greenhouse base-pay range", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Figma", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/figma", boardToken: "figma" },
      http: new FixtureHttpClient(() => ({
        jobs: [{
          ...greenhouseFixture.jobs[0],
          id: 9209,
          content: "<div>Hourly Base Pay Range:</div><div>$32.50 – $41.75 USD</div>",
        }],
        meta: { total: 1 },
      })),
    });

    expect(result.postings[0]?.compensation).toEqual({
      minimum: 32.5,
      maximum: 41.75,
      currency: "USD",
      period: "hour",
      displayText: "Hourly Base Pay Range: $32.50 – $41.75 USD",
    });
  });

  it("parses Databricks local and location-specific Greenhouse pay headings", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Databricks", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/databricks", boardToken: "databricks" },
      http: new FixtureHttpClient(() => ({
        jobs: [
          {
            ...greenhouseFixture.jobs[0],
            id: 9210,
            content: "<div class=\"title\">Local Pay Range</div><div class=\"pay-range\"><span>$133,000</span><span>&mdash;</span><span>$150,000 USD</span></div>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9211,
            content: "<div class=\"title\">San Francisco Annual Salary Range</div><div class=\"pay-range\"><span>$150,000</span><span>&mdash;</span><span>$190,000 USD</span></div>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9212,
            content: [
              "<div class=\"content-pay-transparency\"><div class=\"title\">SF Bay Area Hourly Rate</div>",
              "<div class=\"pay-range\"><span>$54</span><span>&mdash;</span><span>$56 USD</span></div></div>",
              "<div class=\"content-pay-transparency\"><div class=\"title\">Bellevue, Washington Hourly Rate</div>",
              "<div class=\"pay-range\"><span>$51.50</span><span>&mdash;</span><span>$53.50 USD</span></div></div>",
            ].join(""),
          },
        ],
        meta: { total: 3 },
      })),
    });

    expect(result.postings[0]?.compensation).toEqual({
      minimum: 133_000,
      maximum: 150_000,
      currency: "USD",
      period: "year",
      displayText: "Local Pay Range: $133,000 — $150,000 USD",
    });
    expect(result.postings[1]?.compensation).toEqual({
      minimum: 150_000,
      maximum: 190_000,
      currency: "USD",
      period: "year",
      displayText: "San Francisco Annual Salary Range: $150,000 — $190,000 USD",
    });
    expect(result.postings[2]?.compensation).toEqual({
      minimum: null,
      maximum: null,
      currency: "USD",
      period: "hour",
      displayText: "SF Bay Area Hourly Rate: $54 — $56 USD • Bellevue, Washington Hourly Rate: $51.50 — $53.50 USD",
    });
  });

  it("does not infer an annual Local Pay Range from hourly-sized or mixed-period figures", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
      http: new FixtureHttpClient(() => ({
        jobs: [
          {
            ...greenhouseFixture.jobs[0],
            id: 9213,
            content: "<div>Local Pay Range</div><div>$54 — $60 USD</div>",
          },
          {
            ...greenhouseFixture.jobs[0],
            id: 9214,
            content: [
              "<div>SF Bay Area Hourly Rate</div><div>$54 — $60 USD</div>",
              "<div>San Francisco Annual Salary Range</div><div>$150,000 — $190,000 USD</div>",
            ].join(""),
          },
        ],
        meta: { total: 2 },
      })),
    });

    expect(result.postings[0]?.compensation).toBeNull();
    expect(result.postings[1]?.compensation).toEqual({
      minimum: null,
      maximum: null,
      currency: "USD",
      period: "unknown",
      displayText: "SF Bay Area Hourly Rate: $54 — $60 USD • San Francisco Annual Salary Range: $150,000 — $190,000 USD",
    });
  });

  it("parses Ashby published timestamps, URLs, and workplace type", async () => {
    const result = await new AshbyAdapter().fetchAll({
      source: { sourceId: "a", companyId: "c", companyName: "Example", kind: "ashby", officialUrl: "https://jobs.ashbyhq.com/example", boardToken: "example" },
      http: new FixtureHttpClient(() => ashbyFixture),
    });
    expect(result.postings[0]).toMatchObject({ externalId: "ashby-new-grad-1", workplaceType: "hybrid", postedAt: "2026-07-08T16:21:55.393Z" });
  });

  it("keeps Ashby's explicit hybrid workplace type when isRemote is also true", async () => {
    const result = await new AshbyAdapter().fetchAll({
      source: { sourceId: "a", companyId: "c", companyName: "Example", kind: "ashby", officialUrl: "https://jobs.ashbyhq.com/example", boardToken: "example" },
      http: new FixtureHttpClient(() => ({ ...ashbyFixture, jobs: [{ ...ashbyFixture.jobs[0], isRemote: true }] })),
    });

    expect(result.postings[0]?.workplaceType).toBe("hybrid");
  });

  it("stops Lever pagination after the final short page", async () => {
    let calls = 0;
    const result = await new LeverAdapter().fetchAll({
      source: { sourceId: "l", companyId: "c", companyName: "Example", kind: "lever", officialUrl: "https://jobs.lever.co/example", siteName: "example" },
      http: new FixtureHttpClient(() => { calls += 1; return leverFixture; }),
    });
    expect(calls).toBe(1);
    expect(result.diagnostics.pagesRetrieved).toBe(1);
    expect(result.postings[0]).toMatchObject({ externalId: "lever-intern-1", country: "US", workplaceType: "onsite" });
  });

  it("accepts Lever's current onsite workplace spelling", async () => {
    const result = await new LeverAdapter().fetchAll({
      source: { sourceId: "l", companyId: "c", companyName: "Example", kind: "lever", officialUrl: "https://jobs.lever.co/example", siteName: "example" },
      http: new FixtureHttpClient(() => [{ ...leverFixture[0], workplaceType: "onsite" }]),
    });

    expect(result.postings[0]?.workplaceType).toBe("onsite");
  });

  it("paginates Lever until a short page without title filtering at fetch time", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ ...leverFixture[0], id: `page-one-${index}` }));
    let calls = 0;
    const result = await new LeverAdapter().fetchAll({
      source: { sourceId: "l", companyId: "c", companyName: "Example", kind: "lever", officialUrl: "https://jobs.lever.co/example", siteName: "example" },
      http: new FixtureHttpClient((_method, url) => { calls += 1; return url.includes("skip=100") ? [{ ...leverFixture[0], id: "page-two" }] : page; }),
    });
    expect(calls).toBe(2);
    expect(result.diagnostics.pagesRetrieved).toBe(2);
    expect(result.postings).toHaveLength(101);
  });

  it("supports a reviewed public Workday CXS listing but labels it experimental", async () => {
    const result = await new WorkdayAdapter().fetchAll({
      source: { sourceId: "w", companyId: "c", companyName: "Example", kind: "workday", officialUrl: "https://example.com/careers", customEndpoint: "https://example.com/wday/cxs/example/site/jobs" },
      http: new FixtureHttpClient(() => ({ total: 1, jobPostings: [{ title: "Software Engineer Intern", externalPath: "/software-intern_JR1", locationsText: "Austin, TX, United States", postedOn: "Posted 2 Days Ago", bulletFields: ["Current students"] }] })),
    });
    expect(result).toMatchObject({ outcome: "success", completeness: "complete" });
    expect(result.postings[0]).toMatchObject({ externalId: "/software-intern_JR1", postedAt: null });
    expect(result.diagnostics.warnings).toContain("experimental_undocumented_public_contract");
  });

  it("paginates SmartRecruiters list and fetches official posting detail", async () => {
    const result = await new SmartRecruitersAdapter().fetchAll({
      source: { sourceId: "s", companyId: "c", companyName: "Example", kind: "smartrecruiters", officialUrl: "https://careers.smartrecruiters.com/example", companyIdentifier: "example" },
      http: new FixtureHttpClient((_method, url) => url.includes("?limit=")
        ? { limit: 100, offset: 0, totalFound: 1, content: [{ id: "7", uuid: "uuid-7", name: "New Grad Software Engineer", location: { city: "Boston", region: "MA", country: "US", remote: false }, releasedDate: "2026-07-09T00:00:00Z" }] }
        : { id: "7", uuid: "uuid-7", name: "New Grad Software Engineer", applyUrl: "https://jobs.smartrecruiters.com/example/7", jobAd: { sections: { jobDescription: { title: "Role", text: "Build backend software in our university graduate program." } } } }),
    });
    expect(result.postings[0]).toMatchObject({ externalId: "uuid-7", canonicalUrl: "https://jobs.smartrecruiters.com/example/7" });
    expect(result.diagnostics.httpStatuses).toHaveLength(2);
  });

  it("maps a reviewed custom official JSON endpoint through explicit paths", async () => {
    const result = await new CustomJsonAdapter().fetchAll({
      source: {
        sourceId: "c", companyId: "c", companyName: "Example", kind: "custom", officialUrl: "https://example.com/careers",
        customEndpoint: "https://example.com/api/jobs", customItemsPath: "data.openings",
        customFieldMap: { id: "key", title: "name", url: "url", location: "office.label", description: "description", postedAt: "published" },
      },
      http: new FixtureHttpClient(() => ({ data: { openings: [{ key: "custom-1", name: "Graduate Backend Engineer", url: "/careers/custom-1", office: { label: "New York, NY" }, description: "Early career software role", published: "2026-07-09" }] } })),
    });
    expect(result.postings[0]).toMatchObject({ externalId: "custom-1", title: "Graduate Backend Engineer", canonicalUrl: "https://example.com/careers/custom-1" });
  });

  it("degrades duplicate stable IDs instead of silently treating the run as healthy", async () => {
    const duplicate = { ...greenhouseFixture, jobs: [greenhouseFixture.jobs[0], { ...greenhouseFixture.jobs[0] }] };
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
      http: new FixtureHttpClient(() => duplicate),
    });
    expect(result).toMatchObject({ outcome: "degraded", completeness: "partial" });
    expect(result.diagnostics.duplicateExternalIds).toEqual(["9001"]);
  });

  it("fails visibly on malformed adapter payloads", async () => {
    const result = await new AshbyAdapter().fetchAll({
      source: { sourceId: "a", companyId: "c", companyName: "Example", kind: "ashby", officialUrl: "https://jobs.ashbyhq.com/example", boardToken: "example" },
      http: new FixtureHttpClient(() => ({ apiVersion: "1", postings: [] })),
    });
    expect(result).toMatchObject({ outcome: "failed", completeness: "unknown" });
    expect(result.error?.message).toContain("jobs[]");
  });

  it("fails visibly when required source configuration is absent", async () => {
    const result = await new GreenhouseAdapter().fetchAll({
      source: { sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://example.com" },
      http: new FixtureHttpClient(() => ({})),
    });
    expect(result).toMatchObject({ outcome: "failed", completeness: "unknown" });
    expect(result.error?.message).toContain("boardToken");
  });
});
