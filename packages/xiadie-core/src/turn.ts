import type { CapabilityAwareness, CompiledPersona, MemoryRecord, RelationshipState, SelfState } from "./context.js";
import type { TurnId } from "./ids.js";

declare const executionEvidenceBrand: unique symbol;
declare const verifiedExecutionReportBrand: unique symbol;

export interface ExecutionEvidence {
  readonly [executionEvidenceBrand]: true;
  readonly id: string;
  readonly operationId: string;
  readonly summary: string;
}

export interface VerifiedExecutionReport {
  readonly [verifiedExecutionReportBrand]: true;
  readonly runId: string;
  readonly status: "success" | "partial" | "failed";
  readonly evidence: readonly ExecutionEvidence[];
}

export interface UserMessage {
  readonly id: string;
  readonly content: string;
}

export interface SelfRequest {
  readonly turnId: TurnId;
  readonly persona: CompiledPersona;
  readonly state: {
    readonly self: SelfState;
    readonly relationship: RelationshipState;
  };
  readonly memories: readonly MemoryRecord[];
  readonly turnInput: UserMessage;
  readonly evidence: readonly VerifiedExecutionReport[];
  readonly capabilities: CapabilityAwareness;
}

export interface VerifiedExecutionRef {
  runId: string;
  status: VerifiedExecutionReport["status"];
  evidenceIds: string[];
}

export interface BuildMetadata {
  readonly coreVersion: string;
  readonly characterVersion: string;
  readonly characterAssetHash: string;
  readonly personaInstructionHash: string;
  readonly personaCompilerVersion: string;
  readonly schema: {
    readonly conversation: number;
    readonly memory: number;
    readonly relationship: number;
    readonly runtimeCheckpoint: number;
  };
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
