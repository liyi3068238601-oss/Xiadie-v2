import type {
  CommittedTurnRecord,
  TurnId,
  VerifiedTurnRecord,
} from "@xiadie/xiadie-core";

export interface ConversationStore {
  has(turnId: TurnId): boolean;
  commit(record: VerifiedTurnRecord): CommittedTurnRecord;
}

export const canonicalTurnPayload = (
  record: VerifiedTurnRecord,
): VerifiedTurnRecord => ({
  turnId: record.turnId,
  conversationId: record.conversationId,
  userMessageId: record.userMessageId,
  finalResponseId: record.finalResponseId,
  executions: record.executions.map((execution) => ({
    runId: execution.runId,
    status: execution.status,
    evidenceIds: [...execution.evidenceIds],
  })),
  timestamp: record.timestamp,
  build: {
    coreVersion: record.build.coreVersion,
    characterVersion: record.build.characterVersion,
    characterAssetHash: record.build.characterAssetHash,
    personaInstructionHash: record.build.personaInstructionHash,
    personaCompilerVersion: record.build.personaCompilerVersion,
    schema: {
      conversation: record.build.schema.conversation,
      memory: record.build.schema.memory,
      relationship: record.build.schema.relationship,
      runtimeCheckpoint: record.build.schema.runtimeCheckpoint,
    },
  },
});

export const serializeCanonicalTurnPayload = (
  record: VerifiedTurnRecord,
): string => JSON.stringify(canonicalTurnPayload(record));

export const freezeCommittedTurnRecord = (
  record: CommittedTurnRecord,
): CommittedTurnRecord => {
  for (const execution of record.executions) {
    Object.freeze(execution.evidenceIds);
    Object.freeze(execution);
  }
  Object.freeze(record.executions);
  Object.freeze(record.build.schema);
  Object.freeze(record.build);
  Object.freeze(record);
  return record;
};

export class InMemoryConversationStore implements ConversationStore {
  private readonly turns = new Map<string, CommittedTurnRecord>();
  private readonly inputs = new Map<string, string>();

  has(turnId: TurnId): boolean {
    return this.turns.has(turnId);
  }

  commit(record: VerifiedTurnRecord): CommittedTurnRecord {
    const payload = canonicalTurnPayload(record);
    const serialized = JSON.stringify(payload);
    const existing = this.turns.get(record.turnId);

    if (existing !== undefined) {
      if (this.inputs.get(record.turnId) !== serialized) {
        throw new Error("turn_commit_conflict");
      }
      return existing;
    }

    const committed = freezeCommittedTurnRecord({
      ...payload,
      committedAt: Date.now(),
      commitVersion: 1,
    });
    this.inputs.set(record.turnId, serialized);
    this.turns.set(record.turnId, committed);
    return committed;
  }
}
