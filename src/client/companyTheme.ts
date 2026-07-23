import type { CSSProperties } from "react";
import type { CompanySummary } from "../shared/domain";

export interface CompanyTheme {
  accent: string;
  accentStrong: string;
  border: string;
  tint: string;
  tintStrong: string;
  onAccent: "#ffffff" | "#10201a";
}

type ThemeCompany = Pick<CompanySummary, "slug" | "name" | "domain">;

const KNOWN_COMPANY_ACCENTS: Record<string, string> = {
  nvidia: "#4f7908",
  stripe: "#635bff",
  databricks: "#bd3b1e",
  microsoft: "#176b64",
  "jane-street": "#176b75",
  ramp: "#425816",
  apple: "#40514d",
  amazon: "#855500",
  meta: "#1768a7",
  google: "#315ca8",
  cloudflare: "#aa4808",
  figma: "#7551a6",
  benchling: "#08705e",
  palantir: "#334e5b",
  anthropic: "#80513a",
  "citadel-securities": "#344f7a",
  "two-sigma": "#365f7d",
  rippling: "#5e4591",
  anduril: "#405345",
  "scale-ai": "#4c57a8",
};

const DEFAULT_ACCENT = "#12634f";

function toRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHex(red: number, green: number, blue: number): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function mix(color: string, target: string, targetWeight: number): string {
  const sourceRgb = toRgb(color);
  const targetRgb = toRgb(target);
  return toHex(
    sourceRgb[0] + (targetRgb[0] - sourceRgb[0]) * targetWeight,
    sourceRgb[1] + (targetRgb[1] - sourceRgb[1]) * targetWeight,
    sourceRgb[2] + (targetRgb[2] - sourceRgb[2]) * targetWeight,
  );
}

function relativeLuminance(color: string): number {
  const channels = toRgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function getCompanyTheme(company: ThemeCompany): CompanyTheme {
  const accent = KNOWN_COMPANY_ACCENTS[company.slug.toLowerCase()]
    ?? DEFAULT_ACCENT;
  const darkInk = "#10201a";
  const white = "#ffffff";

  return {
    accent,
    accentStrong: mix(accent, "#07120e", 0.2),
    border: mix(accent, "#ffffff", 0.66),
    tint: mix(accent, "#fffdf8", 0.92),
    tintStrong: mix(accent, "#fffdf8", 0.82),
    onAccent: contrastRatio(accent, white) >= contrastRatio(accent, darkInk) ? white : darkInk,
  };
}

export type CompanyThemeStyle = CSSProperties & {
  "--company-accent": string;
  "--company-accent-strong": string;
  "--company-accent-border": string;
  "--company-accent-tint": string;
  "--company-accent-tint-strong": string;
  "--company-on-accent": string;
};

export function companyThemeStyle(company: ThemeCompany): CompanyThemeStyle {
  const theme = getCompanyTheme(company);
  return {
    "--company-accent": theme.accent,
    "--company-accent-strong": theme.accentStrong,
    "--company-accent-border": theme.border,
    "--company-accent-tint": theme.tint,
    "--company-accent-tint-strong": theme.tintStrong,
    "--company-on-accent": theme.onAccent,
  };
}
