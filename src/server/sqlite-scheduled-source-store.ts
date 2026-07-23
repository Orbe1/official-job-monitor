import type { SourceAdapterConfig } from "../adapters";
import type { AdapterKind } from "../shared/domain";
import type { ScheduledSourceStore } from "../workers/scheduler";
import type { MonitorRunRecord } from "../workers/monitor";
import type { SqliteDatabase } from "./database";
import { SqliteMonitorPersistence } from "./monitor-persistence";

type SqlRow = Record<string, unknown>;

const SCHEDULED_ADAPTER_KINDS = new Set<AdapterKind>([
  "greenhouse",
  "ashby",
  "lever",
  "workday",
  "smartrecruiters",
  "custom",
]);

const CONFIG_STRING_FIELDS = [
  "boardToken",
  "siteName",
  "companyIdentifier",
  "tenant",
  "careerSite",
  "customEndpoint",
  "customItemsPath",
] as const;

type ConfigStringField = (typeof CONFIG_STRING_FIELDS)[number];

export class SourceLeaseOwnershipError extends Error {
  constructor(sourceId: string, owner: string) {
    super(`Worker ${owner} does not hold the active lease for source ${sourceId}.`);
    this.name = "SourceLeaseOwnershipError";
  }
}

/**
 * Durable SQLite scheduler store. Claiming is performed in an IMMEDIATE
 * transaction, which makes selecting and leasing due sources one atomic write
 * operation even when multiple worker processes use separate connections.
 */
export class SqliteScheduledSourceStore
  extends SqliteMonitorPersistence
  implements ScheduledSourceStore
{
  constructor(private readonly scheduleDatabase: SqliteDatabase) {
    super(scheduleDatabase);
  }

  claimDueSources(input: {
    now: string;
    owner: string;
    leaseSeconds: number;
    limit: number;
  }): Promise<SourceAdapterConfig[]> {
    const now = normalizedTimestamp(input.now, "now");
    const owner = validatedOwner(input.owner);
    const leaseSeconds = positiveInteger(input.leaseSeconds, "leaseSeconds");
    const limit = positiveInteger(input.limit, "limit");
    const leaseExpiresAt = new Date(Date.parse(now) + leaseSeconds * 1_000).toISOString();

    const claim = this.scheduleDatabase.transaction(() => {
      const rows = this.scheduleDatabase
        .prepare(
          `SELECT s.*, c.name AS company_name
           FROM sources s
           JOIN companies c ON c.id = s.company_id
           WHERE s.enabled = 1
             AND (s.next_poll_at IS NULL OR s.next_poll_at <= ?)
             AND (
               s.lease_owner IS NULL OR
               (s.lease_expires_at IS NOT NULL AND s.lease_expires_at <= ?)
             )
           ORDER BY
             CASE WHEN s.next_poll_at IS NULL THEN 0 ELSE 1 END,
             s.next_poll_at ASC,
             c.priority_tier ASC,
             s.id ASC
           LIMIT ?`,
        )
        .all(now, now, limit) as SqlRow[];

      // Parse before writing so malformed source configuration rolls back the
      // entire claim instead of hiding a source behind a lease until expiry.
      const sources = rows.map(sourceConfigFromRow);
      const update = this.scheduleDatabase.prepare(
        `UPDATE sources
         SET lease_owner = ?, lease_expires_at = ?
         WHERE id = ?
           AND enabled = 1
           AND (next_poll_at IS NULL OR next_poll_at <= ?)
           AND (
             lease_owner IS NULL OR
             (lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
           )`,
      );

      for (const source of sources) {
        const result = update.run(owner, leaseExpiresAt, source.sourceId, now, now);
        if (result.changes !== 1) {
          throw new Error(`Source ${source.sourceId} stopped being claimable during an atomic claim.`);
        }
      }

      return sources;
    });

    return Promise.resolve(claim.immediate());
  }

  completeLease(input: {
    sourceId: string;
    owner: string;
    nextPollAt: string;
    outcome: MonitorRunRecord["outcome"];
  }): Promise<void> {
    const sourceId = requiredText(input.sourceId, "sourceId");
    const owner = validatedOwner(input.owner);
    const nextPollAt = normalizedTimestamp(input.nextPollAt, "nextPollAt");
    const updatedAt = new Date().toISOString();

    const result = this.scheduleDatabase
      .prepare(
        `UPDATE sources
         SET next_poll_at = ?, lease_owner = NULL, lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ? AND lease_owner = ?`,
      )
      .run(nextPollAt, updatedAt, sourceId, owner);

    // The run outcome determines nextPollAt in MonitoringScheduler. It is
    // accepted here as part of the shared store contract, while run/health
    // persistence remains the responsibility of commitRun.
    void input.outcome;

    if (result.changes !== 1) {
      return Promise.reject(new SourceLeaseOwnershipError(sourceId, owner));
    }
    return Promise.resolve();
  }
}

function sourceConfigFromRow(row: SqlRow): SourceAdapterConfig {
  const kind = adapterKind(row.adapter_kind);
  const rawConfig = parsedConfig(row.config_json, requiredText(row.id, "source id"));
  const config: Partial<Record<ConfigStringField, string>> = {};
  for (const field of CONFIG_STRING_FIELDS) {
    const value = rawConfig[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Source ${String(row.id)} has an invalid ${field} in config_json.`);
    }
    config[field] = value;
  }

  const customFieldMap = parsedCustomFieldMap(rawConfig.customFieldMap, String(row.id));
  const maximumResponseBytes = rawConfig.maximumResponseBytes === undefined
    ? undefined
    : positiveInteger(rawConfig.maximumResponseBytes, "maximumResponseBytes");
  return {
    sourceId: requiredText(row.id, "source id"),
    companyId: requiredText(row.company_id, "company id"),
    companyName: requiredText(row.company_name, "company name"),
    kind,
    officialUrl: requiredText(row.official_url, "official URL"),
    ...config,
    ...(customFieldMap ? { customFieldMap } : {}),
    ...(maximumResponseBytes ? { maximumResponseBytes } : {}),
    expectedIntervalMinutes: positiveInteger(row.expected_interval_minutes, "expected_interval_minutes"),
    minimumRequestIntervalMs: nonNegativeInteger(
      row.minimum_request_interval_ms,
      "minimum_request_interval_ms",
    ),
    requestTimeoutMs: positiveInteger(row.request_timeout_ms, "request_timeout_ms"),
  };
}

function adapterKind(value: unknown): AdapterKind {
  if (typeof value === "string" && SCHEDULED_ADAPTER_KINDS.has(value as AdapterKind)) {
    return value as AdapterKind;
  }
  throw new Error(`Unsupported scheduled adapter kind: ${String(value)}.`);
}

function parsedConfig(value: unknown, sourceId: string): Record<string, unknown> {
  if (typeof value !== "string") {
    throw new Error(`Source ${sourceId} has a non-text config_json value.`);
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Source ${sourceId} has invalid config_json; expected a JSON object.`);
  }
}

function parsedCustomFieldMap(
  value: unknown,
  sourceId: string,
): SourceAdapterConfig["customFieldMap"] | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Source ${sourceId} has an invalid customFieldMap in config_json.`);
  }
  const allowed = new Set(["id", "title", "url", "applyUrl", "location", "description", "postedAt"]);
  const result: NonNullable<SourceAdapterConfig["customFieldMap"]> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!allowed.has(key) || typeof fieldValue !== "string" || fieldValue.trim() === "") {
      throw new Error(`Source ${sourceId} has an invalid customFieldMap entry for ${key}.`);
    }
    result[key as keyof typeof result] = fieldValue;
  }
  return result;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function validatedOwner(value: unknown): string {
  const owner = requiredText(value, "owner");
  if (owner.length > 200) throw new Error("owner must be at most 200 characters.");
  return owner;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizedTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return new Date(value).toISOString();
}
