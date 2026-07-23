import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BootstrapPayload, EmergingCandidate, NotificationFrequency, UserPreferences } from "../shared/domain";
import { api, type AlertDraft, type EmergingDraft, type EmergingReviewDraft, type JobStatePatch, type PreferencesPatch } from "./api";

interface DataContextValue {
  data: BootstrapPayload | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  mutationError: string | null;
  clearMutationError(): void;
  refresh(): Promise<void>;
  followCompany(companyId: string, followed: boolean): Promise<void>;
  updateJobState(jobId: string, patch: JobStatePatch): Promise<void>;
  createAlert(draft: AlertDraft): Promise<void>;
  toggleAlert(alertId: string, enabled: boolean): Promise<void>;
  markNotificationRead(notificationId: string, read?: boolean): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  submitEmerging(draft: EmergingDraft): Promise<EmergingCandidate | null>;
  reviewEmerging(candidateId: string, draft: EmergingReviewDraft): Promise<void>;
  promoteEmerging(candidateId: string): Promise<void>;
  updatePreferences(patch: PreferencesPatch): Promise<void>;
  companyAlertPreference(companyId: string): NotificationFrequency;
  setCompanyAlertPreference(companyId: string, frequency: NotificationFrequency): Promise<void>;
  finishOnboarding(preferences: UserPreferences, companyIds: string[]): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mounted = useRef(true);
  const priorVisitAt = useRef<string | null | undefined>(undefined);
  const visitRecorded = useRef(false);

  useEffect(() => {
    // React Strict Mode intentionally runs an effect setup/cleanup/setup cycle
    // in development. Restore the mounted flag in setup so the second,
    // real bootstrap response is not discarded after the probe cleanup.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const payload = await api.bootstrap();
      if (!mounted.current) return;
      if (priorVisitAt.current === undefined) priorVisitAt.current = payload.preferences.lastVisitAt;
      setData({
        ...payload,
        preferences: { ...payload.preferences, lastVisitAt: priorVisitAt.current },
      });
      setError(null);
      if (!visitRecorded.current) {
        visitRecorded.current = true;
        void api.updatePreferences({ lastVisitAt: new Date().toISOString() }).catch(() => {
          visitRecorded.current = false;
        });
      }
    } catch (requestError) {
      if (!mounted.current) return;
      setError(errorMessage(requestError));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const refresh = useCallback(() => load(Boolean(data)), [data, load]);

  const reconcile = useCallback(async (action: () => Promise<unknown>, rollback: BootstrapPayload | null) => {
    setMutationError(null);
    try {
      await action();
      await load(true);
    } catch (requestError) {
      if (rollback) setData(rollback);
      setMutationError(errorMessage(requestError));
      throw requestError;
    }
  }, [load]);

  const followCompany = useCallback(async (companyId: string, followed: boolean) => {
    const before = data;
    setData((current) => current ? {
      ...current,
      companies: current.companies.map((company) => company.id === companyId ? { ...company, followed } : company),
      jobs: current.jobs.map((job) => job.companyId === companyId ? { ...job, company: { ...job.company, followed } } : job),
    } : current);
    await reconcile(() => api.followCompany(companyId, followed), before);
  }, [data, reconcile]);

  const updateJobState = useCallback(async (jobId: string, patch: JobStatePatch) => {
    const before = data;
    setData((current) => current ? {
      ...current,
      jobs: current.jobs.map((job) => job.id === jobId ? {
        ...job,
        userState: { ...job.userState, ...patch, updatedAt: new Date().toISOString() },
      } : job),
    } : current);
    await reconcile(() => api.updateJobState(jobId, patch), before);
  }, [data, reconcile]);

  const createAlert = useCallback(async (draft: AlertDraft) => {
    const before = data;
    const optimistic = {
      ...draft,
      id: `pending-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastMatchedAt: null,
    };
    setData((current) => current ? { ...current, alerts: [optimistic, ...current.alerts] } : current);
    await reconcile(() => api.createAlert(draft), before);
  }, [data, reconcile]);

  const toggleAlert = useCallback(async (alertId: string, enabled: boolean) => {
    const before = data;
    setData((current) => current ? {
      ...current,
      alerts: current.alerts.map((alert) => alert.id === alertId ? { ...alert, enabled } : alert),
    } : current);
    await reconcile(() => api.toggleAlert(alertId, enabled), before);
  }, [data, reconcile]);

  const markNotificationRead = useCallback(async (notificationId: string, read = true) => {
    const before = data;
    const readAt = read ? new Date().toISOString() : null;
    setData((current) => current ? {
      ...current,
      notifications: current.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, readAt } : notification),
    } : current);
    await reconcile(() => api.markNotificationRead(notificationId, read), before);
  }, [data, reconcile]);

  const markAllNotificationsRead = useCallback(async () => {
    const before = data;
    const readAt = new Date().toISOString();
    setData((current) => current ? {
      ...current,
      notifications: current.notifications.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })),
    } : current);
    await reconcile(() => Promise.all(
      (before?.notifications ?? [])
        .filter((notification) => !notification.readAt)
        .map((notification) => api.markNotificationRead(notification.id, true)),
    ), before);
  }, [data, reconcile]);

  const submitEmerging = useCallback(async (draft: EmergingDraft) => {
    const before = data;
    const optimistic: EmergingCandidate = {
      id: `pending-${Date.now()}`,
      companyName: draft.companyName,
      companyDomain: draft.companyDomain,
      logoUrl: null,
      reason: draft.reason,
      discoverySource: draft.discoverySource,
      officialVerificationSource: draft.officialUrl || null,
      discoveredAt: new Date().toISOString(),
      verifiedAt: null,
      reviewStatus: "pending",
      confidence: 0,
      evidence: draft.officialUrl ? [draft.officialUrl] : [],
      roleIds: [],
      reviewNotes: "Awaiting official-source verification.",
    };
    setData((current) => current ? { ...current, emerging: [optimistic, ...current.emerging] } : current);
    try {
      const { candidate: created } = await api.submitEmerging(draft);
      await load(true);
      return created;
    } catch (requestError) {
      if (before) setData(before);
      setMutationError(errorMessage(requestError));
      return null;
    }
  }, [data, load]);

  const reviewEmerging = useCallback(async (candidateId: string, draft: EmergingReviewDraft) => {
    const before = data;
    const reviewedAt = new Date().toISOString();
    setData((current) => current ? {
      ...current,
      emerging: current.emerging.map((candidate) => candidate.id === candidateId ? {
        ...candidate,
        reviewStatus: draft.status,
        reviewNotes: draft.notes ?? candidate.reviewNotes,
        officialVerificationSource: draft.officialVerificationSource ?? candidate.officialVerificationSource,
        confidence: draft.confidence ?? candidate.confidence,
        verifiedAt: draft.status === "verified" ? reviewedAt : null,
      } : candidate),
    } : current);
    await reconcile(() => api.reviewEmerging(candidateId, draft), before);
  }, [data, reconcile]);

  const promoteEmerging = useCallback(async (candidateId: string) => {
    const before = data;
    setData((current) => current ? {
      ...current,
      emerging: current.emerging.map((candidate) => candidate.id === candidateId ? { ...candidate, reviewStatus: "promoted" } : candidate),
    } : current);
    await reconcile(() => api.promoteEmerging(candidateId), before);
  }, [data, reconcile]);

  const updatePreferences = useCallback(async (patch: PreferencesPatch) => {
    const before = data;
    setData((current) => current ? { ...current, preferences: { ...current.preferences, ...patch } } : current);
    await reconcile(() => api.updatePreferences(patch), before);
  }, [data, reconcile]);

  const companyAlertPreference = useCallback((companyId: string): NotificationFrequency => {
    const rule = data?.alerts.find((alert) => alert.criteria.companyIds?.length === 1 && alert.criteria.companyIds[0] === companyId);
    if (!rule?.enabled) return "off";
    return rule.criteria.deliveryFrequency ?? "immediate";
  }, [data?.alerts]);

  const setCompanyAlertPreference = useCallback(async (companyId: string, frequency: NotificationFrequency) => {
    const before = data;
    const existing = data?.alerts.find((alert) => alert.criteria.companyIds?.length === 1 && alert.criteria.companyIds[0] === companyId);
    const companyName = data?.companies.find((company) => company.id === companyId)?.name ?? "Company";
    const criteria = {
      ...(existing?.criteria ?? {}),
      companyIds: [companyId],
      deliveryFrequency: frequency === "daily" ? "daily" as const : "immediate" as const,
    };
    setMutationError(null);
    try {
      if (existing) {
        await api.updateAlert(existing.id, {
          name: `${companyName} updates`,
          enabled: frequency !== "off",
          criteria,
          channels: frequency === "daily" ? ["in_app", "email"] : ["in_app"],
        });
      } else if (frequency !== "off") {
        await api.createAlert({
          name: `${companyName} updates`,
          enabled: true,
          criteria,
          channels: frequency === "daily" ? ["in_app", "email"] : ["in_app"],
        });
      }
      await load(true);
    } catch (requestError) {
      if (before) setData(before);
      setMutationError(errorMessage(requestError));
      throw requestError;
    }
  }, [data, load]);

  const finishOnboarding = useCallback(async (preferences: UserPreferences, companyIds: string[]) => {
    const frequency = preferences.defaultNotificationFrequency;
    const editablePreferences: PreferencesPatch = {
      onboardingCompleted: true,
      opportunityFocus: preferences.opportunityFocus,
      technicalInterests: preferences.technicalInterests,
      preferredLocations: preferences.preferredLocations,
      remotePreferred: preferences.remotePreferred,
      defaultNotificationFrequency: preferences.defaultNotificationFrequency,
    };
    const alertMutations = companyIds.flatMap((companyId) => {
      const companyName = data?.companies.find((company) => company.id === companyId)?.name ?? "Company";
      const existing = data?.alerts.find((alert) =>
        alert.criteria.companyIds?.length === 1 && alert.criteria.companyIds[0] === companyId,
      );
      const criteria = {
        ...(existing?.criteria ?? {}),
        companyIds: [companyId],
        deliveryFrequency: frequency === "daily" ? "daily" as const : "immediate" as const,
      };
      if (existing) {
        return [api.updateAlert(existing.id, {
          name: `${companyName} updates`,
          enabled: frequency !== "off",
          criteria,
          channels: frequency === "daily" ? ["in_app", "email"] : ["in_app"],
        })];
      }
      if (frequency === "off") return [];
      return [api.createAlert({
        name: `${companyName} updates`,
        enabled: true,
        criteria,
        channels: frequency === "daily" ? ["in_app", "email"] : ["in_app"],
      })];
    });
    setMutationError(null);
    try {
      await Promise.all([
        api.updatePreferences(editablePreferences),
        ...companyIds.map((companyId) => api.followCompany(companyId, true)),
        ...alertMutations,
      ]);
      await load(true);
    } catch (requestError) {
      setMutationError(errorMessage(requestError));
      throw requestError;
    }
  }, [data?.alerts, data?.companies, load]);

  const value = useMemo<DataContextValue>(() => ({
    data,
    loading,
    refreshing,
    error,
    mutationError,
    clearMutationError: () => setMutationError(null),
    refresh,
    followCompany,
    updateJobState,
    createAlert,
    toggleAlert,
    markNotificationRead,
    markAllNotificationsRead,
    submitEmerging,
    reviewEmerging,
    promoteEmerging,
    updatePreferences,
    companyAlertPreference,
    setCompanyAlertPreference,
    finishOnboarding,
  }), [
    companyAlertPreference, createAlert, data, error, finishOnboarding, followCompany, loading, markAllNotificationsRead,
    markNotificationRead, mutationError, promoteEmerging, refresh, refreshing, reviewEmerging, setCompanyAlertPreference,
    submitEmerging, toggleAlert, updateJobState, updatePreferences,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
}
