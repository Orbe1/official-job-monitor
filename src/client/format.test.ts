import type { Compensation } from "../shared/domain";
import { compensationLabel, compensationTypeLabel } from "./format";

describe("compensation formatting", () => {
  it("formats a company annual base-salary range while retaining its official source text", () => {
    const compensation: Compensation = {
      minimum: 170_000,
      maximum: 178_000,
      currency: "USD",
      period: "year",
      displayText: "Annual Base Salary Range: $170,000 — $178,000 USD",
      isEstimate: false,
      source: "company",
    };

    expect(compensationLabel(compensation)).toBe("$170K–$178K/year");
    expect(compensationTypeLabel(compensation)).toBe("Base salary");
    expect(compensation.displayText).toBe("Annual Base Salary Range: $170,000 — $178,000 USD");
  });

  it("does not reinterpret an unlabeled amount or an estimate as base salary", () => {
    const compensation: Compensation = {
      minimum: 500,
      maximum: 2_000,
      currency: "USD",
      period: "unknown",
      displayText: "$500 work-from-home stipend and $2,000 learning allowance",
      isEstimate: false,
      source: "company",
    };

    expect(compensationLabel(compensation)).toBe(compensation.displayText);
    expect(compensationTypeLabel(compensation)).toBeNull();
    expect(compensationTypeLabel({
      ...compensation,
      displayText: "Estimated base salary: $170,000–$178,000",
      isEstimate: true,
      source: "historical",
    })).toBeNull();
  });
});
