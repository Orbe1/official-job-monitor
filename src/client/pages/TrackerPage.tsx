import {
  Archive,
  Bookmark,
  ChevronRight,
  CircleCheck,
  Search,
  Send,
} from "lucide-react";
import { clsx } from "clsx";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Job } from "../../shared/domain";
import { APPLICATION_STAGE_LABELS } from "../../shared/constants";
import { useData } from "../DataContext";
import { companyThemeStyle } from "../companyTheme";
import { fullDate } from "../format";
import { OpportunityInspector } from "../components/OpportunityInspector";
import { Button, CompanyLogo, EmptyState } from "../components/ui";

type MyRoleState = "saved" | "applied" | "archived";
type MyRoleFilter = "all" | "open" | "closed";

const stateTabs = [
  { value: "saved", label: "Saved", icon: Bookmark },
  { value: "applied", label: "Applied", icon: Send },
  { value: "archived", label: "Archived", icon: Archive },
] as const;

const roleFilters: Array<{ value: MyRoleFilter; label: string }> = [
  { value: "all", label: "All postings" },
  { value: "open", label: "Posting open" },
  { value: "closed", label: "Posting closed" },
];

function isTracked(job: Job): boolean {
  const state = job.userState;
  return Boolean(
    state.saved
    || state.stage
    || state.notes.trim()
    || state.appliedAt
    || state.nextActionAt,
  );
}

function getRoleState(job: Job): MyRoleState {
  const { stage, appliedAt } = job.userState;
  if (stage === "rejected" || stage === "withdrawn") return "archived";
  if ((stage && stage !== "saved") || appliedAt) return "applied";
  return "saved";
}

function getRoleDate(job: Job, state: MyRoleState): string {
  if (state === "applied") {
    return job.userState.appliedAt ?? job.userState.updatedAt ?? job.firstSeenAt;
  }
  if (state === "archived") {
    return job.userState.updatedAt ?? job.userState.appliedAt ?? job.firstSeenAt;
  }
  return job.userState.updatedAt ?? job.firstSeenAt;
}

function getPostingStatus(job: Job): { label: string; className: string } {
  if (job.availability === "closed") {
    return { label: "Posting closed", className: "is-closed" };
  }
  if (job.availability === "closure_pending") {
    return { label: "Checking availability", className: "is-unconfirmed" };
  }
  return { label: "Posting open", className: "is-open" };
}

function getRoleActivity(job: Job, state: MyRoleState, now = Date.now()): {
  label: string;
  date: string;
  urgency: "default" | "upcoming" | "due" | "overdue";
  status: "Overdue" | "Due today" | null;
} {
  const nextActionAt = state !== "archived" ? job.userState.nextActionAt : null;
  if (nextActionAt) {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const due = new Date(nextActionAt);
    due.setHours(0, 0, 0, 0);
    const urgency = due.getTime() < today.getTime()
      ? "overdue"
      : due.getTime() === today.getTime() ? "due" : "upcoming";
    return {
      label: "Next action",
      date: nextActionAt,
      urgency,
      status: urgency === "overdue" ? "Overdue" : urgency === "due" ? "Due today" : null,
    };
  }
  return {
    label: state === "saved" ? "Saved" : state === "applied" ? "Applied" : "Updated",
    date: getRoleDate(job, state),
    urgency: "default",
    status: null,
  };
}

export function TrackerPage() {
  const { data } = useData();
  const [activeTab, setActiveTab] = useState<MyRoleState>("saved");
  const [filter, setFilter] = useState<MyRoleFilter>("all");
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("job");
  const selectedCompanyId = searchParams.get("company");

  const tracked = useMemo(
    () => (data?.jobs ?? []).filter(isTracked),
    [data?.jobs],
  );

  const stateCounts = useMemo(() => ({
    saved: tracked.filter((job) => getRoleState(job) === "saved").length,
    applied: tracked.filter((job) => getRoleState(job) === "applied").length,
    archived: tracked.filter((job) => getRoleState(job) === "archived").length,
  }), [tracked]);

  const visible = useMemo(() => {
    const selectedState = activeTab;
    const needle = query.trim().toLowerCase();

    return tracked
      .filter((job) => getRoleState(job) === selectedState)
      .filter((job) => filter !== "open" || job.availability === "active")
      .filter((job) => filter !== "closed" || job.availability === "closed")
      .filter((job) => !needle || `${job.title} ${job.company.name} ${job.locationText}`.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (selectedState === "applied") {
          const leftNext = left.userState.nextActionAt;
          const rightNext = right.userState.nextActionAt;
          if (leftNext && rightNext) return new Date(leftNext).getTime() - new Date(rightNext).getTime();
          if (leftNext) return -1;
          if (rightNext) return 1;
        }
        const leftDate = getRoleDate(left, getRoleState(left));
        const rightDate = getRoleDate(right, getRoleState(right));
        return new Date(rightDate).getTime() - new Date(leftDate).getTime();
      });
  }, [activeTab, filter, query, tracked]);

  const selectedJob = data?.jobs.find((job) => job.id === selectedId) ?? null;
  const selectedCompany = data?.companies.find((company) => company.id === selectedCompanyId) ?? null;

  const selectJob = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set("job", id);
      next.delete("company");
    } else {
      next.delete("job");
    }
    setSearchParams(next, { replace: true });
  };

  const selectCompanyFromRole = (companyId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("company", companyId);
    next.delete("job");
    setSearchParams(next, { replace: true });
  };

  const selectJobFromCompany = (nextJob: Job) => {
    const next = new URLSearchParams(searchParams);
    next.set("job", nextJob.id);
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  const closeInspector = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("job");
    next.delete("company");
    setSearchParams(next, { replace: true });
  };

  const changeTab = (state: MyRoleState) => {
    setActiveTab(state);
    setFilter("all");
  };

  const changeFilter = (nextFilter: MyRoleFilter) => setFilter(nextFilter);

  const resetCriteria = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <div className={clsx(
      "tracker-page my-roles-page",
      (selectedJob || selectedCompany) && "tracker-page--inspector",
    )}>
      <section className="my-roles-main" aria-labelledby="my-roles-title">
        <div className="my-roles-main__inner">
          <header className="my-roles-header">
            <h2 id="my-roles-title">My Roles</h2>
            <p>Roles you saved or applied to, without the busywork.</p>
          </header>

          <div
            className="my-roles-tabs"
            role="tablist"
            aria-label="My role states"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const currentIndex = stateTabs.findIndex((tab) => tab.value === activeTab);
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? stateTabs.length - 1
                  : event.key === "ArrowRight"
                    ? (currentIndex + 1) % stateTabs.length
                    : (currentIndex - 1 + stateTabs.length) % stateTabs.length;
              const nextState = stateTabs[nextIndex].value;
              changeTab(nextState);
              queueMicrotask(() => document.getElementById(`my-roles-tab-${nextState}`)?.focus());
            }}
          >
            {stateTabs.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                id={`my-roles-tab-${value}`}
                type="button"
                role="tab"
                aria-label={`${label}, ${stateCounts[value]} ${stateCounts[value] === 1 ? "role" : "roles"}`}
                aria-selected={activeTab === value}
                aria-controls="my-roles-results"
                tabIndex={activeTab === value ? 0 : -1}
                className={activeTab === value ? "is-active" : ""}
                onClick={() => changeTab(value)}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
                <strong>{stateCounts[value]}</strong>
              </button>
            ))}
          </div>

          <label className="my-roles-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search my roles</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search roles, companies, or locations..."
            />
          </label>

          <nav className="my-roles-filters" aria-label="My Roles filters">
            {roleFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "is-active" : ""}
                aria-pressed={filter === value}
                onClick={() => changeFilter(value)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div
            id="my-roles-results"
            className="my-roles-results"
            role="tabpanel"
            aria-labelledby={`my-roles-tab-${activeTab}`}
          >
            {visible.length ? (
              <>
                <div className="my-roles-list__head" aria-hidden="true">
                  <span>Role</span>
                  <span>Status</span>
                  <span>Activity</span>
                  <span>Posting status</span>
                  <span>Actions</span>
                </div>
                <ul className="my-roles-list" aria-label={`${activeTab} roles`}>
                  {visible.map((job) => {
                    const state = getRoleState(job);
                    const posting = getPostingStatus(job);
                    const activity = getRoleActivity(job, state);
                    const StatusIcon = state === "saved" ? Bookmark : state === "applied" ? CircleCheck : Archive;
                    const stateLabel = job.userState.stage
                      ? APPLICATION_STAGE_LABELS[job.userState.stage]
                      : state === "saved" ? "Saved" : state === "applied" ? "Applied" : "Archived";

                    return (
                      <li key={job.id} style={companyThemeStyle(job.company)}>
                        <button
                          type="button"
                          className={clsx(
                            "my-role-row",
                            selectedId === job.id && "is-selected",
                          )}
                          onClick={() => selectJob(job.id)}
                        >
                          <span className="my-role-row__identity">
                            <span className="my-role-row__logo">
                              <CompanyLogo
                                src={job.company.logoUrl}
                                name={job.company.name}
                                initials={job.company.initials}
                                size="md"
                              />
                            </span>
                            <span className="my-role-row__copy">
                              <strong>{job.title}</strong>
                              <small>{job.company.name}<i aria-hidden="true">·</i>{job.locationText}</small>
                            </span>
                          </span>

                          <span className={clsx("my-role-row__state", `is-${state}`)}>
                            <StatusIcon aria-hidden="true" />
                            {stateLabel}
                          </span>

                          <span className={clsx("my-role-row__date", `is-${activity.urgency}`)}>
                            <small>{activity.label}</small>
                            <span>
                              <time dateTime={activity.date}>{fullDate(activity.date)}</time>
                              {activity.status && <em>{activity.status}</em>}
                            </span>
                          </span>

                          <span className={clsx("my-role-row__posting", posting.className)}>
                            <i aria-hidden="true" />
                            {posting.label}
                          </span>

                          <span className="my-role-row__action">
                            <span>View</span>
                            <ChevronRight aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState
                title={!tracked.length ? "Your roles will live here" : query.trim() || filter !== "all" ? "No roles match this view" : `No ${activeTab} roles yet`}
                body={!tracked.length
                  ? "Save a role from Discover and it will stay here, even if the original posting closes."
                  : query.trim() || filter !== "all"
                    ? "Clear the search and posting filter to see this whole list."
                    : activeTab === "applied" ? "When you record an application, it will appear here with its next action." : `Your ${activeTab} roles will appear here.`}
                action={!tracked.length
                  ? <Link className="button button--secondary button--md" to="/discover">Discover roles</Link>
                  : query.trim() || filter !== "all" ? <Button variant="secondary" onClick={resetCriteria}>Clear search and filter</Button> : undefined}
              />
            )}
          </div>
        </div>
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
