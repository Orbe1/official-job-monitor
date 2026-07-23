import type {
  AlertCriteria,
  AlertRule,
  ApplicationStage,
  BootstrapPayload,
  EmergingCandidate,
  Notification,
  UserPreferences,
  UserJobState,
} from "../shared/domain";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "request_failed") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code = "request_failed";
    try {
      const payload = (await response.json()) as { error?: string; code?: string };
      message = payload.error ?? message;
      code = payload.code ?? code;
    } catch {
      // The status and generic message are still useful for non-JSON failures.
    }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface JobStatePatch {
  saved?: boolean;
  stage?: ApplicationStage | null;
  notes?: string;
  appliedAt?: string | null;
  nextActionAt?: string | null;
}

export interface AlertDraft {
  name: string;
  enabled: boolean;
  criteria: AlertCriteria;
  channels: Array<"in_app" | "email">;
}

export interface EmergingDraft {
  companyName: string;
  companyDomain: string;
  reason: string;
  discoverySource: string;
  officialUrl?: string;
}

export interface EmergingReviewDraft {
  status: "verified" | "rejected";
  notes?: string;
  officialVerificationSource?: string;
  confidence?: number;
}

export type PreferencesPatch = Partial<UserPreferences>;

export const api = {
  bootstrap: () => request<BootstrapPayload>("/api/bootstrap"),
  updatePreferences: (patch: PreferencesPatch) =>
    request<{ preferences: UserPreferences }>("/api/preferences", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  followCompany: (companyId: string, followed: boolean) =>
    request<{ company: BootstrapPayload["companies"][number] }>(`/api/companies/${companyId}/follow`, {
      method: "PUT",
      body: JSON.stringify({ followed }),
    }),
  updateJobState: (jobId: string, patch: JobStatePatch) =>
    request<{ jobId: string; userState: UserJobState }>(`/api/jobs/${jobId}/state`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  createAlert: (draft: AlertDraft) =>
    request<{ alert: AlertRule }>("/api/alerts", { method: "POST", body: JSON.stringify(draft) }),
  toggleAlert: (alertId: string, enabled: boolean) =>
    request<{ alert: AlertRule }>(`/api/alerts/${alertId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  updateAlert: (alertId: string, draft: Partial<AlertDraft>) =>
    request<{ alert: AlertRule }>(`/api/alerts/${alertId}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    }),
  markNotificationRead: (notificationId: string, read: boolean) =>
    request<{ notification: Notification }>(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  submitEmerging: (draft: EmergingDraft) =>
    request<{ candidate: EmergingCandidate }>("/api/emerging", {
      method: "POST",
      body: JSON.stringify({
        companyName: draft.companyName,
        companyDomain: draft.companyDomain,
        reason: draft.reason,
        discoverySource: draft.discoverySource,
        evidence: draft.officialUrl ? [draft.officialUrl] : [],
      }),
    }),
  reviewEmerging: (candidateId: string, draft: EmergingReviewDraft) =>
    request<{ candidate: EmergingCandidate }>(`/api/emerging/${candidateId}/reviews`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
  promoteEmerging: (candidateId: string) =>
    request<{ candidate: EmergingCandidate; company: BootstrapPayload["companies"][number] }>(`/api/emerging/${candidateId}/promote`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
