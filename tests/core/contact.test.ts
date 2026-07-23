// @vitest-environment node
import { resolveMonitoringContactEmail } from "../../src/workers/contact";

describe("monitoring contact policy", () => {
  it("allows local monitoring without an email", () => {
    expect(resolveMonitoringContactEmail(undefined, { required: false })).toBeUndefined();
  });

  it("requires a real address for production monitoring", () => {
    expect(() => resolveMonitoringContactEmail(undefined, { required: true })).toThrow(
      /Production monitoring requires MONITOR_CONTACT_EMAIL/,
    );
    expect(resolveMonitoringContactEmail("operator@internjobs.dev", { required: true })).toBe(
      "operator@internjobs.dev",
    );
  });

  it.each([
    "maintainer@example.com",
    "operator@company.test",
    "operator@company.invalid",
    "operator@company.example",
    "operator@localhost",
  ])("rejects an invalid or reserved supplied address: %s", (address) => {
    expect(() => resolveMonitoringContactEmail(address, { required: false })).toThrow(
      /valid real operator address/,
    );
  });
});
