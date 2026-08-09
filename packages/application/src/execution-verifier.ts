import {
  isTerminalRuntimeEvent,
  type RuntimeRunRecord,
} from "@xiadie/agent-runtime";
import type { VerifiedExecutionReport } from "@xiadie/xiadie-core";

export interface ExecutionVerifier {
  verify(run: RuntimeRunRecord): VerifiedExecutionReport;
}

export function verifyExecution(
  run: RuntimeRunRecord,
): VerifiedExecutionReport {
  const terminalIndexes = run.events
    .map((event, index) => (isTerminalRuntimeEvent(event) ? index : -1))
    .filter((index) => index !== -1);

  if (
    terminalIndexes.length !== 1 ||
    terminalIndexes[0] !== run.events.length - 1
  ) {
    throw new Error("runtime_terminal_state_invalid");
  }

  for (let index = 0; index < run.events.length; index += 1) {
    const current = run.events[index];
    if (current === undefined) continue;

    if (current.runId !== run.runId || current.turnId !== run.turnId) {
      throw new Error("runtime_event_identity_invalid");
    }

    const previous = run.events[index - 1];
    if (previous !== undefined && current.sequence <= previous.sequence) {
      throw new Error("runtime_event_sequence_invalid");
    }
  }

  const terminal = run.events[terminalIndexes[0] as number];
  const completedOperations = new Set(
    run.events
      .filter((event) => event.type === "tool.completed")
      .map((event) => event.operationId),
  );
  const successfulOperations = new Set(
    run.toolResults
      .filter((result) => result.ok)
      .map((result) => result.operationId),
  );
  const evidence = run.candidates
    .filter(
      (candidate) =>
        completedOperations.has(candidate.operationId) &&
        successfulOperations.has(candidate.operationId),
    )
    .map((candidate) => ({
      id: candidate.id,
      operationId: candidate.operationId,
      summary: candidate.summary,
    }));
  const status =
    terminal?.type === "run.completed"
      ? evidence.length > 0
        ? "success"
        : "partial"
      : "failed";

  // Core intentionally keeps both brands opaque. This verifier is the sole
  // production construction boundary, after all deterministic checks above.
  return { runId: run.runId, status, evidence } as unknown as VerifiedExecutionReport;
}

export const executionVerifier: ExecutionVerifier = {
  verify: verifyExecution,
};
