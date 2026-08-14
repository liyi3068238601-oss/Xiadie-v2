import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesktopConversationRepository } from "./conversation-repository.js";
import { DesktopDatabase } from "./database.js";

describe("DesktopConversationRepository", () => {
  let database: DesktopDatabase;
  let repository: DesktopConversationRepository;

  beforeEach(() => {
    database = new DesktopDatabase(":memory:");
    repository = new DesktopConversationRepository(database);
  });

  afterEach(() => database.close());

  it("creates deterministic 40-code-point titles, renames and soft deletes", () => {
    const content = `${"蝶".repeat(39)}🦋余下内容`;
    const created = repository.create({
      id: "conversation-1",
      firstUserContent: content,
      createdAt: 100,
    });

    expect(Array.from(created.title)).toHaveLength(40);
    expect(created.title).toBe(`${"蝶".repeat(39)}🦋`);
    expect(repository.list()).toEqual([created]);

    expect(
      repository.rename({ id: created.id, title: "新的标题", updatedAt: 110 }),
    ).toMatchObject({ title: "新的标题", updatedAt: 110 });

    repository.softDelete({ id: created.id, deletedAt: 120 });
    expect(repository.list()).toEqual([]);
    expect(repository.loadMessages(created.id)).toEqual([]);
  });

  it("isolates conversations and exposes only committed history", () => {
    repository.create({ id: "a", firstUserContent: "会话 A", createdAt: 1 });
    repository.create({ id: "b", firstUserContent: "会话 B", createdAt: 2 });
    repository.insertPendingUser({
      id: "a-user",
      conversationId: "a",
      turnId: "a-turn",
      content: "A 的问题",
      createdAt: 3,
    });
    repository.insertPendingUser({
      id: "b-user",
      conversationId: "b",
      turnId: "b-turn",
      content: "B 的问题",
      createdAt: 4,
    });
    repository.commitAssistant({
      id: "a-assistant",
      conversationId: "a",
      turnId: "a-turn",
      content: "A 的回答",
      createdAt: 5,
      committedAt: 6,
    });

    expect(repository.loadMessages("a").map(({ content }) => content)).toEqual([
      "A 的问题",
      "A 的回答",
    ]);
    expect(repository.loadMessages("b").map(({ content }) => content)).toEqual([
      "B 的问题",
    ]);
    expect(repository.loadCommittedHistory("a")).toEqual([
      { id: "a-user", role: "user", content: "A 的问题" },
      { id: "a-assistant", role: "assistant", content: "A 的回答" },
    ]);
    expect(repository.loadCommittedHistory("b")).toEqual([]);
  });

  it("rolls back assistant insertion when no matching pending user exists", () => {
    repository.create({ id: "conversation-1", firstUserContent: "问题", createdAt: 1 });

    expect(() =>
      repository.commitAssistant({
        id: "orphan-assistant",
        conversationId: "conversation-1",
        turnId: "missing-turn",
        content: "不应写入",
        createdAt: 2,
        committedAt: 3,
      }),
    ).toThrowError("desktop_pending_user_missing");
    expect(repository.loadMessages("conversation-1")).toEqual([]);
  });

  it("marks failed turns and recovers pending turns after restart", () => {
    repository.create({ id: "conversation-1", firstUserContent: "问题", createdAt: 1 });
    repository.insertPendingUser({
      id: "user-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      content: "问题一",
      createdAt: 2,
    });
    repository.insertPendingUser({
      id: "user-2",
      conversationId: "conversation-1",
      turnId: "turn-2",
      content: "问题二",
      createdAt: 3,
    });

    repository.markFailed({ turnId: "turn-1", errorCode: "desktop_run_failed" });
    expect(
      repository.recoverPending({ errorCode: "desktop_run_interrupted" }),
    ).toBe(1);

    expect(repository.loadMessages("conversation-1")).toMatchObject([
      { turnId: "turn-1", status: "failed", errorCode: "desktop_run_failed" },
      {
        turnId: "turn-2",
        status: "failed",
        errorCode: "desktop_run_interrupted",
      },
    ]);
  });

  it("retains verified audit facts when the display conversation is deleted", () => {
    repository.create({ id: "conversation-1", firstUserContent: "问题", createdAt: 1 });
    database.run(
      `INSERT INTO verified_turns
        (turn_id, conversation_id, canonical_payload, input_fingerprint, committed_at, commit_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      "turn-1",
      "conversation-1",
      "{}",
      "fingerprint",
      2,
      1,
    );

    repository.softDelete({ id: "conversation-1", deletedAt: 3 });

    expect(
      database.get<{ turn_id: string }>(
        "SELECT turn_id FROM verified_turns WHERE turn_id = ?",
        "turn-1",
      ),
    ).toEqual({ turn_id: "turn-1" });
  });

  it("treats titles and message bodies as data, not SQL", () => {
    const hostile = "'); DROP TABLE conversations; --";
    repository.create({
      id: "conversation-1",
      firstUserContent: hostile,
      createdAt: 1,
    });
    repository.rename({ id: "conversation-1", title: hostile, updatedAt: 2 });
    repository.insertPendingUser({
      id: "user-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      content: hostile,
      createdAt: 3,
    });

    expect(repository.list()[0]?.title).toBe(hostile);
    expect(repository.loadMessages("conversation-1")[0]?.content).toBe(hostile);
    expect(
      database.get<{ count: number }>("SELECT COUNT(*) AS count FROM conversations"),
    ).toEqual({ count: 1 });
  });
});
