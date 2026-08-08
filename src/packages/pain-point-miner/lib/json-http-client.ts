/**
 * Injectable JSON GET client for Signal Source adapters.
 * Tests / CI supply recordings; live runs may use `createFetchHttpClient`.
 */
export type JsonHttpClient = {
  getJson(url: string): Promise<unknown>;
};

/** Live (manual) JSON GET via global fetch. Not used by default CI fixtures. */
export function createFetchHttpClient(init?: {
  userAgent?: string;
  fetchImpl?: typeof fetch;
}): JsonHttpClient {
  const fetchImpl = init?.fetchImpl ?? fetch;
  const userAgent =
    init?.userAgent ?? "pain-point-miner/0.1 (Entry Catalog; local Script)";

  return {
    async getJson(url: string) {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
        },
      });
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} for ${url}: ${response.statusText}`,
        );
      }
      return response.json();
    },
  };
}

/**
 * Recording / fixture HTTP client keyed by exact URL.
 * Unknown URLs throw so CI cannot silently skip a catalog request.
 */
export function createRecordingHttpClient(
  recordings:
    | ReadonlyMap<string, unknown>
    | Record<string, unknown>,
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
