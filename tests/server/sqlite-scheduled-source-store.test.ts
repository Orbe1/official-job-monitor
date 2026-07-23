// @vitest-environment node
import type { SqliteDatabase } from "../../src/server/database";
import { openDatabase } from "../../src/server/database";
import {
  SourceLeaseOwnershipError,
  SqliteScheduledSourceStore,
} from "../../src/server/sqlite-scheduled-source-store";
import { applyMigrations } from "../../scripts/migrate";

const NOW = "2026-07-17T12:00:00.000Z";

let database: SqliteDatabase;
let store: SqliteScheduledSourceStore;

beforeEach(() => {
  database = openDatabase({ filename: ":memory:" });
  applyMigrations(database);
  insertCompany();
  store = new SqliteScheduledSourceStore(database);
});

afterEach(() => {
  database.close();
});

it("claims only enabled due sources and records a recoverable lease", async () => {
  insertSource("never-polled", null, 1, 12_000_000);
  insertSource("overdue", "2026-07-17T11:00:00.000Z", 1);
  insertSource("future", "2026-07-17T13:00:00.000Z", 1);
  insertSource("disabled", null, 0);

  const claimed = await store.claimDueSources({
    now: NOW,
    owner: "worker-a",
    leaseSeconds: 90,
    limit: 2,
  });

  expect(claimed.map((source) => source.sourceId)).toEqual(["never-polled", "overdue"]);
  expect(claimed[0]).toMatchObject({
    companyId: "company-live",
    companyName: "Live Company",
    kind: "greenhouse",
    boardToken: "never-polled",
    expectedIntervalMinutes: 120,
    minimumRequestIntervalMs: 1_000,
    requestTimeoutMs: 15_000,
    maximumResponseBytes: 12_000_000,
  });
  expect(scheduleRow("never-polled")).toMatchObject({
    lease_owner: "worker-a",
    lease_expires_at: "2026-07-17T12:01:30.000Z",
  });
  expect(scheduleRow("future").lease_owner).toBeNull();
  expect(scheduleRow("disabled").lease_owner).toBeNull();
});

it("prevents a second worker from claiming an active lease", async () => {
  insertSource("source-a", null, 1);

  await store.claimDueSources({ now: NOW, owner: "worker-a", leaseSeconds: 60, limit: 1 });
  const collision = await store.claimDueSources({
    now: "2026-07-17T12:00:30.000Z",
    owner: "worker-b",
    leaseSeconds: 60,
    limit: 1,
  });

  expect(collision).toEqual([]);
  expect(scheduleRow("source-a").lease_owner).toBe("worker-a");
});

it("recovers a source after its prior worker lease expires", async () => {
  insertSource("source-a", null, 1);
  await store.claimDueSources({ now: NOW, owner: "worker-a", leaseSeconds: 60, limit: 1 });

  const recovered = await store.claimDueSources({
    now: "2026-07-17T12:01:00.000Z",
    owner: "worker-b",
    leaseSeconds: 120,
    limit: 1,
  });

  expect(recovered.map((source) => source.sourceId)).toEqual(["source-a"]);
  expect(scheduleRow("source-a")).toMatchObject({
    lease_owner: "worker-b",
    lease_expires_at: "2026-07-17T12:03:00.000Z",
  });
});

it("requires the current owner to complete a lease and schedules the next poll", async () => {
  insertSource("source-a", null, 1);
  await store.claimDueSources({ now: NOW, owner: "worker-a", leaseSeconds: 60, limit: 1 });

  await expect(
    store.completeLease({
      sourceId: "source-a",
      owner: "worker-b",
      nextPollAt: "2026-07-17T14:00:00.000Z",
      outcome: "success",
    }),
  ).rejects.toBeInstanceOf(SourceLeaseOwnershipError);
  expect(scheduleRow("source-a").lease_owner).toBe("worker-a");

  await store.completeLease({
    sourceId: "source-a",
    owner: "worker-a",
    nextPollAt: "2026-07-17T14:00:00.000Z",
    outcome: "success",
  });

  expect(scheduleRow("source-a")).toMatchObject({
    next_poll_at: "2026-07-17T14:00:00.000Z",
    lease_owner: null,
    lease_expires_at: null,
  });
  await expect(
    store.claimDueSources({
      now: "2026-07-17T13:59:59.999Z",
      owner: "worker-b",
      leaseSeconds: 60,
      limit: 1,
    }),
  ).resolves.toEqual([]);
  await expect(
    store.claimDueSources({
      now: "2026-07-17T14:00:00.000Z",
      owner: "worker-b",
      leaseSeconds: 60,
      limit: 1,
    }),
  ).resolves.toHaveLength(1);
});

function insertCompany(): void {
  database
    .prepare(
      `INSERT INTO companies (
         id, slug, name, domain, career_url, initials, priority_tier,
         is_sample, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      "company-live",
      "live-company",
      "Live Company",
      "live.example",
      "https://live.example/careers",
      "LC",
      1,
      NOW,
      NOW,
    );
}

function insertSource(
  id: string,
  nextPollAt: string | null,
  enabled: 0 | 1,
  maximumResponseBytes?: number,
): void {
  database
    .prepare(
      `INSERT INTO sources (
         id, company_id, display_name, adapter_kind, official_url, config_json,
         enabled, expected_interval_minutes, minimum_request_interval_ms,
         next_poll_at, is_sample, created_at, updated_at
       ) VALUES (?, 'company-live', ?, 'greenhouse', ?, ?, ?, 120, 1000, ?, 0, ?, ?)`,
    )
    .run(
      id,
      `${id} official board`,
      `https://boards.greenhouse.io/${id}`,
      JSON.stringify({
        boardToken: id,
        ...(maximumResponseBytes ? { maximumResponseBytes } : {}),
      }),
      enabled,
      nextPollAt,
      NOW,
      NOW,
    );
}

function scheduleRow(sourceId: string): Record<string, unknown> {
  return database
    .prepare("SELECT next_poll_at, lease_owner, lease_expires_at FROM sources WHERE id = ?")
    .get(sourceId) as Record<string, unknown>;
}
