import { AdapterError, type AdapterContext, type SourceAdapter } from "../types";
import { failedResult, successfulResult } from "../result";
import { valueAtPath } from "../text";
import { rawPosting, safeUrl, stringValue } from "./shared";

export class CustomJsonAdapter implements SourceAdapter {
  readonly kind = "custom" as const;
  readonly version = "0.3.0-configured";

  async fetchAll({ source, http }: AdapterContext) {
    const startedAt = new Date();
    if (!source.customEndpoint || !source.customItemsPath || !source.customFieldMap?.id || !source.customFieldMap.title) {
      return failedResult(this.kind, this.version, startedAt, new AdapterError("Custom JSON adapter requires a reviewed endpoint, items path, ID map, and title map", "UNSUPPORTED", false));
    }
    try {
      const response = await http.getJson<unknown>(source.customEndpoint, { minimumIntervalMs: source.minimumRequestIntervalMs, timeoutMs: source.requestTimeoutMs });
      const items = valueAtPath(response.data, source.customItemsPath);
      if (!Array.isArray(items)) throw new Error(`Custom JSON items path '${source.customItemsPath}' was not an array`);
      const map = source.customFieldMap;
      const postings = items.map((item) => {
        const canonicalUrl = safeUrl(valueAtPath(item, map.url), source.officialUrl);
        return rawPosting({
          externalId: String(valueAtPath(item, map.id) ?? ""),
          title: String(valueAtPath(item, map.title) ?? ""),
          canonicalUrl,
          applicationUrl: safeUrl(valueAtPath(item, map.applyUrl), canonicalUrl),
          locationText: stringValue(valueAtPath(item, map.location)) ?? "",
          descriptionText: stringValue(valueAtPath(item, map.description)) ?? "",
          postedAt: stringValue(valueAtPath(item, map.postedAt)),
          raw: item,
        });
      });
      return successfulResult(this.kind, this.version, startedAt, postings, 1, [response.status], ["company_specific_configuration_requires_review"]);
    } catch (error) {
      return failedResult(this.kind, this.version, startedAt, error);
    }
  }
}
