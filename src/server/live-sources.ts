import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { SourceAdapterConfig } from "../adapters";
import type { AdapterKind } from "../shared/domain";
import type { SqliteDatabase } from "./database";

const moduleUrl = new URL(import.meta.url);
const PROJECT_ROOT =
  moduleUrl.protocol === "file:"
    ? path.resolve(fileURLToPath(new URL("../..", moduleUrl)))
    : path.resolve(process.cwd());

export const DEFAULT_LIVE_SOURCE_CATALOG_PATH = path.join(
  PROJECT_ROOT,
  "config",
  "live-sources.json",
);

export const LIVE_PILOT_MINIMUM_ENABLED_SOURCES = 5;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case identifier");

const atsIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._-]+$/, "contains unsupported ATS identifier characters");

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "must use HTTPS");

const companyLogoPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .regex(
    /^\/company-logos\/[a-z0-9][a-z0-9._-]*\.(?:svg|png|webp|ico|jpe?g)$/i,
    "must be a same-origin asset under /company-logos",
  );

const companySchema = z
  .object({
    id: identifierSchema.refine((value) => value.startsWith("company-"), {
      message: "must start with company-",
    }),
    slug: identifierSchema,
    name: z.string().trim().min(1).max(120),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(253)
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "must be a bare company domain"),
    careerUrl: httpsUrlSchema,
    logoPath: companyLogoPathSchema.optional(),
    initials: z.string().trim().min(1).max(4).regex(/^[A-Z0-9]+$/),
    categoryTags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
    priorityTier: z.number().int().min(1).max(5).default(3),
  })
  .strict();

const adapterKindSchema = z.enum([
  "greenhouse",
  "ashby",
  "lever",
  "workday",
  "smartrecruiters",
  "custom",
]);

const supportedEnabledKinds = new Set<AdapterKind>(["greenhouse", "ashby", "lever"]);

const liveSourceEntrySchema = z
  .object({
    sourceId: identifierSchema,
    company: companySchema,
    displayName: z.string().trim().min(1).max(160),
    kind: adapterKindSchema,
    officialUrl: httpsUrlSchema,
    boardToken: atsIdentifierSchema.optional(),
    siteName: atsIdentifierSchema.optional(),
    companyIdentifier: atsIdentifierSchema.optional(),
    tenant: atsIdentifierSchema.optional(),
    careerSite: atsIdentifierSchema.optional(),
    customEndpoint: httpsUrlSchema.optional(),
    enabled: z.boolean(),
    rolloutWave: z.number().int().positive(),
    expectedIntervalMinutes: z.number().int().min(15).max(1_440),
    minimumRequestIntervalMs: z.number().int().min(1_000).max(60_000),
    requestTimeoutMs: z.number().int().min(1_000).max(60_000),
    maximumResponseBytes: z.number().int().min(1_000_000).max(20_000_000).optional(),
    closureConfirmationRuns: z.number().int().min(2).max(10),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.enabled && !supportedEnabledKinds.has(entry.kind)) {
      context.addIssue({
        code: "custom",
        message: `${entry.kind} sources cannot be enabled in the live pilot`,
        path: ["kind"],
      });
    }

    if ((entry.kind === "greenhouse" || entry.kind === "ashby") && !entry.boardToken) {
      context.addIssue({
        code: "custom",
        message: `${entry.kind} sources require boardToken`,
        path: ["boardToken"],
      });
    }

    if (entry.kind === "lever" && !entry.siteName) {
      context.addIssue({
        code: "custom",
        message: "lever sources require siteName",
        path: ["siteName"],
      });
    }
  });

export const liveSourceCatalogSchema = z
  .array(liveSourceEntrySchema)
  .min(1)
  .superRefine((entries, context) => {
    const uniqueFields: Array<{
      label: string;
      value: (entry: z.infer<typeof liveSourceEntrySchema>) => string;
    }> = [
      { label: "sourceId", value: (entry) => entry.sourceId },
      { label: "company.id", value: (entry) => entry.company.id },
      { label: "company.slug", value: (entry) => entry.company.slug.toLowerCase() },
      { label: "company.domain", value: (entry) => entry.company.domain.toLowerCase() },
    ];

    for (const field of uniqueFields) {
      const firstIndexByValue = new Map<string, number>();
      entries.forEach((entry, index) => {
        const value = field.value(entry);
        const firstIndex = firstIndexByValue.get(value);
        if (firstIndex === undefined) {
          firstIndexByValue.set(value, index);
          return;
        }

        context.addIssue({
          code: "custom",
          message: `duplicate ${field.label} ${value}; first declared at index ${firstIndex}`,
          path: [index, ...field.label.split(".")],
        });
      });
    }
  });

export type LiveSourceCatalogEntry = z.infer<typeof liveSourceEntrySchema>;
export type LiveSourceCatalog = z.infer<typeof liveSourceCatalogSchema>;

export interface LiveSourceSelectionOptions {
  includeDisabled?: boolean;
}

export interface LiveSourceSyncResult {
  companies: number;
  sources: number;
  enabledSources: number;
  missingSourcesDisabled: number;
}

export function parseLiveSourceCatalog(input: unknown): LiveSourceCatalog {
  return liveSourceCatalogSchema.parse(input);
}

export function loadLiveSourceCatalog(
  explicitCatalogPath = DEFAULT_LIVE_SOURCE_CATALOG_PATH,
): LiveSourceCatalog {
  const catalogPath = path.resolve(explicitCatalogPath);
  let input: unknown;

  try {
    input = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read live source catalog ${catalogPath}: ${reason}`, {
      cause: error,
    });
  }

  const result = liveSourceCatalogSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid live source catalog ${catalogPath}: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

/**
 * Live runs use the enabled-only default. Preview commands deliberately pass
 * includeDisabled so a candidate can be checked before the reviewed catalog is
 * changed to enabled=true.
 */
export function selectLiveSourceEntries(
  catalog: LiveSourceCatalog,
  selector: string = "all",
  options: LiveSourceSelectionOptions = {},
): LiveSourceCatalogEntry[] {
  const includeDisabled = options.includeDisabled ?? false;
  if (selector === "all") {
    return includeDisabled ? [...catalog] : catalog.filter((entry) => entry.enabled);
  }

  const entry = catalog.find((candidate) => candidate.sourceId === selector);
  if (!entry) {
    throw new Error(`Unknown live source ${selector}.`);
  }
  if (!includeDisabled && !entry.enabled) {
    throw new Error(
      `Live source ${selector} is disabled. Preview it first, then enable it in the reviewed catalog.`,
    );
  }
  return [entry];
}

export function toSourceAdapterConfig(entry: LiveSourceCatalogEntry): SourceAdapterConfig {
  return {
    sourceId: entry.sourceId,
    companyId: entry.company.id,
    companyName: entry.company.name,
    kind: entry.kind,
    officialUrl: entry.officialUrl,
    ...(entry.boardToken ? { boardToken: entry.boardToken } : {}),
    ...(entry.siteName ? { siteName: entry.siteName } : {}),
    ...(entry.companyIdentifier ? { companyIdentifier: entry.companyIdentifier } : {}),
    ...(entry.tenant ? { tenant: entry.tenant } : {}),
    ...(entry.careerSite ? { careerSite: entry.careerSite } : {}),
    ...(entry.customEndpoint ? { customEndpoint: entry.customEndpoint } : {}),
    expectedIntervalMinutes: entry.expectedIntervalMinutes,
    minimumRequestIntervalMs: entry.minimumRequestIntervalMs,
    requestTimeoutMs: entry.requestTimeoutMs,
    ...(entry.maximumResponseBytes ? { maximumResponseBytes: entry.maximumResponseBytes } : {}),
    closureConfirmationRuns: entry.closureConfirmationRuns,
  };
}

export function enabledLiveSourceCount(catalog: LiveSourceCatalog): number {
  return catalog.filter(
    (entry) => entry.enabled && supportedEnabledKinds.has(entry.kind),
  ).length;
}

export function meetsLivePilotSourceMinimum(
  catalog: LiveSourceCatalog,
  minimum = LIVE_PILOT_MINIMUM_ENABLED_SOURCES,
): boolean {
  return enabledLiveSourceCount(catalog) >= minimum;
}

function sourceConfigJson(entry: LiveSourceCatalogEntry): string {
  return JSON.stringify({
    catalogManaged: true,
    rolloutWave: entry.rolloutWave,
    ...(entry.boardToken ? { boardToken: entry.boardToken } : {}),
    ...(entry.siteName ? { siteName: entry.siteName } : {}),
    ...(entry.companyIdentifier ? { companyIdentifier: entry.companyIdentifier } : {}),
    ...(entry.tenant ? { tenant: entry.tenant } : {}),
    ...(entry.careerSite ? { careerSite: entry.careerSite } : {}),
    ...(entry.customEndpoint ? { customEndpoint: entry.customEndpoint } : {}),
    ...(entry.maximumResponseBytes ? { maximumResponseBytes: entry.maximumResponseBytes } : {}),
  });
}

function assertCatalogDoesNotOverwriteSamples(
  database: SqliteDatabase,
  catalog: LiveSourceCatalog,
): void {
  const companyIds = new Set(catalog.map((entry) => entry.company.id));
  const sourceIds = new Set(catalog.map((entry) => entry.sourceId));
  const sampleCompanies = database
    .prepare("SELECT id FROM companies WHERE is_sample = 1")
    .all() as Array<{ id: string }>;
  const sampleSources = database
    .prepare("SELECT id FROM sources WHERE is_sample = 1")
    .all() as Array<{ id: string }>;
  const conflict =
    sampleCompanies.find((row) => companyIds.has(row.id))?.id ??
    sampleSources.find((row) => sourceIds.has(row.id))?.id;

  if (conflict) {
    throw new Error(
      `Refusing to overwrite sample record ${conflict}. Use the separate live database.`,
    );
  }
}

export function syncLiveSourceCatalog(
  database: SqliteDatabase,
  catalog: LiveSourceCatalog,
  observedAt = new Date().toISOString(),
): LiveSourceSyncResult {
  assertCatalogDoesNotOverwriteSamples(database, catalog);

  const upsertCompany = database.prepare(`
    INSERT INTO companies (
      id, slug, name, domain, career_url, logo_url, initials,
      category_tags_json, supported_role_types_json, compensation_signal,
      compensation_disclaimer, priority_tier, monitoring_state, is_sample,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '["internship","new_grad"]', NULL, NULL, ?, 'stale', 0, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      domain = excluded.domain,
      career_url = excluded.career_url,
      logo_url = excluded.logo_url,
      initials = excluded.initials,
      category_tags_json = excluded.category_tags_json,
      supported_role_types_json = excluded.supported_role_types_json,
      priority_tier = excluded.priority_tier,
      is_sample = 0,
      updated_at = excluded.updated_at
  `);
  const upsertSource = database.prepare(`
    INSERT INTO sources (
      id, company_id, display_name, adapter_kind, official_url, config_json,
      enabled, health, expected_interval_minutes, minimum_request_interval_ms,
      request_timeout_ms, closure_confirmation_runs, is_sample, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'stale', ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      company_id = excluded.company_id,
      display_name = excluded.display_name,
      adapter_kind = excluded.adapter_kind,
      official_url = excluded.official_url,
      config_json = excluded.config_json,
      enabled = excluded.enabled,
      expected_interval_minutes = excluded.expected_interval_minutes,
      minimum_request_interval_ms = excluded.minimum_request_interval_ms,
      request_timeout_ms = excluded.request_timeout_ms,
      closure_confirmation_runs = excluded.closure_confirmation_runs,
      is_sample = 0,
      updated_at = excluded.updated_at
  `);
  const managedSources = database.prepare(`
    SELECT id, enabled
    FROM sources
    WHERE is_sample = 0 AND json_extract(config_json, '$.catalogManaged') = 1
  `);
  const disableMissingSource = database.prepare(`
    UPDATE sources
    SET enabled = 0, updated_at = ?
    WHERE id = ? AND enabled = 1
  `);

  let missingSourcesDisabled = 0;
  const synchronize = database.transaction(() => {
    for (const entry of catalog) {
      upsertCompany.run(
        entry.company.id,
        entry.company.slug,
        entry.company.name,
        entry.company.domain,
        entry.company.careerUrl,
        entry.company.logoPath ?? null,
        entry.company.initials,
        JSON.stringify(entry.company.categoryTags),
        entry.company.priorityTier,
        observedAt,
        observedAt,
      );
      upsertSource.run(
        entry.sourceId,
        entry.company.id,
        entry.displayName,
        entry.kind,
        entry.officialUrl,
        sourceConfigJson(entry),
        Number(entry.enabled),
        entry.expectedIntervalMinutes,
        entry.minimumRequestIntervalMs,
        entry.requestTimeoutMs,
        entry.closureConfirmationRuns,
        observedAt,
        observedAt,
      );
    }

    const catalogIds = new Set(catalog.map((entry) => entry.sourceId));
    for (const row of managedSources.all() as Array<{ id: string; enabled: number }>) {
      if (!catalogIds.has(row.id) && row.enabled === 1) {
        missingSourcesDisabled += disableMissingSource.run(observedAt, row.id).changes;
      }
    }
  });

  synchronize();
  return {
    companies: catalog.length,
    sources: catalog.length,
    enabledSources: enabledLiveSourceCount(catalog),
    missingSourcesDisabled,
  };
}
