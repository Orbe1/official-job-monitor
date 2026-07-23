import type { RawCompensation, RawPosting } from "../types";
import { normalizeWhitespace, stripHtml } from "../text";

export const UNKNOWN_COUNTRY = "UNKNOWN";

const US_STATE_NAMES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
  "Puerto Rico",
] as const;

const US_STATE_ABBREVIATIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC", "PR",
] as const;

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  USA: "US",
  "U.S.A.": "US",
  "U.S.": "US",
  US: "US",
  CANADA: "CA",
  CAN: "CA",
  MEXICO: "MX",
  MEX: "MX",
  "UNITED KINGDOM": "GB",
  UK: "GB",
  ENGLAND: "GB",
  INDIA: "IN",
  IRELAND: "IE",
  GERMANY: "DE",
  FRANCE: "FR",
  SPAIN: "ES",
  AUSTRALIA: "AU",
  SINGAPORE: "SG",
};

export function rawPosting(input: Partial<RawPosting> & Pick<RawPosting, "externalId" | "title" | "canonicalUrl">): RawPosting {
  const postedAt = normalizeDate(input.postedAt);
  return {
    externalId: normalizeWhitespace(input.externalId),
    title: normalizeWhitespace(input.title),
    canonicalUrl: input.canonicalUrl,
    applicationUrl: input.applicationUrl || input.canonicalUrl,
    locationText: normalizeWhitespace(input.locationText) || "Location not specified",
    country: normalizeCountry(input.country, input.locationText ?? ""),
    workplaceType: input.workplaceType ?? inferWorkplace(input.locationText ?? ""),
    employmentType: input.employmentType ?? null,
    department: input.department ?? null,
    descriptionText: stripHtml(input.descriptionText),
    responsibilities: input.responsibilities ?? [],
    requirements: input.requirements ?? [],
    eligibility: input.eligibility ?? null,
    graduationRequirements: input.graduationRequirements ?? null,
    compensation: input.compensation ?? null,
    postedAt,
    sourcePublishedAt: normalizeDate(input.sourcePublishedAt) ?? postedAt,
    sourceUpdatedAt: normalizeDate(input.sourceUpdatedAt),
    sourcePublicationCheckedAt: normalizeDate(input.sourcePublicationCheckedAt),
    raw: input.raw ?? input,
  };
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function inferWorkplace(text: string): RawPosting["workplaceType"] {
  if (/remote/i.test(text)) return "remote";
  if (/hybrid/i.test(text)) return "hybrid";
  if (/on[ -]?site|in[ -]?office|office/i.test(text)) return "onsite";
  return "unspecified";
}

export function normalizeCountry(value: string | null | undefined, locationText = ""): string {
  const supplied = normalizeWhitespace(value ?? "");
  if (supplied) {
    const normalized = supplied.toUpperCase();
    const alias = COUNTRY_ALIASES[normalized];
    if (alias) return alias;
    return normalized;
  }
  return inferCountry(locationText);
}

export function inferCountry(text: string): string {
  const location = normalizeWhitespace(text);
  if (!location) return UNKNOWN_COUNTRY;

  // An explicitly named non-US country wins over state-abbreviation inference.
  // This avoids treating values such as "Toronto, ON, Canada" as US locations.
  for (const [label, code] of Object.entries(COUNTRY_ALIASES)) {
    if (code === "US" || label.length <= 2) continue;
    if (new RegExp(`\\b${escapeRegExp(label)}\\b`, "i").test(location)) return code;
  }

  if (/(?:^|[,/|;()\s-])(?:USA|United States(?: of America)?|U\.S\.A\.|U\.S\.)(?=$|[,/|;()\s-])/i.test(location) || /(?:^|[,/|;()\s-])US(?:$|[,/|;()\s-])/i.test(location)) {
    return "US";
  }

  // Georgia is both a US state and a country, so the name alone is not enough
  // to confirm US scope. An explicit US marker still succeeds above.
  if (US_STATE_NAMES.some((state) => state !== "Georgia" && new RegExp(`\\b${escapeRegExp(state)}\\b`, "i").test(location))) return "US";

  // Greenhouse commonly supplies only "City, ST". Requiring the state code to
  // be its own delimited location segment keeps ordinary prose from matching.
  const stateCodes = US_STATE_ABBREVIATIONS.join("|");
  if (new RegExp(`(?:^|[,/|;(-]\\s*)(?:${stateCodes})(?=\\s*(?:$|[,/|;)-]))`).test(location)) return "US";

  return UNKNOWN_COUNTRY;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compensationFromUnknown(value: unknown): RawCompensation | null {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const components = Array.isArray(object.summaryComponents) ? object.summaryComponents : [];
  const salaryComponent = components.find((component) => component && typeof component === "object" && /salary/i.test(String((component as Record<string, unknown>).compensationType ?? ""))) as Record<string, unknown> | undefined;
  const min = numeric(object.min ?? object.minimum ?? object.minValue ?? salaryComponent?.minValue);
  const max = numeric(object.max ?? object.maximum ?? object.maxValue ?? salaryComponent?.maxValue);
  const displayText = stringValue(object.displayText ?? object.salaryDescription ?? object.scrapeableCompensationSalarySummary ?? object.summary);
  if (min === null && max === null && !displayText) return null;
  const interval = stringValue(object.interval ?? object.period ?? salaryComponent?.interval)?.toLowerCase() ?? "";
  return {
    minimum: min,
    maximum: max,
    currency: stringValue(object.currency ?? object.currencyCode ?? salaryComponent?.currencyCode),
    period: interval.includes("hour") ? "hour" : interval.includes("month") ? "month" : interval.includes("year") || interval.includes("annual") ? "year" : "unknown",
    displayText,
  };
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function numeric(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

export function safeUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value, fallback);
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
