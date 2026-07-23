import { failedResult, successfulResult } from "../result";
import type { AdapterContext, SourceAdapter } from "../types";
import { compensationFromUnknown, rawPosting, safeUrl } from "./shared";

interface AshbyResponse {
  apiVersion?: string;
  jobs?: Array<{
    id?: string;
    title?: string;
    location?: string;
    secondaryLocations?: Array<{ location?: string; address?: { addressCountry?: string } }>;
    department?: string;
    team?: string;
    isListed?: boolean;
    isRemote?: boolean;
    workplaceType?: string;
    descriptionPlain?: string;
    descriptionHtml?: string;
    publishedAt?: string;
    employmentType?: string;
    address?: { postalAddress?: { addressCountry?: string } };
    jobUrl?: string;
    applyUrl?: string;
    compensation?: unknown;
  }>;
}

export class AshbyAdapter implements SourceAdapter {
  readonly kind = "ashby" as const;
  readonly version = "1.0.0";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.boardToken) return failedResult(this.kind, this.version, startedAt, new Error("Ashby boardToken is required"));
    const endpoint = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.boardToken)}?includeCompensation=true`;
    try {
      const response = await http.getJson<AshbyResponse>(endpoint, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
      if (!Array.isArray(response.data.jobs)) throw new Error("Ashby response omitted jobs[]");
      const postings = response.data.jobs.filter((job) => job.isListed !== false).map((job) => {
        const canonicalUrl = safeUrl(job.jobUrl, source.officialUrl);
        const externalId = job.id || idFromUrl(canonicalUrl);
        const locations = [job.location, ...(job.secondaryLocations ?? []).map((item) => item.location)].filter(Boolean).join(" / ");
        const workplace = job.workplaceType?.toLowerCase();
        const workplaceType = workplace === "remote"
          ? "remote"
          : workplace === "hybrid"
            ? "hybrid"
            : workplace === "onsite" || workplace === "on-site"
              ? "onsite"
              : job.isRemote
                ? "remote"
                : "unspecified";
        return rawPosting({
          externalId,
          title: job.title ?? "",
          canonicalUrl,
          applicationUrl: safeUrl(job.applyUrl, canonicalUrl),
          locationText: locations,
          country: job.address?.postalAddress?.addressCountry ?? job.secondaryLocations?.[0]?.address?.addressCountry ?? null,
          workplaceType,
          employmentType: job.employmentType ?? null,
          department: [job.department, job.team].filter(Boolean).join(" / ") || null,
          descriptionText: job.descriptionPlain || job.descriptionHtml || "",
          compensation: compensationFromUnknown(job.compensation),
          postedAt: job.publishedAt ?? null,
          raw: job,
        });
      });
      return successfulResult(this.kind, this.version, startedAt, postings, 1, [response.status]);
    } catch (error) {
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }
}

function idFromUrl(url: string): string {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? url;
  } catch {
    return url;
  }
}
