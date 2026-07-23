// @vitest-environment node
import path from "node:path";

import {
  LIVE_DEVELOPMENT_SERVICES_SCRIPT,
  liveDevelopmentDatabasePath,
  parseLiveDevelopmentOptions,
} from "../../scripts/dev-live";

describe("one-command live development options", () => {
  it("uses the fail-fast live API process after bootstrap succeeds", () => {
    expect(LIVE_DEVELOPMENT_SERVICES_SCRIPT).toBe("dev:services:live");
  });

  it("does not require a contact email for local development", () => {
    const options = parseLiveDevelopmentOptions([], {});

    expect(options.contactEmail).toBeUndefined();
    expect(options.refresh).toBe(false);
  });

  it("accepts a one-command contact email without persisting it", () => {
    const options = parseLiveDevelopmentOptions(
      ["--contact-email=maintainer@internjobs.dev", "--refresh", "--db", "data/cloudflare-proof.sqlite"],
      {},
    );

    expect(options).toEqual({
      databasePath: path.resolve("data/cloudflare-proof.sqlite"),
      contactEmail: "maintainer@internjobs.dev",
      refresh: true,
    });
  });

  it("continues to honor the dedicated live database environment override", () => {
    expect(
      parseLiveDevelopmentOptions([], {
        INTERNJOBS_LIVE_DB_PATH: "data/custom-live.sqlite",
        MONITOR_CONTACT_EMAIL: "maintainer@internjobs.dev",
      }),
    ).toEqual({
      databasePath: path.resolve("data/custom-live.sqlite"),
      contactEmail: "maintainer@internjobs.dev",
      refresh: false,
    });
    expect(liveDevelopmentDatabasePath(["--db=data/explicit-live.sqlite"])).toBe(
      path.resolve("data/explicit-live.sqlite"),
    );
  });
});
