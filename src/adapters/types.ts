import type { AdapterKind, TechnicalCategory, WorkArrangement } from "../shared/domain";

export interface SourceAdapterConfig {
  sourceId: string;
  companyId: string;
  companyName: string;
  kind: AdapterKind;
  officialUrl: string;
  boardToken?: string;
  siteName?: string;
  companyIdentifier?: string;
  tenant?: string;
  careerSite?: string;
  customEndpoint?: string;
  customItemsPath?: string;
  customFieldMap?: Partial<Record<"id" | "title" | "url" | "applyUrl" | "location" | "description" | "postedAt", string>>;
  expectedIntervalMinutes?: number;
  closureConfirmationRuns?: number;
  minimumRequestIntervalMs?: number;
  requestTimeoutMs?: number;
  maximumResponseBytes?: number;
}

export interface RawCompensation {
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  period: "hour" | "year" | "month" | "unknown";
  /** Normalized official disclosure text retained separately from UI formatting. */
  displayText: string | null;
}

export interface RawPosting {
  externalId: string;
  title: string;
  canonicalUrl: string;
  applicationUrl: string;
  locationText: string;
  country: string | null;
  workplaceType: WorkArrangement;
  employmentType: string | null;
  department: string | null;
  descriptionText: string;
  responsibilities: string[];
  requirements: string[];
  /** Exact role-specific degree or enrollment requirement text from the source. */
  eligibility: string | null;
  /** Exact role-specific graduation timing text from the source. */
  graduationRequirements: string | null;
  compensation: RawCompensation | null;
  /** Legacy compatibility alias for an employer-supplied publication date. */
  postedAt: string | null;
  /** Official source publication time, when the source provides one. */
  sourcePublishedAt: string | null;
  /** Official source update time, distinct from InternJobs observation time. */
  sourceUpdatedAt: string | null;
  /** InternJobs time at which publication metadata was requested successfully or unsuccessfully. */
  sourcePublicationCheckedAt: string | null;
  raw: unknown;
}

export interface SourceTimestampMetadata {
  externalId: string;
  sourcePublishedAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface SourceTimestampEnrichmentResult {
  metadata: SourceTimestampMetadata[];
  httpStatuses: number[];
  warnings: string[];
  failedExternalIds: string[];
}

export interface AdapterDiagnostics {
  adapter: AdapterKind;
  adapterVersion: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  pagesRetrieved: number;
  httpStatuses: number[];
  totalJobs: number;
  warnings: string[];
  suspiciousFlags: string[];
  duplicateExternalIds: string[];
}

export interface AdapterFetchResult {
  outcome: "success" | "degraded" | "failed" | "unsupported";
  completeness: "complete" | "partial" | "unknown";
  postings: RawPosting[];
  diagnostics: AdapterDiagnostics;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Headers;
  url: string;
}

export interface AdapterHttpClient {
  getJson<T>(url: string, options?: { headers?: Record<string, string>; minimumIntervalMs?: number; timeoutMs?: number; maximumResponseBytes?: number }): Promise<HttpResponse<T>>;
  postJson<T>(url: string, body: unknown, options?: { headers?: Record<string, string>; minimumIntervalMs?: number; timeoutMs?: number; maximumResponseBytes?: number }): Promise<HttpResponse<T>>;
}

export interface AdapterContext {
  source: SourceAdapterConfig;
  http: AdapterHttpClient;
  now?: () => Date;
}

export interface SourceAdapter {
  readonly kind: AdapterKind;
  readonly version: string;
  fetchAll(context: AdapterContext): Promise<AdapterFetchResult>;
  fetchSourceTimestamps?(
    context: AdapterContext,
    postings: readonly NormalizedPosting[],
  ): Promise<SourceTimestampEnrichmentResult>;
}

export interface ClassificationResult {
  relevant: boolean;
  audience: "internship" | "new_grad" | "ambiguous" | "irrelevant";
  technicalCategory: TechnicalCategory;
  confidence: number;
  reasons: string[];
  reviewRequired: boolean;
}

export interface NormalizedPosting extends RawPosting {
  normalizedTitle: string;
  contentHash: string;
  classification: ClassificationResult;
  sourceConfidence: number;
}

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
