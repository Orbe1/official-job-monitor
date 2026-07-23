import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import BetterSqlite3 from "better-sqlite3";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DATABASE_PATH = path.join(PROJECT_ROOT, "data", "internjobs.sqlite");

export function resolveDatabasePath(explicitPath?: string): string {
  const configuredPath =
    explicitPath ??
    process.env.INTERNJOBS_DB_PATH ??
    process.env.DATABASE_PATH ??
    DEFAULT_DATABASE_PATH;

  if (configuredPath === ":memory:") {
    return configuredPath;
  }

  return path.resolve(PROJECT_ROOT, configuredPath);
}

export function openDatabase(explicitPath?: string): BetterSqlite3.Database {
  const databasePath = resolveDatabasePath(explicitPath);

  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new BetterSqlite3(databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  if (databasePath !== ":memory:") {
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = NORMAL");
  }

  return database;
}

export function isDirectExecution(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    return false;
  }

  const modulePath = path.resolve(fileURLToPath(moduleUrl));
  const entrypointPath = path.resolve(entrypoint);

  return process.platform === "win32"
    ? modulePath.toLocaleLowerCase() === entrypointPath.toLocaleLowerCase()
    : modulePath === entrypointPath;
}

