import { Bell, BriefcaseBusiness, Building2, Check, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { clsx } from "clsx";
import type { CompanySummary, Job, NotificationFrequency, WatchlistGroup } from "../../shared/domain";
import { companyThemeStyle } from "../companyTheme";
import { OpportunityInspector } from "../components/OpportunityInspector";
import { Button, CompanyLogo, EmptyState } from "../components/ui";
import { useData } from "../DataContext";
import { relativeTime } from "../format";

interface CompanyActivity {
  activeJobs: Job[];
  latestJob: Job | null;
  newJobs: number;
}

const alertOptions: Array<{ value: NotificationFrequency; label: string }> = [
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily digest" },
  { value: "off", label: "Off" },
];

function activityTimestamp(job: Job): number {
  return new Date(job.firstSeenAt).getTime();
}

function CompanyIdentity({ company }: { company: CompanySummary }) {
  return (
    <span className="watch-company__identity product-row__identity">
      <span className="product-row__logo">
        <CompanyLogo src={company.logoUrl} name={company.name} initials={company.initials} size="lg" />
      </span>
      <span>
        <strong>{company.name}</strong>
        <small>{company.domain}</small>
      </span>
    </span>
  );
}

function OpeningSummary({ activity }: { activity: CompanyActivity }) {
  const count = activity.activeJobs.length;
  return (
    <span className="watch-company__activity">
      <BriefcaseBusiness aria-hidden="true" />
      <span>
        <span className="watch-company__activity-line">
          <strong>{count} current {count === 1 ? "opening" : "openings"}</strong>
          {activity.newJobs > 0 && (
            <span className="watch-company__new">
              {activity.newJobs} new
            </span>
          )}
        </span>
        <small>
          {activity.latestJob
            ? `Found ${relativeTime(activity.latestJob.firstSeenAt)} · ${activity.latestJob.title}`
            : "No relevant openings observed yet"}
        </small>
      </span>
    </span>
  );
}

export function WatchPage() {
  const {
    data,
    followCompany,
    companyAlertPreference,
    setCompanyAlertPreference,
    mutationError,
  } = useData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const selectedCompanyId = searchParams.get("company");
  const selectedJobId = searchParams.get("job");

  const companies = useMemo(() => data?.companies ?? [], [data?.companies]);
  const enabledSourceIds = useMemo(
    () => new Set((data?.sources ?? []).filter((source) => source.enabled).map((source) => source.id)),
    [data?.sources],
  );
  const jobs = useMemo(
    () => (data?.jobs ?? []).filter((job) => enabledSourceIds.has(job.sourceId)),
    [data?.jobs, enabledSourceIds],
  );
  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const lastVisitAt = data?.preferences.lastVisitAt
    ? new Date(data.preferences.lastVisitAt).getTime()
    : null;

  const activityByCompany = useMemo(() => {
    const map = new Map<string, CompanyActivity>();
    for (const company of companies) map.set(company.id, { activeJobs: [], latestJob: null, newJobs: 0 });
    for (const job of jobs) {
      const activity = map.get(job.companyId) ?? { activeJobs: [], latestJob: null, newJobs: 0 };
      if (job.availability === "active") {
        activity.activeJobs.push(job);
        if (lastVisitAt !== null && new Date(job.firstSeenAt).getTime() > lastVisitAt) activity.newJobs += 1;
      }
      if (!activity.latestJob || activityTimestamp(job) > activityTimestamp(activity.latestJob)) {
        activity.latestJob = job;
      }
      map.set(job.companyId, activity);
    }
    return map;
  }, [companies, jobs, lastVisitAt]);

  const rankedCompanies = useMemo(() => [...companies].sort((left, right) => {
    const openingDelta = (activityByCompany.get(right.id)?.activeJobs.length ?? 0) -
      (activityByCompany.get(left.id)?.activeJobs.length ?? 0);
    if (openingDelta) return openingDelta;
    const rightActivity = activityByCompany.get(right.id)?.latestJob;
    const leftActivity = activityByCompany.get(left.id)?.latestJob;
    const recencyDelta = (rightActivity ? activityTimestamp(rightActivity) : 0) -
      (leftActivity ? activityTimestamp(leftActivity) : 0);
    if (recencyDelta) return recencyDelta;
    return left.priorityTier - right.priorityTier || left.name.localeCompare(right.name);
  }), [activityByCompany, companies]);

  const browseGroups = useMemo<WatchlistGroup[]>(() => {
    const findGroup = (name: string) => groups.find((group) => group.name.toLowerCase() === name.toLowerCase());
    const curated = [
      ["Quant / Trading", "Quant"],
      ["Big Tech", "Big Tech"],
      ["AI / Infra / Research", "AI / Infra"],
      ["Fintech", "Fintech"],
      ["$200k+ New Grad", "High Pay"],
      ["Top Internships", "Top Internships"],
    ].flatMap(([sourceName, displayName]) => {
      const group = findGroup(sourceName);
      return group ? [{ ...group, name: displayName }] : [];
    });
    return [{
      id: "all-companies",
      name: "All",
      description: "All companies",
      compensationSignal: false,
      companyIds: companies.map((company) => company.id),
    }, ...curated];
  }, [companies, groups]);
  const followedCompanies = rankedCompanies.filter((company) => company.followed);
  const suggestions = rankedCompanies.filter((company) => !company.followed).slice(0, 4);
  const selectedCollection = browseGroups.find((group) => group.id === selectedCollectionId) ?? browseGroups[0] ?? null;
  const collectionIds = new Set(selectedCollection?.companyIds ?? []);
  const collectionCompanies = rankedCompanies.filter((company) => collectionIds.has(company.id));
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId) ?? null;
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;

  function setSelectedCompanyId(companyId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (companyId) next.set("company", companyId);
    else next.delete("company");
    next.delete("job");
    setSearchParams(next, { replace: true });
  }

  function selectCompanyFromRole(companyId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("company", companyId);
    next.delete("job");
    setSearchParams(next, { replace: true });
  }

  function selectJobFromCompany(job: Job) {
    const next = new URLSearchParams(searchParams);
    next.set("job", job.id);
    next.delete("company");
    setSearchParams(next, { replace: true });
  }

  function closeInspector() {
    const next = new URLSearchParams(searchParams);
    next.delete("company");
    next.delete("job");
    setSearchParams(next, { replace: true });
  }

  async function toggleFollowing(company: CompanySummary) {
    setPendingFollowId(company.id);
    const alertPreference = companyAlertPreference(company.id);
    if (company.followed && alertPreference !== "off") setPendingAlertId(company.id);
    try {
      if (company.followed && alertPreference !== "off") {
        await setCompanyAlertPreference(company.id, "off");
      }
      await followCompany(company.id, !company.followed);
    } catch {
      // DataContext keeps the optimistic state and error message consistent.
    } finally {
      setPendingFollowId(null);
      setPendingAlertId(null);
    }
  }

  async function updateCompanyAlert(companyId: string, frequency: NotificationFrequency) {
    setPendingAlertId(companyId);
    try {
      await setCompanyAlertPreference(companyId, frequency);
    } catch {
      // The shared mutation error is displayed above the company list.
    } finally {
      setPendingAlertId(null);
    }
  }

  return (
    <div className={clsx("workspace page-pad watch-page", (selectedCompany || selectedJob) && "watch-page--inspector")}>
      <header className="watch-page__header">
        <div>
          <h2>Following</h2>
          <p>Company openings and alert settings in one place.</p>
        </div>
        <span className="watch-page__count"><Check aria-hidden="true" /> {followedCompanies.length} following</span>
      </header>

      {mutationError && <p className="watch-page__error" role="alert">{mutationError}</p>}

      <section className="watch-following" aria-labelledby="watch-following-heading">
        <header className="watch-section-heading">
          <div>
            <Check aria-hidden="true" />
            <div>
              <h3 id="watch-following-heading">Following</h3>
            </div>
          </div>
          <strong>{followedCompanies.length}</strong>
        </header>

        {followedCompanies.length ? (
          <div className="watch-company-list" aria-label="Companies you follow">
            {followedCompanies.map((company) => {
              const activity = activityByCompany.get(company.id) ?? { activeJobs: [], latestJob: null, newJobs: 0 };
              const preference = companyAlertPreference(company.id);
              return (
                <article
                  className={clsx(
                    "watch-company watch-company--premium product-row",
                    selectedCompanyId === company.id && "watch-company--selected is-selected",
                  )}
                  data-company-id={company.id}
                  style={companyThemeStyle(company)}
                  key={company.id}
                >
                  <button
                    type="button"
                    className="watch-company__primary"
                    aria-label={`Open ${company.name} details`}
                    onClick={() => setSelectedCompanyId(company.id)}
                  >
                    <CompanyIdentity company={company} />
                    <OpeningSummary activity={activity} />
                    <ChevronRight className="watch-company__chevron" aria-hidden="true" />
                  </button>
                  <div className="watch-company__controls">
                    <label className="watch-company__alert-select">
                      <Bell aria-hidden="true" />
                      <span className="sr-only">Alert frequency for {company.name}</span>
                      <select
                        value={preference}
                        disabled={pendingAlertId === company.id}
                        onChange={(event) => void updateCompanyAlert(company.id, event.target.value as NotificationFrequency)}
                      >
                        {alertOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <Button
                      className="watch-company__unfollow"
                      size="sm"
                      variant="quiet"
                      loading={pendingFollowId === company.id}
                      onClick={() => void toggleFollowing(company)}
                    >
                      Unfollow
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="watch-following__empty">
            <EmptyState
              title="Choose a few companies to follow"
              body="You’ll see their current openings and control alerts here. Start with one of these curated employers."
              compact
            />
            <div className="watch-suggestions" aria-label="Suggested companies">
              {suggestions.map((company) => (
                <article
                  className={clsx("watch-suggestion product-row", selectedCompanyId === company.id && "is-company-selected")}
                  style={companyThemeStyle(company)}
                  key={company.id}
                >
                  <button type="button" className="watch-suggestion__identity" onClick={() => setSelectedCompanyId(company.id)}>
                    <CompanyLogo src={company.logoUrl} name={company.name} initials={company.initials} size="md" />
                    <span><strong>{company.name}</strong><small>{activityByCompany.get(company.id)?.activeJobs.length ?? 0} current openings</small></span>
                  </button>
                  <Button
                    className="follow-action"
                    size="sm"
                    variant="secondary"
                    loading={pendingFollowId === company.id}
                    onClick={() => void toggleFollowing(company)}
                  >
                    <Plus aria-hidden="true" /> Follow
                  </Button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="watch-browse" aria-labelledby="watch-browse-heading">
        <header className="watch-section-heading watch-section-heading--compact">
          <div>
            <Building2 aria-hidden="true" />
            <div>
              <h3 id="watch-browse-heading">Browse companies</h3>
            </div>
          </div>
        </header>

        {browseGroups.length > 0 ? (
          <>
            <div className="watch-browse__filters" role="group" aria-label="Company browse filters">
              {browseGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={clsx(selectedCollection?.id === group.id && "is-active")}
                  aria-pressed={selectedCollection?.id === group.id}
                  onClick={() => setSelectedCollectionId(group.id)}
                >
                  {group.name}
                  <span>{group.companyIds.length}</span>
                </button>
              ))}
            </div>

            {selectedCollection && (
              <div className="watch-browse__selection">
                <header className="watch-browse__selection-header">
                  <div>
                    <strong>{selectedCollection.name}</strong>
                  </div>
                  <span>{collectionCompanies.length} companies</span>
                </header>
                <div className="watch-browse__companies" aria-label={`${selectedCollection.name} companies`}>
                  {collectionCompanies.map((company) => {
                    const activity = activityByCompany.get(company.id) ?? { activeJobs: [], latestJob: null, newJobs: 0 };
                    return (
                      <article
                        className={clsx("watch-browse-company product-row", selectedCompanyId === company.id && "is-company-selected")}
                        style={companyThemeStyle(company)}
                        key={company.id}
                      >
                        <button
                          type="button"
                          className="watch-browse-company__open"
                          aria-label={`Open ${company.name} details`}
                          onClick={() => setSelectedCompanyId(company.id)}
                        >
                          <CompanyIdentity company={company} />
                          <span className="watch-browse-company__activity">
                            {activity.activeJobs.length} current {activity.activeJobs.length === 1 ? "opening" : "openings"}
                            {activity.newJobs > 0 && <small>{activity.newJobs} new</small>}
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </button>
                        <Button
                          className={clsx("watch-browse-company__follow", "follow-action", company.followed && "is-following")}
                          size="sm"
                          variant={company.followed ? "quiet" : "secondary"}
                          loading={pendingFollowId === company.id}
                          onClick={() => void toggleFollowing(company)}
                        >
                          {company.followed ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                          {company.followed ? "Following" : "Follow"}
                        </Button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="watch-browse__suggestions">
            <EmptyState title="No companies in this filter yet" body="Try another company filter or follow one of the suggested employers." compact />
            <div className="watch-suggestions" aria-label="Suggested companies">
              {suggestions.map((company) => (
                <article
                  className={clsx("watch-suggestion product-row", selectedCompanyId === company.id && "is-company-selected")}
                  style={companyThemeStyle(company)}
                  key={company.id}
                >
                  <button type="button" className="watch-suggestion__identity" onClick={() => setSelectedCompanyId(company.id)}>
                    <CompanyLogo src={company.logoUrl} name={company.name} initials={company.initials} size="md" />
                    <span><strong>{company.name}</strong><small>{activityByCompany.get(company.id)?.activeJobs.length ?? 0} current openings</small></span>
                  </button>
                  <Button className="follow-action" size="sm" variant="secondary" loading={pendingFollowId === company.id} onClick={() => void toggleFollowing(company)}>
                    <Plus aria-hidden="true" /> Follow
                  </Button>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <OpportunityInspector
        job={selectedJob}
        company={selectedCompany}
        onClose={closeInspector}
        onSelectJob={selectJobFromCompany}
        onSelectCompany={selectCompanyFromRole}
      />
    </div>
  );
}
