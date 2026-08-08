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

export type AdapterHttpRecordings = {
  getJson?: ReadonlyMap<string, unknown> | Record<string, unknown>;
  postJson?: ReadonlyMap<string, unknown> | Record<string, unknown>;
  postForm?: ReadonlyMap<string, string> | Record<string, string>;
  getText?: ReadonlyMap<string, string> | Record<string, string>;
};

function asMap<T>(
  value: ReadonlyMap<string, T> | Record<string, T> | undefined,
): Map<string, T> {
  if (!value) {
    return new Map();
  }
  return value instanceof Map ? new Map(value) : new Map(Object.entries(value));
}

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

/**
 * Recording AdapterHttpClient for Store / Follow-on adapters in CI.
 * Each verb is keyed by exact URL; missing keys throw.
 */
export function createRecordingAdapterHttpClient(
  recordings: AdapterHttpRecordings,
): AdapterHttpClient {
  const getJson = asMap(recordings.getJson);
  const postJson = asMap(recordings.postJson);
  const postForm = asMap(recordings.postForm);
  const getText = asMap(recordings.getText);

  return {
    async getJson(url: string) {
      if (!getJson.has(url)) {
        throw new Error(`No getJson recording for URL: ${url}`);
      }
      return getJson.get(url);
    },
    async postJson(url: string) {
      if (!postJson.has(url)) {
        throw new Error(`No postJson recording for URL: ${url}`);
      }
      return postJson.get(url);
    },
    async postForm(url: string) {
      if (!postForm.has(url)) {
        throw new Error(`No postForm recording for URL: ${url}`);
      }
      return postForm.get(url)!;
    },
    async getText(url: string) {
      if (!getText.has(url)) {
        throw new Error(`No getText recording for URL: ${url}`);
      }
      return getText.get(url)!;
    },
  };
}
