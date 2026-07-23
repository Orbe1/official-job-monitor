import type { Request } from "express";

import type { Viewer } from "../shared/domain";
import type { SqliteDatabase } from "./database";
import { HttpError } from "./http-errors";

export interface IdentityProvider {
  readonly mode: "development" | "authenticated";
  authenticate(request: Request, database: SqliteDatabase): Promise<Viewer> | Viewer;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  is_admin: number;
}

/**
 * Development-only identity boundary. It always resolves one explicitly
 * configured seeded user; it does not inspect or trust a client-supplied user
 * header and must not be described as production authentication.
 */
export class DevelopmentIdentityProvider implements IdentityProvider {
  readonly mode = "development" as const;

  constructor(private readonly userId = process.env.DEV_USER_ID ?? "user-local-dev") {}

  resolveViewer(database: SqliteDatabase): Viewer {
    const user = database
      .prepare("SELECT id, name, email, initials, is_admin FROM users WHERE id = ?")
      .get(this.userId) as UserRow | undefined;

    if (!user) {
      throw new HttpError(
        503,
        "DEVELOPMENT_USER_MISSING",
        "The configured development user is missing. Run `npm run db:seed`.",
      );
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: user.initials,
      mode: this.mode,
      isAdmin: Boolean(user.is_admin),
    };
  }

  authenticate(_request: Request, database: SqliteDatabase): Viewer {
    return this.resolveViewer(database);
  }
}

/**
 * Clear fail-closed placeholder for a future production auth integration.
 * Deployments must inject a real IdentityProvider instead of accepting the
 * seeded development identity.
 */
export class UnconfiguredProductionIdentityProvider implements IdentityProvider {
  readonly mode = "authenticated" as const;

  authenticate(): never {
    throw new HttpError(
      503,
      "PRODUCTION_AUTH_NOT_CONFIGURED",
      "Production authentication is not configured for this deployment.",
    );
  }
}

export class StaticIdentityProvider implements IdentityProvider {
  readonly mode: "development" | "authenticated";

  constructor(private readonly viewer: Viewer) {
    this.mode = viewer.mode;
  }

  authenticate(): Viewer {
    return this.viewer;
  }
}
