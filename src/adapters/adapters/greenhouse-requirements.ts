import { normalizeWhitespace } from "../text";
import { greenhousePostingText } from "./greenhouse-content";

export interface GreenhouseRoleRequirements {
  requirements: string[];
  eligibility: string | null;
  graduationRequirements: string | null;
}

const REQUIRED_SECTION_HEADING = /^(?:(?:(?:minimum|required|basic)\s+)?qualifications?|your qualifications(?: and qualities)?|requirements?|what we (?:look for|are looking for)|what you(?:'|’)?ll need|who you are)\s*:?$/i;
const REQUIRED_SUBHEADING = /^(?:required|minimum)\s*:?$/i;
const PREFERRED_OR_END_HEADING = /^(?:preferred(?: qualifications?)?|nice to have|bonus points|about (?:us|databricks|the company)|benefits|pay range transparency|compensation|equal (?:employment|opportunity)|eeo statement|local pay range|.+ hourly rate|.+ annual (?:pay |salary )?range)\s*:?$/i;
const DEGREE_MARKER = /\b(?:B\.?S\.?|M\.?S\.?|Ph\.?D\.?|bachelor(?:'s)?|master(?:'s)?|doctor(?:al|ate)|degree)\b/i;
const GRADUATION_MARKER = /\b(?:graduat(?:e|es|ed|ing|ion)|class of)\b/i;
const PREFERRED_MARKER = /\b(?:preferred|nice to have|bonus)\b/i;

/**
 * Extracts only required, role-specific qualification bullets. General company
 * copy and preferred qualifications are deliberately excluded so degree and
 * graduation evidence cannot be manufactured from boilerplate.
 */
export function requirementsFromGreenhouseContent(value: unknown): GreenhouseRoleRequirements {
  const lines = greenhousePostingText(value)
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean);
  const requirements: string[] = [];
  let inRequiredSection = false;

  for (const line of lines) {
    if (REQUIRED_SECTION_HEADING.test(line)) {
      inRequiredSection = true;
      continue;
    }
    if (inRequiredSection && REQUIRED_SUBHEADING.test(line)) continue;
    if (inRequiredSection && PREFERRED_OR_END_HEADING.test(line)) break;
    if (!inRequiredSection || PREFERRED_MARKER.test(line)) continue;
    requirements.push(line);
    if (requirements.length >= 40) break;
  }

  const degreeRequirements = requirements.filter((line) => DEGREE_MARKER.test(line));
  const graduationRequirements = requirements.filter((line) => (
    GRADUATION_MARKER.test(line) && /\b20\d{2}\b/.test(line)
  ));

  return {
    requirements,
    eligibility: joinEvidence(degreeRequirements),
    graduationRequirements: joinEvidence(graduationRequirements),
  };
}

function cleanLine(value: string): string {
  return normalizeWhitespace(value).replace(/^(?:[-•▪◦*]|\d+[.)])\s*/, "");
}

function joinEvidence(lines: readonly string[]): string | null {
  const unique = [...new Set(lines)];
  return unique.length > 0 ? unique.join(" ") : null;
}
