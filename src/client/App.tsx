import { Navigate, Route, Routes } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { DataProvider, useData } from "./DataContext";
import { AppShell } from "./components/AppShell";
import { Onboarding } from "./components/Onboarding";
import { ErrorState } from "./components/ui";
import { CompanyDetailPage } from "./pages/CompanyDetailPage";
import { DiscoverPage } from "./pages/DiscoverPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourceHealthPage } from "./pages/SourceHealthPage";
import { TrackerPage } from "./pages/TrackerPage";
import { WatchPage } from "./pages/WatchPage";

function LoadingWorkspace() {
  return (
    <div className="loading-workspace" role="status" aria-label="Loading InternJobs workspace">
      <aside><span><Sparkles /></span><i /><i /><i /></aside>
      <main><header><i /><i /></header><section><div><Sparkles /></div><i /><i /><i /><i /><i /><i /></section></main>
      <span className="sr-only">Loading opportunity data</span>
    </div>
  );
}

function RoutedWorkspace() {
  const { data, loading, error, refresh } = useData();
  if (loading && !data) return <LoadingWorkspace />;
  if (!data) return <div className="startup-error"><div className="startup-error__brand"><Sparkles /><strong>InternJobs</strong></div><ErrorState message={error ?? "The API returned no workspace data."} onRetry={() => void refresh()} /><p>Make sure the local API and database are running, then retry.</p></div>;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/watch" element={<WatchPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin/sources" element={data.viewer.isAdmin ? <SourceHealthPage /> : <Navigate to="/settings" replace />} />
        <Route path="/companies/:slug" element={<CompanyDetailPage />} />
        <Route path="/explore" element={<Navigate to="/discover" replace />} />
        <Route path="/emerging" element={<Navigate to="/discover" replace />} />
        <Route path="/watchlists" element={<Navigate to="/watch" replace />} />
        <Route path="/companies" element={<Navigate to="/watch" replace />} />
        <Route path="/alerts" element={<Navigate to="/watch" replace />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Routes>
      <Onboarding />
    </AppShell>
  );
}

export function App() {
  return <DataProvider><RoutedWorkspace /></DataProvider>;
}
