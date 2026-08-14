import { describe, expect, it } from "vitest";
import type { ConversationHistoryMessage } from "@xiadie/xiadie-core";
import {
  CONVERSATION_HISTORY_CHARACTER_BUDGET,
  selectConversationHistory,
} from "./conversation-history.js";

const pair = (
  prefix: string,
  size: number,
): readonly ConversationHistoryMessage[] => [
  { id: `${prefix}-user`, role: "user", content: "用".repeat(size) },
  { id: `${prefix}-assistant`, role: "assistant", content: "答".repeat(size) },
];

describe("selectConversationHistory", () => {
  it("keeps the newest complete pairs within the fixed character budget", () => {
    const oldPair = pair("old", 6_001);
    const newPair = pair("new", 6_000);

    expect(selectConversationHistory([...oldPair, ...newPair])).toEqual(newPair);
  });

  it("accepts a complete pair at the exact budget without truncating it", () => {
    const exact = pair(
      "exact",
      CONVERSATION_HISTORY_CHARACTER_BUDGET / 2,
    );

    expect(selectConversationHistory(exact)).toEqual(exact);
  });

  it("returns detached deeply frozen messages without mutating the input", () => {
    const input = pair("one", 10).map((message) => ({ ...message }));
    const before = structuredClone(input);

    const selected = selectConversationHistory(input);
    input[0]!.content = "changed";

    expect(input).not.toEqual(before);
    expect(selected[0]?.content).toBe("用".repeat(10));
    expect(Object.isFrozen(selected)).toBe(true);
    expect(selected.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    [undefined],
    [{}],
    [[{ id: "orphan", role: "user", content: "missing reply" }]],
    [[
      { id: "assistant-first", role: "assistant", content: "wrong" },
      { id: "user-second", role: "user", content: "wrong" },
    ]],
    [[
      { id: "", role: "user", content: "blank id" },
      { id: "assistant", role: "assistant", content: "reply" },
    ]],
    [[
      { id: "user", role: "user", content: "" },
      { id: "assistant", role: "assistant", content: "reply" },
    ]],
  ])("fails closed for malformed or incomplete history", (invalid) => {
    expect(() => selectConversationHistory(invalid as ConversationHistoryMessage[]))
      .toThrowError("conversation_history_invalid");
  });
});
