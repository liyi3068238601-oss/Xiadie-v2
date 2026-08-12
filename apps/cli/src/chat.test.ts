import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { CommittedTurnRecord } from "@xiadie/xiadie-core";
import { parseCliMessage, parseModel, runChatTurn, type ChatTurnRunner } from "./index.js";

const execFileAsync = promisify(execFile);

describe("parseModel", () => {
  it("requires provider/model syntax", () => {
    expect(() => parseModel(undefined)).toThrowError("xiadie_model_missing");
    expect(() => parseModel("gpt-5-mini")).toThrowError("xiadie_model_invalid");
    expect(parseModel("openai/gpt-5-mini")).toBe("openai/gpt-5-mini");
  });
});

describe("parseCliMessage", () => {
  it("removes one package-manager separator from the user message", () => {
    expect(parseCliMessage(["--", "你好", "遐蝶"])).toBe("你好 遐蝶");
    expect(parseCliMessage(["你好", "遐蝶"])).toBe("你好 遐蝶");
  });
});

describe("CLI process", () => {
  it("reaches fail-closed configuration validation through the production launcher", async () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    await expect(execFileAsync(
      process.execPath,
      ["apps/cli/node_modules/tsx/dist/cli.mjs", "apps/cli/src/main.ts", "你好"],
      { cwd: root, env: { ...process.env, XIADIE_MODEL: "" } },
    )).rejects.toMatchObject({ stderr: expect.stringContaining("xiadie_model_missing") });
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
