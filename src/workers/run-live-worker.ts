import path from "node:path";
import { pathToFileURL } from "node:url";

import { RespectfulHttpClient, type AdapterHttpClient } from "../adapters";
import { assertDatabaseReady, openDatabase, type SqliteDatabase } from "../server/database";
import { SqliteScheduledSourceStore } from "../server/sqlite-scheduled-source-store";
import { resolveMonitoringContactEmail } from "./contact";
import { MonitoringScheduler } from "./scheduler";

export const DEFAULT_LIVE_WORKER_DATABASE_PATH = path.resolve("data", "internjobs.live.sqlite");

export interface LiveWorkerOptions {
  databasePath?: string;
  contactEmail?: string;
  owner?: string;
  pollIntervalMs?: number;
  claimLimit?: number;
  leaseSeconds?: number;
  http?: AdapterHttpClient;
  onLog?: (event: Record<string, unknown>) => void;
}

export interface LiveWorkerRuntime {
  databasePath: string;
  database: SqliteDatabase;
  scheduler: MonitoringScheduler;
  start(): void;
  stop(): Promise<void>;
}

/**
 * Creates the long-running local live worker without starting it. The caller
 * owns the returned runtime and must call stop() to release the database.
 */
export function createLiveWorker(options: LiveWorkerOptions = {}): LiveWorkerRuntime {
  const databasePath = path.resolve(
    options.databasePath ??
      process.env.INTERNJOBS_LIVE_DB_PATH ??
      DEFAULT_LIVE_WORKER_DATABASE_PATH,
  );
  const database = openDatabase({ filename: databasePath, fileMustExist: true });

  try {
    assertDatabaseReady(database);
    assertSchedulingMigration(database);
    const enabledSources = (
      database.prepare("SELECT count(*) AS count FROM sources WHERE enabled = 1 AND is_sample = 0").get() as {
        count: number;
      }
    ).count;
    if (enabledSources === 0) {
      throw new Error(
        "The live database has no enabled official sources. Preview and enable a reviewed catalog source first.",
      );
    }

    const contactEmail = options.http
      ? undefined
      : resolveMonitoringContactEmail(options.contactEmail ?? process.env.MONITOR_CONTACT_EMAIL);
    const http =
      options.http ??
      new RespectfulHttpClient({
        ...(contactEmail ? { contactEmail } : {}),
        perHostConcurrency: 1,
        minimumHostIntervalMs: 1_000,
      });
    const store = new SqliteScheduledSourceStore(database);
    const log = options.onLog ?? ((event) => process.stdout.write(`${JSON.stringify(event)}\n`));
    const scheduler = new MonitoringScheduler({
      store,
      http,
      ...(options.owner ? { owner: options.owner } : {}),
      pollIntervalMs: options.pollIntervalMs ?? 30_000,
      claimLimit: options.claimLimit ?? 3,
      leaseSeconds: options.leaseSeconds ?? 300,
      onRun: (run) =>
        log({
          event: "source_run_completed",
          sourceId: run.sourceId,
          outcome: run.outcome,
          completeness: run.completeness,
          totalJobs: run.diagnostics.totalJobs,
          relevantJobs: run.relevantCount,
          completedAt: run.completedAt,
        }),
      onError: (error, source) =>
        log({
          event: "source_run_error",
          sourceId: source?.sourceId ?? null,
          error: error instanceof Error ? error.message : String(error),
          observedAt: new Date().toISOString(),
        }),
    });
    let closed = false;
    let stopping: Promise<void> | null = null;

    return {
      databasePath,
      database,
      scheduler,
      start() {
        if (closed) throw new Error("Cannot restart a stopped live worker runtime.");
        scheduler.start();
      },
      stop() {
        if (stopping) return stopping;
        closed = true;
        stopping = (async () => {
          try {
            await scheduler.stopAndWait();
          } finally {
            database.close();
          }
        })();
        return stopping;
      },
    };
  } catch (error) {
    database.close();
    throw error;
  }
}

export function runLiveWorkerCli(args = process.argv.slice(2)): LiveWorkerRuntime {
  const databasePath = parseDatabasePath(args);
  const runtime = createLiveWorker({ ...(databasePath ? { databasePath } : {}) });
  runtime.start();
  process.stdout.write(
    `${JSON.stringify({ event: "live_worker_started", databasePath: runtime.databasePath })}\n`,
  );
  return runtime;
}

function assertSchedulingMigration(database: SqliteDatabase): void {
  const columns = database.prepare("PRAGMA table_info(sources)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  const missing = ["next_poll_at", "lease_owner", "lease_expires_at"].filter(
    (column) => !names.has(column),
  );
  if (missing.length > 0) {
    throw new Error(
      `The live database is missing scheduling columns (${missing.join(", ")}). Run the live bootstrap/migrations first.`,
    );
  }
}

function parseDatabasePath(args: string[]): string | undefined {
  let databasePath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--database" || argument === "--database-path" || argument === "--db") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path.`);
      databasePath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--database=")) {
      databasePath = argument.slice("--database=".length);
      continue;
    }
    if (argument.startsWith("--database-path=")) {
      databasePath = argument.slice("--database-path=".length);
      continue;
    }
    if (argument.startsWith("--db=")) {
      databasePath = argument.slice("--db=".length);
      continue;
    }
    throw new Error(`Unknown live worker option ${argument}.`);
  }
  return databasePath;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    const runtime = runLiveWorkerCli();
    const stop = () => {
      void runtime.stop().then(
        () => {
          process.exitCode = 0;
        },
        (error: unknown) => {
          process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
          process.exitCode = 1;
        },
      );
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
