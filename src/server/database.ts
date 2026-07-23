import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export interface DatabaseOptions {
  filename?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export function defaultDatabasePath(): string {
  return path.resolve(process.env.INTERNJOBS_DB_PATH ?? process.env.DATABASE_PATH ?? "data/internjobs.sqlite");
}

export function openDatabase(options: DatabaseOptions = {}): SqliteDatabase {
  const filename = options.filename ?? defaultDatabasePath();
  if (filename !== ":memory:" && !options.readonly) {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const database = new Database(filename, {
    ...(options.readonly === undefined ? {} : { readonly: options.readonly }),
    ...(options.fileMustExist === undefined ? {} : { fileMustExist: options.fileMustExist }),
  });
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  if (filename !== ":memory:" && !options.readonly) {
    database.pragma("journal_mode = WAL");
  }
  return database;
}

export function assertDatabaseReady(database: SqliteDatabase): void {
  const migrationTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name: string } | undefined;
  if (!migrationTable) {
    throw new Error(
      "The InternJobs database has not been migrated. Run `npm run db:migrate` and `npm run db:seed` first.",
    );
  }
}
