import { failedResult, successfulResult } from "../result";
import type { AdapterContext, SourceAdapter } from "../types";
import { compensationFromUnknown, rawPosting, safeUrl } from "./shared";

interface LeverPosting {
  id?: string;
  text?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string; department?: string };
  country?: string | null;
  descriptionPlain?: string;
  description?: string;
  openingPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  hostedUrl?: string;
  applyUrl?: string;
  workplaceType?: string;
  salaryRange?: unknown;
  salaryDescriptionPlain?: string;
}

export class LeverAdapter implements SourceAdapter {
  readonly kind = "lever" as const;
  readonly version = "1.0.0";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.siteName) return failedResult(this.kind, this.version, startedAt, new Error("Lever siteName is required"));
    const limit = 100;
    let skip = 0;
    let pages = 0;
    const statuses: number[] = [];
    const postings: LeverPosting[] = [];
    try {
      while (pages < 100) {
        const endpoint = `https://api.lever.co/v0/postings/${encodeURIComponent(source.siteName)}?mode=json&skip=${skip}&limit=${limit}`;
        const response = await http.getJson<LeverPosting[]>(endpoint, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
        statuses.push(response.status);
        pages += 1;
        if (!Array.isArray(response.data)) throw new Error("Lever response was not an array");
        postings.push(...response.data);
        if (response.data.length < limit) break;
        skip += response.data.length;
      }
      if (pages === 100) throw new Error("Lever pagination exceeded the safety limit");
      const raw = postings.map((job) => {
        const canonicalUrl = safeUrl(job.hostedUrl, source.officialUrl);
        const workplace = job.workplaceType?.toLowerCase();
        const salary = compensationFromUnknown(job.salaryRange);
        if (salary && job.salaryDescriptionPlain) salary.displayText = job.salaryDescriptionPlain;
        return rawPosting({
          externalId: job.id ?? "",
          title: job.text ?? "",
          canonicalUrl,
          applicationUrl: safeUrl(job.applyUrl, canonicalUrl),
          locationText: job.categories?.allLocations?.join(" / ") || job.categories?.location || "",
          country: job.country?.toUpperCase() ?? null,
          workplaceType: workplace === "remote" ? "remote" : workplace === "hybrid" ? "hybrid" : workplace === "on-site" || workplace === "onsite" ? "onsite" : "unspecified",
          employmentType: job.categories?.commitment ?? null,
          department: [job.categories?.department, job.categories?.team].filter(Boolean).join(" / ") || null,
          descriptionText: job.descriptionPlain || job.description || job.openingPlain || "",
          responsibilities: listContent(job.lists, /responsibil|what you/i),
          requirements: listContent(job.lists, /require|qualif|what we/i),
          compensation: salary,
          postedAt: null,
          raw: job,
        });
      });
      return successfulResult(this.kind, this.version, startedAt, raw, pages, statuses);
    } catch (error) {
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }
}

function listContent(lists: LeverPosting["lists"], pattern: RegExp): string[] {
  return (lists ?? []).filter((item) => pattern.test(item.text ?? "")).map((item) => item.content ?? "");
}
