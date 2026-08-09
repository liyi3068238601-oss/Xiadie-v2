import { describe, expect, it } from "vitest";
import { asTurnId, createVerifiedTurnRecord } from "./index.js";
import type { VerifiedExecutionReport } from "./index.js";

const unverifiedReport = {
  runId: "run-1",
  status: "success" as const,
  evidence: [{ id: "evidence-1", operationId: "operation-1", summary: "unverified" }],
};

// @ts-expect-error Only an ExecutionVerifier may create a verified report.
const verifiedReport: VerifiedExecutionReport = unverifiedReport;
void verifiedReport;

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
