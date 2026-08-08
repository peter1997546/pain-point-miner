/**
 * Injectable JSON GET client for Signal Source adapters.
 * Tests / CI supply recordings; live runs may use `createFetchHttpClient`.
 */
export type JsonHttpClient = {
  getJson(url: string): Promise<unknown>;
};

/**
 * Extended HTTP transport for Store Second Pass and Follow-on adapters
 * (GraphQL POST, form POST, HTML GET). Satisfies `JsonHttpClient`.
 */
export type AdapterHttpClient = JsonHttpClient & {
  postJson(
    url: string,
    body: unknown,
    init?: { headers?: Readonly<Record<string, string>> },
  ): Promise<unknown>;
  postForm(url: string, body: string): Promise<string>;
  getText(url: string): Promise<string>;
};

export type FetchHttpClientInit = {
  userAgent?: string;
  fetchImpl?: typeof fetch;
};

/** Live (manual) HTTP via global fetch. Not used by default CI fixtures. */
export function createFetchHttpClient(
  init?: FetchHttpClientInit,
): AdapterHttpClient {
  const fetchImpl = init?.fetchImpl ?? fetch;
  const userAgent =
    init?.userAgent ?? "pain-point-miner/0.1 (Source Catalog; local Script)";

  async function request(
    url: string,
    options: RequestInit & { parse: "json" | "text" },
  ): Promise<unknown> {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Accept:
          options.parse === "json"
            ? "application/json"
            : "text/html,application/xhtml+xml",
        "User-Agent": userAgent,
        ...(options.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} for ${url}: ${response.statusText}`,
      );
    }
    return options.parse === "json" ? response.json() : response.text();
  }

  return {
    async getJson(url: string) {
      return request(url, { method: "GET", parse: "json" });
    },
    async postJson(url, body, init) {
      return request(url, {
        method: "POST",
        parse: "json",
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
    },
    async postForm(url, body) {
      const text = await request(url, {
        method: "POST",
        parse: "text",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      });
      return String(text);
    },
    async getText(url) {
      const text = await request(url, { method: "GET", parse: "text" });
      return String(text);
    },
  };
}

/**
 * Recording / fixture HTTP client keyed by exact URL (GET JSON only).
 * Unknown URLs throw so CI cannot silently skip a catalog request.
 */
export function createRecordingHttpClient(
  recordings: ReadonlyMap<string, unknown> | Record<string, unknown>,
): JsonHttpClient {
  const byUrl =
    recordings instanceof Map
      ? recordings
      : new Map(Object.entries(recordings));

  return {
    async getJson(url: string) {
      if (!byUrl.has(url)) {
        throw new Error(`No recording for URL: ${url}`);
      }
      return byUrl.get(url);
    },
  };
}
