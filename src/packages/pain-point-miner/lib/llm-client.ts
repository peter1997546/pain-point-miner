/**
 * Injectable LLM completion port for Analysis Pass.
 * Tests / CI supply scripted responses; live runs may use
 * `createOpenAiCompatibleLlmClient`.
 */
export type LlmCompletionRequest = {
  system: string;
  user: string;
};

export type LlmClient = {
  complete(request: LlmCompletionRequest): Promise<string>;
};

export type OpenAiCompatibleLlmClientInit = {
  apiKey: string;
  model: string;
  /** Default `https://api.openai.com/v1`. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Thin OpenAI Chat Completions–compatible client (no SDK dependency).
 * Used for live Skill Analysis Pass; not exercised in CI.
 */
export function createOpenAiCompatibleLlmClient(
  init: OpenAiCompatibleLlmClientInit,
): LlmClient {
  const fetchImpl = init.fetchImpl ?? fetch;
  const baseUrl = (init.baseUrl ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );

  return {
    async complete(request) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${init.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: init.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `LLM HTTP ${response.status}: ${response.statusText}`,
        );
      }
      const payload: unknown = await response.json();
      const content = extractChatContent(payload);
      if (!content) {
        throw new Error("LLM response missing assistant content");
      }
      return content;
    },
  };
}

function extractChatContent(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    return undefined;
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.length > 0
    ? content
    : undefined;
}
