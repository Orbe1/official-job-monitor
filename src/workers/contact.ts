const RESERVED_CONTACT_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
]);

export interface MonitoringContactOptions {
  required?: boolean;
}

/**
 * Contact identification is optional for local, operator-invoked monitoring.
 * Long-running production monitoring requires a reachable operator so an
 * official source can report crawler problems using the outbound User-Agent.
 */
export function resolveMonitoringContactEmail(
  value = process.env.MONITOR_CONTACT_EMAIL,
  options: MonitoringContactOptions = {},
): string | undefined {
  const email = value?.trim() ?? "";
  const required = options.required ?? process.env.NODE_ENV === "production";

  if (!email) {
    if (required) {
      throw new Error(
        "Production monitoring requires MONITOR_CONTACT_EMAIL with a real operator address for the official-source User-Agent.",
      );
    }
    return undefined;
  }

  const domain = email.split("@").at(-1)?.toLowerCase() ?? "";
  const reservedDomain = domain === "localhost"
    || domain.endsWith(".localhost")
    || /\.(?:test|invalid|example)$/.test(domain)
    || RESERVED_CONTACT_DOMAINS.has(domain);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || reservedDomain) {
    throw new Error(
      "MONITOR_CONTACT_EMAIL must be a valid real operator address when supplied.",
    );
  }

  return email;
}
