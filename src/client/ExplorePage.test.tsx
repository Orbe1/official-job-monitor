import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapPayload, CompanySummary, HistoricalOpening, Job } from "../shared/domain";
import { App } from "./App";

const longRoleTitle = "Software Engineering Intern — Distributed Systems and Infrastructure Platform";

const supportedCompanyHistory: HistoricalOpening[] = [
  ["2024-jul", "2024-07-08T12:00:00.000Z"],
  ["2024-aug", "2024-08-12T12:00:00.000Z"],
  ["2024-sep", "2024-09-09T12:00:00.000Z"],
  ["2025-jul", "2025-07-07T12:00:00.000Z"],
  ["2025-aug", "2025-08-11T12:00:00.000Z"],
  ["2025-sep", "2025-09-08T12:00:00.000Z"],
].map(([id, openedAt]) => ({
  id,
  title: `Opening ${id}`,
  audience: "internship",
  openedAt,
  closedAt: null,
  observedDaysOpen: null,
  evidenceType: "first_party",
  sourceLabel: "Acme Systems careers",
}));

const company: CompanySummary = {
  id: "company-acme",
  slug: "acme",
  name: "Acme Systems",
  domain: "acme.example",
  careerUrl: "https://acme.example/careers",
  logoUrl: null,
  initials: "AS",
  categoryTags: ["Infrastructure"],
  compensationSignal: "$150k+ historical new-grad signal",
  compensationDisclaimer: "Historical estimate, not a guaranteed offer.",
  priorityTier: 1,
  followed: false,
  groupIds: [],
  monitoringState: "healthy",
  monitoringMode: "continuous",
};

const discoveryCompany: CompanySummary = {
  ...company,
  id: "company-nova",
  slug: "nova-labs",
  name: "Nova Labs",
  domain: "nova.example",
  careerUrl: "https://nova.example/careers",
  initials: "NL",
  monitoringState: "stale",
  monitoringMode: "discovery",
};

const cloudflareCompany: CompanySummary = {
  ...company,
  id: "company-cloudflare",
  slug: "cloudflare",
  name: "Cloudflare",
  domain: "cloudflare.com",
  careerUrl: "https://www.cloudflare.com/careers/",
  logoUrl: "/company-logos/cloudflare.ico",
  initials: "CF",
};

const figmaCompany: CompanySummary = {
  ...company,
  id: "company-figma",
  slug: "figma",
  name: "Figma",
  domain: "figma.com",
  careerUrl: "https://www.figma.com/careers/",
  logoUrl: "/company-logos/figma.svg",
  initials: "FI",
};

function job(id: string, title: string, postedAt: string | null, employer = company): Job {
  return {
    id,
    companyId: employer.id,
    company: employer,
    sourceId: `source-${employer.slug}`,
    externalJobId: `external-${id}`,
    canonicalUrl: `https://${employer.domain}/jobs/${id}`,
    applicationUrl: `https://${employer.domain}/jobs/${id}/apply`,
    title,
    normalizedTitle: title.toLowerCase(),
    audience: "internship",
    technicalCategory: "software",
    employmentType: "Internship",
    description: "Build production systems with the platform team.",
    responsibilities: ["Ship reliable software"],
    requirements: ["Currently enrolled in a CS program"],
    preferredQualifications: [],
    eligibility: "Current student",
    graduationRequirements: "Graduating 2027 or later",
    workAuthorization: "See official posting",
    locations: [{ city: "Seattle", region: "WA", country: "US", displayText: "Seattle, WA" }],
    locationText: "Seattle, WA",
    country: "US",
    workArrangement: "hybrid",
    compensation: {
      minimum: 50,
      maximum: 65,
      currency: "USD",
      period: "hour",
      displayText: "$50–$65/hr",
      isEstimate: false,
      source: "company",
    },
    postedAt,
    sourcePublishedAt: postedAt,
    sourceUpdatedAt: "2026-07-10T11:30:00.000Z",
    firstSeenAt: "2026-07-09T12:00:00.000Z",
    lastSeenAt: "2026-07-10T12:00:00.000Z",
    closedAt: null,
    reopenedAt: null,
    availability: "active",
    classificationConfidence: .98,
    sourceConfidence: 1,
    sourceName: `${employer.name} official careers`,
    sourceUrl: employer.careerUrl,
    lastSourceCheckAt: "2026-07-10T12:00:00.000Z",
    historicalContext: null,
    history: [],
    userState: {
      saved: false,
      stage: null,
      notes: "",
      appliedAt: null,
      nextActionAt: null,
      updatedAt: null,
    },
    isSample: true,
  };
}

function bootstrap(
  saved = false,
  onboardingCompleted = true,
  followed = false,
  alertFrequency: "off" | "immediate" | "daily" = "off",
  applicationStage: Job["userState"]["stage"] = null,
  trackerDetails: Pick<Job["userState"], "notes" | "appliedAt" | "nextActionAt"> = {
    notes: "",
    appliedAt: null,
    nextActionAt: null,
  },
  companyLogoUrl: string | null = null,
): BootstrapPayload {
  const companyState = { ...company, followed, logoUrl: companyLogoUrl };
  const primary = job("job-posted", "Software Engineering Intern", "2026-07-08T12:00:00.000Z");
  primary.history = [
    {
      id: "history-active-cycle",
      title: "Software Engineering Intern",
      audience: "internship",
      openedAt: "2026-07-09T12:00:00.000Z",
      closedAt: null,
      observedDaysOpen: null,
      evidenceType: "first_party",
      sourceLabel: "Acme Systems careers",
    },
    {
      id: "history-completed-cycle",
      title: "Prior Software Engineering Intern",
      audience: "internship",
      openedAt: "2025-06-01T12:00:00.000Z",
      closedAt: "2025-06-18T12:00:00.000Z",
      observedDaysOpen: 17,
      evidenceType: "first_party",
      sourceLabel: "Acme Systems careers",
    },
  ];
  primary.userState.saved = saved;
  primary.userState.stage = applicationStage ?? (saved ? "saved" : null);
  primary.userState.notes = trackerDetails.notes;
  primary.userState.appliedAt = trackerDetails.appliedAt;
  primary.userState.nextActionAt = trackerDetails.nextActionAt;
  return {
    viewer: { id: "viewer", name: "Local Student", email: "student@example.test", initials: "LS", mode: "development", isAdmin: true },
    jobs: [
      primary,
      job("job-found", "Found-only Platform Intern", null),
      job("job-extra-research", longRoleTitle, "2026-07-07T12:00:00.000Z"),
      job("job-extra-data", "Data Platform Intern", "2026-07-06T12:00:00.000Z"),
      job("job-discovery", "Applied AI Intern", "2026-07-09T15:00:00.000Z", discoveryCompany),
    ].map((item) => item.companyId === company.id ? { ...item, company: companyState } : item),
    companies: [companyState, discoveryCompany],
    groups: [],
    sources: [{
      id: "source-acme",
      companyId: company.id,
      companyName: company.name,
      adapterKind: "greenhouse",
      displayName: "Acme Systems careers",
      officialUrl: "https://boards.greenhouse.io/acme-systems",
      health: "failing",
      enabled: true,
      expectedIntervalMinutes: 60,
      lastAttemptAt: "2026-07-10T11:55:00.000Z",
      lastSuccessAt: null,
      lastFailureAt: "2026-07-10T11:55:00.000Z",
      httpStatus: 503,
      parserStatus: "not_run",
      parserVersion: "test",
      pagesRetrieved: 0,
      totalJobs: 0,
      previousTotalJobs: 2,
      relevantJobs: 0,
      lastNewRoleAt: null,
      consecutiveFailures: 1,
      durationMs: 120,
      suspiciousFlags: [],
      errorDetails: "Fixture failure",
    }, {
      id: "source-nova-labs",
      companyId: discoveryCompany.id,
      companyName: discoveryCompany.name,
      adapterKind: "ashby",
      displayName: "Nova Labs careers",
      officialUrl: "https://nova.example/careers",
      health: "stale",
      enabled: false,
      expectedIntervalMinutes: 120,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      httpStatus: null,
      parserStatus: "not_run",
      parserVersion: "test",
      pagesRetrieved: 0,
      totalJobs: 0,
      previousTotalJobs: 0,
      relevantJobs: 0,
      lastNewRoleAt: null,
      consecutiveFailures: 0,
      durationMs: null,
      suspiciousFlags: [],
      errorDetails: null,
    }],
    monitoringRuns: [],
    alerts: alertFrequency === "off" ? [] : [{
      id: "alert-acme",
      name: "Acme Systems updates",
      enabled: true,
      criteria: { companyIds: [company.id], deliveryFrequency: alertFrequency },
      channels: alertFrequency === "daily" ? ["in_app", "email"] : ["in_app"],
      createdAt: "2026-07-10T12:00:00.000Z",
      lastMatchedAt: null,
    }],
    notifications: [],
    emerging: [],
    preferences: {
      onboardingCompleted,
      opportunityFocus: "both",
      technicalInterests: [],
      preferredLocations: [],
      remotePreferred: false,
      defaultNotificationFrequency: "immediate",
      lastVisitAt: null,
    },
    generatedAt: "2026-07-10T12:00:00.000Z",
    dataMode: "seeded_local",
  };
}

function applyInspectorLogoFixture(payload: BootstrapPayload): void {
  const embeddedCloudflare = { ...cloudflareCompany, logoUrl: null };
  const embeddedFigma = { ...figmaCompany, logoUrl: null };
  const cloudflareRole = {
    ...job(
      "job-cloudflare-intern",
      "Software Engineer Intern (Fall 2026) - Austin, TX",
      "2026-07-21T12:00:00.000Z",
      embeddedCloudflare,
    ),
    sourceId: "cloudflare-greenhouse",
    externalJobId: "cloudflare-6538387",
    isSample: false,
  };
  const figmaRole = {
    ...job(
      "job-figma-data-scientist",
      "Data Scientist, Core Data - PhD (2026)",
      "2026-04-23T02:44:22.000Z",
      embeddedFigma,
    ),
    sourceId: "figma-greenhouse",
    externalJobId: "5976930004",
    audience: "new_grad" as const,
    technicalCategory: "data_science" as const,
    isSample: false,
  };
  const sourceTemplate = payload.sources[0];

  payload.companies = [cloudflareCompany, figmaCompany];
  payload.jobs = [cloudflareRole, figmaRole];
  payload.sources = [
    {
      ...sourceTemplate,
      id: "cloudflare-greenhouse",
      companyId: cloudflareCompany.id,
      companyName: cloudflareCompany.name,
      displayName: "Cloudflare Greenhouse board",
      officialUrl: cloudflareCompany.careerUrl,
      health: "healthy",
      enabled: true,
    },
    {
      ...sourceTemplate,
      id: "figma-greenhouse",
      companyId: figmaCompany.id,
      companyName: figmaCompany.name,
      displayName: "Figma Greenhouse board",
      officialUrl: figmaCompany.careerUrl,
      health: "healthy",
      enabled: true,
    },
  ];
}

function applyDiscoverFilterFixture(payload: BootstrapPayload): void {
  Object.assign(payload.jobs[0], {
    audience: "internship",
    technicalCategory: "software",
    workArrangement: "hybrid",
    locationText: "Seattle, WA",
    locations: [{ city: "Seattle", region: "WA", country: "US", displayText: "Seattle, WA" }],
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[1], {
    audience: "new_grad",
    technicalCategory: "backend",
    workArrangement: "remote",
    locationText: "New York, NY",
    locations: [{ city: "New York", region: "NY", country: "US", displayText: "New York, NY" }],
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[2], {
    audience: "internship",
    technicalCategory: "infrastructure",
    workArrangement: "onsite",
    locationText: "Austin, TX",
    locations: [{ city: "Austin", region: "TX", country: "US", displayText: "Austin, TX" }],
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[3], {
    audience: "new_grad",
    technicalCategory: "data",
    workArrangement: "remote",
    locationText: "Seattle, WA",
    locations: [{ city: "Seattle", region: "WA", country: "US", displayText: "Seattle, WA" }],
  } satisfies Partial<Job>);
}

function applyMyRolesFixture(payload: BootstrapPayload): void {
  Object.assign(payload.jobs[0].userState, {
    saved: true,
    stage: "saved",
    nextActionAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-12T12:00:00.000Z",
  } satisfies Partial<Job["userState"]>);

  Object.assign(payload.jobs[1], {
    availability: "closure_pending",
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[1].userState, {
    saved: true,
    stage: "interview",
    appliedAt: "2026-07-11T12:00:00.000Z",
    updatedAt: "2026-07-11T12:00:00.000Z",
  } satisfies Partial<Job["userState"]>);

  Object.assign(payload.jobs[2], {
    availability: "closed",
    closedAt: "2026-07-10T12:00:00.000Z",
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[2].userState, {
    saved: true,
    stage: "rejected",
    updatedAt: "2026-07-10T12:00:00.000Z",
  } satisfies Partial<Job["userState"]>);

  Object.assign(payload.jobs[3], {
    availability: "closed",
    closedAt: "2026-07-09T12:00:00.000Z",
  } satisfies Partial<Job>);
  Object.assign(payload.jobs[3].userState, {
    saved: true,
    stage: "saved",
    updatedAt: "2026-07-09T12:00:00.000Z",
  } satisfies Partial<Job["userState"]>);
}

type TestUser = ReturnType<typeof userEvent.setup>;

async function selectDiscoverFilterOptions(user: TestUser, filter: string, options: string[]): Promise<void> {
  await user.click(screen.getByRole("button", { name: new RegExp(`^${filter}:`) }));
  const dialog = screen.getByRole("dialog", { name: filter });
  for (const option of options) {
    await user.click(within(dialog).getByRole("checkbox", { name: option }));
  }
  await user.click(within(dialog).getByRole("button", { name: `Close ${filter} filter` }));
}

describe("student workspace", () => {
  let saved = false;
  let onboardingCompleted = true;
  let closedTrackedRole = false;
  let richObservedHistory = false;
  let discoverFilterFixture = false;
  let figmaExtractionFixture = false;
  let inspectorLogoFixture = false;
  let myRolesFixture = false;
  let enableNovaSource = false;
  let trackedNovaRole = false;
  let mobileFilterViewport = false;
  let workspaceDataMode: BootstrapPayload["dataMode"] = "seeded_local";
  let followed = false;
  let alertFrequency: "off" | "immediate" | "daily" = "off";
  let companyLogoUrl: string | null = null;
  let applicationStage: Job["userState"]["stage"] = null;
  let trackerDetails: Pick<Job["userState"], "notes" | "appliedAt" | "nextActionAt"> = {
    notes: "",
    appliedAt: null,
    nextActionAt: null,
  };

  beforeEach(() => {
    saved = false;
    onboardingCompleted = true;
    closedTrackedRole = false;
    richObservedHistory = false;
    discoverFilterFixture = false;
    figmaExtractionFixture = false;
    inspectorLogoFixture = false;
    myRolesFixture = false;
    enableNovaSource = false;
    trackedNovaRole = false;
    mobileFilterViewport = false;
    workspaceDataMode = "seeded_local";
    followed = false;
    alertFrequency = "off";
    companyLogoUrl = null;
    applicationStage = null;
    trackerDetails = { notes: "", appliedAt: null, nextActionAt: null };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("max-width: 620px")
          ? mobileFilterViewport
          : ["max-width: 900px", "max-width: 1240px", "max-width: 1600px", "max-width: 1840px"].some((value) => query.includes(value)),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/bootstrap") {
        const payload = bootstrap(saved, onboardingCompleted, followed, alertFrequency, applicationStage, trackerDetails, companyLogoUrl);
        payload.dataMode = workspaceDataMode;
        if (closedTrackedRole) {
          payload.jobs[0].availability = "closed";
          payload.jobs[0].closedAt = "2026-07-10T16:00:00.000Z";
        }
        if (richObservedHistory) payload.jobs[0].history = supportedCompanyHistory;
        if (discoverFilterFixture) applyDiscoverFilterFixture(payload);
        if (inspectorLogoFixture) applyInspectorLogoFixture(payload);
        if (figmaExtractionFixture) {
          Object.assign(payload.jobs[0], {
            title: "Data Scientist, Core Data - PhD (2026)",
            normalizedTitle: "data scientist core data phd 2026",
            audience: "new_grad",
            technicalCategory: "data_science",
            employmentType: "Full time",
            locationText: "San Francisco, CA • New York, NY",
            locations: [
              { city: "San Francisco", region: "CA", country: "US", displayText: "San Francisco, CA" },
              { city: "New York", region: "NY", country: "US", displayText: "New York, NY" },
            ],
            workArrangement: "remote",
            compensation: {
              minimum: 170_000,
              maximum: 178_000,
              currency: "USD",
              period: "year",
              displayText: "Annual Base Salary Range: $170,000 — $178,000 USD",
              isEstimate: false,
              source: "company",
            },
          } satisfies Partial<Job>);
        }
        if (myRolesFixture) applyMyRolesFixture(payload);
        if (enableNovaSource) {
          const nova = { ...payload.companies[1], monitoringMode: "continuous" as const };
          payload.companies[1] = nova;
          payload.jobs[4].company = nova;
          payload.sources[1] = { ...payload.sources[1], enabled: true, health: "healthy" };
        }
        if (trackedNovaRole) {
          payload.jobs[4].userState = {
            ...payload.jobs[4].userState,
            saved: true,
            stage: "saved",
            updatedAt: "2026-07-10T12:00:00.000Z",
          };
        }
        return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/preferences" && init?.method === "PUT") {
        const patch = JSON.parse(String(init.body)) as { onboardingCompleted?: boolean };
        onboardingCompleted = patch.onboardingCompleted ?? onboardingCompleted;
        return new Response(JSON.stringify({ preferences: bootstrap(saved, onboardingCompleted, followed, alertFrequency, applicationStage, trackerDetails, companyLogoUrl).preferences }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/jobs/job-posted/state" && init?.method === "PUT") {
        const patch = JSON.parse(String(init.body)) as {
          saved?: boolean;
          stage?: Job["userState"]["stage"];
          notes?: string;
          appliedAt?: string | null;
          nextActionAt?: string | null;
        };
        saved = patch.saved ?? saved;
        if ("stage" in patch) applicationStage = patch.stage ?? null;
        trackerDetails = {
          notes: patch.notes ?? trackerDetails.notes,
          appliedAt: "appliedAt" in patch ? patch.appliedAt ?? null : trackerDetails.appliedAt,
          nextActionAt: "nextActionAt" in patch ? patch.nextActionAt ?? null : trackerDetails.nextActionAt,
        };
        return new Response(JSON.stringify({ jobId: "job-posted", userState: bootstrap(saved, onboardingCompleted, followed, alertFrequency, applicationStage, trackerDetails, companyLogoUrl).jobs[0].userState }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/companies/company-acme/follow" && init?.method === "PUT") {
        const patch = JSON.parse(String(init.body)) as { followed: boolean };
        followed = patch.followed;
        return new Response(JSON.stringify({ company: { ...company, followed, logoUrl: companyLogoUrl } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/alerts" && init?.method === "POST") {
        const draft = JSON.parse(String(init.body)) as { criteria: { deliveryFrequency: "immediate" | "daily" } };
        alertFrequency = draft.criteria.deliveryFrequency;
        return new Response(JSON.stringify({ alert: bootstrap(saved, onboardingCompleted, followed, alertFrequency, applicationStage, trackerDetails, companyLogoUrl).alerts[0] }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      if (url === "/api/emerging" && init?.method === "POST") {
        return new Response(JSON.stringify({ candidate: { id: "candidate-requested" } }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Not found", code: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("commits bootstrap after the Strict Mode effect probe and exposes only the three primary destinations", async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole("region", { name: "Monitored roles" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading InternJobs workspace")).not.toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Main navigation" });
    const primaryLinks = within(navigation).getAllByRole("link");
    expect(primaryLinks.map((link) => link.textContent)).toEqual(["Discover", "Following", "My Roles"]);
    expect(primaryLinks.map((link) => link.getAttribute("href"))).toEqual(["/discover", "/watch", "/tracker"]);
    expect(fetch).toHaveBeenCalledWith("/api/bootstrap", expect.anything());
  });

  it("offers product management in onboarding and settings technical interests", async () => {
    const user = userEvent.setup();
    onboardingCompleted = false;
    const onboarding = render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("button", { name: "Product management" })).toBeInTheDocument();
    onboarding.unmount();

    onboardingCompleted = true;
    render(<MemoryRouter initialEntries={["/settings"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Product management" })).toBeInTheDocument();
  });

  it("reuses one company-level logo in Discover, Following, My Roles, and the shared inspector", async () => {
    const user = userEvent.setup();
    const logoPath = "/company-logos/cloudflare.ico";
    companyLogoUrl = logoPath;
    followed = true;
    myRolesFixture = true;

    const discover = render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);
    const discoverTitle = await screen.findByText("Software Engineering Intern");
    const discoverRow = discoverTitle.closest("li");
    expect(discoverRow?.querySelector("img")).toHaveAttribute("src", logoPath);
    await user.click(within(discoverRow!).getByRole("button", { name: "Software Engineering Intern" }));
    const inspector = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    expect(inspector.querySelector("img")).toHaveAttribute("src", logoPath);
    discover.unmount();

    const following = render(<MemoryRouter initialEntries={["/watch"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Following", level: 2 })).toBeInTheDocument();
    expect(following.container.querySelector(`img[src="${logoPath}"]`)).toBeInTheDocument();
    following.unmount();

    const tracker = render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "My Roles", level: 2 })).toBeInTheDocument();
    expect(tracker.container.querySelector(`img[src="${logoPath}"]`)).toBeInTheDocument();
  });

  it("resolves canonical Cloudflare and Figma logos in role and company inspector headers", async () => {
    const user = userEvent.setup();
    inspectorLogoFixture = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const cases = [
      {
        companyName: "Cloudflare",
        initials: "CF",
        roleTitle: "Software Engineer Intern (Fall 2026) - Austin, TX",
        logoPath: "/company-logos/cloudflare.ico",
      },
      {
        companyName: "Figma",
        initials: "FI",
        roleTitle: "Data Scientist, Core Data - PhD (2026)",
        logoPath: "/company-logos/figma.svg",
      },
    ];

    for (const item of cases) {
      const roleButton = await screen.findByRole("button", { name: item.roleTitle });
      const row = roleButton.closest("li");
      expect(row?.querySelector("img")).toHaveAttribute("src", item.logoPath);
      await user.click(roleButton);

      const roleDialog = await screen.findByRole("dialog", { name: item.roleTitle });
      const roleHeaderLogo = roleDialog.querySelector(".inspector-header .company-logo");
      expect(roleHeaderLogo).toHaveClass("company-logo--image");
      expect(roleHeaderLogo?.querySelector("img")).toHaveAttribute("src", item.logoPath);
      expect(roleHeaderLogo).not.toHaveTextContent(item.initials);

      const roleIdentity = roleDialog.querySelector("button.inspector-identity--role");
      expect(roleIdentity).not.toBeNull();
      await user.click(roleIdentity!);

      const companyDialog = await screen.findByRole("dialog", { name: item.companyName });
      const companyHeaderLogo = companyDialog.querySelector(".inspector-header .company-logo");
      expect(companyHeaderLogo).toHaveClass("company-logo--image");
      expect(companyHeaderLogo?.querySelector("img")).toHaveAttribute("src", item.logoPath);
      expect(companyHeaderLogo).not.toHaveTextContent(item.initials);

      await user.click(within(companyDialog).getByRole("button", { name: `Close ${item.companyName} details` }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: item.companyName })).not.toBeInTheDocument());
    }
  });

  it("labels the separate official-source workspace without calling it fixture data", async () => {
    const user = userEvent.setup();
    workspaceDataMode = "live_database";
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    expect(await screen.findByLabelText("Live official sources. Waiting for first check.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Open account menu" })[0]);
    expect(screen.getByText("Live official sources · local database")).toBeInTheDocument();
    expect(screen.queryByText(/Local fixtures/)).not.toBeInTheDocument();
  });

  it.each([
    ["nonzero", "2026-07-09T18:00:00-07:00", "4"],
    ["zero", "2026-07-12T18:00:00-07:00", null],
  ] as const)("renders the %s new-today metric without overemphasizing zero", async (_state, now, expectedCount) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const totals = await screen.findByLabelText("Opportunity totals");
    const liveMetric = within(totals).getByText("Live roles").closest("div");
    expect(liveMetric).not.toBeNull();
    expect(within(liveMetric!).getByText("4")).toBeInTheDocument();

    const newMetric = within(totals).getByText("New today").closest("div");
    expect(newMetric).not.toBeNull();
    if (expectedCount) {
      expect(within(newMetric!).getByText(expectedCount)).toBeInTheDocument();
      expect(within(newMetric!).queryByText("No new roles today")).not.toBeInTheDocument();
    } else {
      expect(within(newMetric!).getByText("No new roles today")).toBeInTheDocument();
      expect(within(newMetric!).queryByText(/^0$/)).not.toBeInTheDocument();
    }
  });

  it("moves keyboard focus into the account menu and restores it on close", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByRole("region", { name: "Monitored roles" });
    const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
    await user.click(accountTrigger);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(accountTrigger).toHaveFocus();
  });

  it("shows only enabled-source postings while preserving posted-versus-found wording and search", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const postedTitle = await screen.findByText("Software Engineering Intern");
    const postedRow = postedTitle.closest("li");
    expect(postedRow).not.toBeNull();
    expect(within(postedRow!).getByText("Posted Jul 8, 2026")).toBeInTheDocument();
    expect(within(postedRow!).getByText(/^Found Jul 9, .+ · Checked /)).toBeInTheDocument();
    expect(screen.getAllByText(/^Posted /)).not.toHaveLength(0);
    expect(screen.getAllByText(/^Found (?!this week)/)).not.toHaveLength(0);
    expect(screen.getByText("Continuously checked official sources")).toBeInTheDocument();
    expect(screen.queryByText("Applied AI Intern")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search roles" }), "Found-only");
    const foundTitle = screen.getByText("Found-only Platform Intern");
    const foundRow = foundTitle.closest("li");
    expect(foundRow).not.toBeNull();
    expect(within(foundRow!).getByText(/^Found Jul 9, /)).toBeInTheDocument();
    expect(within(foundRow!).queryByText(/^Posted /)).not.toBeInTheDocument();
    expect(screen.queryByText("Software Engineering Intern")).not.toBeInTheDocument();
    expect(screen.getByText("matching role").closest("span")).toHaveTextContent("1 matching role");

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Software Engineering Intern")).toBeInTheDocument();
    expect(screen.queryByText("Applied AI Intern")).not.toBeInTheDocument();

    const restoredRow = screen.getByText("Software Engineering Intern").closest("li")!;
    await user.click(within(restoredRow).getByRole("button", { name: "Software Engineering Intern" }));
    const inspector = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    expect(within(inspector).getByText("Posted Jul 8, 2026")).toBeInTheDocument();
    expect(within(inspector).getByText(/^Found Jul 9, .+ · Checked /)).toBeInTheDocument();
  });

  it("shows extracted Figma base salary and remote eligibility while preserving office locations", async () => {
    const user = userEvent.setup();
    figmaExtractionFixture = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const roleButton = await screen.findByRole("button", { name: "Data Scientist, Core Data - PhD (2026)" });
    const row = roleButton.closest("li");
    expect(row).not.toBeNull();
    expect(within(row!).getByText("$170K–$178K/year")).toBeInTheDocument();
    expect(within(row!).getByText("Base salary")).toBeInTheDocument();
    expect(within(row!).getByText("Data science")).toBeInTheDocument();
    expect(within(row!).getByText("San Francisco, CA • New York, NY")).toBeInTheDocument();
    expect(within(row!).getByText("Remote")).toBeInTheDocument();

    await user.click(roleButton);
    const inspector = await screen.findByRole("dialog", { name: "Data Scientist, Core Data - PhD (2026)" });
    expect(within(inspector).getByText("$170K–$178K/year")).toBeInTheDocument();
    expect(within(inspector).getByText("Base salary")).toBeInTheDocument();
    expect(within(inspector).getByText("Data science")).toBeInTheDocument();
    expect(within(inspector).getByText("San Francisco, CA • New York, NY")).toBeInTheDocument();
    expect(within(inspector).getByText("Remote")).toBeInTheDocument();
  });

  it("searches student eligibility details already present on the official role", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const search = await screen.findByRole("textbox", { name: "Search roles" });
    await user.type(search, "Graduating 2027");

    expect(screen.getByText("Software Engineering Intern")).toBeInTheDocument();
    expect(screen.getByText("matching roles").closest("span")).toHaveTextContent("4 matching roles");
  });

  it("explains personalized Best match ordering without showing reasons for other sorts", async () => {
    const user = userEvent.setup();
    followed = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const reasons = await screen.findAllByLabelText(/matches your preferences/);
    expect(reasons[0]).toHaveTextContent("Company you follow");

    await user.click(screen.getByRole("button", { name: "Sort roles: Best match" }));
    await user.click(screen.getByRole("radio", { name: "Newest first" }));
    expect(screen.queryByLabelText(/matches your preferences/)).not.toBeInTheDocument();
  });

  it.each([
    {
      filter: "Role type",
      options: ["Internships", "New grad"],
      summary: "Role type: Role types · 2",
      expectedTitles: ["Software Engineering Intern", "Found-only Platform Intern", longRoleTitle, "Data Platform Intern"],
    },
    {
      filter: "Technical areas",
      options: ["Backend", "Data engineering"],
      summary: "Technical areas: Areas · 2",
      expectedTitles: ["Found-only Platform Intern", "Data Platform Intern"],
    },
    {
      filter: "Locations",
      options: ["Seattle, WA", "New York, NY"],
      summary: "Locations: Locations · 2",
      expectedTitles: ["Software Engineering Intern", "Found-only Platform Intern", "Data Platform Intern"],
    },
    {
      filter: "Work style",
      options: ["Hybrid", "Remote"],
      summary: "Work style: Hybrid +1",
      expectedTitles: ["Software Engineering Intern", "Found-only Platform Intern", "Data Platform Intern"],
    },
  ])("supports multiple $filter values with OR behavior inside the facet", async ({ filter, options, summary, expectedTitles }) => {
    const user = userEvent.setup();
    discoverFilterFixture = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByRole("region", { name: "Monitored roles" });
    await selectDiscoverFilterOptions(user, filter, options);

    expect(screen.getByRole("button", { name: summary })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Monitored active roles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(expectedTitles.length);
    for (const title of expectedTitles) expect(within(list).getByText(title)).toBeInTheDocument();
    expect(screen.getByText(expectedTitles.length === 1 ? "matching role" : "matching roles").closest("span"))
      .toHaveTextContent(`${expectedTitles.length} ${expectedTitles.length === 1 ? "matching role" : "matching roles"}`);
  });

  it("combines facets with AND behavior and keeps removable chips and Clear all in sync", async () => {
    const user = userEvent.setup();
    discoverFilterFixture = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByRole("region", { name: "Monitored roles" });
    await selectDiscoverFilterOptions(user, "Technical areas", ["Backend", "Data engineering"]);
    await selectDiscoverFilterOptions(user, "Locations", ["Seattle, WA", "New York, NY"]);
    await selectDiscoverFilterOptions(user, "Work style", ["Remote"]);

    const activeFilters = screen.getByLabelText("Active filters");
    expect(within(activeFilters).getByRole("button", { name: "Remove Backend filter" })).toBeInTheDocument();
    expect(within(activeFilters).getByRole("button", { name: "Remove Data engineering filter" })).toBeInTheDocument();
    expect(within(activeFilters).getByRole("button", { name: "Remove Seattle, WA filter" })).toBeInTheDocument();
    expect(within(activeFilters).getByRole("button", { name: "Remove New York, NY filter" })).toBeInTheDocument();
    expect(within(activeFilters).getByRole("button", { name: "Remove Remote filter" })).toBeInTheDocument();
    expect(screen.getByText("matching roles").closest("span")).toHaveTextContent("2 matching roles");

    await user.click(within(activeFilters).getByRole("button", { name: "Remove Backend filter" }));
    expect(screen.getByText("matching role").closest("span")).toHaveTextContent("1 matching role");
    expect(screen.queryByText("Found-only Platform Intern")).not.toBeInTheDocument();
    expect(screen.getByText("Data Platform Intern")).toBeInTheDocument();

    await user.click(within(activeFilters).getByRole("button", { name: "Clear all" }));
    expect(screen.queryByLabelText("Active filters")).not.toBeInTheDocument();
    expect(screen.getByText(/^roles$/).closest("span")).toHaveTextContent("4 roles");
    expect(screen.getByRole("button", { name: "Technical areas: All areas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Locations: Anywhere" })).toBeInTheDocument();

    await selectDiscoverFilterOptions(user, "Technical areas", ["Backend", "Infrastructure", "Data engineering"]);
    const summarizedFilters = screen.getByLabelText("Active filters");
    expect(within(summarizedFilters).getByRole("button", { name: "Clear 3 technical areas filters" }))
      .toHaveTextContent("Technical areas · 3");
    expect(within(summarizedFilters).queryByRole("button", { name: "Remove Backend filter" })).not.toBeInTheDocument();
  });

  it("keeps Following only separate from the custom sort selection", async () => {
    const user = userEvent.setup();
    followed = true;
    discoverFilterFixture = true;
    enableNovaSource = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByText("Applied AI Intern");
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sort roles: Best match" }));
    await user.click(screen.getByRole("radio", { name: "Newest first" }));
    expect(screen.getByRole("button", { name: "Sort roles: Newest first" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    let list = screen.getByRole("list", { name: "Monitored active roles" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Applied AI Intern");

    const followingOnly = screen.getByRole("button", { name: "Following only" });
    await user.click(followingOnly);
    expect(followingOnly).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Applied AI Intern")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort roles: Newest first" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    list = screen.getByRole("list", { name: "Monitored active roles" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Applied AI Intern");
    expect(screen.getByRole("button", { name: "Sort roles: Newest first" })).toBeInTheDocument();
  });

  it("preserves search, filter, chip, and sort state while a role drawer opens and closes", async () => {
    const user = userEvent.setup();
    discoverFilterFixture = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByRole("region", { name: "Monitored roles" });
    await selectDiscoverFilterOptions(user, "Technical areas", ["Backend", "Data engineering"]);
    await user.type(screen.getByRole("textbox", { name: "Search roles" }), "Found-only");
    await user.click(screen.getByRole("button", { name: "Sort roles: Best match" }));
    await user.click(screen.getByRole("radio", { name: "Newest first" }));

    await user.click(screen.getByRole("button", { name: "Found-only Platform Intern" }));
    const dialog = await screen.findByRole("dialog", { name: "Found-only Platform Intern" });
    await user.click(within(dialog).getByRole("button", { name: "Close job details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Found-only Platform Intern" })).not.toBeInTheDocument());

    expect(screen.getByRole("textbox", { name: "Search roles" })).toHaveValue("Found-only");
    expect(screen.getByRole("button", { name: "Technical areas: Areas · 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sort roles: Newest first" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Backend filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Data engineering filter" })).toBeInTheDocument();
    expect(screen.getByText("matching role").closest("span")).toHaveTextContent("1 matching role");

    await user.click(screen.getByRole("button", { name: "Technical areas: Areas · 2" }));
    expect(screen.getByRole("checkbox", { name: "Backend" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Data engineering" })).toBeChecked();
  });

  it("keeps one semantic filter set and traps the mobile filter sheet without native selects", async () => {
    const user = userEvent.setup();
    discoverFilterFixture = true;
    mobileFilterViewport = true;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    await screen.findByRole("region", { name: "Monitored roles" });
    const searchForm = screen.getByRole("search");
    expect(searchForm.querySelector("select")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Role type:/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Technical areas:/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Locations:/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Work style:/ })).toHaveLength(1);

    const filtersToggle = screen.getByRole("button", { name: "Filters" });
    expect(filtersToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(filtersToggle);
    expect(filtersToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Filters" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Close filters" })).toHaveFocus();

    const locationsTrigger = screen.getByRole("button", { name: "Locations: Anywhere" });
    await user.click(locationsTrigger);
    expect(screen.getByRole("dialog", { name: "Locations" })).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(locationsTrigger).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(filtersToggle).toHaveFocus();
    expect(filtersToggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("opens a linked role as an accessible mobile dialog and saves optimistically", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover?job=job-posted"]}><App /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "View Acme Systems company profile" })).toHaveFocus());

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("button", { name: "Saved" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Saved" }));
    expect(await within(dialog).findByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/jobs/job-posted/state", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining('"stage":null'),
    }));

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Software Engineering Intern" })).not.toBeInTheDocument());
  });

  it("surfaces eligibility and official role details before a student applies", async () => {
    render(<MemoryRouter initialEntries={["/discover?job=job-posted"]}><App /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    const eligibility = within(dialog).getByRole("region", { name: "Eligibility snapshot" });
    expect(within(eligibility).getByText("Current student")).toBeInTheDocument();
    expect(within(eligibility).getByText("Graduating 2027 or later")).toBeInTheDocument();
    expect(within(eligibility).getByText("See official posting")).toBeInTheDocument();

    const details = within(dialog).getByRole("region", { name: "What the role involves" });
    expect(within(details).getByText("Build production systems with the platform team.")).toBeInTheDocument();
    expect(within(details).getByRole("heading", { name: "What you’ll do" })).toBeInTheDocument();
    expect(within(details).getByRole("heading", { name: "Requirements" })).toBeInTheDocument();
  });

  it("opens a Discover role from row whitespace without letting Save bubble into the inspector", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const roleTitle = await screen.findByRole("button", { name: "Software Engineering Intern" });
    const row = roleTitle.closest("li");
    expect(row).not.toBeNull();
    await user.click(row!);
    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    await user.click(within(dialog).getByRole("button", { name: "Close job details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Software Engineering Intern" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save Software Engineering Intern" }));
    expect(screen.queryByRole("dialog", { name: "Software Engineering Intern" })).not.toBeInTheDocument();
  });

  it("opens the shared color-reactive company drawer from a Discover company", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    const companyButtons = await screen.findAllByRole("button", { name: "Open Acme Systems details" });
    await user.click(companyButtons[0]);

    const drawer = await screen.findByRole("dialog", { name: "Acme Systems" });
    expect(drawer.style.getPropertyValue("--company-accent")).toBe("#12634f");
    expect(within(drawer).getByRole("button", { name: "Alert frequency for Acme Systems: Off" })).toBeInTheDocument();
    expect(within(drawer).queryByRole("combobox", { name: "Alert frequency for Acme Systems" })).not.toBeInTheDocument();
    expect(drawer.querySelector(".company-profile__alerts select")).not.toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "Careers site" })).toHaveAttribute("href", company.careerUrl);
    expect(drawer.querySelector(".company-source__row")).toHaveAttribute("href", "https://boards.greenhouse.io/acme-systems");
    expect(within(drawer).getAllByText(/Checked/)).not.toHaveLength(0);
    expect(within(drawer).getByText("Not enough history yet")).toBeInTheDocument();
    expect(within(drawer).queryByRole("heading", { name: "Previous openings" })).not.toBeInTheDocument();
    expect(within(drawer).getAllByRole("button", { name: /^Open .*Intern/ })).toHaveLength(3);
    expect(within(drawer).queryByRole("button", { name: "Open Data Platform Intern" })).not.toBeInTheDocument();
    expect(within(drawer).getByText("3 of 4")).toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: /View all openings/ })).not.toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: "Close Acme Systems details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Acme Systems" })).not.toBeInTheDocument());

    const reopenedCompanyButtons = await screen.findAllByRole("button", { name: "Open Acme Systems details" });
    await user.click(reopenedCompanyButtons[0]);
    const reopenedDrawer = await screen.findByRole("dialog", { name: "Acme Systems" });
    expect(within(reopenedDrawer).queryByRole("button", { name: "Open Data Platform Intern" })).not.toBeInTheDocument();
  });

  it("renders the observed hiring chart only when company history clears the evidence gate", async () => {
    richObservedHistory = true;
    render(<MemoryRouter initialEntries={["/discover?company=company-acme"]}><App /></MemoryRouter>);

    const drawer = await screen.findByRole("dialog", { name: "Acme Systems" });
    expect(within(drawer).getByRole("img", {
      name: /Acme Systems early-career openings first observed by month.*July: 2.*August: 2.*September: 2/i,
    })).toBeInTheDocument();
    expect(within(drawer).getByText("Based on 6 openings first observed across 2 recruiting seasons.")).toBeInTheDocument();
    expect(within(drawer).queryByText("Not enough history yet")).not.toBeInTheDocument();
  });

  it("persists Follow and alert preference changes from company mode", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover?company=company-acme"]}><App /></MemoryRouter>);

    const drawer = await screen.findByRole("dialog", { name: "Acme Systems" });
    await user.click(within(drawer).getByRole("button", { name: "Follow" }));
    expect(await within(drawer).findByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");

    const alerts = within(drawer).getByRole("button", { name: "Alert frequency for Acme Systems: Off" });
    expect(within(drawer).queryByRole("combobox", { name: "Alert frequency for Acme Systems" })).not.toBeInTheDocument();
    expect(drawer.querySelector(".company-profile__alerts select")).not.toBeInTheDocument();
    await user.click(alerts);
    const alertDialog = within(drawer).getByRole("dialog", { name: "Alerts" });
    expect(within(alertDialog).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(alertDialog).getByRole("radio", { name: "Immediate" }));
    await waitFor(() => expect(within(drawer).queryByRole("dialog", { name: "Alerts" })).not.toBeInTheDocument());
    expect(await within(drawer).findByRole("button", { name: "Alert frequency for Acme Systems: Immediate" })).toHaveFocus();
    expect(fetch).toHaveBeenCalledWith("/api/companies/company-acme/follow", expect.objectContaining({ method: "PUT" }));
    expect(fetch).toHaveBeenCalledWith("/api/alerts", expect.objectContaining({ method: "POST" }));
  });

  it("switches role to standalone company mode and then into another role inside one inspector", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/discover?job=job-posted"]}><App /></MemoryRouter>);

    const roleDialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    const shell = roleDialog.closest(".inspector-shell");
    expect(shell).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /Close .* details/ })).toHaveLength(1);
    expect(within(roleDialog).getByRole("link", { name: /Apply on official site/ })).toHaveAttribute(
      "href",
      "https://acme.example/jobs/job-posted/apply",
    );
    expect(within(roleDialog).queryByRole("combobox", { name: "Application stage for Software Engineering Intern" })).not.toBeInTheDocument();
    await user.click(within(roleDialog).getByRole("button", { name: "View Acme Systems company profile" }));
    const companyDialog = await screen.findByRole("dialog", { name: "Acme Systems" });
    expect(companyDialog.closest(".inspector-shell")).toBe(shell);
    expect(within(companyDialog).queryByRole("button", { name: /^Back to/ })).not.toBeInTheDocument();
    expect(within(companyDialog).queryByRole("button", { name: /company profile/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Close .* details/ })).toHaveLength(1);

    await user.click(within(companyDialog).getByRole("button", { name: "Open Found-only Platform Intern" }));
    const nextRoleDialog = await screen.findByRole("dialog", { name: "Found-only Platform Intern" });
    expect(nextRoleDialog.closest(".inspector-shell")).toBe(shell);
    expect(within(nextRoleDialog).getByRole("button", { name: "View Acme Systems company profile" })).toBeInTheDocument();
  });

  it("keeps a long role title readable while preserving the primary actions", async () => {
    render(<MemoryRouter initialEntries={["/discover?job=job-extra-research"]}><App /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog", { name: longRoleTitle });
    const visibleTitle = dialog.querySelector(".role-overview h2");
    expect(visibleTitle).toHaveTextContent(longRoleTitle);
    expect(visibleTitle).toBeVisible();
    expect(visibleTitle?.closest(".role-overview")).toHaveClass("role-overview--long-title");
    expect(within(dialog).getByRole("link", { name: /Apply on official site/ })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeVisible();
  });

  it("keeps tracker editing collapsed until requested and persists private fields", async () => {
    const user = userEvent.setup();
    saved = true;
    render(<MemoryRouter initialEntries={["/discover?job=job-posted"]}><App /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    const tracker = within(dialog).getByRole("region", { name: "Application tracker" });
    expect(within(tracker).getByText("YOUR WORKSPACE")).toBeInTheDocument();
    expect(within(tracker).getByText("Saved")).toBeInTheDocument();
    expect(within(tracker).getByText("None set")).toBeInTheDocument();
    expect(within(tracker).queryByRole("combobox", { name: "Application stage for Software Engineering Intern" })).not.toBeInTheDocument();

    await user.click(within(tracker).getByRole("button", { name: "Edit" }));
    await user.selectOptions(within(tracker).getByRole("combobox", { name: "Application stage for Software Engineering Intern" }), "interview");
    await user.type(within(tracker).getByRole("textbox", { name: "Private notes" }), "Discard this draft");
    expect(vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).includes("/state") && init?.method === "PUT")).toHaveLength(0);
    await user.click(within(tracker).getByRole("button", { name: "Cancel" }));
    expect(within(tracker).queryByRole("combobox", { name: "Application stage for Software Engineering Intern" })).not.toBeInTheDocument();
    expect(within(tracker).getByText("Saved")).toBeInTheDocument();
    expect(within(tracker).getByText("None set")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.filter(([url, init]) => String(url).includes("/state") && init?.method === "PUT")).toHaveLength(0);

    await user.click(within(tracker).getByRole("button", { name: "Edit" }));
    expect(within(tracker).getByRole("combobox", { name: "Application stage for Software Engineering Intern" })).toHaveValue("saved");
    expect(within(tracker).getByRole("textbox", { name: "Private notes" })).toHaveValue("");
    await user.selectOptions(within(tracker).getByRole("combobox", { name: "Application stage for Software Engineering Intern" }), "interview");
    await user.type(within(tracker).getByRole("textbox", { name: "Private notes" }), "Prepare system design examples");
    await user.type(within(tracker).getByLabelText("Applied on"), "2026-07-11");
    await user.type(within(tracker).getByLabelText("Next action"), "2026-07-18");
    await user.click(within(tracker).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(within(tracker).queryByRole("textbox", { name: "Private notes" })).not.toBeInTheDocument());
    expect(within(tracker).getByText("Interview")).toBeInTheDocument();
    expect(within(tracker).getByText("Jul 18, 2026")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/jobs/job-posted/state", expect.objectContaining({
      method: "PUT",
      body: expect.stringContaining("Prepare system design examples"),
    }));
  }, 10_000);

  it("discards an unfinished tracker draft and reopens the same role collapsed", async () => {
    const user = userEvent.setup();
    saved = true;
    render(<MemoryRouter initialEntries={["/discover?job=job-posted"]}><App /></MemoryRouter>);

    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    let tracker = within(dialog).getByRole("region", { name: "Application tracker" });
    await user.click(within(tracker).getByRole("button", { name: "Edit" }));
    await user.type(within(tracker).getByRole("textbox", { name: "Private notes" }), "Unfinished private draft");
    await user.click(within(dialog).getByRole("button", { name: "Close job details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Software Engineering Intern" })).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Software Engineering Intern" }));
    const reopened = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    tracker = within(reopened).getByRole("region", { name: "Application tracker" });
    expect(within(tracker).queryByRole("textbox", { name: "Private notes" })).not.toBeInTheDocument();
    await user.click(within(tracker).getByRole("button", { name: "Edit" }));
    expect(within(tracker).getByRole("textbox", { name: "Private notes" })).toHaveValue("");
  });

  it("resolves legacy company links into Watch with the shared drawer open", async () => {
    render(<MemoryRouter initialEntries={["/companies/acme"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("dialog", { name: "Acme Systems" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Following", level: 3 })).toBeInTheDocument();
  });

  it("opens a followed company directly in company mode from Watch", async () => {
    const user = userEvent.setup();
    followed = true;
    render(<MemoryRouter initialEntries={["/watch"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Following", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Company openings and alert settings in one place.")).toBeInTheDocument();
    const companyOpeners = await screen.findAllByRole("button", { name: "Open Acme Systems details" });
    await user.click(companyOpeners[0]);
    const drawer = await screen.findByRole("dialog", { name: "Acme Systems" });
    const shell = drawer.closest(".inspector-shell");
    expect(within(drawer).getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
    expect(within(drawer).queryByRole("button", { name: /company profile|^Back to/ })).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Open Software Engineering Intern" }));
    const roleDrawer = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    expect(roleDrawer.closest(".inspector-shell")).toBe(shell);
    expect(within(roleDrawer).getByRole("button", { name: "View Acme Systems company profile" })).toBeInTheDocument();
  });

  it("withholds a disabled-source posting from public surfaces while keeping its saved Tracker history", async () => {
    const user = userEvent.setup();
    trackedNovaRole = true;
    const discover = render(<MemoryRouter initialEntries={["/discover?job=job-discovery"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("region", { name: "Monitored roles" })).toBeInTheDocument();
    expect(screen.queryByText("Applied AI Intern")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Applied AI Intern" })).not.toBeInTheDocument();
    discover.unmount();

    const companyView = render(<MemoryRouter initialEntries={["/companies/nova-labs"]}><App /></MemoryRouter>);

    const drawer = await screen.findByRole("dialog", { name: "Nova Labs" });
    expect(within(drawer).getByRole("heading", { name: "Current openings" })).toBeInTheDocument();
    expect(within(drawer).getByText("No active roles right now.")).toBeInTheDocument();
    expect(within(drawer).queryByText("Applied AI Intern")).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Request continuous monitoring" }));
    expect(await within(drawer).findByRole("button", { name: "Monitoring requested" })).toBeDisabled();
    expect(fetch).toHaveBeenCalledWith("/api/emerging", expect.objectContaining({ method: "POST" }));
    companyView.unmount();

    render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);
    const savedRoles = await screen.findByRole("list", { name: "saved roles" });
    expect(within(savedRoles).getByText("Applied AI Intern")).toBeInTheDocument();
  });

  it("walks a first-time student through the five concise setup steps", async () => {
    const user = userEvent.setup();
    onboardingCompleted = false;
    render(<MemoryRouter initialEntries={["/discover"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "What are you looking for?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Internships/ }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Software engineering" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "Where would you work?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "Follow a few companies" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: "How should we notify you?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Show my roles/ }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "How should we notify you?" })).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Monitored roles" })).toBeInTheDocument();
  });

  it("groups saved, progressed, and archived roles while preserving useful stage details", async () => {
    const user = userEvent.setup();
    myRolesFixture = true;
    render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "My Roles", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Roles you saved or applied to, without the busywork.")).toBeInTheDocument();

    const stateTabs = screen.getByRole("tablist", { name: "My role states" });
    expect(within(stateTabs).getByRole("tab", { name: "Saved, 2 roles" })).toHaveAttribute("aria-selected", "true");
    expect(within(stateTabs).getByRole("tab", { name: "Applied, 1 role" })).toBeInTheDocument();
    expect(within(stateTabs).getByRole("tab", { name: "Archived, 1 role" })).toBeInTheDocument();
    const postingFilters = screen.getByRole("navigation", { name: "My Roles filters" });
    expect(within(postingFilters).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["All postings", "Posting open", "Posting closed"]);

    const savedRoles = screen.getByRole("list", { name: "saved roles" });
    expect(within(savedRoles).getByText("Software Engineering Intern")).toBeInTheDocument();
    expect(within(savedRoles).getByText("Data Platform Intern")).toBeInTheDocument();
    expect(within(savedRoles).getByText("Posting open")).toBeInTheDocument();
    expect(within(savedRoles).getByText("Posting closed")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Application stage for/ })).not.toBeInTheDocument();
    expect(within(savedRoles).getByText("Next action")).toBeInTheDocument();
    expect(within(savedRoles).getByText("Jul 18, 2026")).toBeInTheDocument();

    await user.click(within(stateTabs).getByRole("tab", { name: "Applied, 1 role" }));
    const appliedRoles = await screen.findByRole("list", { name: "applied roles" });
    expect(within(appliedRoles).getByText("Found-only Platform Intern")).toBeInTheDocument();
    expect(within(appliedRoles).getByText("Applied")).toBeInTheDocument();
    expect(within(appliedRoles).getByText("Checking availability")).toBeInTheDocument();
    expect(within(appliedRoles).getByText("Interview")).toBeInTheDocument();

    await user.click(within(stateTabs).getByRole("tab", { name: "Archived, 1 role" }));
    const archivedRoles = await screen.findByRole("list", { name: "archived roles" });
    expect(within(archivedRoles).getByText(longRoleTitle)).toBeInTheDocument();
    expect(within(archivedRoles).getByText("Rejected")).toBeInTheDocument();
    expect(within(archivedRoles).getByText("Posting closed")).toBeInTheDocument();
  });

  it("supports roving keyboard navigation across My Roles state tabs", async () => {
    const user = userEvent.setup();
    myRolesFixture = true;
    render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);

    const tabs = await screen.findByRole("tablist", { name: "My role states" });
    const savedTab = within(tabs).getByRole("tab", { name: "Saved, 2 roles" });
    const appliedTab = within(tabs).getByRole("tab", { name: "Applied, 1 role" });
    const archivedTab = within(tabs).getByRole("tab", { name: "Archived, 1 role" });
    savedTab.focus();

    await user.keyboard("{ArrowRight}");
    expect(appliedTab).toHaveAttribute("aria-selected", "true");
    expect(appliedTab).toHaveFocus();
    await user.keyboard("{End}");
    expect(archivedTab).toHaveAttribute("aria-selected", "true");
    expect(archivedTab).toHaveFocus();
    await user.keyboard("{Home}");
    expect(savedTab).toHaveAttribute("aria-selected", "true");
    expect(savedTab).toHaveFocus();
  });

  it("keeps a saved reminder in Saved and gives an overdue next action restrained emphasis", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    myRolesFixture = true;
    render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);

    const savedRoles = await screen.findByRole("list", { name: "saved roles" });
    const nextAction = within(savedRoles).getByText("Next action").closest(".my-role-row__date");
    expect(nextAction).toHaveClass("is-overdue");
    expect(within(nextAction as HTMLElement).getByText("Overdue")).toBeInTheDocument();
    expect(within(savedRoles).getByText("Software Engineering Intern")).toBeInTheDocument();
  });

  it("filters My Roles and opens the existing role drawer without losing the page state", async () => {
    const user = userEvent.setup();
    myRolesFixture = true;
    render(<MemoryRouter initialEntries={["/tracker"]}><App /></MemoryRouter>);

    const search = await screen.findByRole("textbox", { name: "Search my roles" });
    const postingOpen = screen.getByRole("button", { name: "Posting open" });
    await user.click(postingOpen);
    expect(postingOpen).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Software Engineering Intern")).toBeInTheDocument();
    expect(screen.queryByText("Data Platform Intern")).not.toBeInTheDocument();

    await user.type(search, "Software Engineering");
    const roleButton = screen.getByText("Software Engineering Intern").closest("button");
    expect(roleButton).not.toBeNull();
    await user.click(roleButton!);
    const dialog = await screen.findByRole("dialog", { name: "Software Engineering Intern" });
    await user.click(within(dialog).getByRole("button", { name: "Close job details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Software Engineering Intern" })).not.toBeInTheDocument());

    expect(search).toHaveValue("Software Engineering");
    expect(postingOpen).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "My Roles" })).toHaveAttribute("aria-current", "page");
  });
});
