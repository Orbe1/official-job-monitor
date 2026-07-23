import { AdapterError, type AdapterHttpClient, type HttpResponse } from "./types";

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"]);

interface HttpClientOptions {
  userAgent?: string;
  contactEmail?: string;
  timeoutMs?: number;
  maxRetries?: number;
  globalConcurrency?: number;
  perHostConcurrency?: number;
  minimumHostIntervalMs?: number;
  maximumResponseBytes?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  allowPrivateHostsForTests?: boolean;
}

export class RespectfulHttpClient implements AdapterHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly minimumHostIntervalMs: number;
  private readonly maximumResponseBytes: number;
  private readonly userAgent: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly global: Semaphore;
  private readonly perHostLimit: number;
  private readonly hostSemaphores = new Map<string, Semaphore>();
  private readonly hostLastRequest = new Map<string, number>();
  private readonly allowPrivateHostsForTests: boolean;

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? numberFromEnv("MONITOR_TIMEOUT_MS", 15_000);
    this.maxRetries = options.maxRetries ?? numberFromEnv("MONITOR_MAX_RETRIES", 2);
    this.minimumHostIntervalMs = options.minimumHostIntervalMs ?? numberFromEnv("MONITOR_MIN_HOST_INTERVAL_MS", 1_000);
    this.maximumResponseBytes = options.maximumResponseBytes ?? 5_000_000;
    this.userAgent = options.userAgent ?? process.env.MONITOR_USER_AGENT ?? "InternJobsMonitor/0.1 (public-career-source monitor)";
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.global = new Semaphore(options.globalConcurrency ?? numberFromEnv("MONITOR_CONCURRENCY", 3));
    this.perHostLimit = options.perHostConcurrency ?? numberFromEnv("MONITOR_PER_HOST_CONCURRENCY", 1);
    this.allowPrivateHostsForTests = options.allowPrivateHostsForTests ?? false;

    const contactEmail = options.contactEmail?.trim();
    if (contactEmail) {
      this.userAgent += ` contact=${contactEmail}`;
    }
  }

  getJson<T>(url: string, options?: { headers?: Record<string, string>; minimumIntervalMs?: number; timeoutMs?: number; maximumResponseBytes?: number }): Promise<HttpResponse<T>> {
    return this.request<T>("GET", url, undefined, options);
  }

  postJson<T>(url: string, body: unknown, options?: { headers?: Record<string, string>; minimumIntervalMs?: number; timeoutMs?: number; maximumResponseBytes?: number }): Promise<HttpResponse<T>> {
    return this.request<T>("POST", url, body, options);
  }

  private async request<T>(
    method: "GET" | "POST",
    rawUrl: string,
    body?: unknown,
    options?: { headers?: Record<string, string>; minimumIntervalMs?: number; timeoutMs?: number; maximumResponseBytes?: number },
  ): Promise<HttpResponse<T>> {
    const url = validatePublicUrl(rawUrl, this.allowPrivateHostsForTests);
    const hostSemaphore = this.hostSemaphores.get(url.host) ?? new Semaphore(this.perHostLimit);
    this.hostSemaphores.set(url.host, hostSemaphore);

    return this.global.run(() => hostSemaphore.run(async () => {
      let finalError: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        await this.waitForHost(url.host, options?.minimumIntervalMs);
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? this.timeoutMs);
          this.hostLastRequest.set(url.host, Date.now());
          let response: Response;
          try {
            response = await this.fetchImpl(url, {
              method,
              signal: controller.signal,
              redirect: "follow",
              headers: {
                Accept: "application/json",
                "User-Agent": this.userAgent,
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...options?.headers,
              },
              body: body === undefined ? undefined : JSON.stringify(body),
            });
          } finally {
            clearTimeout(timeout);
          }

          if (!response.ok) {
            const retryable = TRANSIENT_STATUSES.has(response.status);
            const error = new AdapterError(`Official source returned HTTP ${response.status}`, `HTTP_${response.status}`, retryable, response.status);
            if (!retryable || attempt >= this.maxRetries) throw error;
            await this.sleep(retryDelay(response.headers.get("retry-after"), attempt, this.random));
            continue;
          }

          const maximumResponseBytes = options?.maximumResponseBytes ?? this.maximumResponseBytes;
          const contentLength = Number(response.headers.get("content-length") ?? 0);
          if (contentLength > maximumResponseBytes) {
            throw new AdapterError("Official source response exceeded the configured size limit", "RESPONSE_TOO_LARGE", false, response.status);
          }

          const text = await response.text();
          if (new TextEncoder().encode(text).byteLength > maximumResponseBytes) {
            throw new AdapterError("Official source response exceeded the configured size limit", "RESPONSE_TOO_LARGE", false, response.status);
          }
          detectProtectionOrLogin(text, response.headers.get("content-type"));

          try {
            return {
              status: response.status,
              data: JSON.parse(text) as T,
              headers: response.headers,
              url: response.url || url.toString(),
            };
          } catch {
            throw new AdapterError("Official source returned malformed JSON", "MALFORMED_JSON", false, response.status);
          }
        } catch (error) {
          finalError = normalizeFetchError(error);
          const normalized = finalError as AdapterError;
          if (!normalized.retryable || attempt >= this.maxRetries) throw normalized;
          await this.sleep(retryDelay(null, attempt, this.random));
        }
      }
      throw finalError;
    }));
  }

  private async waitForHost(host: string, sourceMinimum?: number): Promise<void> {
    const minimum = Math.max(this.minimumHostIntervalMs, sourceMinimum ?? 0);
    const elapsed = Date.now() - (this.hostLastRequest.get(host) ?? 0);
    if (elapsed < minimum) await this.sleep(minimum - elapsed);
  }
}

export function validatePublicUrl(rawUrl: string, allowPrivateHostsForTests = false): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AdapterError("Source URL is invalid", "INVALID_URL", false);
  }
  if (url.protocol !== "https:" && !(allowPrivateHostsForTests && url.protocol === "http:")) {
    throw new AdapterError("Official source URLs must use HTTPS", "UNSAFE_PROTOCOL", false);
  }
  if (url.username || url.password) throw new AdapterError("Credential-bearing source URLs are not allowed", "CREDENTIAL_URL", false);
  const hostname = url.hostname.toLowerCase();
  if (!allowPrivateHostsForTests && (BLOCKED_HOSTS.has(hostname) || isPrivateIpv4(hostname) || hostname.endsWith(".local"))) {
    throw new AdapterError("Private or local source hosts are not allowed", "PRIVATE_HOST", false);
  }
  return url;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function detectProtectionOrLogin(text: string, contentType: string | null): void {
  const sample = text.slice(0, 20_000).toLowerCase();
  const html = contentType?.includes("text/html") || /^\s*<!doctype html|^\s*<html/i.test(text);
  if (/captcha|cf-chl-|cloudflare ray id|verify you are human|bot protection|access denied/.test(sample)) {
    throw new AdapterError("Official source returned a bot-protection or access-denied page", "BOT_PROTECTION", false);
  }
  if (html && /<form[^>]+(login|sign-in)|\bsign in to continue\b|\blog in\b/.test(sample)) {
    throw new AdapterError("Official source returned a login page", "LOGIN_PAGE", false);
  }
  if (html) throw new AdapterError("Official JSON endpoint returned HTML", "UNEXPECTED_HTML", false);
}

function normalizeFetchError(error: unknown): AdapterError {
  if (error instanceof AdapterError) return error;
  if (error instanceof Error && error.name === "AbortError") return new AdapterError("Official source request timed out", "TIMEOUT", true);
  return new AdapterError(error instanceof Error ? error.message : "Official source request failed", "TRANSPORT_ERROR", true);
}

function retryDelay(retryAfter: string | null, attempt: number, random: () => number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(0, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(60_000, Math.max(0, date - Date.now()));
  }
  return Math.min(30_000, 500 * 2 ** attempt + Math.floor(random() * 250));
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer");
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}
