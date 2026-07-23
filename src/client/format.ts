import type { Compensation, Job } from "../shared/domain";

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function relativeTime(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "recently";
  const delta = timestamp - now;
  const abs = Math.abs(delta);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return relativeFormatter.format(Math.round(delta / 60_000), "minute");
  if (abs < 86_400_000) return relativeFormatter.format(Math.round(delta / 3_600_000), "hour");
  if (abs < 2_592_000_000) return relativeFormatter.format(Math.round(delta / 86_400_000), "day");
  return shortDateFormatter.format(new Date(value));
}

export function fullDate(value: string | null): string {
  return value ? fullDateFormatter.format(new Date(value)) : "Not set";
}

export function dateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "Never";
}

export function dateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T12:00:00`).toISOString();
}

type JobSourceTiming = Pick<Job, "sourcePublishedAt" | "postedAt" | "firstSeenAt">;

export function sourcePublicationDate(job: Pick<JobSourceTiming, "sourcePublishedAt" | "postedAt">): string | null {
  return job.sourcePublishedAt ?? job.postedAt;
}

export function jobAge(job: JobSourceTiming, now?: number): string {
  const publishedAt = sourcePublicationDate(job);
  return publishedAt ? `Posted ${relativeTime(publishedAt, now)}` : `Found ${relativeTime(job.firstSeenAt, now)}`;
}

export function jobDate(job: JobSourceTiming): string {
  const publishedAt = sourcePublicationDate(job);
  return publishedAt ? `Posted ${fullDate(publishedAt)}` : `Found ${dateTime(job.firstSeenAt)}`;
}

export function compensationLabel(compensation: Compensation): string {
  const structuredRange = structuredBasePayLabel(compensation);
  if (structuredRange) return structuredRange;
  if (!compensation.displayText) return "Not listed";
  return compensation.displayText
    .replace(/\s*\(sample estimate\)/i, "")
    .replace(/\s*\(sample historical signal\)/i, "")
    .trim();
}

export function compensationTypeLabel(compensation: Compensation): string | null {
  if (compensation.isEstimate || compensation.source !== "company") return null;
  if (/\bbase salary\b/i.test(compensation.displayText)) return "Base salary";
  if (/\bbase pay\b/i.test(compensation.displayText)) return "Base pay";
  return null;
}

function structuredBasePayLabel(compensation: Compensation): string | null {
  if (
    compensation.isEstimate
    || compensation.source !== "company"
    || compensation.currency.toUpperCase() !== "USD"
    || !/\bbase (?:salary|pay)\b/i.test(compensation.displayText)
    || compensation.minimum === null
    || compensation.maximum === null
  ) {
    return null;
  }

  const suffix = compensation.period === "year"
    ? "/year"
    : compensation.period === "hour"
      ? "/hour"
      : compensation.period === "month"
        ? "/month"
        : "";
  return `${compactUsd(compensation.minimum, compensation.period)}\u2013${compactUsd(compensation.maximum, compensation.period)}${suffix}`;
}

function compactUsd(value: number, period: Compensation["period"]): string {
  if (Math.abs(value) >= 1_000) {
    const thousands = value / 1_000;
    return `$${Number.isInteger(thousands) ? thousands : Number(thousands.toFixed(1))}K`;
  }
  if (period === "hour" && !Number.isInteger(value)) return `$${value.toFixed(2)}`;
  return `$${Number.isInteger(value) ? value : Number(value.toFixed(2))}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
