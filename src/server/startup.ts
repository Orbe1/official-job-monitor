import { applyMigrations } from "../../scripts/migrate";
import type { BootstrapPayload } from "../shared/domain";
import {
  DevelopmentIdentityProvider,
  UnconfiguredProductionIdentityProvider,
  type IdentityProvider,
} from "./auth";
import { assertDatabaseReady, type SqliteDatabase } from "./database";
import { InternJobsRepository } from "./repository";

export interface PrepareServerRuntimeOptions {
  productionAuthRequested: boolean;
  applyPendingMigrations: boolean;
}

export interface PreparedServerRuntime {
  identityProvider: IdentityProvider;
  repository: InternJobsRepository;
  bootstrap: BootstrapPayload | null;
}

/**
 * Prepare everything the HTTP server needs before it binds a port. Local
 * development applies pending append-only migrations on every API restart so
 * a watched process cannot load new repository SQL against a stale database.
 * The real bootstrap query and JSON serialization are then exercised as the
 * readiness boundary used by Discover.
 */
export function prepareServerRuntime(
  database: SqliteDatabase,
  options: PrepareServerRuntimeOptions,
): PreparedServerRuntime {
  if (options.applyPendingMigrations) applyMigrations(database);
  assertDatabaseReady(database);

  const repository = new InternJobsRepository(database);
  if (options.productionAuthRequested) {
    return {
      identityProvider: new UnconfiguredProductionIdentityProvider(),
      repository,
      bootstrap: null,
    };
  }

  const identityProvider = new DevelopmentIdentityProvider();
  const bootstrap = repository.getBootstrap(identityProvider.resolveViewer(database));
  JSON.stringify(bootstrap);
  return { identityProvider, repository, bootstrap };
}
