import { AdapterError, type AdapterContext, type SourceAdapter } from "../types";
import { failedResult, successfulResult } from "../result";
import { rawPosting, safeUrl } from "./shared";

interface WorkdayListResponse {
  total?: number;
  jobPostings?: Array<{
    title?: string;
    externalPath?: string;
    locationsText?: string;
    postedOn?: string;
    bulletFields?: string[];
  }>;
}

/**
 * Experimental adapter for the public CXS endpoint used by some official
 * Workday career sites. Workday does not publish a general public-job API
 * contract, so every source requires company-specific verification. The
 * adapter never attempts authentication or bot-control bypasses.
 */
export class WorkdayAdapter implements SourceAdapter {
  readonly kind = "workday" as const;
  readonly version = "0.2.0-experimental";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.customEndpoint) {
      return failedResult(this.kind, this.version, startedAt, new AdapterError("Workday requires a verified public CXS endpoint", "UNSUPPORTED", false));
    }
    let offset = 0;
    const limit = 20;
    let pages = 0;
    const statuses: number[] = [];
    const jobs: NonNullable<WorkdayListResponse["jobPostings"]> = [];
    try {
      while (pages < 100) {
        const response = await http.postJson<WorkdayListResponse>(source.customEndpoint, {
          appliedFacets: {},
          limit,
          offset,
          searchText: "",
        }, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
        statuses.push(response.status);
        pages += 1;
        if (!Array.isArray(response.data.jobPostings)) throw new Error("Workday response omitted jobPostings[]");
        jobs.push(...response.data.jobPostings);
        offset += response.data.jobPostings.length;
        if (response.data.jobPostings.length < limit || offset >= (response.data.total ?? offset)) break;
      }
      if (pages === 100) throw new Error("Workday pagination exceeded the safety limit");
      const endpointUrl = new URL(source.customEndpoint);
      const base = `${endpointUrl.origin}${endpointUrl.pathname.replace(/\/jobs\/?$/, "")}`;
      const postings = jobs.map((job) => {
        const canonicalUrl = safeUrl(job.externalPath ? `${base}/job${job.externalPath}` : source.officialUrl, source.officialUrl);
        return rawPosting({
          externalId: job.externalPath || canonicalUrl,
          title: job.title ?? "",
          canonicalUrl,
          applicationUrl: canonicalUrl,
          locationText: job.locationsText ?? "",
          descriptionText: job.bulletFields?.join("\n") ?? "",
          postedAt: parseRelativePostedOn(job.postedOn),
          raw: job,
        });
      });
      return successfulResult(this.kind, this.version, startedAt, postings, pages, statuses, ["experimental_undocumented_public_contract", "listing_payload_may_omit_full_description"]);
    } catch (error) {
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }
}

function parseRelativePostedOn(value: string | undefined): string | null {
  if (!value) return null;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  // Relative labels are retained in the raw snapshot. Fabricating an exact
  // timestamp from “posted N days ago” would overstate source precision.
  return null;
}
