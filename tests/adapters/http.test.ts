// @vitest-environment node
import { RespectfulHttpClient, validatePublicUrl } from "../../src/adapters/http";

describe("respectful HTTP client", () => {
  it.each(["http://example.com/jobs", "https://127.0.0.1/jobs", "https://192.168.1.4/jobs", "https://user:pass@example.com/jobs"])("blocks unsafe source URL %s", (url) => {
    expect(() => validatePublicUrl(url)).toThrow();
  });

  it("detects bot protection instead of treating it as an empty board", async () => {
    const client = new RespectfulHttpClient({
      fetchImpl: vi.fn(async () => new Response("<html>Verify you are human captcha</html>", { status: 200, headers: { "content-type": "text/html" } })),
      maxRetries: 0,
      minimumHostIntervalMs: 0,
    });
    await expect(client.getJson("https://example.com/jobs")).rejects.toMatchObject({ code: "BOT_PROTECTION", retryable: false });
  });

  it("honors transient retry behavior and then returns JSON", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"jobs":[]}', { status: 200, headers: { "content-type": "application/json" } }));
    const client = new RespectfulHttpClient({ fetchImpl, maxRetries: 1, minimumHostIntervalMs: 0, sleep: async () => undefined, random: () => 0 });
    await expect(client.getJson("https://example.com/jobs")).resolves.toMatchObject({ status: 200, data: { jobs: [] } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends a generic User-Agent locally when no contact is configured", async () => {
    const originalContact = process.env.MONITOR_CONTACT_EMAIL;
    delete process.env.MONITOR_CONTACT_EMAIL;
    try {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("user-agent")).toBe("InternJobsMonitor/test");
        return new Response('{"jobs":[]}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      const client = new RespectfulHttpClient({
        userAgent: "InternJobsMonitor/test",
        fetchImpl,
        maxRetries: 0,
        minimumHostIntervalMs: 0,
      });

      await client.getJson("https://example.com/jobs");
    } finally {
      if (originalContact === undefined) delete process.env.MONITOR_CONTACT_EMAIL;
      else process.env.MONITOR_CONTACT_EMAIL = originalContact;
    }
  });

  it("does not read contact email implicitly from the environment", async () => {
    const originalContact = process.env.MONITOR_CONTACT_EMAIL;
    process.env.MONITOR_CONTACT_EMAIL = "operator@internjobs.dev";
    let observedUserAgent: string | null = null;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      observedUserAgent = new Headers(init?.headers).get("User-Agent");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const client = new RespectfulHttpClient({
        fetchImpl,
        maxRetries: 0,
        minimumHostIntervalMs: 0,
      });
      await client.getJson("https://boards.greenhouse.io/example/jobs/1");
      expect(observedUserAgent).toBe("InternJobsMonitor/0.1 (public-career-source monitor)");
    } finally {
      if (originalContact === undefined) delete process.env.MONITOR_CONTACT_EMAIL;
      else process.env.MONITOR_CONTACT_EMAIL = originalContact;
    }
  });

  it("sends an optional contact in the outbound User-Agent", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("user-agent")).toBe(
        "InternJobsMonitor/test contact=operator@internjobs.dev",
      );
      return new Response('{"jobs":[]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new RespectfulHttpClient({
      userAgent: "InternJobsMonitor/test",
      contactEmail: "operator@internjobs.dev",
      fetchImpl,
      maxRetries: 0,
      minimumHostIntervalMs: 0,
    });

    await client.getJson("https://example.com/jobs");
  });

  it("honors a reviewed source's per-request timeout", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const client = new RespectfulHttpClient({
      fetchImpl,
      timeoutMs: 5_000,
      maxRetries: 0,
      minimumHostIntervalMs: 0,
    });

    await expect(
      client.getJson("https://example.com/jobs", { timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("keeps the response ceiling low by default while allowing a reviewed per-request override", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"jobs":[]}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = new RespectfulHttpClient({
      fetchImpl,
      maximumResponseBytes: 8,
      maxRetries: 0,
      minimumHostIntervalMs: 0,
    });

    await expect(client.getJson("https://example.com/jobs"))
      .rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    await expect(client.getJson("https://example.com/jobs", { maximumResponseBytes: 64 }))
      .resolves.toMatchObject({ data: { jobs: [] } });
  });
});
