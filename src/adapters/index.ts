import type { AdapterKind } from "../shared/domain";
import type { SourceAdapter } from "./types";
import { AshbyAdapter } from "./adapters/ashby";
import { CustomJsonAdapter } from "./adapters/custom-json";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters";
import { WorkdayAdapter } from "./adapters/workday";

export * from "./types";
export * from "./classifier";
export * from "./normalize";
export * from "./lifecycle";
export * from "./http";

const adapters: Record<AdapterKind, SourceAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  ashby: new AshbyAdapter(),
  lever: new LeverAdapter(),
  workday: new WorkdayAdapter(),
  smartrecruiters: new SmartRecruitersAdapter(),
  custom: new CustomJsonAdapter(),
};

export function adapterFor(kind: AdapterKind): SourceAdapter {
  return adapters[kind];
}
