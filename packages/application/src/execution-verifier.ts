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

  const toolTerminalOperations = new Set<string>();
  const completedOperations = new Set<string>();

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

    if (current.type === "tool.completed" || current.type === "tool.failed") {
      if (toolTerminalOperations.has(current.operationId)) {
        throw new Error("runtime_operation_state_invalid");
      }
      toolTerminalOperations.add(current.operationId);
      if (current.type === "tool.completed") {
        completedOperations.add(current.operationId);
      }
    }
  }

  const terminal = run.events[terminalIndexes[0] as number];
  const resultOperations = new Set<string>();
  const successfulOperations = new Set<string>();
  for (const result of run.toolResults) {
    if (resultOperations.has(result.operationId)) {
      throw new Error("runtime_operation_state_invalid");
    }
    resultOperations.add(result.operationId);
    if (result.ok) successfulOperations.add(result.operationId);
  }

  const candidateIds = new Set<string>();
  const candidateOperations = new Set<string>();
  for (const candidate of run.candidates) {
    if (
      candidateIds.has(candidate.id) ||
      candidateOperations.has(candidate.operationId)
    ) {
      throw new Error("runtime_evidence_candidate_invalid");
    }
    candidateIds.add(candidate.id);
    candidateOperations.add(candidate.operationId);
  }

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
