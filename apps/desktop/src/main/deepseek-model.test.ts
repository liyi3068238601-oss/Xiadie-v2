import { createMastraTextAgent } from "@xiadie/mastra-self-runtime";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedConnectionSettings } from "./connection-settings.js";
import {
  type ConnectionProbeInput,
  type DeepSeekLanguageModel,
  DEEPSEEK_MODEL_DISPLAY_NAME,
  DEEPSEEK_MODEL_ID,
  createDeepSeekModel,
  testDeepSeekConnection,
} from "./deepseek-model.js";

const settings = (): ResolvedConnectionSettings => ({
  apiKey: "secret",
  configured: true,
  keySource: "application",
  baseUrlSource: "default",
  baseUrl: "https://api.deepseek.com",
  requiresExternalHostConfirmation: false,
});

describe("createDeepSeekModel", () => {
  it("injects the resolved secret and fixed model without mutating globals", () => {
    const previous = process.env.DEEPSEEK_API_KEY;
    const chatModel = vi.fn(() => ({}) as DeepSeekLanguageModel);
    const factory = vi.fn(() => ({ chatModel }));

    createDeepSeekModel(settings(), factory);

    expect(factory).toHaveBeenCalledWith({
      name: "deepseek",
      apiKey: "secret",
      baseURL: "https://api.deepseek.com",
    });
    expect(chatModel).toHaveBeenCalledWith(DEEPSEEK_MODEL_ID);
    expect(DEEPSEEK_MODEL_DISPLAY_NAME).toBe("deepseek/deepseek-v4-flash");
    expect(process.env.DEEPSEEK_API_KEY).toBe(previous);
  });

  it("produces a model accepted by the Mastra Self adapter", () => {
    const model = createDeepSeekModel(settings());
    expect(createMastraTextAgent(model)).toHaveProperty("stream");
  });
});

describe("testDeepSeekConnection", () => {
  it("uses a fixed non-sensitive probe and discards response text", async () => {
    const probe = vi.fn(async (_input: ConnectionProbeInput) => ({
      text: "provider response must be discarded",
    }));

    await expect(
      testDeepSeekConnection(settings(), { probe, timeoutMs: 100 }),
    ).resolves.toBe("ok");

    const input = probe.mock.calls[0]?.[0];
    expect(input?.prompt).toBe("Reply with exactly OK.");
    expect(input?.prompt).not.toMatch(/遐蝶|xiadie|secret|history/i);
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [404, "invalid_endpoint"],
    [503, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, expected) => {
    const probe = async () => Promise.reject(Object.assign(new Error("raw"), { status }));
    await expect(
      testDeepSeekConnection(settings(), { probe, timeoutMs: 100 }),
    ).resolves.toBe(expected);
  });

  it("aborts a slow probe with the stable timeout result", async () => {
    const probe = ({ signal }: { signal: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });

    await expect(
      testDeepSeekConnection(settings(), { probe, timeoutMs: 5 }),
    ).resolves.toBe("timeout");
  });
});
