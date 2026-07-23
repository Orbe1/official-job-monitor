import type { AdapterHttpClient, HttpResponse } from "../adapters";

export class FixtureHttpClient implements AdapterHttpClient {
  constructor(private readonly resolver: (method: "GET" | "POST", url: string, body?: unknown) => unknown) {}

  async getJson<T>(url: string): Promise<HttpResponse<T>> {
    return response(url, this.resolver("GET", url) as T);
  }

  async postJson<T>(url: string, body: unknown): Promise<HttpResponse<T>> {
    return response(url, this.resolver("POST", url, body) as T);
  }
}

function response<T>(url: string, data: T): HttpResponse<T> {
  return { status: 200, data, headers: new Headers({ "content-type": "application/json" }), url };
}
