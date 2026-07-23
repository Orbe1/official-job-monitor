export type JobAudience = "internship" | "new_grad" | "ambiguous";
export type TechnicalCategory =
  | "software"
  | "backend"
  | "frontend"
  | "full_stack"
  | "infrastructure"
  | "support"
  | "networking"
  | "security"
  | "machine_learning"
  | "data_science"
  | "data"
  | "product_management"
  | "quant"
  | "embedded"
  | "robotics";
export type WorkArrangement = "remote" | "hybrid" | "onsite" | "unspecified";
export type JobAvailability = "active" | "closure_pending" | "closed";
export type ApplicationStage =
  | "saved"
  | "applied"
  | "online_assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";
export type SourceHealthStatus = "healthy" | "degraded" | "failing" | "stale" | "unsupported";
export type AdapterKind = "greenhouse" | "ashby" | "lever" | "workday" | "smartrecruiters" | "custom";
export type NotificationFrequency = "immediate" | "daily" | "off";
export type OpportunityFocus = "internship" | "new_grad" | "both";

export interface Compensation {
  minimum: number | null;
  maximum: number | null;
  currency: string;
  period: "hour" | "year" | "month" | "unknown";
  /** Normalized source disclosure text; clients may derive a compact label. */
  displayText: string;
  isEstimate: boolean;
  source: "company" | "historical" | "unknown";
}

export interface JobLocation {
  city?: string;
  region?: string;
  country: string;
  displayText: string;
}

export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  domain: string;
  careerUrl: string;
  logoUrl: string | null;
  initials: string;
  categoryTags: string[];
  compensationSignal: string | null;
  compensationDisclaimer: string | null;
  priorityTier: number;
  followed: boolean;
  groupIds: string[];
  monitoringState: SourceHealthStatus;
  monitoringMode: "continuous" | "discovery";
}

export interface UserJobState {
  saved: boolean;
  stage: ApplicationStage | null;
  notes: string;
  appliedAt: string | null;
  nextActionAt: string | null;
  updatedAt: string | null;
}

export interface HistoricalOpening {
  id: string;
  title: string;
  audience: JobAudience;
  openedAt: string;
  closedAt: string | null;
  observedDaysOpen: number | null;
  evidenceType: "first_party" | "secondary_archive";
  sourceLabel: string;
}

export interface Job {
  id: string;
  companyId: string;
  company: CompanySummary;
  sourceId: string;
  externalJobId: string;
  canonicalUrl: string;
  applicationUrl: string;
  title: string;
  normalizedTitle: string;
  audience: JobAudience;
  technicalCategory: TechnicalCategory;
  employmentType: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  eligibility: string | null;
  graduationRequirements: string | null;
  workAuthorization: string | null;
  locations: JobLocation[];
  locationText: string;
  country: string;
  workArrangement: WorkArrangement;
  compensation: Compensation;
  /** Compatibility alias for sourcePublishedAt. */
  postedAt: string | null;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  reopenedAt: string | null;
  availability: JobAvailability;
  classificationConfidence: number;
  sourceConfidence: number;
  sourceName: string;
  sourceUrl: string;
  lastSourceCheckAt: string;
  historicalContext: string | null;
  history: HistoricalOpening[];
  userState: UserJobState;
  isSample: boolean;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  description: string;
  compensationSignal: boolean;
  companyIds: string[];
}

export interface SourceSummary {
  id: string;
  companyId: string;
  companyName: string;
  adapterKind: AdapterKind;
  displayName: string;
  officialUrl: string;
  health: SourceHealthStatus;
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

export interface MonitoringRun {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "degraded" | "failed" | "unsupported";
  completeness: "complete" | "partial" | "unknown";
  totalJobs: number;
  relevantJobs: number;
  newJobs: number;
  changedJobs: number;
  missingJobs: number;
  durationMs: number | null;
  diagnostics: string[];
}

export interface AlertCriteria {
  audiences?: JobAudience[];
  companyIds?: string[];
  followedCompaniesOnly?: boolean;
  technicalCategories?: TechnicalCategory[];
  locations?: string[];
  workArrangements?: WorkArrangement[];
  minimumCompensation?: number;
  newlyFoundWithinHours?: number;
  reopenedOnly?: boolean;
  deliveryFrequency?: Exclude<NotificationFrequency, "off">;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  criteria: AlertCriteria;
  channels: Array<"in_app" | "email">;
  createdAt: string;
  lastMatchedAt: string | null;
}

export interface Notification {
  id: string;
  type: "new_job" | "reopened_job" | "source_health" | "system";
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  jobId: string | null;
  companyId: string | null;
  deliveryStatus: "in_app" | "development_email" | "delivered" | "failed";
}

export type EmergingReviewStatus = "pending" | "verified" | "rejected" | "promoted";

export interface EmergingCandidate {
  id: string;
  companyName: string;
  companyDomain: string;
  logoUrl: string | null;
  reason: string;
  discoverySource: string;
  officialVerificationSource: string | null;
  discoveredAt: string;
  verifiedAt: string | null;
  reviewStatus: EmergingReviewStatus;
  confidence: number;
  evidence: string[];
  roleIds: string[];
  reviewNotes: string | null;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
  initials: string;
  mode: "development" | "authenticated";
  isAdmin: boolean;
}

export interface UserPreferences {
  onboardingCompleted: boolean;
  opportunityFocus: OpportunityFocus;
  technicalInterests: TechnicalCategory[];
  preferredLocations: string[];
  remotePreferred: boolean;
  defaultNotificationFrequency: NotificationFrequency;
  lastVisitAt: string | null;
}

export interface BootstrapPayload {
  viewer: Viewer;
  jobs: Job[];
  companies: CompanySummary[];
  groups: WatchlistGroup[];
  sources: SourceSummary[];
  monitoringRuns: MonitoringRun[];
  alerts: AlertRule[];
  notifications: Notification[];
  emerging: EmergingCandidate[];
  preferences: UserPreferences;
  generatedAt: string;
  dataMode: "seeded_local" | "live_database" | "empty_database";
}

export interface ApiErrorPayload {
  error: string;
  code: string;
  details?: unknown;
}
