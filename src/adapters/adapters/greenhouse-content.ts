import type { RawCompensation, RawPosting } from "../types";
import { normalizeWhitespace, stripHtml } from "../text";

type CompensationSection = {
  label: RegExp;
  period: Exclude<RawCompensation["period"], "month" | "unknown">;
  minimumAllowed: number;
  maximumAllowed: number;
};

type ParsedCompensationRange = RawCompensation & {
  minimum: number;
  maximum: number;
  currency: "USD";
  period: CompensationSection["period"];
  displayText: string;
};

const COMPENSATION_SECTIONS: readonly CompensationSection[] = [
  {
    label: /^(Annual Base Salary Range)\s*:?\s*(.*)$/i,
    period: "year",
    minimumAllowed: 10_000,
    maximumAllowed: 2_000_000,
  },
  {
    label: /^(Hourly Base (?:Pay|Salary) Range)\s*:?\s*(.*)$/i,
    period: "hour",
    minimumAllowed: 1,
    maximumAllowed: 1_000,
  },
  {
    // Databricks uses this heading for annual salary-sized disclosures while
    // using an explicit "Hourly Rate" heading for internships.
    label: /^(Local Pay Range)\s*:?\s*(.*)$/i,
    period: "year",
    minimumAllowed: 10_000,
    maximumAllowed: 2_000_000,
  },
  {
    // Location names vary by posting (for example "SF Bay Area" and
    // "Bellevue, Washington"), so the stable signal is the exact suffix.
    label: /^([^:$\n]{2,80}\s+Hourly Rate)\s*:?\s*(.*)$/i,
    period: "hour",
    minimumAllowed: 1,
    maximumAllowed: 1_000,
  },
  {
    // Some boards prefix annual salary/pay headings with a location or zone.
    // Annual-sized bounds keep generic or hourly figures from being promoted.
    label: /^([^:$\n]{2,80}\s+(?:Annual\s+(?:Base\s+)?(?:Salary|Pay)\s+Range|(?:Salary|Pay)\s+Range))\s*:?\s*(.*)$/i,
    period: "year",
    minimumAllowed: 10_000,
    maximumAllowed: 2_000_000,
  },
];

const MONEY_RANGE = /^\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:-|\u2013|\u2014|to)\s*\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s+USD\.?$/i;
const ROLE_REMOTE_OPTION = /\b(?:this|the)\s+(?:is\s+(?:an?\s+)?(?:full[- ]time\s+|part[- ]time\s+)?)?(?:role|position|job)\b[^.!?\n]{0,80}\b(?:can|may)\s+be\s+(?:held|based|performed|filled)(?:\s+remotely\s+(?:in|within)\s+(?:the\s+)?(?:United States|U\.?S\.?)\b|[^,;.!?\n]{0,140}\bor\s+remotely\s+(?:in|within)\s+(?:the\s+)?(?:United States|U\.?S\.?)\b)/i;
const ROLE_IS_REMOTE = /\b(?:this|the)\s+(?:role|position|job)\s+(?:is|will be)\s+(?:fully\s+)?remote\s+(?:in|within)\s+(?:the\s+)?(?:United States|U\.?S\.?)\b/i;
const THIS_IS_REMOTE_ROLE = /\b(?:this|the)\s+is\s+(?:an?\s+)?(?:full[- ]time\s+|part[- ]time\s+)?(?:fully\s+)?remote\s+(?:role|position|job)\s+(?:in|within)\s+(?:the\s+)?(?:United States|U\.?S\.?)\b/i;

/**
 * Greenhouse description content can contain entity-encoded HTML inside an
 * outer HTML document. A bounded number of passes produces the same plain
 * role text used by normalization without recursively decoding arbitrary data.
 */
export function greenhousePostingText(value: unknown): string {
  if (typeof value !== "string") return "";
  let text = value
    .replace(/&(?:amp;)?mdash;/gi, "\u2014")
    .replace(/&(?:amp;)?ndash;/gi, "\u2013");

  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = stripHtml(text);
    if (stripped === text) break;
    text = stripped;
  }
  return text;
}

/**
 * Parses only an explicitly labeled, immediately adjacent company pay range.
 * Unlabeled dollar figures and total-compensation boilerplate are ignored.
 */
export function compensationFromGreenhouseContent(value: unknown): RawCompensation | null {
  const lines = greenhousePostingText(value)
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const ranges: ParsedCompensationRange[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const section of COMPENSATION_SECTIONS) {
      const labelMatch = line.match(section.label);
      if (!labelMatch) continue;

      const labelText = labelMatch[1];
      const inlineRange = normalizeWhitespace(labelMatch[2]);
      const rangeText = adjacentRangeText(lines, index, inlineRange);
      const rangeMatch = rangeText.match(MONEY_RANGE);
      if (!rangeMatch) continue;

      const minimum = parseMoney(rangeMatch[1]);
      const maximum = parseMoney(rangeMatch[2]);
      if (
        minimum < section.minimumAllowed
        || maximum > section.maximumAllowed
        || maximum < minimum
      ) {
        continue;
      }

      ranges.push({
        minimum,
        maximum,
        currency: "USD",
        period: section.period,
        // This field deliberately retains the normalized official disclosure;
        // presentation formatting is derived separately in the client.
        displayText: `${labelText}: ${rangeText}`,
      });
      break;
    }
  }

  const uniqueRanges = ranges.filter((range, index) => (
    ranges.findIndex((candidate) => candidate.displayText.toLowerCase() === range.displayText.toLowerCase()) === index
  ));
  if (uniqueRanges.length === 0) return null;

  const first = uniqueRanges[0];
  const compatibleAmounts = uniqueRanges.every((range) => (
    range.minimum === first.minimum
    && range.maximum === first.maximum
    && range.currency === first.currency
    && range.period === first.period
  ));
  const commonPeriod = uniqueRanges.every((range) => range.period === first.period)
    ? first.period
    : "unknown";

  return {
    // Distinct location-specific ranges are alternatives, not one broad pay
    // band. Preserve every disclosure but never manufacture outer bounds.
    minimum: compatibleAmounts ? first.minimum : null,
    maximum: compatibleAmounts ? first.maximum : null,
    currency: "USD",
    period: commonPeriod,
    displayText: uniqueRanges.map((range) => range.displayText).join(" • "),
  };
}

/**
 * Recognizes an explicit US remote option only when it is anchored to the
 * specific role in the same sentence. Generic remote-team, interview, benefit,
 * or pay-transparency language does not satisfy the rule.
 */
export function workplaceFromGreenhouseContent(value: unknown): RawPosting["workplaceType"] {
  const statements = greenhousePostingText(value)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((statement) => normalizeWhitespace(statement))
    .filter(Boolean);

  return statements.some((statement) => (
    ROLE_REMOTE_OPTION.test(statement)
    || ROLE_IS_REMOTE.test(statement)
    || THIS_IS_REMOTE_ROLE.test(statement)
  )) ? "remote" : "unspecified";
}

function parseMoney(value: string): number {
  return Number(value.replace(/,/g, ""));
}

function adjacentRangeText(lines: string[], labelIndex: number, inlineRange: string): string {
  if (MONEY_RANGE.test(inlineRange)) return inlineRange;

  const parts: string[] = [];
  // Greenhouse commonly wraps the minimum, divider, and maximum in separate
  // spans. `stripHtml` normally keeps them on one line, but this bounded join
  // also handles templates that insert line breaks between those spans.
  for (let offset = 1; offset <= 3; offset += 1) {
    const part = lines[labelIndex + offset];
    if (!part || isCompensationLabel(part)) break;
    parts.push(part);
    const candidate = normalizeWhitespace(parts.join(" "));
    if (MONEY_RANGE.test(candidate)) return candidate;
    if (/\bUSD\.?$/i.test(candidate)) break;
  }

  return inlineRange;
}

function isCompensationLabel(line: string): boolean {
  return COMPENSATION_SECTIONS.some((section) => section.label.test(line));
}
