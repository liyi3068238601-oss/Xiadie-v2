import { describe, expect, it } from "vitest";
import { runPersonaEvaluation, type PersonaEvaluationCase } from "./persona-eval.js";

describe("runPersonaEvaluation", () => {
  it("emits ordered JSONL records with model and persona provenance", async () => {
    const cases: PersonaEvaluationCase[] = [
      { id: "daily", category: "daily_chat", userInput: "早上好", must: ["自然"], mustNot: ["客服腔"] },
      { id: "work", category: "technical_work", userInput: "帮我分析", must: ["判断"], mustNot: ["伪造"] },
    ];
    const lines: string[] = [];

    await runPersonaEvaluation({
      cases,
      model: "openai/gpt-5-mini",
      provenance: { characterAssetHash: "asset-hash", personaInstructionHash: "instruction-hash" },
      respond: async (input) => `回复：${input}`,
      writeLine: (line) => lines.push(line),
    });

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { id: "daily", category: "daily_chat", model: "openai/gpt-5-mini", characterAssetHash: "asset-hash", personaInstructionHash: "instruction-hash", response: "回复：早上好" },
      { id: "work", category: "technical_work", model: "openai/gpt-5-mini", characterAssetHash: "asset-hash", personaInstructionHash: "instruction-hash", response: "回复：帮我分析" },
    ]);
  });
});
