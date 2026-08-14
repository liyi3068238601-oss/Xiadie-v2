import {
  freezeCommittedTurnRecord,
  serializeCanonicalTurnPayload,
  type ConversationStore,
} from "@xiadie/application";
import {
  sha256Text,
  type CommittedTurnRecord,
  type TurnId,
  type VerifiedTurnRecord,
} from "@xiadie/xiadie-core";
import { DesktopDatabase } from "./database.js";

interface VerifiedTurnRow {
  canonical_payload: string;
  input_fingerprint: string;
  committed_at: number;
  commit_version: number;
}

export interface SqliteVerifiedTurnStoreOptions {
  readonly now?: () => number;
}

export class SqliteVerifiedTurnStore implements ConversationStore {
  readonly #now: () => number;

  constructor(
    private readonly database: DesktopDatabase,
    options: SqliteVerifiedTurnStoreOptions = {},
  ) {
    this.#now = options.now ?? Date.now;
  }

  has(turnId: TurnId): boolean {
    return this.database.get<{ present: number }>(
      "SELECT 1 AS present FROM verified_turns WHERE turn_id = ?",
      turnId,
    ) !== undefined;
  }

  commit(record: VerifiedTurnRecord): CommittedTurnRecord {
    const serialized = serializeCanonicalTurnPayload(record);
    const fingerprint = sha256Text(serialized);

    return this.database.transaction(() => {
      const existing = this.#read(record.turnId);
      if (existing !== undefined) {
        return this.#resolveExisting(existing, serialized, fingerprint);
      }

      const committedAt = this.#now();
      this.database.run(
        `INSERT INTO verified_turns
          (turn_id, conversation_id, canonical_payload, input_fingerprint,
           committed_at, commit_version)
         VALUES (?, ?, ?, ?, ?, ?)`,
        record.turnId,
        record.conversationId,
        serialized,
        fingerprint,
        committedAt,
        1,
      );

      return this.#committedFrom(serialized, committedAt, 1);
    });
  }

  #read(turnId: TurnId): VerifiedTurnRow | undefined {
    return this.database.get<VerifiedTurnRow>(
      `SELECT canonical_payload, input_fingerprint, committed_at, commit_version
       FROM verified_turns WHERE turn_id = ?`,
      turnId,
    );
  }

  #resolveExisting(
    existing: VerifiedTurnRow,
    serialized: string,
    fingerprint: string,
  ): CommittedTurnRecord {
    if (
      existing.canonical_payload !== serialized ||
      existing.input_fingerprint !== fingerprint
    ) {
      throw new Error("turn_commit_conflict");
    }
    return this.#committedFrom(
      existing.canonical_payload,
      existing.committed_at,
      existing.commit_version,
    );
  }

  #committedFrom(
    serialized: string,
    committedAt: number,
    commitVersion: number,
  ): CommittedTurnRecord {
    const payload = JSON.parse(serialized) as VerifiedTurnRecord;
    return freezeCommittedTurnRecord({
      ...payload,
      committedAt,
      commitVersion,
    });
  }
}
