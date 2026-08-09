import { describe, expect, it } from "vitest";
import { asTurnId, createVerifiedTurnRecord } from "./index.js";

describe("core contracts", () => {
  it("uses an executions array even without delegation", () => {
    const record = createVerifiedTurnRecord({
      turnId: asTurnId("turn-1"),
      conversationId: "conversation-1",
      userMessageId: "user-1",
      finalResponseId: "self-1",
      executions: [],
      timestamp: 1,
      build: {
        coreVersion: "0.0.0",
        characterVersion: "0.0.0",
        personaCompilerVersion: "0.0.0",
        schema: { conversation: 1, memory: 1, relationship: 1, runtimeCheckpoint: 1 },
      },
    });

    expect(record.executions).toEqual([]);
  });
});
