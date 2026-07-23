import type { AlertCriteria, AlertRule, JobAudience, TechnicalCategory, WorkArrangement } from "../shared/domain";

export interface AlertCandidate {
  jobId: string;
  companyId: string;
  companyName: string;
  title: string;
  audience: JobAudience;
  technicalCategory: TechnicalCategory;
  locationText: string;
  workArrangement: WorkArrangement;
  compensationAnnualized: number | null;
  firstSeenAt: string;
  reopened: boolean;
}

export interface AlertMatchContext {
  now: string;
  followedCompanyIds: ReadonlySet<string>;
}

export function matchesAlertCriteria(criteria: AlertCriteria, candidate: AlertCandidate, context: AlertMatchContext): boolean {
  if (criteria.audiences?.length && !criteria.audiences.includes(candidate.audience)) return false;
  if (criteria.companyIds?.length && !criteria.companyIds.includes(candidate.companyId)) return false;
  if (criteria.followedCompaniesOnly && !context.followedCompanyIds.has(candidate.companyId)) return false;
  if (criteria.technicalCategories?.length && !criteria.technicalCategories.includes(candidate.technicalCategory)) return false;
  if (criteria.locations?.length && !criteria.locations.some((location) => candidate.locationText.toLowerCase().includes(location.toLowerCase()))) return false;
  if (criteria.workArrangements?.length && !criteria.workArrangements.includes(candidate.workArrangement)) return false;
  if (criteria.minimumCompensation !== undefined && (candidate.compensationAnnualized ?? 0) < criteria.minimumCompensation) return false;
  if (criteria.newlyFoundWithinHours !== undefined) {
    const age = Date.parse(context.now) - Date.parse(candidate.firstSeenAt);
    if (!Number.isFinite(age) || age < 0 || age > criteria.newlyFoundWithinHours * 3_600_000) return false;
  }
  if (criteria.reopenedOnly && !candidate.reopened) return false;
  return true;
}

export function matchingAlertRules(
  rules: AlertRule[],
  candidate: AlertCandidate,
  context: AlertMatchContext,
): AlertRule[] {
  return rules.filter((rule) => rule.enabled && matchesAlertCriteria(rule.criteria, candidate, context));
}

export function annualizedCompensation(input: { maximum: number | null; minimum: number | null; period: "hour" | "year" | "month" | "unknown" }): number | null {
  const value = input.maximum ?? input.minimum;
  if (value === null) return null;
  if (input.period === "hour") return value * 2_080;
  if (input.period === "month") return value * 12;
  return input.period === "year" ? value : null;
}
