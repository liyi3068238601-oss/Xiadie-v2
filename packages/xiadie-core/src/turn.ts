import type { CapabilityAwareness, CompiledPersona, MemoryRecord, RelationshipState, SelfState } from "./context.js";
import type { TurnId } from "./ids.js";

declare const executionEvidenceBrand: unique symbol;
declare const verifiedExecutionReportBrand: unique symbol;

export interface ExecutionEvidence {
  readonly [executionEvidenceBrand]: true;
  id: string;
  operationId: string;
  summary: string;
}

export interface VerifiedExecutionReport {
  readonly [verifiedExecutionReportBrand]: true;
  runId: string;
  status: "success" | "partial" | "failed";
  evidence: ExecutionEvidence[];
}

export interface UserMessage {
  id: string;
  content: string;
}

export interface SelfRequest {
  turnId: TurnId;
  persona: CompiledPersona;
  state: { self: SelfState; relationship: RelationshipState };
  memories: MemoryRecord[];
  turnInput: UserMessage;
  evidence: VerifiedExecutionReport[];
  capabilities: CapabilityAwareness;
}

export interface VerifiedExecutionRef {
  runId: string;
  status: VerifiedExecutionReport["status"];
  evidenceIds: string[];
}

export interface BuildMetadata {
  coreVersion: string;
  characterVersion: string;
  personaCompilerVersion: string;
  schema: { conversation: number; memory: number; relationship: number; runtimeCheckpoint: number };
}

export interface VerifiedTurnRecord {
  turnId: TurnId;
  conversationId: string;
  userMessageId: string;
  finalResponseId: string;
  executions: VerifiedExecutionRef[];
  timestamp: number;
  build: BuildMetadata;
}

export interface CommittedTurnRecord extends VerifiedTurnRecord {
  committedAt: number;
  commitVersion: number;
}

export const createVerifiedTurnRecord = (record: VerifiedTurnRecord): VerifiedTurnRecord => record;
