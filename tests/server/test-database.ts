import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { PROJECT_ROOT } from "../../scripts/database";
import { resetDatabase } from "../../scripts/reset-db";
import { openDatabase, type SqliteDatabase } from "../../src/server/database";

export interface SeededTestDatabase {
  database: SqliteDatabase;
  filename: string;
  cleanup(): void;
}

export function createSeededTestDatabase(label: string): SeededTestDatabase {
  const filename = path.join(PROJECT_ROOT, "data", `vitest-${label}-${randomUUID()}.sqlite`);
  resetDatabase(filename);
  const database = openDatabase({ filename });
  return {
    database,
    filename,
    cleanup() {
      if (database.open) database.close();
      for (const candidate of [filename, `${filename}-wal`, `${filename}-shm`]) {
        fs.rmSync(candidate, { force: true });
      }
    },
  };
}
