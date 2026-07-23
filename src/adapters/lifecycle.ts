import type { NormalizedPosting } from "./types";

export interface ExistingPostingState {
  id: string;
  externalId: string;
  contentHash: string;
  availability: "active" | "closure_pending" | "closed";
  missingSuccessfulRuns: number;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  sourcePublicationCheckedAt: string | null;
  isRelevant: boolean;
  closureCandidateSince?: string | null;
  lastClosureConfirmationAt?: string | null;
}

export type LifecycleAction =
  | { type: "discovered"; externalId: string; posting: NormalizedPosting; at: string }
  | { type: "seen"; id: string; externalId: string; posting: NormalizedPosting; at: string }
  | { type: "changed"; id: string; externalId: string; posting: NormalizedPosting; previousHash: string; at: string }
  | { type: "missing"; id: string; externalId: string; missingSuccessfulRuns: number; at: string }
  | { type: "closed"; id: string; externalId: string; at: string }
  | { type: "reopened"; id: string; externalId: string; posting: NormalizedPosting; at: string }
  | { type: "preserved"; id: string; externalId: string; reason: string; at: string };

export interface LifecycleInput {
  existing: ExistingPostingState[];
  incoming: NormalizedPosting[];
  run: {
    outcome: "success" | "degraded" | "failed" | "unsupported";
    completeness: "complete" | "partial" | "unknown";
    suspiciousFlags: string[];
  };
  now: string;
  closeAfterSuccessfulAbsences?: number;
  expectedIntervalMinutes?: number;
}

export function planLifecycle(input: LifecycleInput): LifecycleAction[] {
  const closeAfter = Math.max(2, input.closeAfterSuccessfulAbsences ?? 2);
  const expectedIntervalMs = Math.max(1, input.expectedIntervalMinutes ?? 60) * 60_000;
  const existingByExternalId = new Map(input.existing.map((item) => [item.externalId, item]));
  const incomingByExternalId = new Map(input.incoming.map((item) => [item.externalId, item]));
  const actions: LifecycleAction[] = [];

  for (const posting of input.incoming) {
    const previous = existingByExternalId.get(posting.externalId);
    if (!previous) {
      actions.push({ type: "discovered", externalId: posting.externalId, posting, at: input.now });
      continue;
    }
    if (previous.availability === "closed") {
      actions.push({ type: "reopened", id: previous.id, externalId: previous.externalId, posting, at: input.now });
    } else if (previous.contentHash !== posting.contentHash) {
      actions.push({ type: "changed", id: previous.id, externalId: previous.externalId, posting, previousHash: previous.contentHash, at: input.now });
    } else {
      actions.push({ type: "seen", id: previous.id, externalId: previous.externalId, posting, at: input.now });
    }
  }

  const canAdvanceClosure = input.run.outcome === "success" && input.run.completeness === "complete" && input.run.suspiciousFlags.length === 0;
  for (const previous of input.existing) {
    if (incomingByExternalId.has(previous.externalId) || previous.availability === "closed") continue;
    if (!canAdvanceClosure) {
      actions.push({ type: "preserved", id: previous.id, externalId: previous.externalId, reason: preservationReason(input.run), at: input.now });
      continue;
    }
    if (previous.missingSuccessfulRuns > 0 && !confirmationIntervalElapsed(previous, input.now, expectedIntervalMs)) {
      actions.push({
        type: "preserved",
        id: previous.id,
        externalId: previous.externalId,
        reason: "Closure confirmation interval has not elapsed",
        at: input.now,
      });
      continue;
    }
    const missingSuccessfulRuns = previous.missingSuccessfulRuns + 1;
    if (missingSuccessfulRuns >= closeAfter) {
      actions.push({ type: "closed", id: previous.id, externalId: previous.externalId, at: input.now });
    } else {
      actions.push({ type: "missing", id: previous.id, externalId: previous.externalId, missingSuccessfulRuns, at: input.now });
    }
  }

  return actions;
}

function confirmationIntervalElapsed(previous: ExistingPostingState, now: string, expectedIntervalMs: number): boolean {
  const lastConfirmation = previous.lastClosureConfirmationAt ?? previous.closureCandidateSince;
  if (!lastConfirmation) return false;
  const previousTimestamp = Date.parse(lastConfirmation);
  const currentTimestamp = Date.parse(now);
  return Number.isFinite(previousTimestamp)
    && Number.isFinite(currentTimestamp)
    && currentTimestamp - previousTimestamp >= expectedIntervalMs;
}

function preservationReason(run: LifecycleInput["run"]): string {
  if (run.suspiciousFlags.length) return `Suspicious run: ${run.suspiciousFlags.join(", ")}`;
  if (run.outcome !== "success") return `Run outcome was ${run.outcome}`;
  return `Run completeness was ${run.completeness}`;
}
