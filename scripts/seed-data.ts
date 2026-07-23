export const SAMPLE_SEED_TIMESTAMP = "2026-07-10T16:00:00.000Z";
export const SAMPLE_USER_ID = "user-local-dev";

export interface SeedCompany {
  id: string;
  slug: string;
  name: string;
  domain: string;
  careerUrl: string;
  logoUrl: string | null;
  initials: string;
  categoryTags: string[];
  compensationSignal: string | null;
  priorityTier: number;
  monitoringState: "healthy" | "degraded" | "failing" | "stale" | "unsupported";
}

const company = (
  input: Omit<SeedCompany, "id" | "logoUrl"> & { logoUrl?: string | null },
): SeedCompany => ({
  id: `company-${input.slug}`,
  logoUrl: input.logoUrl ?? `https://${input.domain}/favicon.ico`,
  ...input,
});

export const SAMPLE_COMPANIES: SeedCompany[] = [
  company({ slug: "nvidia", name: "NVIDIA", domain: "nvidia.com", careerUrl: "https://www.nvidia.com/en-us/about-nvidia/careers/", initials: "NV", categoryTags: ["Big Tech", "AI / Infra / Research", "Hardware / Autonomous Systems"], compensationSignal: "Historically among the strongest-paying large technology employers; role-specific pay varies.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "microsoft", name: "Microsoft", domain: "microsoft.com", careerUrl: "https://careers.microsoft.com/", initials: "MS", categoryTags: ["Big Tech", "AI / Infra / Research"], compensationSignal: "Competitive large-technology compensation signal based on historical public disclosures.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "apple", name: "Apple", domain: "apple.com", careerUrl: "https://jobs.apple.com/", initials: "AP", categoryTags: ["Big Tech", "Hardware / Autonomous Systems"], compensationSignal: "Competitive large-technology compensation signal; sample ranges are not offers.", priorityTier: 1, monitoringState: "degraded" }),
  company({ slug: "amazon", name: "Amazon", domain: "amazon.com", careerUrl: "https://www.amazon.jobs/", initials: "AZ", categoryTags: ["Big Tech", "AI / Infra / Research"], compensationSignal: "Competitive large-technology compensation signal based on historical data.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "meta", name: "Meta", domain: "meta.com", careerUrl: "https://www.metacareers.com/", initials: "ME", categoryTags: ["Big Tech", "AI / Infra / Research"], compensationSignal: "$200k+ new-grad total compensation has been reported historically for some technical roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "google", name: "Google", domain: "google.com", careerUrl: "https://www.google.com/about/careers/applications/", initials: "GO", categoryTags: ["Big Tech", "AI / Infra / Research"], compensationSignal: "Competitive large-technology compensation signal; monitoring is unsupported in this local scenario.", priorityTier: 1, monitoringState: "unsupported" }),
  company({ slug: "stripe", name: "Stripe", domain: "stripe.com", careerUrl: "https://stripe.com/jobs", initials: "ST", categoryTags: ["Fintech", "High-Growth Startups"], compensationSignal: "$200k+ new-grad total compensation has been reported historically for some engineering roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "databricks", name: "Databricks", domain: "databricks.com", careerUrl: "https://www.databricks.com/company/careers", initials: "DB", categoryTags: ["AI / Infra / Research", "High-Growth Startups"], compensationSignal: "Strong historical compensation signal for distributed-systems and ML infrastructure roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "cloudflare", name: "Cloudflare", domain: "cloudflare.com", careerUrl: "https://www.cloudflare.com/careers/", initials: "CF", categoryTags: ["AI / Infra / Research", "High-Growth Startups"], compensationSignal: "Competitive infrastructure-company compensation signal; role and location dependent.", priorityTier: 2, monitoringState: "healthy" }),
  company({ slug: "figma", name: "Figma", domain: "figma.com", careerUrl: "https://www.figma.com/careers/", initials: "FI", categoryTags: ["High-Growth Startups"], compensationSignal: "Strong historical product-engineering compensation signal; not a guaranteed offer.", priorityTier: 2, monitoringState: "healthy" }),
  company({ slug: "benchling", name: "Benchling", domain: "benchling.com", careerUrl: "https://www.benchling.com/careers", initials: "BE", categoryTags: ["High-Growth Startups", "AI / Infra / Research"], compensationSignal: "Competitive vertical-software compensation signal based on historical public information.", priorityTier: 2, monitoringState: "healthy" }),
  company({ slug: "palantir", name: "Palantir", domain: "palantir.com", careerUrl: "https://www.palantir.com/careers/", initials: "PL", categoryTags: ["AI / Infra / Research", "High-Growth Startups"], compensationSignal: "Strong historical compensation signal for selected early-career technical roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "anthropic", name: "Anthropic", domain: "anthropic.com", careerUrl: "https://www.anthropic.com/careers", initials: "AN", categoryTags: ["AI / Infra / Research", "High-Growth Startups"], compensationSignal: "High compensation signal in public postings for selected technical roles.", priorityTier: 1, monitoringState: "failing" }),
  company({ slug: "jane-street", name: "Jane Street", domain: "janestreet.com", careerUrl: "https://www.janestreet.com/join-jane-street/", initials: "JS", categoryTags: ["Quant / Trading"], compensationSignal: "$300k+ first-year total compensation has been reported historically for selected graduate roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "citadel-securities", name: "Citadel Securities", domain: "citadelsecurities.com", careerUrl: "https://www.citadelsecurities.com/careers/", initials: "CS", categoryTags: ["Quant / Trading"], compensationSignal: "$300k+ first-year total compensation has been reported historically for selected technical roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "two-sigma", name: "Two Sigma", domain: "twosigma.com", careerUrl: "https://www.twosigma.com/careers/", initials: "TS", categoryTags: ["Quant / Trading", "AI / Infra / Research"], compensationSignal: "High historical quantitative-development compensation signal; monitoring is currently stale.", priorityTier: 1, monitoringState: "stale" }),
  company({ slug: "ramp", name: "Ramp", domain: "ramp.com", careerUrl: "https://ramp.com/careers", initials: "RA", categoryTags: ["Fintech", "High-Growth Startups"], compensationSignal: "Strong high-growth fintech compensation signal from historical disclosures.", priorityTier: 2, monitoringState: "healthy" }),
  company({ slug: "rippling", name: "Rippling", domain: "rippling.com", careerUrl: "https://www.rippling.com/careers", initials: "RI", categoryTags: ["Fintech", "High-Growth Startups"], compensationSignal: "Strong high-growth software compensation signal; role-specific pay varies.", priorityTier: 2, monitoringState: "healthy" }),
  company({ slug: "anduril", name: "Anduril", domain: "anduril.com", careerUrl: "https://www.anduril.com/open-roles/", initials: "AD", categoryTags: ["Hardware / Autonomous Systems", "High-Growth Startups"], compensationSignal: "Strong historical compensation signal for autonomy and embedded-software roles.", priorityTier: 1, monitoringState: "healthy" }),
  company({ slug: "scale-ai", name: "Scale AI", domain: "scale.com", careerUrl: "https://scale.com/careers", initials: "SC", categoryTags: ["AI / Infra / Research", "High-Growth Startups"], compensationSignal: "Strong AI infrastructure compensation signal based on historical public information.", priorityTier: 2, monitoringState: "healthy" }),
];

export interface SeedGroup {
  id: string;
  slug: string;
  name: string;
  description: string;
  compensationSignal: boolean;
  companySlugs: string[];
  ownerUserId?: string;
}

export const SAMPLE_GROUPS: SeedGroup[] = [
  { id: "group-200k-new-grad", slug: "200k-new-grad", name: "$200k+ New Grad", description: "Companies with historical or estimated signals around $200k+ total compensation for selected new-grad technical roles. Not a guarantee.", compensationSignal: true, companySlugs: ["meta", "google", "stripe", "databricks", "anthropic", "jane-street", "citadel-securities", "two-sigma"] },
  { id: "group-300k-quant", slug: "300k-quant", name: "$300k+ Quant", description: "Quantitative employers with historical reports above $300k for selected graduate roles. Not a guaranteed offer.", compensationSignal: true, companySlugs: ["jane-street", "citadel-securities", "two-sigma"] },
  { id: "group-top-internships", slug: "top-internships", name: "Top Internships", description: "A curated local sample of selective technical internship programs.", compensationSignal: false, companySlugs: ["nvidia", "microsoft", "apple", "amazon", "meta", "google", "stripe", "databricks", "benchling", "palantir", "jane-street", "citadel-securities"] },
  { id: "group-big-tech", slug: "big-tech", name: "Big Tech", description: "Large technology employers with established student recruiting programs.", compensationSignal: false, companySlugs: ["nvidia", "microsoft", "apple", "amazon", "meta", "google"] },
  { id: "group-quant-trading", slug: "quant-trading", name: "Quant / Trading", description: "Quantitative trading and research employers.", compensationSignal: false, companySlugs: ["jane-street", "citadel-securities", "two-sigma"] },
  { id: "group-ai-infra-research", slug: "ai-infra-research", name: "AI / Infra / Research", description: "Companies building AI systems, research platforms, and core infrastructure.", compensationSignal: false, companySlugs: ["nvidia", "microsoft", "amazon", "meta", "google", "databricks", "cloudflare", "benchling", "palantir", "anthropic", "two-sigma", "scale-ai"] },
  { id: "group-fintech", slug: "fintech", name: "Fintech", description: "Payments, financial infrastructure, and business-finance software.", compensationSignal: false, companySlugs: ["stripe", "ramp", "rippling"] },
  { id: "group-high-growth", slug: "high-growth-startups", name: "High-Growth Startups", description: "High-growth private technology companies with strong technical hiring signals.", compensationSignal: false, companySlugs: ["stripe", "databricks", "cloudflare", "figma", "benchling", "palantir", "anthropic", "ramp", "rippling", "anduril", "scale-ai"] },
  { id: "group-hardware-autonomy", slug: "hardware-autonomous-systems", name: "Hardware / Autonomous Systems", description: "Hardware-adjacent software, robotics, embedded systems, and autonomy.", compensationSignal: false, companySlugs: ["nvidia", "apple", "anduril"] },
  { id: "group-local-focus", slug: "my-west-coast-focus", name: "My West Coast focus", description: "Development-only personal watchlist used to exercise persistence.", compensationSignal: false, companySlugs: ["nvidia", "apple", "stripe", "databricks", "figma", "anthropic"], ownerUserId: SAMPLE_USER_ID },
];

export type SeedSourceHealth = "healthy" | "degraded" | "failing" | "stale" | "unsupported";

export interface SeedSource {
  id: string;
  companySlug: string;
  displayName: string;
  adapterKind: "greenhouse" | "ashby" | "lever" | "workday" | "smartrecruiters" | "custom";
  officialUrl: string;
  health: SeedSourceHealth;
  enabled: boolean;
  expectedIntervalMinutes: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  httpStatus: number | null;
  parserStatus: "ok" | "warning" | "error" | "not_run";
  parserVersion: string;
  pagesRetrieved: number;
  totalJobs: number;
  previousTotalJobs: number;
  relevantJobs: number;
  lastNewRoleAt: string | null;
  consecutiveFailures: number;
  durationMs: number | null;
  suspiciousFlags: string[];
  errorDetails: string | null;
}

const healthySource = (
  input: Pick<SeedSource, "companySlug" | "displayName" | "adapterKind" | "officialUrl" | "totalJobs" | "relevantJobs"> &
    Partial<Omit<SeedSource, "id" | "companySlug" | "displayName" | "adapterKind" | "officialUrl" | "totalJobs" | "relevantJobs">>,
  sourceIdOverride?: string,
): SeedSource => ({
  id: sourceIdOverride ?? `source-${input.companySlug}`,
  health: "healthy",
  enabled: true,
  expectedIntervalMinutes: 60,
  lastAttemptAt: "2026-07-10T15:00:00.000Z",
  lastSuccessAt: "2026-07-10T15:00:00.000Z",
  lastFailureAt: null,
  httpStatus: 200,
  parserStatus: "ok",
  parserVersion: "sample-fixture-v1",
  pagesRetrieved: 1,
  previousTotalJobs: input.totalJobs,
  lastNewRoleAt: "2026-07-09T17:00:00.000Z",
  consecutiveFailures: 0,
  durationMs: 640,
  suspiciousFlags: [],
  errorDetails: null,
  ...input,
});

export const SAMPLE_SOURCES: SeedSource[] = [
  healthySource({ companySlug: "nvidia", displayName: "NVIDIA external careers (sample registry)", adapterKind: "workday", officialUrl: "https://www.nvidia.com/en-us/about-nvidia/careers/", totalJobs: 188, relevantJobs: 2, pagesRetrieved: 8, durationMs: 1320 }),
  healthySource({ companySlug: "microsoft", displayName: "Microsoft careers (sample registry)", adapterKind: "custom", officialUrl: "https://careers.microsoft.com/", totalJobs: 410, relevantJobs: 2, pagesRetrieved: 9, durationMs: 1740 }),
  healthySource({ companySlug: "apple", displayName: "Apple careers (sample registry)", adapterKind: "workday", officialUrl: "https://jobs.apple.com/", totalJobs: 0, relevantJobs: 0, health: "degraded", lastAttemptAt: "2026-07-10T14:45:00.000Z", lastSuccessAt: "2026-07-08T14:45:00.000Z", lastFailureAt: "2026-07-10T14:45:03.000Z", httpStatus: 200, parserStatus: "warning", pagesRetrieved: 1, previousTotalJobs: 142, lastNewRoleAt: "2026-07-06T19:20:00.000Z", consecutiveFailures: 1, durationMs: 810, suspiciousFlags: ["unexpected_empty", "major_count_decrease"], errorDetails: "Sample incident: the source returned a valid response with zero jobs; closure confirmation was intentionally suppressed." }),
  healthySource({ companySlug: "amazon", displayName: "Amazon Jobs (sample registry)", adapterKind: "custom", officialUrl: "https://www.amazon.jobs/", totalJobs: 670, relevantJobs: 1, pagesRetrieved: 14, durationMs: 2200 }),
  healthySource({ companySlug: "meta", displayName: "Meta Careers (sample registry)", adapterKind: "custom", officialUrl: "https://www.metacareers.com/", totalJobs: 226, relevantJobs: 1, pagesRetrieved: 5, durationMs: 980 }),
  healthySource({ companySlug: "google", displayName: "Google Careers (unsupported local example)", adapterKind: "custom", officialUrl: "https://www.google.com/about/careers/applications/", totalJobs: 0, relevantJobs: 0, health: "unsupported", enabled: false, lastAttemptAt: "2026-07-10T13:20:00.000Z", lastSuccessAt: "2026-06-30T13:20:00.000Z", lastFailureAt: "2026-07-10T13:20:01.000Z", httpStatus: 403, parserStatus: "not_run", pagesRetrieved: 0, previousTotalJobs: 315, consecutiveFailures: 3, durationMs: 390, suspiciousFlags: ["bot_protection"], errorDetails: "Development-only example: monitoring is disabled rather than bypassing access controls." }),
  healthySource({ companySlug: "stripe", displayName: "Stripe careers (sample registry)", adapterKind: "custom", officialUrl: "https://stripe.com/jobs", totalJobs: 96, relevantJobs: 2, pagesRetrieved: 3, durationMs: 720 }),
  healthySource({ companySlug: "databricks", displayName: "Databricks Greenhouse board (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.databricks.com/company/careers", totalJobs: 155, relevantJobs: 2, pagesRetrieved: 1, durationMs: 510 }),
  healthySource({ companySlug: "cloudflare", displayName: "Cloudflare Greenhouse board (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.cloudflare.com/careers/", totalJobs: 132, relevantJobs: 1, pagesRetrieved: 1, durationMs: 460 }),
  healthySource({ companySlug: "figma", displayName: "Figma Greenhouse board (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.figma.com/careers/", totalJobs: 42, relevantJobs: 1, durationMs: 430 }, "figma-greenhouse"),
  healthySource({ companySlug: "benchling", displayName: "Benchling Ashby board (sample registry)", adapterKind: "ashby", officialUrl: "https://www.benchling.com/careers/open-roles", totalJobs: 38, relevantJobs: 1, durationMs: 410 }, "benchling-ashby"),
  healthySource({ companySlug: "palantir", displayName: "Palantir Lever board (sample registry)", adapterKind: "lever", officialUrl: "https://www.palantir.com/careers/", totalJobs: 76, relevantJobs: 1, durationMs: 520 }, "palantir-lever"),
  healthySource({ companySlug: "anthropic", displayName: "Anthropic careers (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.anthropic.com/careers", totalJobs: 0, relevantJobs: 0, health: "failing", lastAttemptAt: "2026-07-10T12:10:00.000Z", lastSuccessAt: "2026-07-07T12:10:00.000Z", lastFailureAt: "2026-07-10T12:10:01.000Z", httpStatus: 429, parserStatus: "not_run", pagesRetrieved: 0, previousTotalJobs: 71, consecutiveFailures: 3, durationMs: 280, suspiciousFlags: ["rate_limited"], errorDetails: "Sample incident: respectful backoff is active after an HTTP 429 response." }),
  healthySource({ companySlug: "jane-street", displayName: "Jane Street careers (sample registry)", adapterKind: "custom", officialUrl: "https://www.janestreet.com/join-jane-street/", totalJobs: 58, relevantJobs: 2, durationMs: 560 }),
  healthySource({ companySlug: "citadel-securities", displayName: "Citadel Securities careers (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.citadelsecurities.com/careers/", totalJobs: 84, relevantJobs: 2, durationMs: 490 }),
  healthySource({ companySlug: "two-sigma", displayName: "Two Sigma careers (sample registry)", adapterKind: "custom", officialUrl: "https://www.twosigma.com/careers/", totalJobs: 61, relevantJobs: 1, health: "stale", lastAttemptAt: "2026-07-06T10:00:00.000Z", lastSuccessAt: "2026-07-06T10:00:00.000Z", lastFailureAt: null, previousTotalJobs: 60, consecutiveFailures: 0, durationMs: 590, suspiciousFlags: ["success_interval_exceeded"], errorDetails: "Sample incident: no run has completed within the configured health window." }),
  healthySource({ companySlug: "ramp", displayName: "Ramp Ashby board (sample registry)", adapterKind: "ashby", officialUrl: "https://ramp.com/careers", totalJobs: 64, relevantJobs: 1, durationMs: 440 }),
  healthySource({ companySlug: "rippling", displayName: "Rippling Greenhouse board (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.rippling.com/careers", totalJobs: 120, relevantJobs: 1, durationMs: 480 }),
  healthySource({ companySlug: "anduril", displayName: "Anduril careers (sample registry)", adapterKind: "greenhouse", officialUrl: "https://www.anduril.com/open-roles/", totalJobs: 182, relevantJobs: 1, durationMs: 540 }),
  healthySource({ companySlug: "scale-ai", displayName: "Scale AI Ashby board (sample registry)", adapterKind: "ashby", officialUrl: "https://scale.com/careers", totalJobs: 75, relevantJobs: 1, durationMs: 450 }),
];

export interface SeedLocation {
  city?: string;
  region?: string;
  country: string;
  displayText: string;
}

export interface SeedHistoricalCycle {
  openedAt: string;
  closedAt: string | null;
  evidenceType: "first_party" | "secondary_archive";
  sourceLabel: string;
}

export interface SeedJob {
  id: string;
  companySlug: string;
  externalJobId: string;
  title: string;
  normalizedTitle: string;
  audience: "internship" | "new_grad" | "ambiguous";
  technicalCategory: "software" | "backend" | "frontend" | "full_stack" | "infrastructure" | "support" | "networking" | "security" | "machine_learning" | "data_science" | "data" | "quant" | "embedded" | "robotics";
  employmentType: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  eligibility: string | null;
  graduationRequirements: string | null;
  workAuthorization: string | null;
  locations: SeedLocation[];
  workArrangement: "remote" | "hybrid" | "onsite" | "unspecified";
  compensationMinimum: number | null;
  compensationMaximum: number | null;
  compensationPeriod: "hour" | "year" | "month" | "unknown";
  compensationDisplayText: string;
  compensationIsEstimate: boolean;
  compensationSource: "company" | "historical" | "unknown";
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  reopenedAt: string | null;
  lastSourceCheckAt: string;
  availability: "active" | "closure_pending" | "closed";
  classificationConfidence: number;
  sourceConfidence: number;
  historicalContext: string | null;
  historicalCycles: SeedHistoricalCycle[];
}

type SeedJobInput = Pick<SeedJob, "companySlug" | "externalJobId" | "title" | "audience" | "technicalCategory" | "locations" | "workArrangement" | "postedAt" | "firstSeenAt"> &
  Partial<Omit<SeedJob, "id" | "companySlug" | "externalJobId" | "title" | "audience" | "technicalCategory" | "locations" | "workArrangement" | "postedAt" | "firstSeenAt">>;

const sampleJob = (input: SeedJobInput): SeedJob => {
  const active = input.availability !== "closed";
  const lastSeenAt = input.lastSeenAt ?? (active ? "2026-07-10T15:00:00.000Z" : input.closedAt ?? input.firstSeenAt);
  return {
    id: `job-${input.companySlug}-${input.externalJobId}`,
    normalizedTitle: input.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    employmentType: input.audience === "internship" ? "Internship" : "Full-time",
    description: `LOCAL SAMPLE DATA — not a live job posting. This realistic fixture represents a ${input.title} role and exists to exercise InternJobs workflows without claiming current availability.`,
    responsibilities: ["Build and maintain production technical systems.", "Collaborate with engineers and product partners.", "Write tested, maintainable code and communicate tradeoffs."],
    requirements: input.audience === "internship"
      ? ["Currently pursuing a technical degree or equivalent experience.", "Programming experience from coursework, projects, or prior work."]
      : ["Recent technical degree or equivalent practical experience.", "Programming fundamentals and evidence of shipping technical work."],
    preferredQualifications: ["Experience related to the role's technical category.", "Clear written and verbal communication."],
    eligibility: input.audience === "internship" ? "Student eligibility varies by the real employer; verify on the official posting." : "True early-career sample classification; verify real eligibility with the employer.",
    graduationRequirements: input.audience === "internship" ? "Sample target: graduating between December 2026 and June 2028." : "Sample target: graduating between December 2025 and June 2027.",
    workAuthorization: "Not asserted by InternJobs. Check the employer's official posting for sponsorship and authorization terms.",
    compensationMinimum: null,
    compensationMaximum: null,
    compensationPeriod: "unknown",
    compensationDisplayText: "Not disclosed",
    compensationIsEstimate: false,
    compensationSource: "unknown",
    lastSeenAt,
    closedAt: null,
    reopenedAt: null,
    lastSourceCheckAt: lastSeenAt,
    availability: "active",
    classificationConfidence: 0.96,
    sourceConfidence: 0.98,
    historicalContext: null,
    historicalCycles: [],
    ...input,
  };
};

const location = (displayText: string, city?: string, region?: string): SeedLocation => ({
  city,
  region,
  country: "US",
  displayText,
});

export const SAMPLE_JOBS: SeedJob[] = [
  sampleJob({ companySlug: "nvidia", externalJobId: "2026-swe-intern", title: "Software Engineering Intern — GPU Platforms", audience: "internship", technicalCategory: "infrastructure", locations: [location("Santa Clara, CA", "Santa Clara", "CA")], workArrangement: "hybrid", postedAt: "2026-07-07T16:00:00.000Z", firstSeenAt: "2026-07-07T16:18:00.000Z", compensationMinimum: 42, compensationMaximum: 68, compensationPeriod: "hour", compensationDisplayText: "$42–$68/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical", historicalContext: "Comparable sample roles were observed in two prior summer recruiting cycles.", historicalCycles: [{ openedAt: "2025-07-18T00:00:00.000Z", closedAt: "2025-09-20T00:00:00.000Z", evidenceType: "first_party", sourceLabel: "InternJobs sample observation" }] }),
  sampleJob({ companySlug: "nvidia", externalJobId: "2026-systems-ng", title: "Systems Software Engineer — New College Graduate", audience: "new_grad", technicalCategory: "embedded", locations: [location("Austin, TX", "Austin", "TX"), location("Santa Clara, CA", "Santa Clara", "CA")], workArrangement: "onsite", postedAt: null, firstSeenAt: "2026-07-09T17:00:00.000Z", compensationMinimum: 145000, compensationMaximum: 220000, compensationPeriod: "year", compensationDisplayText: "$145k–$220k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "microsoft", externalJobId: "campus-swe-intern-26", title: "Software Engineering Internship", audience: "internship", technicalCategory: "software", locations: [location("Redmond, WA", "Redmond", "WA")], workArrangement: "hybrid", postedAt: "2026-07-01T15:00:00.000Z", firstSeenAt: "2026-07-01T15:42:00.000Z", compensationMinimum: 38, compensationMaximum: 56, compensationPeriod: "hour", compensationDisplayText: "$38–$56/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "microsoft", externalJobId: "cloud-ng-26", title: "Cloud Software Engineer — Recent Graduate", audience: "new_grad", technicalCategory: "infrastructure", locations: [location("Redmond, WA", "Redmond", "WA"), location("Atlanta, GA", "Atlanta", "GA")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-08T18:10:00.000Z", compensationMinimum: 118000, compensationMaximum: 195000, compensationPeriod: "year", compensationDisplayText: "$118k–$195k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "apple", externalJobId: "ml-intern-26", title: "Machine Learning Engineering Intern", audience: "internship", technicalCategory: "machine_learning", locations: [location("Cupertino, CA", "Cupertino", "CA")], workArrangement: "onsite", postedAt: "2026-07-04T17:00:00.000Z", firstSeenAt: "2026-07-04T17:26:00.000Z", lastSeenAt: "2026-07-08T14:45:00.000Z", lastSourceCheckAt: "2026-07-08T14:45:00.000Z", compensationMinimum: 44, compensationMaximum: 66, compensationPeriod: "hour", compensationDisplayText: "$44–$66/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "apple", externalJobId: "platform-early-career-26", title: "Platform Software Engineer — Early Career", audience: "new_grad", technicalCategory: "infrastructure", locations: [location("San Diego, CA", "San Diego", "CA")], workArrangement: "onsite", postedAt: null, firstSeenAt: "2026-07-06T19:20:00.000Z", lastSeenAt: "2026-07-08T14:45:00.000Z", lastSourceCheckAt: "2026-07-08T14:45:00.000Z", compensationMinimum: 130000, compensationMaximum: 205000, compensationPeriod: "year", compensationDisplayText: "$130k–$205k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "amazon", externalJobId: "sde-intern-2026", title: "Software Development Engineer Intern", audience: "internship", technicalCategory: "backend", locations: [location("Seattle, WA", "Seattle", "WA"), location("Arlington, VA", "Arlington", "VA")], workArrangement: "onsite", postedAt: "2026-06-25T16:00:00.000Z", firstSeenAt: "2026-06-25T16:35:00.000Z", compensationMinimum: 42, compensationMaximum: 58, compensationPeriod: "hour", compensationDisplayText: "$42–$58/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical", historicalCycles: [{ openedAt: "2025-06-27T00:00:00.000Z", closedAt: "2025-10-11T00:00:00.000Z", evidenceType: "secondary_archive", sourceLabel: "Sample secondary archive" }] }),
  sampleJob({ companySlug: "meta", externalJobId: "swe-intern-2026", title: "Software Engineer Intern", audience: "internship", technicalCategory: "software", locations: [location("Menlo Park, CA", "Menlo Park", "CA"), location("New York, NY", "New York", "NY")], workArrangement: "hybrid", postedAt: "2026-07-02T14:00:00.000Z", firstSeenAt: "2026-07-02T14:21:00.000Z", compensationMinimum: 45, compensationMaximum: 70, compensationPeriod: "hour", compensationDisplayText: "$45–$70/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "google", externalJobId: "swe-intern-2026", title: "Software Engineering Intern", audience: "internship", technicalCategory: "software", locations: [location("Mountain View, CA", "Mountain View", "CA"), location("New York, NY", "New York", "NY")], workArrangement: "hybrid", postedAt: "2026-06-29T15:00:00.000Z", firstSeenAt: "2026-06-29T15:38:00.000Z", lastSeenAt: "2026-06-30T13:20:00.000Z", lastSourceCheckAt: "2026-06-30T13:20:00.000Z", sourceConfidence: 0.82, historicalContext: "Monitoring is disabled in this sample scenario; availability has not been inferred from failed checks." }),
  sampleJob({ companySlug: "stripe", externalJobId: "swe-intern-26", title: "Software Engineer Intern", audience: "internship", technicalCategory: "full_stack", locations: [location("San Francisco, CA", "San Francisco", "CA"), location("Seattle, WA", "Seattle", "WA")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-08T16:05:00.000Z", compensationMinimum: 48, compensationMaximum: 68, compensationPeriod: "hour", compensationDisplayText: "$48–$68/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "stripe", externalJobId: "backend-ng-26", title: "Backend Engineer — New Grad", audience: "new_grad", technicalCategory: "backend", locations: [location("San Francisco, CA", "San Francisco", "CA"), location("New York, NY", "New York", "NY")], workArrangement: "hybrid", postedAt: "2026-07-03T16:00:00.000Z", firstSeenAt: "2026-07-03T16:14:00.000Z", compensationMinimum: 155000, compensationMaximum: 235000, compensationPeriod: "year", compensationDisplayText: "$155k–$235k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical", historicalContext: "Comparable roles opened in July in two sample historical cycles.", historicalCycles: [{ openedAt: "2025-07-11T00:00:00.000Z", closedAt: "2025-08-30T00:00:00.000Z", evidenceType: "first_party", sourceLabel: "InternJobs sample observation" }, { openedAt: "2024-07-19T00:00:00.000Z", closedAt: "2024-09-01T00:00:00.000Z", evidenceType: "secondary_archive", sourceLabel: "Sample secondary archive" }] }),
  sampleJob({ companySlug: "databricks", externalJobId: "swe-intern-26", title: "Software Engineering Intern — Data Platform", audience: "internship", technicalCategory: "data", locations: [location("San Francisco, CA", "San Francisco", "CA"), location("Bellevue, WA", "Bellevue", "WA")], workArrangement: "hybrid", postedAt: "2026-07-05T17:00:00.000Z", firstSeenAt: "2026-07-05T17:09:00.000Z", compensationMinimum: 50, compensationMaximum: 67, compensationPeriod: "hour", compensationDisplayText: "$50–$67/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "databricks", externalJobId: "distributed-ng-26", title: "Software Engineer — Distributed Data Systems, New Grad", audience: "new_grad", technicalCategory: "infrastructure", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-09T16:30:00.000Z", compensationMinimum: 160000, compensationMaximum: 240000, compensationPeriod: "year", compensationDisplayText: "$160k–$240k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "cloudflare", externalJobId: "edge-intern-26", title: "Software Engineer Intern — Edge Platform", audience: "internship", technicalCategory: "infrastructure", locations: [location("Austin, TX", "Austin", "TX")], workArrangement: "hybrid", postedAt: "2026-07-02T19:00:00.000Z", firstSeenAt: "2026-07-02T19:18:00.000Z", reopenedAt: "2026-07-09T12:00:00.000Z", compensationMinimum: 38, compensationMaximum: 52, compensationPeriod: "hour", compensationDisplayText: "$38–$52/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical", historicalContext: "This sample role reappeared with the same stable external ID after an earlier disappearance." }),
  sampleJob({ companySlug: "figma", externalJobId: "product-eng-intern-26", title: "Product Engineering Intern", audience: "internship", technicalCategory: "frontend", locations: [location("San Francisco, CA", "San Francisco", "CA"), location("New York, NY", "New York", "NY")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-07T18:40:00.000Z", compensationMinimum: 45, compensationMaximum: 62, compensationPeriod: "hour", compensationDisplayText: "$45–$62/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "benchling", externalJobId: "platform-intern-26", title: "Software Engineering Intern — Platform", audience: "internship", technicalCategory: "full_stack", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: "2026-07-08T17:00:00.000Z", firstSeenAt: "2026-07-08T17:18:00.000Z", compensationMinimum: 40, compensationMaximum: 58, compensationPeriod: "hour", compensationDisplayText: "$40–$58/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "palantir", externalJobId: "fdse-ng-26", title: "Forward Deployed Software Engineer — New Grad", audience: "new_grad", technicalCategory: "full_stack", locations: [location("New York, NY", "New York", "NY"), location("Washington, DC", "Washington", "DC")], workArrangement: "onsite", postedAt: null, firstSeenAt: "2026-07-09T14:40:00.000Z", compensationMinimum: 145000, compensationMaximum: 220000, compensationPeriod: "year", compensationDisplayText: "$145k–$220k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "anthropic", externalJobId: "research-eng-early-26", title: "Research Engineer — Early Career", audience: "new_grad", technicalCategory: "machine_learning", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: "2026-07-01T18:00:00.000Z", firstSeenAt: "2026-07-01T18:12:00.000Z", lastSeenAt: "2026-07-07T12:10:00.000Z", lastSourceCheckAt: "2026-07-07T12:10:00.000Z", compensationMinimum: 180000, compensationMaximum: 310000, compensationPeriod: "year", compensationDisplayText: "$180k–$310k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical", sourceConfidence: 0.86 }),
  sampleJob({ companySlug: "jane-street", externalJobId: "swd-intern-26", title: "Software Developer Internship", audience: "internship", technicalCategory: "quant", locations: [location("New York, NY", "New York", "NY")], workArrangement: "onsite", postedAt: "2026-06-20T13:00:00.000Z", firstSeenAt: "2026-06-20T13:11:00.000Z", compensationMinimum: 80, compensationMaximum: 120, compensationPeriod: "hour", compensationDisplayText: "$80–$120/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical", historicalContext: "Comparable internships opened in early summer in two sample cycles." }),
  sampleJob({ companySlug: "jane-street", externalJobId: "swd-ng-26", title: "Software Developer — New Grad", audience: "new_grad", technicalCategory: "quant", locations: [location("New York, NY", "New York", "NY")], workArrangement: "onsite", postedAt: null, firstSeenAt: "2026-07-06T14:15:00.000Z", compensationMinimum: 250000, compensationMaximum: 400000, compensationPeriod: "year", compensationDisplayText: "$250k–$400k/year (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "citadel-securities", externalJobId: "swe-intern-26", title: "Software Engineer Intern — Trading Systems", audience: "internship", technicalCategory: "quant", locations: [location("Chicago, IL", "Chicago", "IL"), location("New York, NY", "New York", "NY")], workArrangement: "onsite", postedAt: "2026-07-01T13:00:00.000Z", firstSeenAt: "2026-07-01T13:16:00.000Z", compensationMinimum: 75, compensationMaximum: 115, compensationPeriod: "hour", compensationDisplayText: "$75–$115/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "citadel-securities", externalJobId: "cpp-ng-26", title: "C++ Developer — New Grad", audience: "new_grad", technicalCategory: "quant", locations: [location("Chicago, IL", "Chicago", "IL")], workArrangement: "onsite", postedAt: "2026-06-30T13:00:00.000Z", firstSeenAt: "2026-06-30T13:08:00.000Z", compensationMinimum: 240000, compensationMaximum: 390000, compensationPeriod: "year", compensationDisplayText: "$240k–$390k/year (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "two-sigma", externalJobId: "swe-intern-26", title: "Software Engineering Internship", audience: "internship", technicalCategory: "quant", locations: [location("New York, NY", "New York", "NY")], workArrangement: "onsite", postedAt: "2026-07-04T14:00:00.000Z", firstSeenAt: "2026-07-04T14:19:00.000Z", lastSeenAt: "2026-07-06T10:00:00.000Z", lastSourceCheckAt: "2026-07-06T10:00:00.000Z", compensationMinimum: 70, compensationMaximum: 105, compensationPeriod: "hour", compensationDisplayText: "$70–$105/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical", sourceConfidence: 0.9 }),
  sampleJob({ companySlug: "ramp", externalJobId: "backend-intern-26", title: "Backend Engineering Intern", audience: "internship", technicalCategory: "backend", locations: [location("New York, NY", "New York", "NY")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-08T15:50:00.000Z", compensationMinimum: 45, compensationMaximum: 62, compensationPeriod: "hour", compensationDisplayText: "$45–$62/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "rippling", externalJobId: "product-ng-26", title: "Software Engineer — Product, New Grad", audience: "new_grad", technicalCategory: "full_stack", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "onsite", postedAt: "2026-07-05T16:00:00.000Z", firstSeenAt: "2026-07-05T16:24:00.000Z", compensationMinimum: 145000, compensationMaximum: 215000, compensationPeriod: "year", compensationDisplayText: "$145k–$215k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "anduril", externalJobId: "autonomy-intern-26", title: "Autonomy Software Engineering Intern", audience: "internship", technicalCategory: "robotics", locations: [location("Costa Mesa, CA", "Costa Mesa", "CA")], workArrangement: "onsite", postedAt: "2026-07-03T18:00:00.000Z", firstSeenAt: "2026-07-03T18:27:00.000Z", compensationMinimum: 42, compensationMaximum: 60, compensationPeriod: "hour", compensationDisplayText: "$42–$60/hour (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "scale-ai", externalJobId: "ml-platform-ng-26", title: "Machine Learning Platform Engineer — New Grad", audience: "new_grad", technicalCategory: "machine_learning", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: null, firstSeenAt: "2026-07-09T20:10:00.000Z", compensationMinimum: 155000, compensationMaximum: 240000, compensationPeriod: "year", compensationDisplayText: "$155k–$240k/year (sample estimate)", compensationIsEstimate: true, compensationSource: "historical" }),

  sampleJob({ companySlug: "nvidia", externalJobId: "2025-systems-intern-closed", title: "Systems Software Intern — 2025 Cycle", audience: "internship", technicalCategory: "embedded", locations: [location("Santa Clara, CA", "Santa Clara", "CA")], workArrangement: "onsite", postedAt: "2025-07-18T15:00:00.000Z", firstSeenAt: "2025-07-18T15:28:00.000Z", lastSeenAt: "2025-09-18T15:00:00.000Z", closedAt: "2025-09-20T15:00:00.000Z", lastSourceCheckAt: "2025-09-20T15:00:00.000Z", availability: "closed", compensationMinimum: 40, compensationMaximum: 64, compensationPeriod: "hour", compensationDisplayText: "$40–$64/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "jane-street", externalJobId: "2025-swd-intern-closed", title: "Software Developer Internship — 2025 Cycle", audience: "internship", technicalCategory: "quant", locations: [location("New York, NY", "New York", "NY")], workArrangement: "onsite", postedAt: "2025-06-14T13:00:00.000Z", firstSeenAt: "2025-06-14T13:12:00.000Z", lastSeenAt: "2025-08-25T13:00:00.000Z", closedAt: "2025-08-27T13:00:00.000Z", lastSourceCheckAt: "2025-08-27T13:00:00.000Z", availability: "closed", compensationMinimum: 75, compensationMaximum: 115, compensationPeriod: "hour", compensationDisplayText: "$75–$115/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "stripe", externalJobId: "2025-backend-ng-closed", title: "Backend Engineer — 2025 New Grad Cycle", audience: "new_grad", technicalCategory: "backend", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: "2025-07-11T16:00:00.000Z", firstSeenAt: "2025-07-11T16:22:00.000Z", lastSeenAt: "2025-08-28T16:00:00.000Z", closedAt: "2025-08-30T16:00:00.000Z", lastSourceCheckAt: "2025-08-30T16:00:00.000Z", availability: "closed", compensationMinimum: 150000, compensationMaximum: 225000, compensationPeriod: "year", compensationDisplayText: "$150k–$225k/year (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "apple", externalJobId: "2025-ml-intern-closed", title: "Machine Learning Intern — 2025 Cycle", audience: "internship", technicalCategory: "machine_learning", locations: [location("Cupertino, CA", "Cupertino", "CA")], workArrangement: "onsite", postedAt: null, firstSeenAt: "2025-08-03T17:00:00.000Z", lastSeenAt: "2025-10-01T17:00:00.000Z", closedAt: "2025-10-03T17:00:00.000Z", lastSourceCheckAt: "2025-10-03T17:00:00.000Z", availability: "closed", compensationMinimum: 42, compensationMaximum: 64, compensationPeriod: "hour", compensationDisplayText: "$42–$64/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
  sampleJob({ companySlug: "databricks", externalJobId: "2025-data-intern-closed", title: "Data Platform Engineering Intern — 2025 Cycle", audience: "internship", technicalCategory: "data", locations: [location("San Francisco, CA", "San Francisco", "CA")], workArrangement: "hybrid", postedAt: "2025-07-22T16:00:00.000Z", firstSeenAt: "2025-07-22T16:14:00.000Z", lastSeenAt: "2025-09-07T16:00:00.000Z", closedAt: "2025-09-09T16:00:00.000Z", lastSourceCheckAt: "2025-09-09T16:00:00.000Z", availability: "closed", compensationMinimum: 48, compensationMaximum: 65, compensationPeriod: "hour", compensationDisplayText: "$48–$65/hour (sample historical signal)", compensationIsEstimate: true, compensationSource: "historical" }),
];
