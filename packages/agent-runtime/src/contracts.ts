import type { TurnId } from "@xiadie/xiadie-core";

export interface AgentTask {
  turnId: TurnId;
  taskId: string;
  goal: string;
  scope: { taskType: string; readOnly: boolean };
  allowedTools: string[];
  workspace?: { root: string };
  context: {
    goal: string;
    relevantFacts: string[];
    artifacts: string[];
    constraints: string[];
  };
  inputs: Array<{ kind: "artifact" | "fact"; ref: string }>;
}

interface RuntimeEventBase {
  id: string;
  turnId: TurnId;
  runId: string;
  sequence: number;
  timestamp: number;
  operationId: string;
}

export type RuntimeEvent =
  | (RuntimeEventBase & { type: "run.started" })
  | (RuntimeEventBase & { type: "tool.completed" })
  | (RuntimeEventBase & { type: "tool.failed"; error: string })
  | (RuntimeEventBase & { type: "run.suspended" })
  | (RuntimeEventBase & { type: "run.resumed" })
  | (RuntimeEventBase & { type: "run.completed" })
  | (RuntimeEventBase & { type: "run.failed" })
  | (RuntimeEventBase & { type: "run.cancelled" });

export interface ToolResult {
  operationId: string;
  ok: boolean;
  summary: string;
}

export interface EvidenceCandidate {
  id: string;
  operationId: string;
  summary: string;
}

export interface RuntimeRunRecord {
  turnId: TurnId;
  runId: string;
  events: RuntimeEvent[];
  toolResults: ToolResult[];
  candidates: EvidenceCandidate[];
}

export interface AgentRuntime {
  start(task: AgentTask): Promise<RuntimeRunRecord>;
}

export const isTerminalRuntimeEvent = (event: Pick<RuntimeEvent, "type">): boolean =>
  event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";
