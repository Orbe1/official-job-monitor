import { failedResult, successfulResult } from "../result";
import { AdapterError, type AdapterContext, type NormalizedPosting, type SourceAdapter, type SourceTimestampMetadata } from "../types";
import { inferWorkplace, normalizeCountry, normalizeDate, rawPosting, safeUrl, stringValue, UNKNOWN_COUNTRY } from "./shared";
import { compensationFromGreenhouseContent, workplaceFromGreenhouseContent } from "./greenhouse-content";
import { requirementsFromGreenhouseContent } from "./greenhouse-requirements";

interface GreenhouseResponse {
  jobs?: Array<{
    id?: number | string;
    internal_job_id?: number | string | null;
    title?: string;
    updated_at?: string;
    location?: { name?: string };
    absolute_url?: string;
    content?: string;
    departments?: Array<{ name?: string }>;
    offices?: Array<{ name?: string; location?: string }>;
    metadata?: Array<{ name?: string; value?: unknown }> | null;
  }>;
  meta?: { total?: number };
}

interface GreenhouseJobDetail {
  id?: number | string;
  first_published?: string | null;
  updated_at?: string | null;
}

export class GreenhouseAdapter implements SourceAdapter {
  readonly kind = "greenhouse" as const;
  readonly version = "1.3.0";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.boardToken) return failedResult(this.kind, this.version, startedAt, new Error("Greenhouse boardToken is required"));
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs?content=true`;
    try {
      const response = await http.getJson<GreenhouseResponse>(endpoint, {
        minimumIntervalMs: source.minimumRequestIntervalMs,
        timeoutMs: source.requestTimeoutMs,
        maximumResponseBytes: source.maximumResponseBytes,
      });
      if (!Array.isArray(response.data.jobs)) throw new Error("Greenhouse response omitted jobs[]");
      const postings = response.data.jobs.map((job) => {
        const id = String(job.id ?? "");
        const canonicalUrl = safeUrl(job.absolute_url, source.officialUrl);
        const location = greenhouseLocation(job);
        const descriptionContent = job.content ?? "";
        const primaryWorkplace = inferWorkplace(job.location?.name ?? "");
        const resolvedWorkplace = inferWorkplace(location);
        const sourceWorkplace = primaryWorkplace === "unspecified" ? resolvedWorkplace : primaryWorkplace;
        const contentWorkplace = workplaceFromGreenhouseContent(descriptionContent);
        const roleRequirements = requirementsFromGreenhouseContent(descriptionContent);
        const locationCountry = normalizeCountry(null, location);
        return rawPosting({
          externalId: id,
          title: job.title ?? "",
          canonicalUrl,
          applicationUrl: canonicalUrl,
          locationText: location,
          country: locationCountry === UNKNOWN_COUNTRY && contentWorkplace === "remote"
            ? "US"
            : locationCountry,
          workplaceType: sourceWorkplace === "unspecified"
            ? contentWorkplace
            : sourceWorkplace,
          department: job.departments?.map((item) => item.name).filter(Boolean).join(" / ") || null,
          descriptionText: descriptionContent,
          requirements: roleRequirements.requirements,
          eligibility: roleRequirements.eligibility,
          graduationRequirements: roleRequirements.graduationRequirements,
          compensation: compensationFromGreenhouseContent(descriptionContent),
          // The bulk endpoint's updated_at is not a publication date. The
          // worker enriches new IDs from the individual-job endpoint below.
          postedAt: null,
          sourcePublishedAt: null,
          sourceUpdatedAt: job.updated_at ?? null,
          raw: job,
        });
      });
      const warnings = response.data.meta?.total !== undefined && response.data.meta.total !== postings.length ? ["reported_total_mismatch"] : [];
      return successfulResult(this.kind, this.version, startedAt, postings, 1, [response.status], warnings);
    } catch (error) {
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }

  async fetchSourceTimestamps(
    { source, http }: AdapterContext,
    postings: readonly NormalizedPosting[],
  ) {
    const metadata: SourceTimestampMetadata[] = [];
    const httpStatuses: number[] = [];
    const warnings: string[] = [];
    const failedExternalIds: string[] = [];

    if (!source.boardToken) {
      return {
        metadata,
        httpStatuses,
        warnings: ["Greenhouse publication detail requests skipped because boardToken is missing."],
        failedExternalIds: postings.map((posting) => posting.externalId),
      };
    }

    for (const posting of postings) {
      const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.boardToken)}/jobs/${encodeURIComponent(posting.externalId)}`;
      try {
        const response = await http.getJson<GreenhouseJobDetail>(endpoint, {
          minimumIntervalMs: source.minimumRequestIntervalMs,
          timeoutMs: source.requestTimeoutMs,
        });
        httpStatuses.push(response.status);
        if (String(response.data.id ?? "") !== posting.externalId) {
          throw new AdapterError(
            `Greenhouse job detail ID did not match ${posting.externalId}`,
            "DETAIL_ID_MISMATCH",
            false,
            response.status,
          );
        }

        const sourcePublishedAt = normalizeDate(response.data.first_published);
        if (!sourcePublishedAt) {
          warnings.push(`Greenhouse job ${posting.externalId} detail omitted a valid first_published timestamp.`);
        }
        metadata.push({
          externalId: posting.externalId,
          sourcePublishedAt,
          sourceUpdatedAt: normalizeDate(response.data.updated_at) ?? posting.sourceUpdatedAt,
        });
      } catch (error) {
        failedExternalIds.push(posting.externalId);
        if (error instanceof AdapterError && error.status && !httpStatuses.includes(error.status)) {
          httpStatuses.push(error.status);
        }
        warnings.push(
          `Greenhouse job ${posting.externalId} publication detail request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        metadata.push({
          externalId: posting.externalId,
          sourcePublishedAt: null,
          sourceUpdatedAt: posting.sourceUpdatedAt,
        });
      }
    }

    return { metadata, httpStatuses, warnings, failedExternalIds };
  }
}

function greenhouseLocation(job: NonNullable<GreenhouseResponse["jobs"]>[number]): string {
  const primary = stringValue(job.location?.name);
  if (primary && !isGenericWorkplaceLabel(primary)) return primary;

  const officeLocations = uniqueStrings(job.offices?.map((office) => office.location || office.name));
  if (officeLocations.length > 0) return officeLocations.join(" / ");

  const metadataLocations = uniqueStrings(
    job.metadata
      ?.filter((item) => /(?:job posting )?location/i.test(item.name ?? ""))
      .flatMap((item) => Array.isArray(item.value) ? item.value : [item.value]),
  );
  if (metadataLocations.length > 0) return metadataLocations.join(" / ");

  return primary ?? "";
}

function isGenericWorkplaceLabel(value: string): boolean {
  const remainder = value
    .toLowerCase()
    .replace(/\b(?:remote|hybrid|distributed|flexible|in[ -]?office|on[ -]?site|onsite|office)\b/g, "")
    .replace(/[-\s,;/|()]+/g, "");
  return remainder.length === 0;
}

function uniqueStrings(values: unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const text = stringValue(value);
    if (!text || isGenericWorkplaceLabel(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
