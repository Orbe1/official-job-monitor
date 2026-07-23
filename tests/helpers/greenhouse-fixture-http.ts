import greenhouseDetails from "../fixtures/greenhouse-details.json";
import { FixtureHttpClient } from "../../src/workers/fixture-http";

interface FixtureGreenhouseJob {
  id?: number | string;
  updated_at?: string;
}

interface FixtureGreenhouseBoard {
  jobs: FixtureGreenhouseJob[];
  meta?: { total?: number };
}

type DetailFixture = {
  id: number | string;
  first_published: string;
  updated_at: string;
};

export function greenhouseFixtureHttp(
  board: FixtureGreenhouseBoard,
  onRequest?: (url: string) => void,
): FixtureHttpClient {
  return new FixtureHttpClient((_method, url) => {
    onRequest?.(url);
    const detailId = new URL(url).pathname.match(/\/jobs\/([^/]+)$/)?.[1];
    if (!detailId) return board;

    const configured = (greenhouseDetails as Record<string, DetailFixture>)[detailId];
    if (configured) return configured;
    const bulkJob = board.jobs.find((job) => String(job.id ?? "") === detailId);
    if (!bulkJob) throw new Error(`No Greenhouse detail fixture for ${detailId}`);
    return {
      id: bulkJob.id,
      first_published: "2026-07-01T15:30:00Z",
      updated_at: bulkJob.updated_at ?? "2026-07-09T12:00:00Z",
    };
  });
}
