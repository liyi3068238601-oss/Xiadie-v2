import type { SelfRequest, TurnId } from "@xiadie/xiadie-core";

export interface DelegateRequest {
  goal: string;
  taskType: string;
  requestedCapabilities?: string[];
  contextRefs?: string[];
}

interface SelfEventBase {
  id: string;
  turnId: TurnId;
  runId: string;
  sequence: number;
  timestamp: number;
}

export type SelfEvent =
  | (SelfEventBase & { type: "self.started" })
  | (SelfEventBase & { type: "self.text.delta"; delta: string })
  | (SelfEventBase & { type: "self.delegate.requested"; request: DelegateRequest })
  | (SelfEventBase & { type: "self.final"; response: string })
  | (SelfEventBase & { type: "self.failed"; error: string })
  | (SelfEventBase & { type: "self.cancelled" });

export interface SelfRuntime {
  respond(input: SelfRequest): AsyncIterable<SelfEvent>;
}
