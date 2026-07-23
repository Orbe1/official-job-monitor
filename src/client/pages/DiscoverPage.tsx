import {
  Bookmark,
  BookmarkCheck,
  Check,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { clsx } from "clsx";
import type {
  Job,
  JobAudience,
  TechnicalCategory,
  UserPreferences,
  WorkArrangement,
} from "../../shared/domain";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  WORK_ARRANGEMENT_LABELS,
} from "../../shared/constants";
import { useData } from "../DataContext";
import { companyThemeStyle } from "../companyTheme";
import { compensationLabel, compensationTypeLabel, dateTime, fullDate, relativeTime, sourcePublicationDate } from "../format";
import { OpportunityInspector } from "../components/OpportunityInspector";
import {
  type FilterOption,
  MultiSelectPopover,
  SingleSelectPopover,
} from "../components/FilterPopover";
import { Button, CompanyLogo, EmptyState, IconButton } from "../components/ui";

type RoleType = Exclude<JobAudience, "ambiguous">;
type SortKey = "recommended" | "newest" | "company";
type OpenFilter = "role" | "area" | "location" | "style" | "sort" | null;

interface ActiveFilterChip {
  key: string;
  label: string;
  removeLabel: string;
  onRemove: () => void;
}

const roleTypeOptions: readonly FilterOption<RoleType>[] = [
  { value: "internship", label: "Internships" },
  { value: "new_grad", label: "New grad" },
];

const categoryOptions = (Object.entries(CATEGORY_LABELS) as Array<[TechnicalCategory, string]>)
  .map(([value, label]) => ({ value, label }));

const arrangementOptions = (Object.entries(WORK_ARRANGEMENT_LABELS) as Array<[WorkArrangement, string]>)
  .map(([value, label]) => ({ value, label }));

const sortOptions: readonly FilterOption<SortKey>[] = [
  { value: "recommended", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "company", label: "Company A–Z" },
];
const fallbackPreferences: UserPreferences = {
  onboardingCompleted: false,
  opportunityFocus: "both",
  technicalInterests: [],
  preferredLocations: [],
  remotePreferred: false,
  defaultNotificationFrequency: "off",
  lastVisitAt: null,
};

function audienceLabel(audience: JobAudience): string {
  return audience === "ambiguous" ? "Early career" : AUDIENCE_LABELS[audience];
}

function timestamp(job: Job): number {
  const value = new Date(sourcePublicationDate(job) ?? job.firstSeenAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function containsIgnoreCase(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function optionLabel<Value extends string>(value: Value, options: readonly FilterOption<Value>[]): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function selectedSummary<Value extends string>(
  selected: readonly Value[],
  options: readonly FilterOption<Value>[],
  emptyLabel: string,
  groupLabel: string,
): string {
  if (!selected.length) return emptyLabel;
  if (selected.length === 1) return optionLabel(selected[0], options);
  return `${groupLabel} · ${selected.length}`;
}

function workStyleSummary(selected: readonly WorkArrangement[]): string {
  if (!selected.length) return "Any style";
  if (selected.length === 1) return optionLabel(selected[0], arrangementOptions);
  if (selected.length === 2) return `${optionLabel(selected[0], arrangementOptions)} +1`;
  return `Work styles · ${selected.length}`;
}

function jobLocationLabels(job: Job): string[] {
  const structured = job.locations.map((location) => location.displayText.trim()).filter(Boolean);
  return structured.length ? structured : job.locationText ? [job.locationText.trim()] : [];
}

function facetChips<Value extends string>(
  keyPrefix: string,
  groupLabel: string,
  selected: readonly Value[],
  options: readonly FilterOption<Value>[],
  onChange: (values: Value[]) => void,
  forceSummary: boolean,
  individualLimit = 2,
): ActiveFilterChip[] {
  if (!selected.length) return [];
  if ((forceSummary && selected.length > 1) || selected.length > individualLimit) {
    return [{
      key: keyPrefix,
      label: `${groupLabel} · ${selected.length}`,
      removeLabel: `Clear ${selected.length} ${groupLabel.toLocaleLowerCase()} filters`,
      onRemove: () => onChange([]),
    }];
  }
  return selected.map((value) => {
    const label = optionLabel(value, options);
    return {
      key: `${keyPrefix}-${value}`,
      label,
      removeLabel: `Remove ${label} filter`,
      onRemove: () => onChange(selected.filter((selectedValue) => selectedValue !== value)),
    };
  });
}

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, label"));
}

function matchesPreferredLocation(job: Job, preferences: UserPreferences): boolean {
  return preferences.preferredLocations.some((preference) =>
    containsIgnoreCase(job.locationText, preference) ||
    job.locations.some((location) => containsIgnoreCase(location.displayText, preference)),
  );
}

function preferenceScore(job: Job, preferences: UserPreferences): number {
  let score = 0;
  if (job.company.followed) score += 60;
  if (preferences.technicalInterests.includes(job.technicalCategory)) score += 35;
  if (
    preferences.opportunityFocus === "both" ||
    preferences.opportunityFocus === job.audience
  ) score += 28;
  if (matchesPreferredLocation(job, preferences)) score += 20;
  if (preferences.remotePreferred && job.workArrangement === "remote") score += 16;
  if (
    preferences.lastVisitAt &&
    new Date(job.firstSeenAt).getTime() > new Date(preferences.lastVisitAt).getTime()
  ) score += 12;
  return score;
}

function preferenceReasons(job: Job, preferences: UserPreferences): string[] {
  const reasons: string[] = [];
  if (job.company.followed) reasons.push("Company you follow");
  if (preferences.technicalInterests.includes(job.technicalCategory)) {
    reasons.push(`${CATEGORY_LABELS[job.technicalCategory]} interest`);
  }
  if (preferences.opportunityFocus !== "both" && preferences.opportunityFocus === job.audience) {
    reasons.push(`${audienceLabel(job.audience)} focus`);
  }
  if (matchesPreferredLocation(job, preferences)) reasons.push("Preferred location");
  if (preferences.remotePreferred && job.workArrangement === "remote") reasons.push("Remote preference");
  return reasons.slice(0, 2);
}

function isNewSinceVisit(job: Job, preferences: UserPreferences, now: number): boolean {
  const firstSeen = new Date(job.firstSeenAt).getTime();
  if (!Number.isFinite(firstSeen)) return false;
  if (preferences.lastVisitAt) {
    const lastVisit = new Date(preferences.lastVisitAt).getTime();
    if (Number.isFinite(lastVisit)) return firstSeen > lastVisit;
  }
  return firstSeen > now - 72 * 60 * 60 * 1000;
}

export function DiscoverPage() {
  const { data, updateJobState } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState<RoleType[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<TechnicalCategory[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedArrangements, setSelectedArrangements] = useState<WorkArrangement[]>([]);
  const [followedOnly, setFollowedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [secondaryFiltersOpen, setSecondaryFiltersOpen] = useState(false);
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [now] = useState(() => Date.now());
  const todayStartedAt = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }, [now]);
  const toolbarRef = useRef<HTMLFormElement>(null);
  const filtersToggleRef = useRef<HTMLButtonElement>(null);
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const filtersCloseRef = useRef<HTMLButtonElement>(null);
  const preferences = data?.preferences;
  const selectedJobId = searchParams.get("job");
  const selectedCompanyId = searchParams.get("company");
  const companiesById = useMemo(
    () => new Map((data?.companies ?? []).map((company) => [company.id, company])),
    [data?.companies],
  );
  const enabledSourceIds = useMemo(
    () => new Set((data?.sources ?? []).filter((source) => source.enabled).map((source) => source.id)),
    [data?.sources],
  );
  const activeJobs = useMemo(
    () => (data?.jobs ?? []).filter((job) =>
      job.availability === "active" && enabledSourceIds.has(job.sourceId)),
    [data?.jobs, enabledSourceIds],
  );
  const newTodayCount = useMemo(
    () => activeJobs.filter((job) => {
      const firstSeenAt = new Date(job.firstSeenAt).getTime();
      return Number.isFinite(firstSeenAt) && firstSeenAt >= todayStartedAt && firstSeenAt <= now;
    }).length,
    [activeJobs, now, todayStartedAt],
  );
  const locationOptions = useMemo(() => {
    const labelsByKey = new Map<string, string>();
    for (const job of activeJobs) {
      for (const label of jobLocationLabels(job)) {
        const key = label.toLocaleLowerCase();
        if (!labelsByKey.has(key)) labelsByKey.set(key, label);
      }
    }
    return [...labelsByKey.values()]
      .sort((first, second) => first.localeCompare(second))
      .map((label) => ({ value: label, label }));
  }, [activeJobs]);

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = activeJobs.filter((job) => {
      if (normalizedQuery && ![
        job.title,
        job.normalizedTitle,
        job.company.name,
        job.locationText,
        CATEGORY_LABELS[job.technicalCategory],
        job.eligibility ?? "",
        job.graduationRequirements ?? "",
        job.workAuthorization ?? "",
        ...job.requirements,
        ...job.preferredQualifications,
      ].join(" ").toLocaleLowerCase().includes(normalizedQuery)) return false;
      if (selectedAudiences.length && !selectedAudiences.includes(job.audience as RoleType)) return false;
      if (selectedCategories.length && !selectedCategories.includes(job.technicalCategory)) return false;
      if (selectedArrangements.length && !selectedArrangements.includes(job.workArrangement)) return false;
      if (selectedLocations.length && !jobLocationLabels(job).some((label) => selectedLocations.includes(label))) return false;
      const company = companiesById.get(job.companyId) ?? job.company;
      if (followedOnly && !company.followed) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (sort === "company") {
        return a.company.name.localeCompare(b.company.name) || a.title.localeCompare(b.title);
      }
      if (sort === "recommended" && preferences) {
        const scoreDifference = preferenceScore(b, preferences) - preferenceScore(a, preferences);
        if (scoreDifference) return scoreDifference;
      }
      return timestamp(b) - timestamp(a);
    });
  }, [activeJobs, companiesById, followedOnly, preferences, query, selectedArrangements, selectedAudiences, selectedCategories, selectedLocations, sort]);

  const selectedJob = activeJobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedCompany = data?.companies.find((company) => company.id === selectedCompanyId) ?? null;
  const activeCompany = selectedCompany ?? (selectedJob
    ? companiesById.get(selectedJob.companyId) ?? selectedJob.company
    : null);
  const selectedFilterValueCount = selectedAudiences.length + selectedCategories.length +
    selectedLocations.length + selectedArrangements.length + Number(followedOnly);
  const hasFacetFilters = selectedFilterValueCount > 0;
  const hasActiveCriteria = Boolean(query.trim() || hasFacetFilters);
  const forceSummarizedChips = selectedFilterValueCount > 5;
  const activeFilterChips = [
    ...facetChips("role", "Role types", selectedAudiences, roleTypeOptions, setSelectedAudiences, forceSummarizedChips),
    ...facetChips("area", "Technical areas", selectedCategories, categoryOptions, setSelectedCategories, forceSummarizedChips),
    ...facetChips("location", "Locations", selectedLocations, locationOptions, setSelectedLocations, forceSummarizedChips),
    ...facetChips("style", "Work styles", selectedArrangements, arrangementOptions, setSelectedArrangements, forceSummarizedChips),
    ...(followedOnly ? [{
      key: "following",
      label: "Following only",
      removeLabel: "Remove Following only filter",
      onRemove: () => setFollowedOnly(false),
    }] : []),
  ];

  const clearFacetFilters = () => {
    setSelectedAudiences([]);
    setSelectedCategories([]);
    setSelectedArrangements([]);
    setSelectedLocations([]);
    setFollowedOnly(false);
  };

  const resetAllCriteria = () => {
    setQuery("");
    clearFacetFilters();
    setSecondaryFiltersOpen(false);
    setOpenFilter(null);
  };

  const showJob = (job: Job) => {
    setOpenFilter(null);
    setSecondaryFiltersOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("job", job.id);
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  const showCompany = (companyId: string) => {
    setOpenFilter(null);
    setSecondaryFiltersOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("company", companyId);
    next.delete("job");
    setSearchParams(next, { replace: true });
  };

  const closeInspector = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("job");
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!secondaryFiltersOpen || !window.matchMedia("(max-width: 620px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [secondaryFiltersOpen]);

  useEffect(() => {
    if (!secondaryFiltersOpen) return;
    const mobileSheet = window.matchMedia("(max-width: 620px)").matches;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || toolbarRef.current?.contains(target)) return;
      setSecondaryFiltersOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !openFilter) {
        event.preventDefault();
        setSecondaryFiltersOpen(false);
        filtersToggleRef.current?.focus();
        return;
      }
      if (!mobileSheet || openFilter || event.key !== "Tab") return;
      const focusable = [...(filtersPanelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hidden);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (!filtersPanelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilter, secondaryFiltersOpen]);

  const mobileFiltersModal = secondaryFiltersOpen && window.matchMedia("(max-width: 620px)").matches;

  return (
    <div
      className={clsx(
        "discover-layout",
        (selectedJob || selectedCompany) && "discover-layout--inspector",
      )}
      data-active-company={activeCompany?.slug}
      style={activeCompany ? companyThemeStyle(activeCompany) : undefined}
    >
      <section className="workspace discover-workspace" aria-labelledby="discover-heading">
        <header className="discover-header discover-header--editorial">
          <div className="discover-header__title">
            <h2 id="discover-heading">Discover</h2>
          </div>
          <dl className="discover-header__metrics" aria-label="Opportunity totals">
            <div className="discover-header__metric discover-header__metric--live">
              <dt className="discover-header__metric-label">Live roles</dt>
              <dd className="discover-header__metric-value">{activeJobs.length}</dd>
            </div>
            <div className={clsx(
              "discover-header__metric",
              newTodayCount > 0 ? "discover-header__metric--new" : "discover-header__metric--quiet",
            )}>
              <dt className={clsx("discover-header__metric-label", newTodayCount === 0 && "sr-only")}>New today</dt>
              <dd className="discover-header__metric-value">
                {newTodayCount > 0 ? newTodayCount : "No new roles today"}
              </dd>
            </div>
          </dl>
        </header>

        <section
          id="discover-feed"
          className="discover-feed"
          aria-label="Monitored roles"
        >
          <form
            ref={toolbarRef}
            className="discover-toolbar discover-toolbar--editorial"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="search-field discover-toolbar__search">
              <Search aria-hidden="true" />
              <span className="sr-only">Search roles</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles, companies, keywords…"
              />
              {query && <IconButton type="button" label="Clear search" onClick={() => setQuery("")}><X /></IconButton>}
            </label>

            <div
              ref={filtersPanelRef}
              id="discover-secondary-filters"
              className={clsx("discover-toolbar__filters", secondaryFiltersOpen && "is-open")}
              role={mobileFiltersModal ? "dialog" : "region"}
              aria-modal={mobileFiltersModal || undefined}
              aria-label="Filters"
            >
              <header className="discover-filter-sheet__header">
                <div><h3>Filters</h3>{selectedFilterValueCount > 0 && <span>{selectedFilterValueCount} selected</span>}</div>
                <button ref={filtersCloseRef} type="button" aria-label="Close filters" onClick={() => {
                  setOpenFilter(null);
                  setSecondaryFiltersOpen(false);
                  filtersToggleRef.current?.focus();
                }}><X aria-hidden="true" /></button>
              </header>

              <MultiSelectPopover
                className="filter-control--role"
                label="Role type"
                summary={selectedSummary(selectedAudiences, roleTypeOptions, "All roles", "Role types")}
                options={roleTypeOptions}
                selected={selectedAudiences}
                onChange={setSelectedAudiences}
                open={openFilter === "role"}
                onOpenChange={(nextOpen) => setOpenFilter(nextOpen ? "role" : null)}
              />
              <MultiSelectPopover
                className="filter-control--area"
                label="Technical areas"
                summary={selectedSummary(selectedCategories, categoryOptions, "All areas", "Areas")}
                options={categoryOptions}
                selected={selectedCategories}
                onChange={setSelectedCategories}
                open={openFilter === "area"}
                onOpenChange={(nextOpen) => setOpenFilter(nextOpen ? "area" : null)}
                searchable
                searchPlaceholder="Search technical areas…"
              />
              <MultiSelectPopover
                className="filter-control--location filter-control--secondary"
                label="Locations"
                summary={selectedSummary(selectedLocations, locationOptions, "Anywhere", "Locations")}
                options={locationOptions}
                selected={selectedLocations}
                onChange={setSelectedLocations}
                open={openFilter === "location"}
                onOpenChange={(nextOpen) => setOpenFilter(nextOpen ? "location" : null)}
                searchable
                searchPlaceholder="Search locations…"
                align="end"
              />
              <MultiSelectPopover
                className="filter-control--style filter-control--secondary"
                label="Work style"
                summary={workStyleSummary(selectedArrangements)}
                options={arrangementOptions}
                selected={selectedArrangements}
                onChange={setSelectedArrangements}
                open={openFilter === "style"}
                onOpenChange={(nextOpen) => setOpenFilter(nextOpen ? "style" : null)}
                align="end"
              />
              <button
                type="button"
                className={clsx("filter-trigger", "following-filter-trigger", "filter-control--secondary", followedOnly && "is-active")}
                aria-pressed={followedOnly}
                onClick={() => setFollowedOnly((active) => !active)}
              >
                {followedOnly && <Check aria-hidden="true" />}
                <span className="filter-trigger__label">Following only</span>
              </button>
            </div>

            <button
              ref={filtersToggleRef}
              type="button"
              className={clsx("discover-toolbar__filter-toggle", secondaryFiltersOpen && "is-open")}
              aria-expanded={secondaryFiltersOpen}
              aria-controls="discover-secondary-filters"
              onClick={() => {
                setOpenFilter(null);
                setSecondaryFiltersOpen((open) => {
                  const nextOpen = !open;
                  if (nextOpen && window.matchMedia("(max-width: 620px)").matches) {
                    queueMicrotask(() => filtersCloseRef.current?.focus());
                  }
                  return nextOpen;
                });
              }}
            >
              <Filter aria-hidden="true" />
              <span>Filters</span>
              {selectedFilterValueCount > 0 && <strong aria-label={`${selectedFilterValueCount} filter values active`}>{selectedFilterValueCount}</strong>}
            </button>

            {hasFacetFilters && (
              <div className="discover-active-filters" aria-label="Active filters">
                {activeFilterChips.map((chip) => (
                  <button type="button" className="filter-chip" aria-label={chip.removeLabel} key={chip.key} onClick={chip.onRemove}>
                    <span>{chip.label}</span><X aria-hidden="true" />
                  </button>
                ))}
                <button type="button" className="filter-clear" onClick={clearFacetFilters}>Clear all</button>
              </div>
            )}
          </form>

          <div className="discover-results" aria-live="polite">
            <div className="discover-results__summary">
              <span>
                <strong>{visibleJobs.length}</strong> {hasActiveCriteria
                  ? visibleJobs.length === 1 ? "matching role" : "matching roles"
                  : visibleJobs.length === 1 ? "role" : "roles"}
                {sort === "recommended" && preferences && <small> ordered for you</small>}
              </span>
              <small className="discover-feed__context">
                <ShieldCheck aria-hidden="true" /> Continuously checked official sources
              </small>
            </div>
            <div className="discover-results__actions">
              <SingleSelectPopover
                label="Sort roles"
                options={sortOptions}
                value={sort}
                onChange={setSort}
                open={openFilter === "sort"}
                onOpenChange={(nextOpen) => setOpenFilter(nextOpen ? "sort" : null)}
                triggerPrefix="Sort"
                className="discover-sort"
              />
            </div>
          </div>

          {visibleJobs.length ? (
            <ul className="discover-opportunity-list" aria-label="Monitored active roles">
              {visibleJobs.map((job) => {
                const company = companiesById.get(job.companyId) ?? job.company;
                const newForUser = isNewSinceVisit(job, preferences ?? fallbackPreferences, now);
                const companySelected = selectedCompany?.id === company.id;
                const rawCompensation = compensationLabel(job.compensation);
                const compensation = rawCompensation === "Not listed" ? "Compensation not listed" : rawCompensation;
                const compensationType = compensationTypeLabel(job.compensation);
                const publishedAt = sourcePublicationDate(job);
                const matchReasons = sort === "recommended" && preferences
                  ? preferenceReasons(job, preferences)
                  : [];
                return (
                  <li
                    key={job.id}
                    className={clsx(
                      "product-row",
                      "discover-role",
                      "opportunity-row",
                      selectedJobId === job.id && "discover-role--selected",
                      companySelected && "discover-role--company-selected",
                      newForUser && "discover-role--fresh",
                    )}
                    data-company={company.slug}
                    data-company-selected={companySelected ? "true" : undefined}
                    aria-current={selectedJobId === job.id ? "true" : undefined}
                    style={companyThemeStyle(company)}
                    onClick={(event) => {
                      if (!isInteractiveRowTarget(event.target)) showJob(job);
                    }}
                  >
                    <div className="product-row__identity discover-role__identity opportunity-row__identity">
                      <button
                        type="button"
                        className="product-row__logo discover-role__logo-action"
                        onClick={() => showCompany(company.id)}
                        aria-label={`Open ${company.name} details`}
                      >
                        <CompanyLogo
                          className="company-logo--direct"
                          src={company.logoUrl}
                          name={company.name}
                          initials={company.initials}
                          size="md"
                        />
                      </button>
                      <div className="discover-role__copy">
                        <div className="discover-role__title-line">
                          <button type="button" className="discover-role__title" onClick={() => showJob(job)}>
                            {job.title}
                          </button>
                          {newForUser && (
                            <span className="discover-role__fresh-label">
                              {preferences?.lastVisitAt ? "New for you" : "New"}
                            </span>
                          )}
                        </div>
                        <div className="discover-role__metadata">
                          <button
                            type="button"
                            className="discover-role__company-name"
                            onClick={() => showCompany(company.id)}
                          >
                            {company.name}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span>{audienceLabel(job.audience)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{CATEGORY_LABELS[job.technicalCategory]}</span>
                        </div>
                        <div className="discover-role__location">
                          <MapPin aria-hidden="true" />
                          <span>{job.locationText}</span>
                          <span aria-hidden="true">·</span>
                          <span>{WORK_ARRANGEMENT_LABELS[job.workArrangement]}</span>
                        </div>
                        {matchReasons.length > 0 && (
                          <div className="discover-role__match" aria-label={`Why ${job.title} matches your preferences`}>
                            <Sparkles aria-hidden="true" />
                            <span>{matchReasons.join(" · ")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="discover-role__compensation opportunity-row__compensation">
                      <strong>{compensation}</strong>
                      {compensationType
                        ? <small>{compensationType}</small>
                        : job.compensation.isEstimate && (
                          <small>{job.compensation.source === "historical" ? "Historical estimate" : "Estimate"}</small>
                        )}
                    </div>

                    <div className="discover-role__timing opportunity-row__timing">
                      <strong>
                        {publishedAt
                          ? `Posted ${fullDate(publishedAt)}`
                          : `Found ${dateTime(job.firstSeenAt)}`}
                      </strong>
                      <small>
                        {publishedAt
                          ? `Found ${dateTime(job.firstSeenAt)} · Checked ${relativeTime(job.lastSourceCheckAt, now)}`
                          : `Checked ${relativeTime(job.lastSourceCheckAt, now)}`}
                      </small>
                    </div>

                    <div className="discover-role__actions opportunity-row__actions">
                      <button
                        type="button"
                        className={clsx("discover-role__save", job.userState.saved && "is-saved")}
                        aria-pressed={job.userState.saved}
                        aria-label={job.userState.saved ? `Remove ${job.title} from saved roles` : `Save ${job.title}`}
                        onClick={() => void updateJobState(job.id, {
                          saved: !job.userState.saved,
                          stage: !job.userState.saved
                            ? job.userState.stage ?? "saved"
                            : job.userState.stage === "saved" ? null : job.userState.stage,
                        }).catch(() => undefined)}
                      >
                        {job.userState.saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                        <span>{job.userState.saved ? "Saved" : "Save"}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title={hasActiveCriteria ? "No roles match these filters" : "No active monitored roles right now"}
              body={hasActiveCriteria
                ? "Try a broader search or clear the filters."
                : "Follow companies in Watch and keep alerts on for the next opening."}
              action={hasActiveCriteria ? <Button variant="secondary" onClick={resetAllCriteria}>Clear filters</Button> : undefined}
            />
          )}
        </section>
      </section>

      <OpportunityInspector
        job={selectedJob}
        company={activeCompany}
        onClose={closeInspector}
        onSelectJob={showJob}
        onSelectCompany={showCompany}
      />
    </div>
  );
}
