import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HistoricalOpening, JobAudience } from "../../shared/domain";
import {
  HIRING_SEASON_MIN_RECRUITING_SEASONS,
  HIRING_SEASON_MIN_STARTS,
  HIRING_SEASON_MIN_STARTS_PER_SEASON,
  ObservedHiringSeason,
} from "./ObservedHiringSeason";

function opening(id: string, openedAt: string, audience: JobAudience = "internship"): HistoricalOpening {
  return {
    id,
    title: `Opening ${id}`,
    audience,
    openedAt,
    closedAt: null,
    observedDaysOpen: null,
    evidenceType: "first_party",
    sourceLabel: "Official careers site",
  };
}

const supportedInternshipHistory = [
  opening("2024-jul", "2024-07-08T12:00:00.000Z"),
  opening("2024-aug", "2024-08-12T12:00:00.000Z"),
  opening("2024-sep", "2024-09-09T12:00:00.000Z"),
  opening("2025-jul", "2025-07-07T12:00:00.000Z"),
  opening("2025-aug", "2025-08-11T12:00:00.000Z"),
  opening("2025-sep", "2025-09-08T12:00:00.000Z"),
];

describe("ObservedHiringSeason", () => {
  it("uses a conservative, documented evidence threshold", () => {
    expect(HIRING_SEASON_MIN_STARTS).toBe(6);
    expect(HIRING_SEASON_MIN_RECRUITING_SEASONS).toBe(2);
    expect(HIRING_SEASON_MIN_STARTS_PER_SEASON).toBe(2);
  });

  it("renders nothing when there are too few valid posting starts", () => {
    const { container } = render(
      <ObservedHiringSeason observations={supportedInternshipHistory.slice(0, 5)} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a supplied quiet fallback when the evidence gate is not met", () => {
    render(
      <ObservedHiringSeason
        observations={supportedInternshipHistory.slice(0, 2)}
        fallback={<p>Not enough observed history yet.</p>}
      />,
    );

    expect(screen.getByText("Not enough observed history yet.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when observations do not span two supported recruiting seasons", () => {
    const oneSeason = Array.from({ length: 6 }, (_, index) =>
      opening(`one-season-${index}`, `2025-0${7 + (index % 3)}-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`));

    const { container } = render(<ObservedHiringSeason observations={oneSeason} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the month pattern, evidence size, and cautious first-observed language", () => {
    render(
      <ObservedHiringSeason
        observations={supportedInternshipHistory}
        audience="internship"
        companyName="NVIDIA"
      />,
    );

    expect(screen.getByRole("heading", { name: "Observed hiring pattern" })).toBeInTheDocument();
    expect(screen.getByRole("img", {
      name: /NVIDIA internship openings first observed by month.*July: 2.*August: 2.*September: 2/i,
    })).toBeInTheDocument();
    expect(screen.getByText("Most internship openings were first observed between July and September.")).toBeInTheDocument();
    expect(screen.getByText("Based on 6 openings first observed across 2 recruiting seasons.")).toBeInTheDocument();
    expect(screen.getByText(/when InternJobs first saw each opening.*not a guaranteed posting date or prediction/i)).toBeInTheDocument();
  });

  it("deduplicates equivalent openings, ignores invalid and archive evidence, and scopes by audience", () => {
    const mixedHistory = [
      ...supportedInternshipHistory,
      { ...supportedInternshipHistory[0], id: "duplicate-id" },
      opening("invalid", "not-a-date"),
      { ...opening("archive", "2024-10-01T12:00:00.000Z"), evidenceType: "secondary_archive" as const },
      ...supportedInternshipHistory.map((item, index) =>
        opening(`new-grad-${index}`, item.openedAt, "new_grad")),
    ];

    const { rerender } = render(
      <ObservedHiringSeason observations={mixedHistory} audience="internship" />,
    );
    const internshipChart = screen.getByLabelText(/internship openings first observed by month/i);
    expect(internshipChart.closest("section")).toHaveAttribute("data-observation-count", "6");

    rerender(
      <ObservedHiringSeason
        observations={mixedHistory.slice(0, supportedInternshipHistory.length + 2)}
        audience="new_grad"
      />,
    );
    expect(screen.queryByRole("heading", { name: "Observed hiring pattern" })).not.toBeInTheDocument();
  });
});
