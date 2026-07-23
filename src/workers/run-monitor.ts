import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isPubliclyRelevantPosting,
  RespectfulHttpClient,
  type NormalizedPosting,
  type SourceAdapterConfig,
} from "../adapters";
import {
  loadLiveSourceCatalog,
  selectLiveSourceEntries,
  toSourceAdapterConfig,
} from "../server/live-sources";
import { assertDatabaseReady, openDatabase, type SqliteDatabase } from "../server/database";
import { SqliteMonitorPersistence } from "../server/monitor-persistence";
import { FixtureHttpClient } from "./fixture-http";
import { resolveMonitoringContactEmail } from "./contact";
import {
  MemoryMonitorPersistence,
  runSourceMonitor,
  type MonitorRunRecord,
} from "./monitor";

const FIXTURE_SOURCES: SourceAdapterConfig[] = [
  { sourceId: "fixture-greenhouse", companyId: "figma", companyName: "Figma", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example" },
  { sourceId: "fixture-ashby", companyId: "notion", companyName: "Notion", kind: "ashby", officialUrl: "https://jobs.ashbyhq.com/example", boardToken: "example" },
  { sourceId: "fixture-lever", companyId: "palantir", companyName: "Palantir", kind: "lever", officialUrl: "https://jobs.lever.co/example", siteName: "example" },
];

const DEFAULT_LIVE_DATABASE_PATH = resolve("data", "internjobs.live.sqlite");
const PREVIEW_POSTING_SAMPLE_LIMIT = 5;

export interface PreviewPostingSample {
  externalId: string;
  title: string;
  canonicalUrl: string;
  applicationUrl: string;
  country: string;
  classification: {
    audience: NormalizedPosting["classification"]["audience"];
    confidence: number;
    reviewRequired: boolean;
  };
  https: {
    canonicalUrl: boolean;
    applicationUrl: boolean;
  };
}

export interface MonitorCliOptions {
  live: boolean;
  preview: boolean;
  source: string;
  databasePath: string;
  catalogPath?: string;
}

class PreviewMonitorPersistence extends MemoryMonitorPersistence {
  private readonly normalizedPostings = new Map<string, NormalizedPosting[]>();

  override commitRun(record: MonitorRunRecord, incoming: NormalizedPosting[]): Promise<void> {
    this.normalizedPostings.set(record.sourceId, incoming);
    return super.commitRun(record, incoming);
  }

  samplesFor(sourceId: string): PreviewPostingSample[] {
    return buildPreviewPostingSamples(this.normalizedPostings.get(sourceId) ?? []);
  }

  qualifyingSamplesFor(sourceId: string): PreviewPostingSample[] {
    return buildQualifyingPreviewPostingSamples(this.normalizedPostings.get(sourceId) ?? []);
  }
}

export function buildPreviewPostingSamples(
  postings: readonly NormalizedPosting[],
  limit = PREVIEW_POSTING_SAMPLE_LIMIT,
): PreviewPostingSample[] {
  return postings.slice(0, Math.max(0, limit)).map((posting) => ({
    externalId: posting.externalId,
    title: posting.title,
    canonicalUrl: posting.canonicalUrl,
    applicationUrl: posting.applicationUrl,
    country: posting.country ?? "UNKNOWN",
    classification: {
      audience: posting.classification.audience,
      confidence: posting.classification.confidence,
      reviewRequired: posting.classification.reviewRequired,
    },
    https: {
      canonicalUrl: isHttpsUrl(posting.canonicalUrl),
      applicationUrl: isHttpsUrl(posting.applicationUrl),
    },
  }));
}

export function buildQualifyingPreviewPostingSamples(
  postings: readonly NormalizedPosting[],
  limit = PREVIEW_POSTING_SAMPLE_LIMIT,
): PreviewPostingSample[] {
  return buildPreviewPostingSamples(
    postings.filter(isPubliclyRelevantPosting),
    limit,
  );
}

export function previewAcceptanceIssues(result: MonitorRunRecord): string[] {
  const issues: string[] = [];
  if (result.outcome !== "success") issues.push(`outcome_${result.outcome}`);
  if (result.completeness !== "complete") issues.push(`completeness_${result.completeness}`);
  if (result.diagnostics.totalJobs === 0) issues.push("empty_board");
  return issues;
}

export function monitorRunFailed(result: MonitorRunRecord, preview: boolean): boolean {
  if (result.outcome !== "success" || result.completeness !== "complete") return true;
  return preview && result.diagnostics.totalJobs === 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function runMonitorCli(): Promise<void> {
  const options = parseMonitorCliOptions(process.argv.slice(2));
  let database: SqliteDatabase | null = null;
  let previewPersistence: PreviewMonitorPersistence | null = null;
  try {
    const sources = options.live ? liveSources(options) : FIXTURE_SOURCES;
    if (!sources.length) {
      throw new Error(
        options.preview
          ? "No live sources matched the preview selector."
          : "No reviewed live sources are enabled. Preview them, enable passing entries in config/live-sources.json, then run live:bootstrap.",
      );
    }

    const contactEmail = options.live ? resolveMonitoringContactEmail() : undefined;
    const http = options.live
      ? new RespectfulHttpClient(contactEmail ? { contactEmail } : {})
      : await fixtureHttp();
    const persistence = options.live && !options.preview
      ? (() => {
          database = openDatabase({ filename: options.databasePath });
          assertDatabaseReady(database);
          return new SqliteMonitorPersistence(database);
        })()
      : options.live && options.preview
        ? (previewPersistence = new PreviewMonitorPersistence())
        : new MemoryMonitorPersistence();
    const results = [];
    for (const source of sources) {
      results.push(await runSourceMonitor({ source, http, persistence }));
    }
    const summary = results.map((result) => {
      const base = {
        sourceId: result.sourceId,
        outcome: result.outcome,
        completeness: result.completeness,
        totalJobs: result.diagnostics.totalJobs,
        relevantJobs: result.relevantCount,
        pages: result.diagnostics.pagesRetrieved,
        durationMs: result.diagnostics.durationMs,
        warnings: result.diagnostics.warnings,
        suspiciousFlags: result.diagnostics.suspiciousFlags,
        actionCounts: result.actions.reduce<Record<string, number>>((counts, action) => {
          counts[action.type] = (counts[action.type] ?? 0) + 1;
          return counts;
        }, {}),
      };
      if (!options.preview) return base;
      const acceptanceIssues = previewAcceptanceIssues(result);
      return {
        ...base,
        previewAcceptance: {
          accepted: acceptanceIssues.length === 0,
          issues: acceptanceIssues,
        },
        postingReviewSamples: previewPersistence?.samplesFor(result.sourceId) ?? [],
        qualifyingPostingReviewSamples:
          previewPersistence?.qualifyingSamplesFor(result.sourceId) ?? [],
      };
    });
    process.stdout.write(`${JSON.stringify({
      mode: options.live ? (options.preview ? "live_preview" : "live") : "fixture",
      persisted: options.live && !options.preview ? options.databasePath : "memory_only",
      results: summary,
    }, null, 2)}\n`);
    if (results.some((result) => monitorRunFailed(result, options.preview))) {
      process.exitCode = 1;
    }
  } finally {
    database?.close();
  }
}

export function parseMonitorCliOptions(args: string[]): MonitorCliOptions {
  const options: MonitorCliOptions = {
    live: process.env.MONITOR_MODE === "live",
    preview: false,
    source: "all",
    databasePath: resolve(process.env.INTERNJOBS_LIVE_DB_PATH ?? DEFAULT_LIVE_DATABASE_PATH),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--live") {
      options.live = true;
      continue;
    }
    if (argument === "--preview") {
      options.live = true;
      options.preview = true;
      continue;
    }
    if (argument === "--source") {
      options.source = requiredOptionValue(args, ++index, "--source");
      continue;
    }
    if (argument.startsWith("--source=")) {
      options.source = argument.slice("--source=".length);
      continue;
    }
    if (argument === "--database" || argument === "--database-path" || argument === "--db") {
      options.databasePath = resolve(requiredOptionValue(args, ++index, argument));
      continue;
    }
    if (argument.startsWith("--database=") || argument.startsWith("--database-path=") || argument.startsWith("--db=")) {
      options.databasePath = resolve(argument.slice(argument.indexOf("=") + 1));
      continue;
    }
    if (argument === "--catalog") {
      options.catalogPath = resolve(requiredOptionValue(args, ++index, argument));
      continue;
    }
    if (argument.startsWith("--catalog=")) {
      options.catalogPath = resolve(argument.slice("--catalog=".length));
      continue;
    }
    throw new Error(`Unknown monitor option ${argument}.`);
  }
  return options;
}

function liveSources(options: MonitorCliOptions): SourceAdapterConfig[] {
  const catalog = loadLiveSourceCatalog(options.catalogPath);
  return selectLiveSourceEntries(catalog, options.source, { includeDisabled: options.preview })
    .map(toSourceAdapterConfig);
}

function requiredOptionValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

async function fixtureHttp(): Promise<FixtureHttpClient> {
  const [greenhouse, greenhouseDetails, ashby, lever] = await Promise.all([
    readFixture("greenhouse.json"),
    readFixture("greenhouse-details.json"),
    readFixture("ashby.json"),
    readFixture("lever.json"),
  ]);
  return new FixtureHttpClient((_method, url) => {
    if (url.includes("greenhouse")) {
      const detailId = new URL(url).pathname.match(/\/jobs\/([^/]+)$/)?.[1];
      if (!detailId) return greenhouse;
      const detail = (greenhouseDetails as Record<string, unknown>)[detailId];
      if (!detail) throw new Error(`No Greenhouse detail fixture configured for ${detailId}`);
      return detail;
    }
    if (url.includes("ashby")) return ashby;
    if (url.includes("lever")) return lever;
    throw new Error(`No fixture configured for ${url}`);
  });
}

async function readFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve("tests", "fixtures", name), "utf8"));
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runMonitorCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
