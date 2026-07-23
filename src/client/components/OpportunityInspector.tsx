import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Bookmark,
  BookmarkCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Globe2,
  GraduationCap,
  IdCard,
  ListChecks,
  LockKeyhole,
  MapPin,
  Pencil,
  Plus,
  Radio,
  Save,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { clsx } from "clsx";
import { useMemo, useState } from "react";
import type {
  ApplicationStage,
  CompanySummary,
  HistoricalOpening,
  Job,
  NotificationFrequency,
} from "../../shared/domain";
import {
  APPLICATION_STAGE_LABELS,
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  WORK_ARRANGEMENT_LABELS,
} from "../../shared/constants";
import { companyThemeStyle } from "../companyTheme";
import { useData } from "../DataContext";
import {
  compensationLabel,
  compensationTypeLabel,
  dateInput,
  dateTime,
  fullDate,
  relativeTime,
  sourcePublicationDate,
  toIsoOrNull,
} from "../format";
import { InspectorDrawer } from "./InspectorDrawer";
import { type FilterOption, SingleSelectPopover } from "./FilterPopover";
import { ObservedHiringSeason } from "./ObservedHiringSeason";
import { Button, CompanyLogo } from "./ui";

interface RoleDraft {
  jobId: string | null;
  stage: ApplicationStage | null;
  notes: string;
  appliedAt: string;
  nextActionAt: string;
}

export interface OpportunityInspectorProps {
  job: Job | null;
  company: CompanySummary | null;
  onClose: () => void;
  onSelectJob: (job: Job) => void;
  onSelectCompany: (companyId: string) => void;
}

const stages = Object.entries(APPLICATION_STAGE_LABELS) as Array<[ApplicationStage, string]>;

const alertFrequencyOptions: readonly FilterOption<NotificationFrequency>[] = [
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily digest" },
  { value: "off", label: "Off" },
];

function audienceLabel(audience: Job["audience"]): string {
  return audience === "ambiguous" ? "Early career" : AUDIENCE_LABELS[audience];
}

function estimateLabel(job: Job): string | null {
  const compensationType = compensationTypeLabel(job.compensation);
  if (compensationType) return compensationType;
  if (!job.compensation.isEstimate) return null;
  return job.compensation.source === "historical" ? "Historical estimate" : "Estimated range";
}

function cleanCompensation(job: Job): string {
  const label = compensationLabel(job.compensation);
  return label === "Not listed" ? "Compensation not listed" : label;
}

function roleDraftFor(job: Job | null): RoleDraft {
  return {
    jobId: job?.id ?? null,
    stage: job?.userState.stage ?? null,
    notes: job?.userState.notes ?? "",
    appliedAt: dateInput(job?.userState.appliedAt ?? null),
    nextActionAt: dateInput(job?.userState.nextActionAt ?? null),
  };
}

function careerAddress(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function availabilityMeta(availability: Job["availability"]): { label: string; className: string } {
  if (availability === "closed") return { label: "Posting closed", className: "is-closed" };
  if (availability === "closure_pending") return { label: "Checking availability", className: "is-pending" };
  return { label: "Posting available", className: "is-open" };
}

export function OpportunityInspector({
  job,
  company,
  onClose,
  onSelectJob,
  onSelectCompany,
}: OpportunityInspectorProps) {
  const {
    data,
    updateJobState,
    followCompany,
    companyAlertPreference,
    setCompanyAlertPreference,
    submitEmerging,
  } = useData();
  const mode = job ? "role" : "company";
  const selectedCompanyId = job?.companyId ?? company?.id ?? null;
  const selectedCompany = data?.companies.find((item) => item.id === selectedCompanyId)
    ?? (company?.id === selectedCompanyId ? company : null)
    ?? (job?.companyId === selectedCompanyId ? job.company : null);
  const open = Boolean(job || selectedCompany);
  const roleId = job?.id ?? null;

  const [storedRoleDraft, setStoredRoleDraft] = useState<RoleDraft>(() => roleDraftFor(job));
  const roleDraft = storedRoleDraft.jobId === roleId ? storedRoleDraft : roleDraftFor(job);
  const [trackerEditingRoleId, setTrackerEditingRoleId] = useState<string | null>(null);
  const trackerEditing = Boolean(job && trackerEditingRoleId === job.id);
  const [savingTracker, setSavingTracker] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [alertPending, setAlertPending] = useState(false);
  const [alertMenuCompanyId, setAlertMenuCompanyId] = useState<string | null>(null);
  const [monitoringRequestPending, setMonitoringRequestPending] = useState(false);
  const [requestedMonitoringCompanyId, setRequestedMonitoringCompanyId] = useState<string | null>(null);

  const companyJobs = useMemo(
    () => selectedCompany ? (data?.jobs ?? []).filter((item) => item.companyId === selectedCompany.id) : [],
    [data?.jobs, selectedCompany],
  );
  const enabledSourceIds = useMemo(
    () => new Set((data?.sources ?? []).filter((source) => source.enabled).map((source) => source.id)),
    [data?.sources],
  );
  const activeJobs = useMemo(
    () => companyJobs
      .filter((item) => item.availability === "active" && enabledSourceIds.has(item.sourceId))
      .sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()),
    [companyJobs, enabledSourceIds],
  );
  const allObservedOpenings = useMemo(() => {
    const unique = new Map<string, HistoricalOpening>();
    for (const item of companyJobs) {
      for (const opening of item.history) unique.set(opening.id, opening);
    }
    return [...unique.values()].sort(
      (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
    );
  }, [companyJobs]);
  const sources = selectedCompany?.monitoringMode === "continuous"
    ? (data?.sources ?? []).filter((source) => source.companyId === selectedCompany.id)
    : [];
  const primarySource = [...sources].sort((first, second) => {
    if (first.enabled !== second.enabled) return first.enabled ? -1 : 1;
    const firstTime = new Date(first.lastAttemptAt ?? first.lastSuccessAt ?? 0).getTime();
    const secondTime = new Date(second.lastAttemptAt ?? second.lastSuccessAt ?? 0).getTime();
    if (firstTime !== secondTime) return secondTime - firstTime;
    return first.displayName.localeCompare(second.displayName);
  })[0] ?? null;
  const lastCheckedAt = primarySource?.lastAttemptAt ?? null;
  const officialSourceUrl = primarySource?.officialUrl ?? selectedCompany?.careerUrl ?? "";
  const alertFrequency = selectedCompany ? companyAlertPreference(selectedCompany.id) : "off";
  const alertMenuOpen = Boolean(selectedCompany && alertMenuCompanyId === selectedCompany.id);
  const monitoringRequested = Boolean(selectedCompany && (
    requestedMonitoringCompanyId === selectedCompany.id ||
    (data?.emerging ?? []).some((candidate) =>
      candidate.reviewStatus !== "rejected" &&
      candidate.companyDomain.trim().toLocaleLowerCase() === selectedCompany.domain.trim().toLocaleLowerCase())
  ));
  const visibleActiveJobs = activeJobs.slice(0, 3);

  const openCompany = () => {
    if (!selectedCompany) return;
    setAlertMenuCompanyId(null);
    setTrackerEditingRoleId(null);
    setStoredRoleDraft(roleDraftFor(job));
    onSelectCompany(selectedCompany.id);
  };

  const openJob = (selectedJob: Job) => {
    setAlertMenuCompanyId(null);
    setTrackerEditingRoleId(null);
    setStoredRoleDraft(roleDraftFor(selectedJob));
    onSelectJob(selectedJob);
  };

  const updateStageDraft = (stageValue: string) => {
    if (!job) return;
    const stage = (stageValue || null) as ApplicationStage | null;
    setStoredRoleDraft({
      ...roleDraft,
      stage,
      appliedAt: stage && stage !== "saved" && !job.userState.appliedAt
        ? dateInput(new Date().toISOString())
        : roleDraft.appliedAt,
    });
  };

  const saveTrackerDetails = async () => {
    if (!job) return;
    setSavingTracker(true);
    try {
      await updateJobState(job.id, {
        stage: roleDraft.stage,
        saved: roleDraft.stage ? true : job.userState.saved,
        notes: roleDraft.notes.trim(),
        appliedAt: toIsoOrNull(roleDraft.appliedAt),
        nextActionAt: toIsoOrNull(roleDraft.nextActionAt),
      });
      setTrackerEditingRoleId(null);
    } catch {
      // The shared mutation notice reports the failure and keeps the draft available.
    } finally {
      setSavingTracker(false);
    }
  };

  const toggleFollow = async () => {
    if (!selectedCompany) return;
    setFollowPending(true);
    setAlertPending(true);
    try {
      if (selectedCompany.followed && alertFrequency !== "off") {
        await setCompanyAlertPreference(selectedCompany.id, "off");
      }
      await followCompany(selectedCompany.id, !selectedCompany.followed);
    } catch {
      // The shared mutation notice reports the failure and restores prior state.
    } finally {
      setFollowPending(false);
      setAlertPending(false);
    }
  };

  const changeAlertFrequency = async (frequency: NotificationFrequency) => {
    if (!selectedCompany) return;
    setAlertPending(true);
    try {
      if (frequency !== "off" && !selectedCompany.followed) {
        await followCompany(selectedCompany.id, true);
      }
      await setCompanyAlertPreference(selectedCompany.id, frequency);
    } catch {
      // The shared mutation notice reports the failure and restores prior state.
    } finally {
      setAlertPending(false);
    }
  };

  const requestMonitoring = async () => {
    if (!selectedCompany || monitoringRequestPending || monitoringRequested) return;
    setMonitoringRequestPending(true);
    try {
      const request = await submitEmerging({
        companyName: selectedCompany.name,
        companyDomain: selectedCompany.domain,
        reason: `Please add ${selectedCompany.name} to continuous official-source monitoring.`,
        discoverySource: "Student request from the company inspector",
        officialUrl: selectedCompany.careerUrl,
      });
      if (request) setRequestedMonitoringCompanyId(selectedCompany.id);
    } catch {
      // The shared mutation notice reports the failure and leaves the request available.
    } finally {
      setMonitoringRequestPending(false);
    }
  };

  const closeInspector = () => {
    setAlertMenuCompanyId(null);
    setTrackerEditingRoleId(null);
    setStoredRoleDraft(roleDraftFor(job));
    onClose();
  };

  const roleHeader = job && selectedCompany ? (
    <button type="button" className="inspector-identity inspector-identity--role" onClick={openCompany}>
      <CompanyLogo
        className="inspector-identity__logo"
        src={selectedCompany.logoUrl}
        name={selectedCompany.name}
        initials={selectedCompany.initials}
        size="lg"
      />
      <span className="inspector-identity__copy">
        <strong>{selectedCompany.name}</strong>
        <small>
          {selectedCompany.monitoringMode === "continuous" ? <ShieldCheck aria-hidden="true" /> : <Radio aria-hidden="true" />}
          <span>{selectedCompany.monitoringMode === "continuous"
            ? `Official source · Checked ${relativeTime(job.lastSourceCheckAt)}`
            : `Discovery listing · Found ${relativeTime(job.firstSeenAt)}`}</span>
        </small>
      </span>
    </button>
  ) : null;

  const companyHeader = selectedCompany ? (
    <div className="inspector-identity inspector-identity--company">
      <CompanyLogo
        className="inspector-identity__logo inspector-identity__logo--company"
        src={selectedCompany.logoUrl}
        name={selectedCompany.name}
        initials={selectedCompany.initials}
        size="lg"
      />
      <span className="inspector-identity__copy">
        <strong className="company-inspector-header__name">{selectedCompany.name}</strong>
        <small>
          {selectedCompany.monitoringMode === "continuous" ? <ShieldCheck aria-hidden="true" /> : <Radio aria-hidden="true" />}
          <span>{selectedCompany.monitoringMode === "continuous"
            ? `Official source · ${lastCheckedAt ? `Checked ${relativeTime(lastCheckedAt)}` : "Check unavailable"}`
            : "Discovery listing · Not continuously monitored"}</span>
        </small>
      </span>
    </div>
  ) : null;

  const roleContent = job && selectedCompany ? (() => {
    const availability = availabilityMeta(job.availability);
    const publishedAt = sourcePublicationDate(job);
    const stageLabel = job.userState.stage
      ? APPLICATION_STAGE_LABELS[job.userState.stage]
      : job.userState.saved ? "Saved" : "Not tracking";
    const trackerContentId = `role-tracker-content-${job.id}`;
    const hasEligibilityDetails = Boolean(
      job.eligibility?.trim()
      || job.graduationRequirements?.trim()
      || job.workAuthorization?.trim(),
    );
    const hasRoleDetails = Boolean(
      job.description.trim()
      || job.responsibilities.length
      || job.requirements.length
      || job.preferredQualifications.length,
    );
    return (
      <>
        <section className={clsx(
          "role-overview",
          "inspector-section",
          "inspector-section--hero",
          job.title.trim().length > 40 && "role-overview--long-title",
          job.title.trim().length > 68 && "role-overview--very-long-title",
        )}>
          <h2>{job.title}</h2>
          <div className="role-overview__chips" aria-label="Role classification">
            <span>{audienceLabel(job.audience)}</span>
            <span>{CATEGORY_LABELS[job.technicalCategory]}</span>
          </div>
          <div className="role-overview__trust">
            <span className={clsx("posting-status", availability.className)}><i aria-hidden="true" />{availability.label}</span>
            <span aria-hidden="true" className="role-overview__divider" />
            <span>
              {selectedCompany.monitoringMode === "continuous"
                ? <><ShieldCheck aria-hidden="true" />Official source</>
                : <><Radio aria-hidden="true" />Discovery listing</>}
            </span>
          </div>

          <dl className="role-facts role-facts--divided">
            <div><dt><MapPin aria-hidden="true" /> Location</dt><dd>{job.locationText}</dd></div>
            <div><dt><BriefcaseBusiness aria-hidden="true" /> Work style</dt><dd>{WORK_ARRANGEMENT_LABELS[job.workArrangement]}</dd></div>
            <div>
              <dt><CircleDollarSign aria-hidden="true" /> Compensation</dt>
              <dd>{cleanCompensation(job)}{estimateLabel(job) && <small>{estimateLabel(job)}</small>}</dd>
            </div>
            <div>
              <dt><Clock3 aria-hidden="true" /> Timing</dt>
              <dd>
                {publishedAt
                  ? `Posted ${fullDate(publishedAt)}`
                  : `Found ${dateTime(job.firstSeenAt)}`}
                <small>
                  {publishedAt
                    ? `Found ${dateTime(job.firstSeenAt)} · ${selectedCompany.monitoringMode === "continuous" ? `Checked ${relativeTime(job.lastSourceCheckAt)}` : "Discovery listing"}`
                    : selectedCompany.monitoringMode === "continuous" ? `Checked ${relativeTime(job.lastSourceCheckAt)}` : "Discovery listing"}
                </small>
              </dd>
            </div>
          </dl>

          <div className="role-detail__actions">
            <a className="button button--primary button--md company-primary-action" href={job.applicationUrl} target="_blank" rel="noreferrer">
              Apply on official site <ArrowUpRight aria-hidden="true" />
            </a>
            <Button
              className={clsx("save-action", job.userState.saved && "is-saved")}
              variant="secondary"
              aria-pressed={job.userState.saved}
              onClick={() => void updateJobState(job.id, {
                saved: !job.userState.saved,
                stage: !job.userState.saved
                  ? job.userState.stage ?? "saved"
                  : job.userState.stage === "saved" ? null : job.userState.stage,
              }).catch(() => undefined)}
            >
              {job.userState.saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
              {job.userState.saved ? "Saved" : "Save"}
            </Button>
          </div>
        </section>

        <section
          className="role-fit inspector-section"
          aria-labelledby={`role-fit-heading-${job.id}`}
        >
          <header className="role-fit__header">
            <span className="role-fit__mark" aria-hidden="true"><BadgeCheck /></span>
            <div>
              <span className="section-kicker">BEFORE YOU APPLY</span>
              <h3 id={`role-fit-heading-${job.id}`}>Eligibility snapshot</h3>
            </div>
          </header>
          {hasEligibilityDetails ? (
            <dl className="role-fit__grid">
              {job.eligibility?.trim() && (
                <div>
                  <dt><BadgeCheck aria-hidden="true" /> Eligibility</dt>
                  <dd>{job.eligibility}</dd>
                </div>
              )}
              {job.graduationRequirements?.trim() && (
                <div>
                  <dt><GraduationCap aria-hidden="true" /> Graduation</dt>
                  <dd>{job.graduationRequirements}</dd>
                </div>
              )}
              {job.workAuthorization?.trim() && (
                <div>
                  <dt><IdCard aria-hidden="true" /> Work authorization</dt>
                  <dd>{job.workAuthorization}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="role-fit__empty">Eligibility details were not clearly listed.</p>
          )}
          <p className="role-fit__note"><ShieldCheck aria-hidden="true" /> Confirm the exact requirements on the employer’s official posting.</p>
        </section>

        <section
          className={clsx("role-tracker inspector-section", trackerEditing && "is-editing")}
          aria-labelledby={`role-tracker-heading-${job.id}`}
        >
          <header className="role-tracker__header">
            {trackerEditing ? (
              <div className="role-tracker__editing-heading">
                <span className="role-tracker__editing-icon"><TrendingUp aria-hidden="true" /></span>
                <h3 id={`role-tracker-heading-${job.id}`}>Application tracker</h3>
              </div>
            ) : (
              <div><span className="section-kicker">YOUR WORKSPACE</span><h3 id={`role-tracker-heading-${job.id}`}>Application tracker</h3></div>
            )}
            {!trackerEditing && (
              <button
                type="button"
                className="role-tracker__edit"
                aria-expanded="false"
                aria-controls={trackerContentId}
                onClick={() => setTrackerEditingRoleId(job.id)}
              >
                <Pencil aria-hidden="true" /> Edit
              </button>
            )}
          </header>

          {!trackerEditing ? (
            <div id={trackerContentId} className="role-tracker__summary" role="group" aria-label="Application tracker summary">
              <div><Bookmark aria-hidden="true" /><span><small>Stage</small><strong>{stageLabel}</strong></span></div>
              <div><Clock3 aria-hidden="true" /><span><small>Next action</small><strong>{job.userState.nextActionAt ? fullDate(job.userState.nextActionAt) : "None set"}</strong></span></div>
            </div>
          ) : (
            <div id={trackerContentId} className="role-tracker__form">
              <label
                className={clsx("field", "role-tracker__field-row", "application-stage-control", roleDraft.stage && `application-stage-control--${roleDraft.stage}`)}
                data-stage={roleDraft.stage ?? "none"}
              >
                <span className="field__label">Stage</span>
                <select aria-label={`Application stage for ${job.title}`} value={roleDraft.stage ?? ""} onChange={(event) => updateStageDraft(event.target.value)}>
                  <option value="">Not tracking</option>
                  {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field role-tracker__field-row"><span className="field__label">Applied on</span><input type="date" value={roleDraft.appliedAt} onChange={(event) => setStoredRoleDraft({ ...roleDraft, appliedAt: event.target.value })} /></label>
              <label className="field role-tracker__field-row"><span className="field__label">Next action</span><input type="date" value={roleDraft.nextActionAt} onChange={(event) => setStoredRoleDraft({ ...roleDraft, nextActionAt: event.target.value })} /></label>
              <label className="field role-tracker__field-row role-tracker__field-row--notes"><span className="field__label">Private notes</span><textarea rows={4} value={roleDraft.notes} onChange={(event) => setStoredRoleDraft({ ...roleDraft, notes: event.target.value })} placeholder="Recruiter, interview prep, follow-up…" /></label>
              <div className="role-tracker__footer">
                <p className="role-tracker__privacy"><LockKeyhole aria-hidden="true" /> Only visible to you</p>
                <div className="role-tracker__form-actions">
                  <Button variant="secondary" size="sm" onClick={() => {
                    setStoredRoleDraft(roleDraftFor(job));
                    setTrackerEditingRoleId(null);
                  }}>Cancel</Button>
                  <Button size="sm" loading={savingTracker} onClick={() => void saveTrackerDetails()}><Save aria-hidden="true" /> Save changes</Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {hasRoleDetails && (
          <section
            className="role-description inspector-section"
            aria-labelledby={`role-description-heading-${job.id}`}
          >
            <header className="role-description__header">
              <ListChecks aria-hidden="true" />
              <div>
                <span className="section-kicker">OFFICIAL ROLE DETAILS</span>
                <h3 id={`role-description-heading-${job.id}`}>What the role involves</h3>
              </div>
            </header>
            {job.description.trim() && <p className="role-description__summary">{job.description}</p>}
            <div className="role-description__groups">
              {job.responsibilities.length > 0 && (
                <section>
                  <h4>What you’ll do</h4>
                  <ul>{job.responsibilities.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </section>
              )}
              {job.requirements.length > 0 && (
                <section>
                  <h4>Requirements</h4>
                  <ul>{job.requirements.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </section>
              )}
              {job.preferredQualifications.length > 0 && (
                <section>
                  <h4>Preferred</h4>
                  <ul>{job.preferredQualifications.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </section>
              )}
            </div>
          </section>
        )}
      </>
    );
  })() : null;

  const companyContent = selectedCompany ? (
    <>
      <section className="company-profile__overview inspector-section">
        <div className="company-profile__actions">
          <Button
            className={clsx("follow-action", selectedCompany.followed && "is-following")}
            variant={selectedCompany.followed ? "primary" : "secondary"}
            loading={followPending}
            disabled={alertPending}
            aria-pressed={selectedCompany.followed}
            onClick={() => void toggleFollow()}
          >
            {selectedCompany.followed ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {selectedCompany.followed ? "Following" : "Follow"}
          </Button>
          <SingleSelectPopover
            label={`Alert frequency for ${selectedCompany.name}`}
            heading="Alerts"
            options={alertFrequencyOptions}
            value={alertFrequency}
            onChange={(frequency) => void changeAlertFrequency(frequency)}
            open={alertMenuOpen}
            onOpenChange={(nextOpen) => setAlertMenuCompanyId(nextOpen ? selectedCompany.id : null)}
            variant="drawer"
            triggerPrefix="Alerts"
            leadingIcon={<Bell />}
            disabled={alertPending}
            align="end"
            className="company-profile__alerts"
          />
          <a className="button button--secondary button--md company-profile__careers-action" href={selectedCompany.careerUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" /> Careers site
          </a>
        </div>
        {selectedCompany.categoryTags.length > 0 && (
          <div className="company-profile__categories" aria-label={`${selectedCompany.name} categories`}>
            {selectedCompany.categoryTags.slice(0, 3).map((category) => <span key={category}>{category}</span>)}
          </div>
        )}
        {selectedCompany.monitoringMode === "discovery" && (
          <Button
            className="monitoring-request-action"
            variant="quiet"
            size="sm"
            loading={monitoringRequestPending}
            disabled={monitoringRequested}
            onClick={() => void requestMonitoring()}
          >
            <Building2 aria-hidden="true" />
            {monitoringRequested ? "Monitoring requested" : "Request continuous monitoring"}
          </Button>
        )}
      </section>

      <section className="company-openings inspector-section" aria-labelledby="company-current-roles">
        <header className="inspector-section-heading">
          <div><h3 id="company-current-roles">Current openings</h3><span>{activeJobs.length > 3 ? `3 of ${activeJobs.length}` : activeJobs.length}</span></div>
        </header>
        {activeJobs.length ? (
          <ol className="company-openings__list">
            {visibleActiveJobs.map((activeJob) => (
              <li key={activeJob.id}>
                <button type="button" aria-label={`Open ${activeJob.title}`} onClick={() => openJob(activeJob)}>
                  <span className="company-openings__identity">
                    <strong>{activeJob.title}</strong>
                    <small>{audienceLabel(activeJob.audience)} <span aria-hidden="true">·</span> {CATEGORY_LABELS[activeJob.technicalCategory]}</small>
                    <small><MapPin aria-hidden="true" /> {activeJob.locationText} <span aria-hidden="true">·</span> {WORK_ARRANGEMENT_LABELS[activeJob.workArrangement]}</small>
                  </span>
                  <span className="company-openings__facts">
                    <strong>{cleanCompensation(activeJob)}</strong>
                    {estimateLabel(activeJob) && <em>{estimateLabel(activeJob)}</em>}
                    <small>Found {relativeTime(activeJob.firstSeenAt)}</small>
                  </span>
                  <ArrowRight className="company-openings__arrow" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="company-openings__empty">
            <strong>No active roles right now.</strong>
            <span>{selectedCompany.monitoringMode === "continuous"
              ? "Keep alerts on to hear when a relevant role appears."
              : "Follow this company while you explore other roles."}</span>
          </p>
        )}
      </section>

      <ObservedHiringSeason
        observations={allObservedOpenings}
        companyName={selectedCompany.name}
        fallback={(
          <section className="hiring-season-root hiring-season-root--empty" aria-label="Observed hiring pattern">
            <p className="hiring-season-empty"><strong>Observed hiring pattern</strong><span aria-hidden="true">—</span> Not enough history yet</p>
          </section>
        )}
      />

      <section className="company-source inspector-section" aria-label="Official source">
        <a className="company-source__row" href={officialSourceUrl} target="_blank" rel="noreferrer">
          <span className="company-source__icon"><Globe2 aria-hidden="true" /></span>
          <span className="company-source__identity">
            <strong>{primarySource?.displayName ?? `${selectedCompany.name} Careers`}</strong>
            <small>{careerAddress(officialSourceUrl)}</small>
          </span>
          <span className="company-source__meta">
            <span className="company-source__official"><ShieldCheck aria-hidden="true" /> Official</span>
            <span className="company-source__checked">
              {selectedCompany.monitoringMode === "continuous"
                ? lastCheckedAt ? `Checked ${relativeTime(lastCheckedAt)}` : "Check unavailable"
                : "Discovery listing"}
            </span>
          </span>
          <ExternalLink aria-hidden="true" />
        </a>
      </section>
    </>
  ) : null;

  const title = job?.title ?? selectedCompany?.name ?? "Opportunity details";

  return (
    <InspectorDrawer
      mode={mode}
      title={title}
      description={job ? `${selectedCompany?.name ?? "Company"} role details` : "Company profile"}
      onClose={closeInspector}
      open={open}
      backAction={job && selectedCompany ? { label: `View ${selectedCompany.name} company profile`, onClick: openCompany } : undefined}
      closeLabel={job ? "Close job details" : selectedCompany ? `Close ${selectedCompany.name} details` : "Close details"}
      header={mode === "role" ? roleHeader : companyHeader}
      className="opportunity-inspector"
      bodyClassName={clsx("opportunity-inspector__body", `opportunity-inspector__body--${mode}`)}
      themeClassName="opportunity-inspector--themed"
      theme={selectedCompany?.slug}
      style={selectedCompany ? companyThemeStyle(selectedCompany) : undefined}
      overlayBreakpoint={1600}
    >
      {mode === "role" ? roleContent : companyContent}
    </InspectorDrawer>
  );
}
