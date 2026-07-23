import { type ReactNode, useId } from "react";
import type { HistoricalOpening, JobAudience } from "../../shared/domain";

const MONTHS = [
  { short: "Jan", long: "January" },
  { short: "Feb", long: "February" },
  { short: "Mar", long: "March" },
  { short: "Apr", long: "April" },
  { short: "May", long: "May" },
  { short: "Jun", long: "June" },
  { short: "Jul", long: "July" },
  { short: "Aug", long: "August" },
  { short: "Sep", long: "September" },
  { short: "Oct", long: "October" },
  { short: "Nov", long: "November" },
  { short: "Dec", long: "December" },
] as const;

/**
 * Evidence gate for rendering a seasonal pattern.
 *
 * Six unique, valid first-party observations are required, spanning at least two
 * July-through-June recruiting seasons with at least two observations in each of
 * those seasons. This deliberately conservative gate keeps one-off historical
 * observations from looking like a predictive pattern.
 */
export const HIRING_SEASON_MIN_STARTS = 6;
export const HIRING_SEASON_MIN_RECRUITING_SEASONS = 2;
export const HIRING_SEASON_MIN_STARTS_PER_SEASON = 2;

export interface ObservedHiringSeasonProps {
  observations: readonly HistoricalOpening[];
  /** When supplied, only observations for this audience contribute to the chart. */
  audience?: JobAudience;
  /** Used only to make the chart's accessible label more specific. */
  companyName?: string;
  /** Optional quiet replacement when the evidence gate is not met. */
  fallback?: ReactNode;
}

interface ObservedStart {
  month: number;
  season: string;
}

function observedStart(opening: HistoricalOpening): ObservedStart | null {
  const date = new Date(opening.openedAt);
  if (!Number.isFinite(date.getTime())) return null;

  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const seasonStartYear = month >= 6 ? year : year - 1;
  return {
    month,
    season: `${seasonStartYear}-${seasonStartYear + 1}`,
  };
}

function audiencePhrase(audience?: JobAudience): string {
  if (audience === "internship") return "internship";
  if (audience === "new_grad") return "new-grad";
  return "early-career";
}

function activitySummary(monthCounts: readonly number[], phrase: string, total: number): string {
  const peakMonthCount = Math.max(...monthCounts);
  const peakMonths = monthCounts
    .map((count, month) => ({ count, month }))
    .filter(({ count }) => count === peakMonthCount);

  if (peakMonths.length === 1 && peakMonthCount > total / 2) {
    return `Most ${phrase} openings were first observed in ${MONTHS[peakMonths[0].month].long}.`;
  }

  const windows = monthCounts.map((count, month) => ({
    month,
    count: count + monthCounts[(month + 1) % 12] + monthCounts[(month + 2) % 12],
  }));
  const peakWindowCount = Math.max(...windows.map((window) => window.count));
  const peakWindows = windows.filter((window) => window.count === peakWindowCount);

  if (peakWindows.length === 1 && peakWindowCount > total / 2) {
    const start = peakWindows[0].month;
    const end = (start + 2) % 12;
    return `Most ${phrase} openings were first observed between ${MONTHS[start].long} and ${MONTHS[end].long}.`;
  }

  return `${phrase[0].toUpperCase()}${phrase.slice(1)} openings were first observed across several months.`;
}

export function ObservedHiringSeason({
  observations,
  audience,
  companyName,
  fallback,
}: ObservedHiringSeasonProps) {
  const headingId = useId();
  const evidenceId = useId();
  const uniqueOpenings = new Map<string, HistoricalOpening>();

  for (const opening of observations) {
    if (audience && opening.audience !== audience) continue;
    if (opening.evidenceType !== "first_party") continue;
    const openedAt = new Date(opening.openedAt);
    if (!Number.isFinite(openedAt.getTime())) continue;
    const normalizedTitle = opening.title.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    const canonicalObservation = `${opening.audience}|${normalizedTitle}|${openedAt.toISOString().slice(0, 10)}`;
    if (!uniqueOpenings.has(canonicalObservation)) uniqueOpenings.set(canonicalObservation, opening);
  }

  const starts = [...uniqueOpenings.values()]
    .map(observedStart)
    .filter((start): start is ObservedStart => start !== null);
  const seasonCounts = new Map<string, number>();

  for (const start of starts) {
    seasonCounts.set(start.season, (seasonCounts.get(start.season) ?? 0) + 1);
  }

  const supportedSeasonCount = [...seasonCounts.values()]
    .filter((count) => count >= HIRING_SEASON_MIN_STARTS_PER_SEASON).length;
  if (
    starts.length < HIRING_SEASON_MIN_STARTS ||
    supportedSeasonCount < HIRING_SEASON_MIN_RECRUITING_SEASONS
  ) {
    return fallback ?? null;
  }

  const monthCounts = Array.from({ length: 12 }, () => 0);
  for (const start of starts) monthCounts[start.month] += 1;

  const maxCount = Math.max(...monthCounts);
  const phrase = audiencePhrase(audience);
  const chartLabel = `${companyName ? `${companyName} ` : ""}${phrase} openings first observed by month. ${MONTHS
    .map((month, index) => `${month.long}: ${monthCounts[index]}`)
    .join("; ")}.`;

  return (
    <section
      className="hiring-season-root"
      aria-labelledby={headingId}
      aria-describedby={evidenceId}
      data-observation-count={starts.length}
      data-season-count={seasonCounts.size}
    >
      <header className="hiring-season-header">
        <h3 id={headingId} className="hiring-season-heading">Observed hiring pattern</h3>
      </header>

      <div className="hiring-season-chart" role="img" aria-label={chartLabel}>
        {MONTHS.map((month, index) => {
          const count = monthCounts[index];
          const height = count === 0 ? 0 : Math.round((count / maxCount) * 100);
          return (
            <div
              className={`hiring-season-month${count ? " hiring-season-month-active" : ""}`}
              key={month.short}
              title={`${month.long}: ${count} ${count === 1 ? "opening" : "openings"} first observed`}
            >
              <span className="hiring-season-bar-track" aria-hidden="true">
                <span className="hiring-season-bar" style={{ height: `${height}%` }} />
              </span>
              <span className="hiring-season-month-label" aria-hidden="true">{month.short}</span>
            </div>
          );
        })}
      </div>

      <p className="hiring-season-summary">
        {activitySummary(monthCounts, phrase, starts.length)}
      </p>
      <p className="hiring-season-evidence" id={evidenceId}>
        Based on {starts.length} openings first observed across {seasonCounts.size} recruiting {seasonCounts.size === 1 ? "season" : "seasons"}.
      </p>
      <p className="hiring-season-caveat">
        Months reflect when InternJobs first saw each opening, not a guaranteed posting date or prediction. Recruiting seasons are grouped July–June.
      </p>
    </section>
  );
}
