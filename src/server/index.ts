import { createApp } from "./app";
import { openDatabase } from "./database";
import { prepareServerRuntime } from "./startup";

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const database = openDatabase();
const productionAuthRequested = process.env.AUTH_MODE === "production";
let runtime: ReturnType<typeof prepareServerRuntime>;
try {
  runtime = prepareServerRuntime(database, {
    productionAuthRequested,
    applyPendingMigrations: process.env.NODE_ENV !== "production",
  });
} catch (error) {
  database.close();
  throw error;
}

const app = createApp({
  database,
  identityProvider: runtime.identityProvider,
  repository: runtime.repository,
  serveClient: process.env.NODE_ENV === "production",
});

const server = app.listen(port, "127.0.0.1", () => {
  // This line is intentionally explicit about the local development boundary.
  const authLabel = productionAuthRequested ? "production-unconfigured" : "seeded-development-user";
  process.stdout.write(`InternJobs API listening at http://127.0.0.1:${port} (auth: ${authLabel})\n`);
});

function shutdown(signal: string): void {
  process.stdout.write(`Received ${signal}; closing InternJobs API.\n`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

export { createApp } from "./app";
export { openDatabase } from "./database";
export { SqliteMonitorPersistence } from "./monitor-persistence";
