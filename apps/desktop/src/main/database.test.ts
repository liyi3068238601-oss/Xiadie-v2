import { afterEach, describe, expect, it } from "vitest";
import { DesktopDatabase } from "./database.js";

describe("DesktopDatabase", () => {
  let database: DesktopDatabase | undefined;

  afterEach(() => database?.close());

  it("applies migration 1 with foreign keys and a busy timeout", () => {
    database = new DesktopDatabase(":memory:", { now: () => 1_700_000_000_000 });

    expect(database.get<{ version: number }>(
      "SELECT version FROM schema_migrations",
    )).toEqual({ version: 1 });
    expect(database.get<{ foreign_keys: number }>("PRAGMA foreign_keys")).toEqual({
      foreign_keys: 1,
    });
    expect(database.get<{ timeout: number }>("PRAGMA busy_timeout")).toEqual({
      timeout: 5000,
    });
  });

  it("enforces message foreign keys", () => {
    database = new DesktopDatabase(":memory:");

    expect(() =>
      database?.run(
        `INSERT INTO messages
          (id, conversation_id, turn_id, role, content, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        "message-1",
        "missing-conversation",
        "turn-1",
        "user",
        "hello",
        "pending",
        1,
      ),
    ).toThrow();
  });

  it("does not expose SQLite extension loading", () => {
    database = new DesktopDatabase(":memory:");

    expect("enableLoadExtension" in database).toBe(false);
    expect("loadExtension" in database).toBe(false);
  });
});
