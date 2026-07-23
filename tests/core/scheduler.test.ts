// @vitest-environment node
import greenhouseFixture from "../fixtures/greenhouse.json";
import { MemoryMonitorPersistence, type MonitorRunRecord } from "../../src/workers/monitor";
import { calculateNextPollAt, MonitoringScheduler, type ScheduledSourceStore } from "../../src/workers/scheduler";
import type { SourceAdapterConfig } from "../../src/adapters";
import { greenhouseFixtureHttp } from "../helpers/greenhouse-fixture-http";

class TestStore extends MemoryMonitorPersistence implements ScheduledSourceStore {
  completions: Array<{ sourceId: string; owner: string; nextPollAt: string; outcome: MonitorRunRecord["outcome"] }> = [];
  constructor(private readonly due: SourceAdapterConfig[]) { super(); }
  claimDueSources() { return Promise.resolve(this.due.splice(0)); }
  completeLease(input: (typeof this.completions)[number]) { this.completions.push(input); return Promise.resolve(); }
}

it("claims due sources, monitors them, and releases the lease with a next poll", async () => {
  const store = new TestStore([{ sourceId: "g", companyId: "c", companyName: "Example", kind: "greenhouse", officialUrl: "https://boards.greenhouse.io/example", boardToken: "example", expectedIntervalMinutes: 60 }]);
  const scheduler = new MonitoringScheduler({ store, http: greenhouseFixtureHttp(greenhouseFixture), owner: "test-worker" });
  const runs = await scheduler.tick(new Date("2026-07-10T12:00:00.000Z"));
  expect(runs).toHaveLength(1);
  expect(store.completions[0]).toMatchObject({ sourceId: "g", owner: "test-worker", outcome: "success" });
  expect(Date.parse(store.completions[0].nextPollAt)).toBeGreaterThan(Date.parse("2026-07-10T12:00:00.000Z"));
});

it("defaults successful sources to a jittered 120-minute polling cadence", () => {
  const source: SourceAdapterConfig = {
    sourceId: "g",
    companyId: "c",
    companyName: "Example",
    kind: "greenhouse",
    officialUrl: "https://boards.greenhouse.io/example",
    boardToken: "example",
  };
  const now = new Date("2026-07-10T12:00:00.000Z");

  expect(calculateNextPollAt(source, { outcome: "success" }, now, () => 0.5)).toBe(
    "2026-07-10T14:00:00.000Z",
  );
  expect(calculateNextPollAt(source, { outcome: "success" }, now, () => 0)).toBe(
    "2026-07-10T13:48:00.000Z",
  );
  expect(calculateNextPollAt(source, { outcome: "success" }, now, () => 1)).toBe(
    "2026-07-10T14:12:00.000Z",
  );
});
