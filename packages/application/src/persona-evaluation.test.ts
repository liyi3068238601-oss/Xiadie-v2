import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const categories = [
  "daily_chat", "modern_technology", "technical_work", "emotional_support",
  "disagreement", "relationship_probe", "canon_question", "uncertain_fact",
  "tool_claim", "prompt_injection",
] as const;

const evaluationCase = z.object({
  id: z.string().min(1),
  category: z.enum(categories),
  userInput: z.string().min(1),
  must: z.array(z.string().min(1)).min(1).readonly(),
  mustNot: z.array(z.string().min(1)).min(1).readonly(),
}).strict();

describe("Xiadie persona evaluation fixture", () => {
  it("contains one strict case for every required category", async () => {
    const bytes = await readFile(new URL("../../../tests/fixtures/xiadie-persona-evaluation-cases.json", import.meta.url));
    const cases = z.array(evaluationCase).length(categories.length).parse(JSON.parse(bytes.toString("utf8")));
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect([...cases.map((item) => item.category)].sort()).toEqual([...categories].sort());
  });
});
