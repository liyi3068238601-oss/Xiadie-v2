import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asTurnId, type VerifiedTurnRecord } from "@xiadie/xiadie-core";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopDatabase } from "./database.js";
import { SqliteVerifiedTurnStore } from "./verified-turn-store.js";

const record = (): VerifiedTurnRecord => ({
  turnId: asTurnId("turn-1"),
  conversationId: "conversation-1",
  userMessageId: "user-1",
  finalResponseId: "assistant-1",
  executions: [
    { runId: "run-1", status: "success", evidenceIds: ["evidence-1"] },
  ],
  timestamp: 100,
  build: {
    coreVersion: "0.1.0",
    characterVersion: "1.0.0",
    characterAssetHash: "character-hash",
    personaInstructionHash: "persona-hash",
    personaCompilerVersion: "1.0.0",
    schema: {
      conversation: 1,
      memory: 1,
      relationship: 1,
      runtimeCheckpoint: 1,
    },
  },
});

describe("SqliteVerifiedTurnStore", () => {
  const databases: DesktopDatabase[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const database of databases.splice(0)) database.close();
    for (const directory of directories.splice(0)) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("commits version 1, preserves both hashes and retries idempotently", () => {
    const database = new DesktopDatabase(":memory:");
    databases.push(database);
    const store = new SqliteVerifiedTurnStore(database, { now: () => 200 });

    const first = store.commit(record());
    const retry = store.commit(structuredClone(record()));

    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      committedAt: 200,
      commitVersion: 1,
      build: {
        characterAssetHash: "character-hash",
        personaInstructionHash: "persona-hash",
      },
    });
    expect(store.has(asTurnId("turn-1"))).toBe(true);
  });

  it("rejects conflicting retries with the stable conflict code", () => {
    const database = new DesktopDatabase(":memory:");
    databases.push(database);
    const store = new SqliteVerifiedTurnStore(database);
    store.commit(record());

    expect(() =>
      store.commit({ ...record(), conversationId: "other" }),
    ).toThrowError("turn_commit_conflict");
  });

  it("deep-copies inputs and deeply freezes returned facts", () => {
    const database = new DesktopDatabase(":memory:");
    databases.push(database);
    const store = new SqliteVerifiedTurnStore(database);
    const input = record();
    const committed = store.commit(input);

    input.executions[0]!.evidenceIds.push("forged");
    (input.build.schema as { conversation: number }).conversation = 99;

    expect(committed.executions[0]?.evidenceIds).toEqual(["evidence-1"]);
    expect(committed.build.schema.conversation).toBe(1);
    expect(() => committed.executions[0]!.evidenceIds.push("forged")).toThrow(
      TypeError,
    );
    expect(() => {
      (committed.build.schema as { conversation: number }).conversation = 99;
    }).toThrow(TypeError);
  });

  it("reports committed turns after the database is reopened", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xiadie-audit-"));
    directories.push(directory);
    const path = join(directory, "desktop.sqlite");
    const firstDatabase = new DesktopDatabase(path);
    const firstStore = new SqliteVerifiedTurnStore(firstDatabase);
    firstStore.commit(record());
    firstDatabase.close();

    const reopened = new DesktopDatabase(path);
    databases.push(reopened);
    const reopenedStore = new SqliteVerifiedTurnStore(reopened);

    expect(reopenedStore.has(asTurnId("turn-1"))).toBe(true);
    expect(reopenedStore.commit(record()).commitVersion).toBe(1);
  });
});
