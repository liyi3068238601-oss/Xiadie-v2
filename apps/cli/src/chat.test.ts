import { describe, expect, it } from "vitest";
import type { CommittedTurnRecord } from "@xiadie/xiadie-core";
import { parseModel, runChatTurn, type ChatTurnRunner } from "./index.js";

describe("parseModel", () => {
  it("requires provider/model syntax", () => {
    expect(() => parseModel(undefined)).toThrowError("xiadie_model_missing");
    expect(() => parseModel("gpt-5-mini")).toThrowError("xiadie_model_invalid");
    expect(parseModel("openai/gpt-5-mini")).toBe("openai/gpt-5-mini");
  });
});

describe("runChatTurn", () => {
  it("writes the committed direct response", async () => {
    const writes: string[] = [];
    const committed = { turnId: "turn-1" } as CommittedTurnRecord;
    const runner: ChatTurnRunner = {
      run: async (input, onDelta) => {
        expect(input).toEqual({ conversationId: "cli", userMessage: "你好" });
        onDelta("你好。");
        onDelta("今天想先做什么？");
        return { finalResponse: "你好。今天想先做什么？", committed };
      },
    };

    const result = await runChatTurn("你好", runner, (text) => writes.push(text));

    expect(writes).toEqual(["你好。", "今天想先做什么？", "\n"]);
    expect(result).toBe(committed);
  });

  it("does not print a fabricated response when the runtime fails", async () => {
    const writes: string[] = [];
    const runner: ChatTurnRunner = { run: async () => { throw new Error("self_runtime_failed:self_provider_failed"); } };

    await expect(runChatTurn("你好", runner, (text) => writes.push(text))).rejects.toThrowError(
      "self_runtime_failed:self_provider_failed",
    );
    expect(writes).toEqual([]);
  });
});
