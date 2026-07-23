import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type BetterSqlite3 from "better-sqlite3";

import {
  PROJECT_ROOT,
  isDirectExecution,
  openDatabase,
  resolveDatabasePath,
} from "./database";

const DEFAULT_MIGRATIONS_DIRECTORY = path.join(PROJECT_ROOT, "db", "migrations");
const MIGRATION_FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

interface AppliedMigrationRow {
  name: string;
  checksum: string;
}

export interface MigrationResult {
  databasePath: string;
  applied: string[];
  alreadyApplied: string[];
}

function migrationChecksum(sql: string): string {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function ensureMigrationTable(database: BetterSqlite3.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) WITHOUT ROWID;
  `);
}

export function applyMigrations(
  database: BetterSqlite3.Database,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
): Omit<MigrationResult, "databasePath"> {
  ensureMigrationTable(database);

  const migrationFiles = fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
  }

  const appliedRows = database
    .prepare<[], AppliedMigrationRow>("SELECT name, checksum FROM schema_migrations ORDER BY name")
    .all();
  const appliedByName = new Map(appliedRows.map((row) => [row.name, row.checksum]));
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, ?)",
  );

  for (const migrationFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDirectory, migrationFile), "utf8");
    const checksum = migrationChecksum(sql);
    const recordedChecksum = appliedByName.get(migrationFile);

    if (recordedChecksum) {
      if (recordedChecksum !== checksum) {
        throw new Error(
          `Applied migration ${migrationFile} has changed. Add a new migration instead of editing history.`,
        );
      }

      alreadyApplied.push(migrationFile);
      continue;
    }

    const applyOne = database.transaction(() => {
      database.exec(sql);
      recordMigration.run(migrationFile, checksum, new Date().toISOString());
    });

    applyOne();
    applied.push(migrationFile);
  }

  return { applied, alreadyApplied };
}

export function migrateDatabase(explicitDatabasePath?: string): MigrationResult {
  const databasePath = resolveDatabasePath(explicitDatabasePath);
  const database = openDatabase(databasePath);

  try {
    return {
      databasePath,
      ...applyMigrations(database),
    };
  } finally {
    database.close();
  }
}

if (isDirectExecution(import.meta.url)) {
  try {
    const result = migrateDatabase();
    const appliedSummary =
      result.applied.length > 0
        ? `Applied ${result.applied.join(", ")}`
        : "Database schema is already current";
    console.log(`${appliedSummary}. Database: ${result.databasePath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

