import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ConnectionProbeStatus } from "../shared/contracts.js";
import type { ResolvedConnectionSettings } from "./connection-settings.js";

export const DEEPSEEK_MODEL_ID = "deepseek-v4-flash";
export const DEEPSEEK_MODEL_DISPLAY_NAME = "deepseek/deepseek-v4-flash";

export type DeepSeekLanguageModel = ReturnType<
  ReturnType<typeof createOpenAICompatible>["chatModel"]
>;

export interface CompatibleProviderFactory {
  (options: Readonly<{ name: string; apiKey: string; baseURL: string }>): {
    chatModel(modelId: string): DeepSeekLanguageModel;
  };
}

export interface ConnectionProbeInput {
  readonly model: DeepSeekLanguageModel;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export interface TestDeepSeekConnectionOptions {
  readonly probe?: (input: ConnectionProbeInput) => Promise<unknown>;
  readonly timeoutMs?: number;
}

export function createDeepSeekModel(
  settings: ResolvedConnectionSettings,
  factory: CompatibleProviderFactory = createOpenAICompatible,
): DeepSeekLanguageModel {
  if (settings.apiKey === undefined) {
    throw new Error("deepseek_not_configured");
  }
  const provider = factory({
    name: "deepseek",
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });
  return provider.chatModel(DEEPSEEK_MODEL_ID);
}

const defaultProbe = async ({
  model,
  prompt,
  signal,
}: ConnectionProbeInput): Promise<unknown> =>
  generateText({
    model,
    prompt,
    abortSignal: signal,
    maxOutputTokens: 8,
  });

const statusFromError = (
  error: unknown,
  timedOut: boolean,
): ConnectionProbeStatus => {
  if (
    timedOut ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    return "timeout";
  }
  const status =
    typeof error === "object" && error !== null
      ? ((error as { status?: unknown; statusCode?: unknown }).status ??
        (error as { statusCode?: unknown }).statusCode)
      : undefined;
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "invalid_endpoint";
  return "unavailable";
};

export async function testDeepSeekConnection(
  settings: ResolvedConnectionSettings,
  options: TestDeepSeekConnectionOptions = {},
): Promise<ConnectionProbeStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const model = createDeepSeekModel(settings);
    await (options.probe ?? defaultProbe)({
      model,
      prompt: "Reply with exactly OK.",
      signal: controller.signal,
    });
    return "ok";
  } catch (error) {
    return statusFromError(error, controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
}
