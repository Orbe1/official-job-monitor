import type { AdapterKind } from "../shared/domain";
import { AdapterError, type AdapterFetchResult, type RawPosting } from "./types";

export function successfulResult(
  kind: AdapterKind,
  version: string,
  startedAt: Date,
  postings: RawPosting[],
  pagesRetrieved: number,
  httpStatuses: number[],
  warnings: string[] = [],
): AdapterFetchResult {
  const completedAt = new Date();
  const duplicateExternalIds = duplicateIds(postings);
  const suspiciousFlags: string[] = [];
  if (duplicateExternalIds.length) suspiciousFlags.push("duplicate_external_ids");
  if (postings.some((posting) => !posting.externalId || !posting.title)) suspiciousFlags.push("blank_required_fields");
  return {
    outcome: suspiciousFlags.length ? "degraded" : "success",
    completeness: suspiciousFlags.length ? "partial" : "complete",
    postings,
    diagnostics: {
      adapter: kind,
      adapterVersion: version,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      pagesRetrieved,
      httpStatuses,
      totalJobs: postings.length,
      warnings,
      suspiciousFlags,
      duplicateExternalIds,
    },
  };
}

export function failedResult(kind: AdapterKind, version: string, startedAt: Date, error: unknown): AdapterFetchResult {
  const completedAt = new Date();
  const normalized = error instanceof AdapterError ? error : new AdapterError(error instanceof Error ? error.message : "Adapter failed", "ADAPTER_FAILURE", false);
  return {
    outcome: normalized.code === "UNSUPPORTED" ? "unsupported" : "failed",
    completeness: "unknown",
    postings: [],
    diagnostics: {
      adapter: kind,
      adapterVersion: version,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      pagesRetrieved: 0,
      httpStatuses: normalized.status ? [normalized.status] : [],
      totalJobs: 0,
      warnings: [],
      suspiciousFlags: [normalized.code.toLowerCase()],
      duplicateExternalIds: [],
    },
    error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable },
  };
}

function duplicateIds(postings: RawPosting[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const posting of postings) {
    if (seen.has(posting.externalId)) duplicates.add(posting.externalId);
    seen.add(posting.externalId);
  }
  return [...duplicates];
}
