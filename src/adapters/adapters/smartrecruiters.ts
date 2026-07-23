import { AdapterError, type AdapterContext, type SourceAdapter } from "../types";
import { failedResult, successfulResult } from "../result";
import { rawPosting, safeUrl } from "./shared";

interface SmartRecruitersList {
  limit?: number;
  offset?: number;
  totalFound?: number;
  content?: SmartRecruitersPosting[];
}

interface SmartRecruitersPosting {
  id?: string;
  uuid?: string;
  name?: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  ref?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}

/** Public posting data only. If a tenant requires an API key, it is unsupported. */
export class SmartRecruitersAdapter implements SourceAdapter {
  readonly kind = "smartrecruiters" as const;
  readonly version = "0.5.0";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.companyIdentifier) return failedResult(this.kind, this.version, startedAt, new Error("SmartRecruiters companyIdentifier is required"));
    const limit = 100;
    let offset = 0;
    let pages = 0;
    const statuses: number[] = [];
    const summaries: SmartRecruitersPosting[] = [];
    try {
      while (pages < 100) {
        const endpoint = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.companyIdentifier)}/postings?limit=${limit}&offset=${offset}`;
        const response = await http.getJson<SmartRecruitersList>(endpoint, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
        statuses.push(response.status);
        pages += 1;
        if (!Array.isArray(response.data.content)) throw new Error("SmartRecruiters response omitted content[]");
        summaries.push(...response.data.content);
        offset += response.data.content.length;
        if (response.data.content.length < limit || offset >= (response.data.totalFound ?? offset)) break;
      }
      if (pages === 100) throw new Error("SmartRecruiters pagination exceeded the safety limit");

      const details: SmartRecruitersPosting[] = [];
      for (const summary of summaries) {
        if (!summary.id && !summary.uuid) continue;
        const endpoint = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.companyIdentifier)}/postings/${encodeURIComponent(summary.id ?? summary.uuid ?? "")}`;
        const response = await http.getJson<SmartRecruitersPosting>(endpoint, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
        statuses.push(response.status);
        details.push({ ...summary, ...response.data });
      }

      const postings = details.map((job) => {
        const canonicalUrl = safeUrl(job.applyUrl, source.officialUrl);
        const sections = Object.values(job.jobAd?.sections ?? {});
        const description = sections.map((section) => `${section.title ?? ""}\n${section.text ?? ""}`).join("\n\n");
        return rawPosting({
          externalId: job.uuid ?? job.id ?? "",
          title: job.name ?? "",
          canonicalUrl,
          applicationUrl: canonicalUrl,
          locationText: [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", "),
          country: job.location?.country?.toUpperCase() ?? null,
          workplaceType: job.location?.remote ? "remote" : "unspecified",
          employmentType: job.typeOfEmployment?.label ?? null,
          department: [job.department?.label, job.function?.label].filter(Boolean).join(" / ") || null,
          descriptionText: description,
          postedAt: job.releasedDate ?? null,
          raw: job,
        });
      });
      return successfulResult(this.kind, this.version, startedAt, postings, pages, statuses, ["tenant_may_require_authorized_posting_api_access"]);
    } catch (error) {
      if (error instanceof AdapterError && (error.status === 401 || error.status === 403)) {
        return failedResult(this.kind, this.version, startedAt, new AdapterError("This SmartRecruiters tenant requires authorization; manual review only", "UNSUPPORTED", false, error.status));
      }
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }
}
