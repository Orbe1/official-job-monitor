import { spawn } from "node:child_process";
import path from "node:path";

import { RespectfulHttpClient } from "../src/adapters";
import { assertDatabaseReady, openDatabase } from "../src/server/database";
import {
  loadLiveSourceCatalog,
  selectLiveSourceEntries,
  toSourceAdapterConfig,
  type LiveSourceCatalog,
} from "../src/server/live-sources";
import { SqliteMonitorPersistence } from "../src/server/monitor-persistence";
import { resolveMonitoringContactEmail } from "../src/workers/contact";
import { runSourceMonitor } from "../src/workers/monitor";
import { isDirectExecution } from "./database";
import {
  bootstrapLiveDatabase,
  DEFAULT_LIVE_DATABASE_PATH,
} from "./live-bootstrap";

export const CLOUDFLARE_SOURCE_ID = "cloudflare-greenhouse";
export const FIGMA_SOURCE_ID = "figma-greenhouse";
export const DATABRICKS_SOURCE_ID = "databricks-greenhouse";
export const APPROVED_LIVE_GREENHOUSE_SOURCE_IDS = [
  CLOUDFLARE_SOURCE_ID,
  FIGMA_SOURCE_ID,
  DATABRICKS_SOURCE_ID,
] as const;
export const LIVE_DEVELOPMENT_SERVICES_SCRIPT = "dev:services:live";

export interface LiveDevelopmentOptions {
  databasePath: string;
  contactEmail?: string;
  refresh: boolean;
}

export interface GreenhouseDiscoverProof {
  sourceId: string;
  successfulRunId: string;
  jobs: Array<{
    id: string;
    externalJobId: string;
    title: string;
    canonicalUrl: string;
    applicationUrl: string;
    sourcePublishedAt: string | null;
    firstSeenAt: string;
  }>;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseLiveDevelopmentOptions(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): LiveDevelopmentOptions {
  let databasePath = environment.INTERNJOBS_LIVE_DB_PATH ?? DEFAULT_LIVE_DATABASE_PATH;
  let contactEmail = environment.MONITOR_CONTACT_EMAIL?.trim() || undefined;
  let refresh = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--database" || argument === "--database-path" || argument === "--db") {
      databasePath = optionValue(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--database=") || argument.startsWith("--database-path=") || argument.startsWith("--db=")) {
      databasePath = argument.slice(argument.indexOf("=") + 1);
      continue;
    }
    if (argument === "--contact-email") {
      contactEmail = optionValue(args, index, argument).trim();
      index += 1;
      continue;
    }
    if (argument.startsWith("--contact-email=")) {
      contactEmail = argument.slice("--contact-email=".length).trim();
      continue;
    }
    if (argument === "--refresh") {
      refresh = true;
      continue;
    }
    throw new Error(`Unknown live development option ${argument}.`);
  }
  return {
    databasePath: path.resolve(databasePath),
    ...(contactEmail ? { contactEmail } : {}),
    refresh,
  };
}

export function liveDevelopmentDatabasePath(args: string[]): string {
  return parseLiveDevelopmentOptions(args).databasePath;
}

export function assertApprovedLiveGreenhouseSources(catalog: LiveSourceCatalog): void {
  const enabled = catalog.filter((entry) => entry.enabled);
  const expectedIds = new Set<string>(APPROVED_LIVE_GREENHOUSE_SOURCE_IDS);
  const enabledIdSet = new Set(enabled.map((entry) => entry.sourceId));
  if (
    enabled.length !== expectedIds.size
    || enabled.some((entry) => entry.kind !== "greenhouse" || !expectedIds.has(entry.sourceId))
    || [...expectedIds].some((sourceId) => !enabledIdSet.has(sourceId))
  ) {
    const enabledIds = enabled.map((entry) => entry.sourceId).join(", ") || "none";
    throw new Error(
      `Local live proof is locked to exactly ${APPROVED_LIVE_GREENHOUSE_SOURCE_IDS.join(", ")}; enabled sources: ${enabledIds}.`,
    );
  }
}

export function greenhouseDiscoverProof(
  database: ReturnType<typeof openDatabase>,
  sourceId: string,
): GreenhouseDiscoverProof | null {
  const successfulRun = database
    .prepare(
      `SELECT id
       FROM source_runs
       WHERE source_id = ? AND status = 'success' AND completeness = 'complete'
         AND closure_eligible = 1
       ORDER BY completed_at DESC, id DESC
       LIMIT 1`,
    )
    .get(sourceId) as { id: string } | undefined;
  if (!successfulRun) return null;

  const jobs = database
    .prepare(
      `SELECT j.id, j.external_job_id, j.title, j.canonical_url, j.application_url,
              j.source_published_at, j.first_seen_at, j.source_publication_checked_at,
              c.domain AS company_domain
       FROM jobs AS j
       JOIN sources AS s ON s.id = j.source_id
       JOIN companies AS c ON c.id = j.company_id
       WHERE j.source_id = ? AND j.is_sample = 0 AND j.availability = 'active'
         AND j.is_relevant = 1 AND j.country = 'US' AND s.enabled = 1
         AND s.adapter_kind = 'greenhouse'
       ORDER BY COALESCE(j.source_published_at, j.posted_at, j.first_seen_at) DESC, j.id`,
    )
    .all(sourceId) as Array<{
      id: string;
      external_job_id: string;
      title: string;
      canonical_url: string;
      application_url: string;
      source_published_at: string | null;
      first_seen_at: string;
      source_publication_checked_at: string | null;
      company_domain: string;
    }>;
  const externalIds = new Set(jobs.map((job) => job.external_job_id));
  if (
    externalIds.size !== jobs.length
    || jobs.some(
      (job) =>
        job.source_publication_checked_at === null
        ||
        !isOfficialGreenhouseUrl(job.canonical_url, job.company_domain)
        || !isOfficialGreenhouseUrl(job.application_url, job.company_domain),
    )
  ) return null;

  return {
    sourceId,
    successfulRunId: successfulRun.id,
    jobs: jobs.map((job) => ({
      id: job.id,
      externalJobId: job.external_job_id,
      title: job.title,
      canonicalUrl: job.canonical_url,
      applicationUrl: job.application_url,
      sourcePublishedAt: job.source_published_at,
      firstSeenAt: job.first_seen_at,
    })),
  };
}

function isOfficialGreenhouseUrl(value: string, companyDomain: string): boolean {
  try {
    const url = new URL(value);
    const officialCompanyDomain = companyDomain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
    return url.protocol === "https:"
      && (
        url.hostname === "greenhouse.io"
        || url.hostname.endsWith(".greenhouse.io")
        || url.hostname === officialCompanyDomain
        || url.hostname.endsWith(`.${officialCompanyDomain}`)
      );
  } catch {
    return false;
  }
}

async function ensureApprovedSourceProofs(
  options: LiveDevelopmentOptions,
): Promise<GreenhouseDiscoverProof[]> {
  const bootstrap = bootstrapLiveDatabase({ databasePath: options.databasePath });
  const catalog = loadLiveSourceCatalog(bootstrap.catalogPath);
  assertApprovedLiveGreenhouseSources(catalog);
  const sourceEntries = selectLiveSourceEntries(catalog);

  const database = openDatabase({ filename: options.databasePath });
  try {
    assertDatabaseReady(database);
    const contactEmail = resolveMonitoringContactEmail(options.contactEmail, { required: false });
    const http = new RespectfulHttpClient(contactEmail ? { contactEmail } : {});
    const persistence = new SqliteMonitorPersistence(database);
    const proofs: GreenhouseDiscoverProof[] = [];
    for (const sourceEntry of sourceEntries) {
      let proof = greenhouseDiscoverProof(database, sourceEntry.sourceId);
      if (!proof || options.refresh) {
        const result = await runSourceMonitor({
          source: toSourceAdapterConfig(sourceEntry),
          http,
          persistence,
        });
        if (
          result.outcome !== "success"
          || result.completeness !== "complete"
          || result.diagnostics.suspiciousFlags.length > 0
        ) {
          throw new Error(
            `${sourceEntry.company.name} ingestion did not pass: outcome=${result.outcome}, `
              + `completeness=${result.completeness}, `
              + `flags=${result.diagnostics.suspiciousFlags.join(",") || "none"}.`,
          );
        }
        proof = greenhouseDiscoverProof(database, sourceEntry.sourceId);
      }
      if (!proof) {
        throw new Error(
          `${sourceEntry.company.name} ingestion did not produce a valid successful-run proof.`,
        );
      }
      proofs.push(proof);
    }
    return proofs;
  } finally {
    database.close();
  }
}

export async function runLiveDevelopment(args = process.argv.slice(2)): Promise<void> {
  const options = parseLiveDevelopmentOptions(args);
  const proofs = await ensureApprovedSourceProofs(options);
  const example = proofs.flatMap((proof) => proof.jobs)[0];
  if (!example) throw new Error("Live proof completed without an example Discover listing.");
  process.stdout.write(
    `Greenhouse live proof ready: ${proofs.map((proof) => `${proof.sourceId}=${proof.jobs.length}`).join(", ")}; `
      + `${example.title} (${example.canonicalUrl}).\n`,
  );

  const child = process.platform === "win32"
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm.cmd run ${LIVE_DEVELOPMENT_SERVICES_SCRIPT}`], {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_PATH: options.databasePath,
          INTERNJOBS_DB_PATH: options.databasePath,
          MONITOR_MODE: "live",
        },
      })
    : spawn("npm", ["run", LIVE_DEVELOPMENT_SERVICES_SCRIPT], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_PATH: options.databasePath,
      INTERNJOBS_DB_PATH: options.databasePath,
      MONITOR_MODE: "live",
    },
  });
  child.once("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

if (isDirectExecution(import.meta.url)) {
  runLiveDevelopment().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
