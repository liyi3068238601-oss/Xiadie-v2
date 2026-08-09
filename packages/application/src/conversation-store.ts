import type {
  CommittedTurnRecord,
  VerifiedTurnRecord,
} from "@xiadie/xiadie-core";

export interface ConversationStore {
  commit(record: VerifiedTurnRecord): CommittedTurnRecord;
}

const canonicalPayload = (record: VerifiedTurnRecord): VerifiedTurnRecord => ({
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
    personaCompilerVersion: record.build.personaCompilerVersion,
    schema: {
      conversation: record.build.schema.conversation,
      memory: record.build.schema.memory,
      relationship: record.build.schema.relationship,
      runtimeCheckpoint: record.build.schema.runtimeCheckpoint,
    },
  },
});

const freezeCommitted = (
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

  commit(record: VerifiedTurnRecord): CommittedTurnRecord {
    const payload = canonicalPayload(record);
    const serialized = JSON.stringify(payload);
    const existing = this.turns.get(record.turnId);

    if (existing !== undefined) {
      if (this.inputs.get(record.turnId) !== serialized) {
        throw new Error("turn_commit_conflict");
      }
      return existing;
    }

    const committed = freezeCommitted({
      ...payload,
      committedAt: Date.now(),
      commitVersion: 1,
    });
    this.inputs.set(record.turnId, serialized);
    this.turns.set(record.turnId, committed);
    return committed;
  }
}
