import fs from "node:fs";
import path from "node:path";

import { PROJECT_ROOT, isDirectExecution, resolveDatabasePath } from "./database";
import { seedDatabase, type SeedResult } from "./seed";

const SQLITE_FILE_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3"]);

function assertSafeResetTarget(databasePath: string): void {
  if (databasePath === ":memory:") {
    throw new Error("db:reset requires a persistent SQLite file, not :memory:.");
  }

  const resolvedPath = path.resolve(databasePath);
  const relativeToProject = path.relative(PROJECT_ROOT, resolvedPath);
  const isInsideProject =
    relativeToProject !== "" &&
    !relativeToProject.startsWith(`..${path.sep}`) &&
    relativeToProject !== ".." &&
    !path.isAbsolute(relativeToProject);

  if (!isInsideProject && process.env.INTERNJOBS_ALLOW_EXTERNAL_DB_RESET !== "1") {
    throw new Error(
      `Refusing to reset a database outside the InternJobs workspace: ${resolvedPath}. ` +
        "Set INTERNJOBS_ALLOW_EXTERNAL_DB_RESET=1 only when that external file is intentionally disposable.",
    );
  }

  if (!SQLITE_FILE_EXTENSIONS.has(path.extname(resolvedPath).toLocaleLowerCase())) {
    throw new Error(`Refusing to reset a path that does not look like a SQLite database: ${resolvedPath}`);
  }
}

export function resetDatabase(explicitDatabasePath?: string): SeedResult {
  const databasePath = resolveDatabasePath(explicitDatabasePath);
  assertSafeResetTarget(databasePath);

  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    fs.rmSync(candidate, { force: true });
  }

  return seedDatabase(databasePath);
}

if (isDirectExecution(import.meta.url)) {
  try {
    const result = resetDatabase();
    console.log(
      `Reset ${result.databasePath} and loaded LOCAL SAMPLE DATA: ` +
        `${result.activeJobs} active jobs and ${result.closedJobs} closed jobs.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

