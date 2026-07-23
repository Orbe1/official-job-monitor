// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  bootstrapLiveDatabase,
  LIVE_DEVELOPMENT_USER_ID,
} from "../../scripts/live-bootstrap";
import { applyMigrations } from "../../scripts/migrate";
import { openDatabase } from "../../scripts/database";
import {
  DEFAULT_LIVE_SOURCE_CATALOG_PATH,
  loadLiveSourceCatalog,
  meetsLivePilotSourceMinimum,
  parseLiveSourceCatalog,
  selectLiveSourceEntries,
  syncLiveSourceCatalog,
  toSourceAdapterConfig,
} from "../../src/server/live-sources";

const temporaryDirectories: string[] = [];

function temporaryDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "internjobs-live-bootstrap-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "pilot.sqlite");
}

function copyCatalogInput(): Array<Record<string, unknown>> {
  return JSON.parse(fs.readFileSync(DEFAULT_LIVE_SOURCE_CATALOG_PATH, "utf8")) as Array<
    Record<string, unknown>
  >;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("live source catalog validation", () => {
  it("enables only the proven Cloudflare, Figma, and Databricks Greenhouse sources", () => {
    const catalog = loadLiveSourceCatalog();

    expect(catalog).toHaveLength(9);
    expect(catalog.filter((entry) => entry.enabled).map((entry) => entry.sourceId)).toEqual([
      "cloudflare-greenhouse",
      "figma-greenhouse",
      "databricks-greenhouse",
    ]);
    expect(new Set(catalog.map((entry) => entry.kind))).toEqual(
      new Set(["greenhouse", "ashby", "lever"]),
    );
    expect(meetsLivePilotSourceMinimum(catalog)).toBe(false);
    expect(selectLiveSourceEntries(catalog, "all").map((entry) => entry.sourceId)).toEqual([
      "cloudflare-greenhouse",
      "figma-greenhouse",
      "databricks-greenhouse",
    ]);
    expect(selectLiveSourceEntries(catalog, "all", { includeDisabled: true })).toHaveLength(9);
    expect(
      selectLiveSourceEntries(catalog, "cloudflare-greenhouse", { includeDisabled: true }),
    ).toHaveLength(1);
    expect(catalog.find((entry) => entry.sourceId === "figma-greenhouse")?.company.logoPath)
      .toBe("/company-logos/figma.svg");
    expect(catalog.find((entry) => entry.sourceId === "databricks-greenhouse")?.company.logoPath)
      .toBe("/company-logos/databricks.svg");
    const databricks = catalog.find((entry) => entry.sourceId === "databricks-greenhouse");
    expect(databricks?.maximumResponseBytes).toBe(12_000_000);
    expect(databricks && toSourceAdapterConfig(databricks).maximumResponseBytes).toBe(12_000_000);
  });

  it("rejects duplicate stable identifiers and company identities", () => {
    const input = copyCatalogInput().slice(0, 2);
    input[1] = {
      ...input[1],
      sourceId: input[0].sourceId,
      company: input[0].company,
    };

    expect(() => parseLiveSourceCatalog(input)).toThrow(/duplicate sourceId/);
    expect(() => parseLiveSourceCatalog(input)).toThrow(/duplicate company\.id/);
  });

  it("rejects non-HTTPS company and source URLs", () => {
    const sourceUrlInput = copyCatalogInput().slice(0, 1);
    sourceUrlInput[0] = { ...sourceUrlInput[0], officialUrl: "http://example.com/jobs" };
    expect(() => parseLiveSourceCatalog(sourceUrlInput)).toThrow(/must use HTTPS/);

    const companyUrlInput = copyCatalogInput().slice(0, 1);
    companyUrlInput[0] = {
      ...companyUrlInput[0],
      company: {
        ...(companyUrlInput[0].company as Record<string, unknown>),
        careerUrl: "http://example.com/careers",
      },
    };
    expect(() => parseLiveSourceCatalog(companyUrlInput)).toThrow(/must use HTTPS/);
  });

  it("bounds reviewed per-source response-size overrides", () => {
    const input = copyCatalogInput().slice(0, 1);
    input[0] = { ...input[0], maximumResponseBytes: 20_000_001 };
    expect(() => parseLiveSourceCatalog(input)).toThrow(/20000000/);
  });

  it("accepts only curated same-origin company logo paths", () => {
    const validInput = copyCatalogInput().slice(0, 1);
    expect(parseLiveSourceCatalog(validInput)[0].company.logoPath).toBe(
      "/company-logos/cloudflare.ico",
    );

    const invalidInput = copyCatalogInput().slice(0, 1);
    invalidInput[0] = {
      ...invalidInput[0],
      company: {
        ...(invalidInput[0].company as Record<string, unknown>),
        logoPath: "https://cloudflare.com/favicon.ico",
      },
    };
    expect(() => parseLiveSourceCatalog(invalidInput)).toThrow(
      /must be a same-origin asset under \/company-logos/,
    );
  });

  it("permits future unsupported candidates only while they remain disabled", () => {
    const input = copyCatalogInput().slice(0, 1);
    input[0] = {
      ...input[0],
      sourceId: "future-workday",
      kind: "workday",
      enabled: false,
    };
    expect(parseLiveSourceCatalog(input)[0].kind).toBe("workday");

    input[0] = { ...input[0], enabled: true };
    expect(() => parseLiveSourceCatalog(input)).toThrow(
      /workday sources cannot be enabled in the live pilot/,
    );
  });
});

describe("live source catalog synchronization", () => {
  it("is idempotent and disables missing managed sources instead of deleting them", () => {
    const database = openDatabase(":memory:");
    applyMigrations(database);
    const input: Array<Record<string, unknown>> = copyCatalogInput()
      .slice(0, 2)
      .map((entry): Record<string, unknown> => ({ ...entry, enabled: true }));
    const missingSourceId = String(input[1]["sourceId"]);
    const catalog = parseLiveSourceCatalog(input);

    syncLiveSourceCatalog(database, catalog, "2026-07-17T12:00:00.000Z");
    syncLiveSourceCatalog(database, catalog, "2026-07-17T12:00:00.000Z");

    expect((database.prepare("SELECT count(*) AS count FROM companies").get() as { count: number }).count).toBe(2);
    expect((database.prepare("SELECT count(*) AS count FROM sources").get() as { count: number }).count).toBe(2);
    expect((database.prepare("SELECT count(*) AS count FROM jobs").get() as { count: number }).count).toBe(0);
    expect(database.prepare("SELECT logo_url FROM companies WHERE id = ?").get("company-cloudflare"))
      .toEqual({ logo_url: "/company-logos/cloudflare.ico" });

    const reducedCatalog = parseLiveSourceCatalog(input.slice(0, 1));
    const result = syncLiveSourceCatalog(
      database,
      reducedCatalog,
      "2026-07-17T14:00:00.000Z",
    );
    const removed = database
      .prepare("SELECT enabled FROM sources WHERE id = ?")
      .get(missingSourceId) as { enabled: number };

    expect(result.missingSourcesDisabled).toBe(1);
    expect(removed.enabled).toBe(0);
    expect((database.prepare("SELECT count(*) AS count FROM sources").get() as { count: number }).count).toBe(2);
    database.close();
  });

  it("bootstraps a clean live database with one labeled dev user and no sample jobs", () => {
    const databasePath = temporaryDatabasePath();
    const first = bootstrapLiveDatabase({
      databasePath,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
    });
    const second = bootstrapLiveDatabase({
      databasePath,
      now: () => new Date("2026-07-17T14:00:00.000Z"),
    });
    const database = openDatabase(databasePath);

    expect(first.companies).toBe(9);
    expect(first.sources).toBe(9);
    expect(first.jobs).toBe(0);
    expect(first.sampleJobs).toBe(0);
    expect(second.migrationsApplied).toEqual([]);
    expect((database.prepare("SELECT count(*) AS count FROM users").get() as { count: number }).count).toBe(1);
    expect(
      database.prepare("SELECT name, mode, is_sample FROM users WHERE id = ?").get(
        LIVE_DEVELOPMENT_USER_ID,
      ),
    ).toEqual({
      name: "Local Student (Development)",
      mode: "development",
      is_sample: 0,
    });
    expect(
      database.prepare("SELECT onboarding_completed FROM user_preferences WHERE user_id = ?").get(
        LIVE_DEVELOPMENT_USER_ID,
      ),
    ).toEqual({ onboarding_completed: 1 });
    expect((database.prepare("SELECT count(*) AS count FROM companies").get() as { count: number }).count).toBe(9);
    expect(database.prepare("SELECT logo_url, is_sample FROM companies WHERE id = ?").get("company-cloudflare"))
      .toEqual({ logo_url: "/company-logos/cloudflare.ico", is_sample: 0 });
    expect(database.prepare("SELECT logo_url, is_sample FROM companies WHERE id = ?").get("company-figma"))
      .toEqual({ logo_url: "/company-logos/figma.svg", is_sample: 0 });
    expect(database.prepare("SELECT logo_url, is_sample FROM companies WHERE id = ?").get("company-databricks"))
      .toEqual({ logo_url: "/company-logos/databricks.svg", is_sample: 0 });
    expect(database.prepare(
      "SELECT json_extract(config_json, '$.maximumResponseBytes') AS maximum_response_bytes FROM sources WHERE id = 'databricks-greenhouse'",
    ).get()).toEqual({ maximum_response_bytes: 12_000_000 });
    expect((database.prepare("SELECT count(*) AS count FROM sources").get() as { count: number }).count).toBe(9);
    expect((database.prepare("SELECT count(*) AS count FROM jobs").get() as { count: number }).count).toBe(0);
    expect((database.prepare("SELECT count(*) AS count FROM jobs WHERE is_sample = 1").get() as { count: number }).count).toBe(0);
    database.close();
  });
});
