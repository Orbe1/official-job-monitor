import path from "node:path";

import type BetterSqlite3 from "better-sqlite3";

import {
  DEFAULT_LIVE_SOURCE_CATALOG_PATH,
  enabledLiveSourceCount,
  loadLiveSourceCatalog,
  syncLiveSourceCatalog,
  type LiveSourceSyncResult,
} from "../src/server/live-sources";
import { PROJECT_ROOT, isDirectExecution, openDatabase, resolveDatabasePath } from "./database";
import { applyMigrations } from "./migrate";

export const DEFAULT_LIVE_DATABASE_PATH = path.join(
  PROJECT_ROOT,
  "data",
  "internjobs.live.sqlite",
);

export const LIVE_DEVELOPMENT_USER_ID = "user-local-dev";

export interface LiveBootstrapOptions {
  databasePath?: string;
  catalogPath?: string;
  now?: () => Date;
}

export interface LiveBootstrapResult extends LiveSourceSyncResult {
  databasePath: string;
  catalogPath: string;
  migrationsApplied: string[];
  migrationsAlreadyApplied: string[];
  developmentUsers: number;
  jobs: number;
  sampleJobs: number;
}

interface CliOptions {
  databasePath?: string;
  catalogPath?: string;
}

function readOption(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a path.`);
  }
  return value;
}

function parseCliOptions(args: string[]): CliOptions {
  const result: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--database" || argument === "--database-path" || argument === "--db") {
      result.databasePath = readOption(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--database=")) {
      result.databasePath = argument.slice("--database=".length);
      continue;
    }
    if (argument.startsWith("--database-path=")) {
      result.databasePath = argument.slice("--database-path=".length);
      continue;
    }
    if (argument.startsWith("--db=")) {
      result.databasePath = argument.slice("--db=".length);
      continue;
    }
    if (argument === "--catalog") {
      result.catalogPath = readOption(args, index, argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--catalog=")) {
      result.catalogPath = argument.slice("--catalog=".length);
      continue;
    }
    throw new Error(`Unknown live bootstrap option ${argument}.`);
  }
  return result;
}

function scalarCount(database: BetterSqlite3.Database, sql: string): number {
  return (database.prepare(sql).get() as { count: number }).count;
}

function assertNoSampleRecords(database: BetterSqlite3.Database): void {
  const sampleCounts = {
    users: scalarCount(database, "SELECT count(*) AS count FROM users WHERE is_sample = 1"),
    companies: scalarCount(database, "SELECT count(*) AS count FROM companies WHERE is_sample = 1"),
    sources: scalarCount(database, "SELECT count(*) AS count FROM sources WHERE is_sample = 1"),
    jobs: scalarCount(database, "SELECT count(*) AS count FROM jobs WHERE is_sample = 1"),
  };
  const populated = Object.entries(sampleCounts).filter(([, count]) => count > 0);
  if (populated.length > 0) {
    throw new Error(
      `Refusing to bootstrap live sources into a sample database (${populated
        .map(([table, count]) => `${table}: ${count}`)
        .join(", ")}). Use ${DEFAULT_LIVE_DATABASE_PATH}.`,
    );
  }
}

function upsertDevelopmentUser(database: BetterSqlite3.Database, observedAt: string): void {
  database
    .prepare(`
      INSERT INTO users (
        id, auth_subject, email, name, initials, mode, is_admin, is_sample,
        created_at, updated_at
      ) VALUES (?, 'development:local-live-user', 'student@local.internjobs.invalid',
        'Local Student (Development)', 'LS', 'development', 1, 0, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        auth_subject = excluded.auth_subject,
        email = excluded.email,
        name = excluded.name,
        initials = excluded.initials,
        mode = 'development',
        is_admin = 1,
        is_sample = 0,
        updated_at = excluded.updated_at
    `)
    .run(LIVE_DEVELOPMENT_USER_ID, observedAt, observedAt);
}

function insertLiveProofPreferences(database: BetterSqlite3.Database, observedAt: string): void {
  database
    .prepare(`
      INSERT OR IGNORE INTO user_preferences (
        user_id, onboarding_completed, opportunity_focus, technical_interests_json,
        preferred_locations_json, remote_preferred, default_notification_frequency,
        last_visit_at, created_at, updated_at
      ) VALUES (?, 1, 'both', '[]', '[]', 0, 'immediate', NULL, ?, ?)
    `)
    .run(LIVE_DEVELOPMENT_USER_ID, observedAt, observedAt);
}

export function resolveLiveDatabasePath(explicitPath?: string): string {
  const configured =
    explicitPath ?? process.env.INTERNJOBS_LIVE_DB_PATH ?? DEFAULT_LIVE_DATABASE_PATH;
  return resolveDatabasePath(configured);
}

export function bootstrapLiveDatabase(options: LiveBootstrapOptions = {}): LiveBootstrapResult {
  const databasePath = resolveLiveDatabasePath(options.databasePath);
  const catalogPath = path.resolve(options.catalogPath ?? DEFAULT_LIVE_SOURCE_CATALOG_PATH);
  const catalog = loadLiveSourceCatalog(catalogPath);
  const database = openDatabase(databasePath);

  try {
    const migrations = applyMigrations(database);
    assertNoSampleRecords(database);
    const observedAt = (options.now ?? (() => new Date()))().toISOString();
    const synchronize = database.transaction(() => {
      upsertDevelopmentUser(database, observedAt);
      // This workspace exists to show the official-source proof immediately.
      // Preserve any preferences the local user has already chosen.
      insertLiveProofPreferences(database, observedAt);
      return syncLiveSourceCatalog(database, catalog, observedAt);
    });
    const syncResult = synchronize();
    assertNoSampleRecords(database);

    return {
      databasePath,
      catalogPath,
      migrationsApplied: migrations.applied,
      migrationsAlreadyApplied: migrations.alreadyApplied,
      developmentUsers: scalarCount(
        database,
        "SELECT count(*) AS count FROM users WHERE mode = 'development' AND is_sample = 0",
      ),
      jobs: scalarCount(database, "SELECT count(*) AS count FROM jobs"),
      sampleJobs: scalarCount(database, "SELECT count(*) AS count FROM jobs WHERE is_sample = 1"),
      ...syncResult,
      enabledSources: enabledLiveSourceCount(catalog),
    };
  } finally {
    database.close();
  }
}

if (isDirectExecution(import.meta.url)) {
  try {
    const cli = parseCliOptions(process.argv.slice(2));
    const result = bootstrapLiveDatabase(cli);
    console.log(
      `Live database ready at ${result.databasePath}. ` +
        `Synchronized ${result.companies} official companies and ${result.sources} sources ` +
        `(${result.enabledSources} enabled); ${result.jobs} jobs, ${result.sampleJobs} sample jobs.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
