import { createHash } from "node:crypto";
import { classifyPosting } from "./classifier";
import { normalizeCountry } from "./adapters/shared";
import { normalizeWhitespace, stableStringify, stripHtml } from "./text";
import type { NormalizedPosting, RawPosting } from "./types";

export function normalizePosting(posting: RawPosting): NormalizedPosting {
  const cleaned: RawPosting = {
    ...posting,
    externalId: normalizeWhitespace(posting.externalId),
    title: normalizeWhitespace(posting.title),
    canonicalUrl: normalizeWhitespace(posting.canonicalUrl),
    applicationUrl: normalizeWhitespace(posting.applicationUrl || posting.canonicalUrl),
    locationText: normalizeWhitespace(posting.locationText || "Location not specified"),
    country: normalizeCountry(posting.country, posting.locationText),
    descriptionText: stripHtml(posting.descriptionText),
    responsibilities: posting.responsibilities.map(stripHtml).filter(Boolean),
    requirements: posting.requirements.map(stripHtml).filter(Boolean),
    eligibility: posting.eligibility ? stripHtml(posting.eligibility) : null,
    graduationRequirements: posting.graduationRequirements
      ? stripHtml(posting.graduationRequirements)
      : null,
  };

  const classification = classifyPosting(cleaned);
  const normalizedTitle = cleaned.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hashInput = {
    title: normalizedTitle,
    description: cleaned.descriptionText,
    location: cleaned.locationText,
    workplaceType: cleaned.workplaceType,
    employmentType: cleaned.employmentType,
    compensation: cleaned.compensation,
  };

  return {
    ...cleaned,
    normalizedTitle,
    classification,
    sourceConfidence: cleaned.externalId && cleaned.canonicalUrl ? 0.98 : 0.65,
    contentHash: createHash("sha256").update(stableStringify(hashInput)).digest("hex"),
  };
}

/**
 * The classifier describes role fit; this gate describes whether a posting is
 * safe to publish in the US early-career product. Excluded postings still
 * participate in normalization for the in-memory bulk pass, but persistence
 * retains only their compact source identity and lifecycle state.
 */
export function isPubliclyRelevantPosting(posting: Pick<NormalizedPosting, "country" | "locationText" | "classification">): boolean {
  const classification = posting.classification;
  return normalizeCountry(posting.country, posting.locationText) === "US"
    && classification.relevant
    && (classification.audience === "internship" || classification.audience === "new_grad")
    && !classification.reviewRequired
    && classification.confidence >= 0.9;
}

export function shouldRetainFullPosting(
  posting: Pick<NormalizedPosting, "country" | "locationText" | "classification">,
): boolean {
  const isUnitedStates = normalizeCountry(posting.country, posting.locationText) === "US";
  return isPubliclyRelevantPosting(posting)
    || (isUnitedStates && posting.classification.reviewRequired);
}

export function normalizeAndDedupe(postings: RawPosting[]): {
  postings: NormalizedPosting[];
  duplicateExternalIds: string[];
} {
  const seen = new Set<string>();
  const duplicateExternalIds = new Set<string>();
  const normalized: NormalizedPosting[] = [];

  for (const posting of postings) {
    const item = normalizePosting(posting);
    if (!item.externalId) continue;
    if (seen.has(item.externalId)) {
      duplicateExternalIds.add(item.externalId);
      continue;
    }
    seen.add(item.externalId);
    normalized.push(item);
  }

  return { postings: normalized, duplicateExternalIds: [...duplicateExternalIds] };
}
