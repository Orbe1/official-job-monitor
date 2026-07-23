import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  FileWarning,
  Gauge,
  Radio,
  Search,
  ServerCog,
  Timer,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { SourceHealthStatus } from "../../shared/domain";
import { useData } from "../DataContext";
import { dateTime } from "../format";
import { EmptyState, IconButton, OutboundLink, StatusDot, Tag } from "../components/ui";

const healthOrder: SourceHealthStatus[] = ["failing", "degraded", "stale", "unsupported", "healthy"];

function RunStatusTag({ status }: { status: "running" | "success" | "degraded" | "failed" | "unsupported" }) {
  return <Tag tone={status === "success" ? "teal" : status === "failed" ? "red" : status === "degraded" ? "amber" : "neutral"}>{status}</Tag>;
}

export function SourceHealthPage() {
  const { data } = useData();
  const sources = useMemo(() => data?.sources ?? [], [data?.sources]);
  const [selectedId, setSelectedId] = useState<string | null>(sources.find((source) => source.health !== "healthy")?.id ?? sources[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | SourceHealthStatus>("all");
  const selected = sources.find((source) => source.id === selectedId) ?? null;
  const runs = (data?.monitoringRuns ?? []).filter((run) => !selectedId || run.sourceId === selectedId).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const visibleSources = sources
    .filter((source) => (!query || [source.companyName, source.displayName, source.adapterKind].join(" ").toLowerCase().includes(query.toLowerCase())) && (status === "all" || source.health === status))
    .sort((a, b) => healthOrder.indexOf(a.health) - healthOrder.indexOf(b.health) || a.companyName.localeCompare(b.companyName));
  const counts = useMemo(() => Object.fromEntries(healthOrder.map((health) => [health, sources.filter((source) => source.health === health).length])) as Record<SourceHealthStatus, number>, [sources]);
  const enabledSources = sources.filter((source) => source.enabled);
  const incidents = enabledSources.filter((source) => source.suspiciousFlags.length || source.errorDetails || ["failing", "degraded", "stale"].includes(source.health));

  return (
    <div className="workspace page-pad source-health-page">
      <header className="page-header">
        <div><p className="page-header__eyebrow"><span /> Administration</p><h2>Source health is part of the product</h2><p>A failed or suspiciously empty run never closes jobs. Successful source checks and closure confirmation remain separate facts.</p></div>
        <div className="page-header__note"><ServerCog /><span><strong>{enabledSources.length} enabled · {sources.length} reviewed</strong> official-source configurations</span></div>
      </header>

      <div className="health-summary">
        {healthOrder.map((health) => <button key={health} className={clsx(status === health && "is-active", `health-summary--${health}`)} onClick={() => setStatus(status === health ? "all" : health)}><StatusDot status={health} /><span><strong>{counts[health]}</strong>{health}</span></button>)}
      </div>

      {incidents.length > 0 && (
        <section className="incident-strip">
          <AlertOctagon />
          <div><strong>{incidents.length} source {incidents.length === 1 ? "incident needs" : "incidents need"} attention</strong><p>Existing job availability is preserved until monitoring completeness recovers and closure policy is satisfied.</p></div>
          <button onClick={() => setStatus("degraded")}>Review incidents</button>
        </section>
      )}

      <div className="source-health-layout">
        <section className="source-table-section">
          <div className="directory-toolbar source-toolbar">
            <label className="search-field"><Search /><span className="sr-only">Search sources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company, source, adapter" />{query && <IconButton label="Clear source search" onClick={() => setQuery("")}><X /></IconButton>}</label>
            <label><span className="sr-only">Filter health</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option>{healthOrder.map((health) => <option key={health}>{health}</option>)}</select></label>
          </div>
          <div className="source-table" role="table" aria-label="Official source monitoring health">
            <div className="source-table__head" role="row"><span>Company / source</span><span>Health</span><span>Last success</span><span>Jobs</span><span>Parser</span><span>Duration</span></div>
            <div role="rowgroup">
              {visibleSources.map((source) => {
                const delta = source.totalJobs - source.previousTotalJobs;
                return (
                  <button key={source.id} role="row" className={clsx("source-row", selectedId === source.id && "source-row--selected")} onClick={() => setSelectedId(source.id)}>
                    <span role="cell"><strong>{source.companyName}</strong><small>{source.displayName} · {source.adapterKind}</small></span>
                    <span role="cell">{source.enabled ? <><StatusDot status={source.health} /><span className="capitalize">{source.health}</span>{source.consecutiveFailures > 0 && <small>{source.consecutiveFailures} consecutive</small>}</> : <Tag tone="neutral">disabled</Tag>}</span>
                    <span role="cell">{dateTime(source.lastSuccessAt)}</span>
                    <span role="cell"><strong>{source.totalJobs}</strong>{delta !== 0 && <small className={delta < 0 ? "negative" : "positive"}>{delta < 0 ? <ArrowDown /> : <ArrowUp />}{Math.abs(delta)} vs prior</small>}</span>
                    <span role="cell"><Tag tone={source.parserStatus === "ok" ? "teal" : source.parserStatus === "error" ? "red" : "amber"}>{source.parserStatus}</Tag><small>v{source.parserVersion}</small></span>
                    <span role="cell">{source.durationMs ? `${source.durationMs.toLocaleString()} ms` : "—"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {!visibleSources.length && <EmptyState compact title="No sources match" body="Clear the source search or health filter." />}
        </section>

        {selected && (
          <aside className="source-inspector">
            <header><div><span className="section-kicker">Source inspector</span><h3>{selected.companyName}</h3><p>{selected.displayName}</p></div><StatusDot status={selected.health} /></header>
            <OutboundLink href={selected.officialUrl}>Open official source</OutboundLink>
            <dl className="source-metrics">
              <div><dt><Clock3 /> Last attempt</dt><dd>{dateTime(selected.lastAttemptAt)}</dd></div>
              <div><dt><CheckCircle2 /> Last success</dt><dd>{dateTime(selected.lastSuccessAt)}</dd></div>
              <div><dt><Activity /> Relevant roles</dt><dd>{selected.relevantJobs}</dd></div>
              <div><dt><Gauge /> HTTP / transport</dt><dd>{selected.httpStatus ?? "No response"}</dd></div>
              <div><dt><Timer /> Expected interval</dt><dd>{selected.expectedIntervalMinutes} min</dd></div>
              <div><dt><Radio /> Pages retrieved</dt><dd>{selected.pagesRetrieved}</dd></div>
            </dl>
            {(selected.suspiciousFlags.length > 0 || selected.errorDetails) && (
              <section className="source-incident">
                <header><AlertTriangle /><div><strong>Incident details</strong><span>Jobs were not mass-closed</span></div></header>
                {selected.errorDetails && <p>{selected.errorDetails}</p>}
                <ul>{selected.suspiciousFlags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
              </section>
            )}
            <section className="run-history">
              <div className="section-heading"><div><span className="section-kicker">Recent execution</span><h4>Monitoring runs</h4></div><span>{runs.length}</span></div>
              {runs.map((run) => (
                <article key={run.id}>
                  <header><span>{dateTime(run.startedAt)}</span><RunStatusTag status={run.status} /></header>
                  <dl><div><dt>Completeness</dt><dd>{run.completeness}</dd></div><div><dt>Total / relevant</dt><dd>{run.totalJobs} / {run.relevantJobs}</dd></div><div><dt>New / changed</dt><dd>{run.newJobs} / {run.changedJobs}</dd></div><div><dt>Missing</dt><dd>{run.missingJobs}</dd></div></dl>
                  {run.diagnostics.length > 0 && <details><summary><FileWarning /> Diagnostics ({run.diagnostics.length})</summary><ul>{run.diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}</ul></details>}
                </article>
              ))}
              {!runs.length && <p className="muted-copy">No monitoring runs are recorded for this source.</p>}
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
