import { adapterFor, isPossibleStudentOrEarlyCareerPosting, isPubliclyRelevantPosting, normalizeAndDedupe, planLifecycle, shouldRetainFullPosting, type AdapterFetchResult, type AdapterHttpClient, type ExistingPostingState, type LifecycleAction, type NormalizedPosting, type SourceAdapterConfig, type SourceTimestampEnrichmentResult } from "../adapters";
import { normalizeCountry } from "../adapters/adapters/shared";

export interface MonitorRunRecord {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt: string;
  outcome: AdapterFetchResult["outcome"];
  completeness: AdapterFetchResult["completeness"];
  diagnostics: AdapterFetchResult["diagnostics"];
  relevantCount: number;
  actions: LifecycleAction[];
}

export interface MonitorPersistence {
  existingPostings(sourceId: string): Promise<ExistingPostingState[]>;
  lifecyclePolicy?(sourceId: string): Promise<{ closureConfirmationRuns: number; expectedIntervalMinutes: number } | null>;
  commitRun(record: MonitorRunRecord, postings: NormalizedPosting[]): Promise<void>;
}

export async function runSourceMonitor(input: {
  source: SourceAdapterConfig;
  http: AdapterHttpClient;
  persistence: MonitorPersistence;
  now?: () => Date;
}): Promise<MonitorRunRecord> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const existing = await input.persistence.existingPostings(input.source.sourceId);
  const persistedPolicy = await input.persistence.lifecyclePolicy?.(input.source.sourceId);
  const adapter = adapterFor(input.source.kind);
  const fetched = await adapter.fetchAll({ source: input.source, http: input.http, now });
  const normalized = normalizeAndDedupe(fetched.postings);
  const detectedAt = now().toISOString();

  if (normalized.duplicateExternalIds.length) {
    fetched.diagnostics.duplicateExternalIds = normalized.duplicateExternalIds;
    if (!fetched.diagnostics.suspiciousFlags.includes("duplicate_external_ids")) fetched.diagnostics.suspiciousFlags.push("duplicate_external_ids");
    fetched.outcome = "degraded";
    fetched.completeness = "partial";
  }

  if (normalized.postings.length === 0 && fetched.outcome === "success") {
    fetched.diagnostics.suspiciousFlags.push("unexpected_zero_results");
    fetched.outcome = "degraded";
  } else if (existing.length >= 5 && normalized.postings.length / existing.length < 0.5 && fetched.outcome === "success") {
    fetched.diagnostics.suspiciousFlags.push("major_count_decrease");
    fetched.outcome = "degraded";
  }

  const existingByExternalId = new Map(existing.map((posting) => [posting.externalId, posting]));
  let postings = normalized.postings.map((posting) => carryStoredSourceTimestamps(
    posting,
    existingByExternalId.get(posting.externalId),
  ));
  const sourceTimestampTargets = adapter.fetchSourceTimestamps
    ? postings.filter((posting) => shouldRequestSourceTimestampDetail(input.source, posting)
      && shouldFetchSourceTimestamps(existingByExternalId.get(posting.externalId)))
    : [];
  let timestampEnrichment: SourceTimestampEnrichmentResult | null = null;
  if (adapter.fetchSourceTimestamps && sourceTimestampTargets.length > 0) {
    try {
      timestampEnrichment = await adapter.fetchSourceTimestamps(
        { source: input.source, http: input.http, now },
        sourceTimestampTargets,
      );
    } catch (error) {
      timestampEnrichment = {
        metadata: [],
        httpStatuses: [],
        warnings: [`Source publication enrichment failed: ${error instanceof Error ? error.message : String(error)}`],
        failedExternalIds: sourceTimestampTargets.map((posting) => posting.externalId),
      };
    }
    fetched.diagnostics.httpStatuses.push(...timestampEnrichment.httpStatuses);
    fetched.diagnostics.pagesRetrieved += timestampEnrichment.httpStatuses.length;
    fetched.diagnostics.warnings.push(...timestampEnrichment.warnings);
    if (timestampEnrichment.failedExternalIds.length > 0) {
      if (!fetched.diagnostics.suspiciousFlags.includes("source_timestamp_detail_failed")) {
        fetched.diagnostics.suspiciousFlags.push("source_timestamp_detail_failed");
      }
      fetched.outcome = "degraded";
      fetched.completeness = "partial";
    }
  }

  const completedAt = now().toISOString();
  if (timestampEnrichment) {
    postings = applySourceTimestampEnrichment(
      postings,
      sourceTimestampTargets,
      timestampEnrichment,
      existingByExternalId,
      completedAt,
    );
  }
  fetched.diagnostics.completedAt = completedAt;
  const diagnosticStartedAt = Date.parse(fetched.diagnostics.startedAt);
  const diagnosticCompletedAt = Date.parse(completedAt);
  if (Number.isFinite(diagnosticStartedAt) && Number.isFinite(diagnosticCompletedAt)) {
    fetched.diagnostics.durationMs = Math.max(0, diagnosticCompletedAt - diagnosticStartedAt);
  }

  const relevant = postings.filter(isPubliclyRelevantPosting);
  const actions = planLifecycle({
    existing,
    incoming: postings,
    run: {
      outcome: fetched.outcome,
      completeness: fetched.completeness,
      suspiciousFlags: fetched.diagnostics.suspiciousFlags,
    },
    now: detectedAt,
    closeAfterSuccessfulAbsences: persistedPolicy?.closureConfirmationRuns ?? input.source.closureConfirmationRuns,
    expectedIntervalMinutes: persistedPolicy?.expectedIntervalMinutes ?? input.source.expectedIntervalMinutes,
  });
  const record: MonitorRunRecord = {
    id: crypto.randomUUID(),
    sourceId: input.source.sourceId,
    startedAt,
    completedAt,
    outcome: fetched.outcome,
    completeness: fetched.completeness,
    diagnostics: fetched.diagnostics,
    relevantCount: relevant.length,
    actions,
  };
  await input.persistence.commitRun(record, postings);
  return record;
}

export function shouldRequestSourceTimestampDetail(
  source: Pick<SourceAdapterConfig, "kind">,
  posting: NormalizedPosting,
): boolean {
  if (source.kind !== "greenhouse") return true;
  return shouldRetainFullPosting(posting)
    || (normalizeCountry(posting.country, posting.locationText) === "US"
      && isPossibleStudentOrEarlyCareerPosting(posting));
}

function shouldFetchSourceTimestamps(
  previous: ExistingPostingState | undefined,
): boolean {
  if (!previous || previous.availability === "closed") return true;
  // One-time compatibility backfill for a posting selected by the Greenhouse
  // bulk pass. Compact excluded states keep this check marker without keeping
  // the complete description or normalized role.
  return previous.sourcePublicationCheckedAt === null;
}

function carryStoredSourceTimestamps(
  posting: NormalizedPosting,
  previous: ExistingPostingState | undefined,
): NormalizedPosting {
  if (!previous) return posting;
  const sourcePublishedAt = previous.sourcePublishedAt ?? posting.sourcePublishedAt;
  return {
    ...posting,
    postedAt: sourcePublishedAt ?? posting.postedAt,
    sourcePublishedAt,
    sourceUpdatedAt: posting.sourceUpdatedAt ?? previous.sourceUpdatedAt,
    sourcePublicationCheckedAt:
      previous.sourcePublicationCheckedAt ?? posting.sourcePublicationCheckedAt,
  };
}

function applySourceTimestampEnrichment(
  postings: NormalizedPosting[],
  targets: NormalizedPosting[],
  enrichment: SourceTimestampEnrichmentResult,
  existingByExternalId: Map<string, ExistingPostingState>,
  checkedAt: string,
): NormalizedPosting[] {
  const targetIds = new Set(targets.map((posting) => posting.externalId));
  const metadataByExternalId = new Map(
    enrichment.metadata.map((item) => [item.externalId, item]),
  );

  return postings.map((posting) => {
    if (!targetIds.has(posting.externalId)) return posting;
    const metadata = metadataByExternalId.get(posting.externalId);
    const previous = existingByExternalId.get(posting.externalId);
    const isRepublish = previous?.availability === "closed";
    const sourcePublishedAt = isRepublish
      ? metadata?.sourcePublishedAt ?? posting.sourcePublishedAt
      : posting.sourcePublishedAt ?? metadata?.sourcePublishedAt ?? null;
    return {
      ...posting,
      postedAt: sourcePublishedAt,
      sourcePublishedAt,
      sourceUpdatedAt: metadata?.sourceUpdatedAt ?? posting.sourceUpdatedAt,
      sourcePublicationCheckedAt: checkedAt,
    };
  });
}

export class MemoryMonitorPersistence implements MonitorPersistence {
  readonly runs: MonitorRunRecord[] = [];
  readonly postings = new Map<string, ExistingPostingState[]>();

  existingPostings(sourceId: string): Promise<ExistingPostingState[]> {
    return Promise.resolve(this.postings.get(sourceId) ?? []);
  }

  commitRun(record: MonitorRunRecord, incoming: NormalizedPosting[]): Promise<void> {
    this.runs.push(record);
    const previous = new Map((this.postings.get(record.sourceId) ?? []).map((item) => [item.externalId, item]));
    for (const action of record.actions) {
      if (action.type === "discovered") {
        previous.set(action.externalId, {
          id: crypto.randomUUID(),
          externalId: action.externalId,
          contentHash: action.posting.contentHash,
          availability: "active",
          missingSuccessfulRuns: 0,
          firstSeenAt: action.at,
          lastSeenAt: action.at,
          closedAt: null,
          sourcePublishedAt: action.posting.sourcePublishedAt,
          sourceUpdatedAt: action.posting.sourceUpdatedAt,
          sourcePublicationCheckedAt: action.posting.sourcePublicationCheckedAt,
          isRelevant: isPubliclyRelevantPosting(action.posting),
          closureCandidateSince: null,
          lastClosureConfirmationAt: null,
        });
      } else if (action.type === "seen" || action.type === "changed" || action.type === "reopened") {
        const current = previous.get(action.externalId);
        if (current) previous.set(action.externalId, {
          ...current,
          contentHash: action.posting.contentHash,
          availability: "active",
          missingSuccessfulRuns: 0,
          lastSeenAt: action.at,
          closedAt: null,
          sourcePublishedAt: action.type === "reopened"
            ? action.posting.sourcePublishedAt ?? current.sourcePublishedAt
            : current.sourcePublishedAt ?? action.posting.sourcePublishedAt,
          sourceUpdatedAt: action.posting.sourceUpdatedAt ?? current.sourceUpdatedAt,
          sourcePublicationCheckedAt: action.type === "reopened"
            ? action.posting.sourcePublicationCheckedAt ?? current.sourcePublicationCheckedAt
            : current.sourcePublicationCheckedAt ?? action.posting.sourcePublicationCheckedAt,
          isRelevant: isPubliclyRelevantPosting(action.posting),
          closureCandidateSince: null,
          lastClosureConfirmationAt: null,
        });
      } else if (action.type === "missing") {
        const current = previous.get(action.externalId);
        if (current) previous.set(action.externalId, {
          ...current,
          availability: "closure_pending",
          missingSuccessfulRuns: action.missingSuccessfulRuns,
          closureCandidateSince: current.closureCandidateSince ?? action.at,
          lastClosureConfirmationAt: action.at,
        });
      } else if (action.type === "closed") {
        const current = previous.get(action.externalId);
        if (current) previous.set(action.externalId, { ...current, availability: "closed", closedAt: action.at, closureCandidateSince: null, lastClosureConfirmationAt: action.at });
      }
    }
    // Preserve normalized values only through actions; the interface mirrors a DB transaction.
    void incoming;
    this.postings.set(record.sourceId, [...previous.values()]);
    return Promise.resolve();
  }
}
