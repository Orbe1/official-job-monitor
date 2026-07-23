import { describe, expect, it } from "vitest";

import { companyThemeStyle, getCompanyTheme } from "./companyTheme";

const unknown = { slug: "acme-systems", name: "Acme Systems", domain: "acme.example" };

describe("company theme", () => {
  it.each([
    ["stripe", "Stripe", "stripe.com", "#635bff"],
    ["anthropic", "Anthropic", "anthropic.com", "#80513a"],
    ["nvidia", "NVIDIA", "nvidia.com", "#4f7908"],
    ["ramp", "Ramp", "ramp.com", "#425816"],
  ])("uses the restrained %s brand accent with derived readable surfaces", (slug, name, domain, accent) => {
    const theme = getCompanyTheme({ slug, name, domain });

    expect(theme.accent).toBe(accent);
    expect(theme.tint).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.tint).not.toBe(theme.accent);
    expect(["#ffffff", "#10201a"]).toContain(theme.onAccent);
  });

  it("creates a stable fallback and exposes the complete CSS variable contract", () => {
    expect(getCompanyTheme(unknown)).toEqual(getCompanyTheme(unknown));
    expect(getCompanyTheme(unknown).accent).toBe("#12634f");
    expect(companyThemeStyle(unknown)).toEqual(expect.objectContaining({
      "--company-accent": expect.stringMatching(/^#[0-9a-f]{6}$/i),
      "--company-accent-strong": expect.any(String),
      "--company-accent-border": expect.any(String),
      "--company-accent-tint": expect.any(String),
      "--company-accent-tint-strong": expect.any(String),
      "--company-on-accent": expect.any(String),
    }));
  });
});
