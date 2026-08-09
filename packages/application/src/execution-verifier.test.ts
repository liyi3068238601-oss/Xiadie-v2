import { describe, expect, it } from "vitest";
import { asTurnId } from "@xiadie/xiadie-core";
import type { RuntimeEvent, RuntimeRunRecord } from "@xiadie/agent-runtime";
import { verifyExecution } from "./index.js";

const event = (
  type: RuntimeEvent["type"],
  operationId: string,
  sequence: number,
): RuntimeEvent =>
  ({
    type,
    operationId,
    sequence,
    id: `event-${sequence}`,
    turnId: asTurnId("turn-1"),
    runId: "run-1",
    timestamp: sequence,
  }) as RuntimeEvent;

const runRecord = (
  overrides: Partial<RuntimeRunRecord> = {},
): RuntimeRunRecord => ({
  turnId: asTurnId("turn-1"),
  runId: "run-1",
  events: [event("run.completed", "run-op", 1)],
  toolResults: [],
  candidates: [],
  ...overrides,
});

describe("verifyExecution", () => {
  it("reports failed when the runtime failed despite an agent success claim", () => {
    const report = verifyExecution(
      runRecord({
        events: [
          {
            ...event("tool.failed", "op-1", 1),
            type: "tool.failed",
            error: "denied",
          },
          event("run.failed", "run-op", 2),
        ],
        toolResults: [
          { operationId: "op-1", ok: false, summary: "I succeeded" },
        ],
        candidates: [
          { id: "e-1", operationId: "op-1", summary: "created" },
        ],
      }),
    );

    expect(report).toEqual({
      runId: "run-1",
      status: "failed",
      evidence: [],
    });
  });

  it("reports real success and promotes evidence with both runtime proofs", () => {
    const report = verifyExecution(
      runRecord({
        events: [
          event("run.started", "run-op", 1),
          event("tool.completed", "op-1", 2),
          event("run.completed", "run-op", 3),
        ],
        toolResults: [
          { operationId: "op-1", ok: true, summary: "created file" },
        ],
        candidates: [
          { id: "e-1", operationId: "op-1", summary: "created file" },
        ],
      }),
    );

    expect(report).toEqual({
      runId: "run-1",
      status: "success",
      evidence: [
        { id: "e-1", operationId: "op-1", summary: "created file" },
      ],
    });
  });

  it("rejects multiple mutually exclusive terminal events", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("run.completed", "run-op", 1),
            event("run.failed", "run-op", 2),
          ],
        }),
      ),
    ).toThrowError("runtime_terminal_state_invalid");
  });

  it("rejects a run without a terminal event", () => {
    expect(() =>
      verifyExecution(
        runRecord({ events: [event("run.started", "run-op", 1)] }),
      ),
    ).toThrowError("runtime_terminal_state_invalid");
  });

  it("rejects events that arrive after the terminal event", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("run.completed", "run-op", 1),
            event("tool.completed", "op-1", 2),
          ],
        }),
      ),
    ).toThrowError("runtime_terminal_state_invalid");
  });

  it("rejects event sequences that are not strictly increasing", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("run.started", "run-op", 2),
            event("run.completed", "run-op", 1),
          ],
        }),
      ),
    ).toThrowError("runtime_event_sequence_invalid");
  });

  it("rejects an event from a different run", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("run.started", "run-op", 1),
            { ...event("run.completed", "run-op", 2), runId: "run-2" },
          ],
        }),
      ),
    ).toThrowError("runtime_event_identity_invalid");
  });

  it("rejects an event from a different turn", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("run.started", "run-op", 1),
            {
              ...event("run.completed", "run-op", 2),
              turnId: asTurnId("turn-2"),
            },
          ],
        }),
      ),
    ).toThrowError("runtime_event_identity_invalid");
  });

  it("does not promote candidates without matching successful results and completed events", () => {
    const report = verifyExecution(
      runRecord({
        events: [
          event("tool.completed", "op-with-failed-result", 1),
          {
            ...event("tool.failed", "op-without-completed-event", 2),
            type: "tool.failed",
            error: "failed",
          },
          event("run.completed", "run-op", 3),
        ],
        toolResults: [
          {
            operationId: "op-with-failed-result",
            ok: false,
            summary: "failed",
          },
          {
            operationId: "op-without-completed-event",
            ok: true,
            summary: "unsubstantiated",
          },
        ],
        candidates: [
          {
            id: "e-failed-result",
            operationId: "op-with-failed-result",
            summary: "must not promote",
          },
          {
            id: "e-no-event",
            operationId: "op-without-completed-event",
            summary: "must not promote",
          },
          {
            id: "e-no-result",
            operationId: "op-without-result",
            summary: "must not promote",
          },
        ],
      }),
    );

    expect(report).toEqual({
      runId: "run-1",
      status: "partial",
      evidence: [],
    });
  });

  it("rejects conflicting tool terminal events for one operation", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            {
              ...event("tool.failed", "op-1", 2),
              type: "tool.failed",
              error: "failed after completion",
            },
            event("run.completed", "run-op", 3),
          ],
        }),
      ),
    ).toThrowError("runtime_operation_state_invalid");
  });

  it("rejects duplicate completed events for one operation", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            event("tool.completed", "op-1", 2),
            event("run.completed", "run-op", 3),
          ],
        }),
      ),
    ).toThrowError("runtime_operation_state_invalid");
  });

  it("rejects duplicate identical tool results", () => {
    const result = { operationId: "op-1", ok: true, summary: "created" };

    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            event("run.completed", "run-op", 2),
          ],
          toolResults: [result, { ...result }],
        }),
      ),
    ).toThrowError("runtime_operation_state_invalid");
  });

  it("rejects conflicting tool results", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            event("run.completed", "run-op", 2),
          ],
          toolResults: [
            { operationId: "op-1", ok: true, summary: "created" },
            { operationId: "op-1", ok: false, summary: "failed" },
          ],
        }),
      ),
    ).toThrowError("runtime_operation_state_invalid");
  });

  it("rejects duplicate candidate IDs", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            event("tool.completed", "op-2", 2),
            event("run.completed", "run-op", 3),
          ],
          toolResults: [
            { operationId: "op-1", ok: true, summary: "first" },
            { operationId: "op-2", ok: true, summary: "second" },
          ],
          candidates: [
            { id: "e-1", operationId: "op-1", summary: "first" },
            { id: "e-1", operationId: "op-2", summary: "second" },
          ],
        }),
      ),
    ).toThrowError("runtime_evidence_candidate_invalid");
  });

  it("rejects multiple candidates for one operation", () => {
    expect(() =>
      verifyExecution(
        runRecord({
          events: [
            event("tool.completed", "op-1", 1),
            event("run.completed", "run-op", 2),
          ],
          toolResults: [
            { operationId: "op-1", ok: true, summary: "created" },
          ],
          candidates: [
            { id: "e-1", operationId: "op-1", summary: "first" },
            { id: "e-2", operationId: "op-1", summary: "second" },
          ],
        }),
      ),
    ).toThrowError("runtime_evidence_candidate_invalid");
  });

  it("reports cancelled runs as failed", () => {
    const report = verifyExecution(
      runRecord({ events: [event("run.cancelled", "run-op", 1)] }),
    );

    expect(report).toEqual({
      runId: "run-1",
      status: "failed",
      evidence: [],
    });
  });
});
