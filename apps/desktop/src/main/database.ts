import {
  DatabaseSync,
  type SQLInputValue,
  type StatementResultingChanges,
} from "node:sqlite";

export interface DesktopDatabaseOptions {
  readonly now?: () => number;
}

const MIGRATION_1 = `
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  turn_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','committed','failed')),
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  error_code TEXT,
  UNIQUE(turn_id, role)
);
CREATE INDEX messages_conversation_order
  ON messages(conversation_id, created_at, id);
CREATE TABLE verified_turns (
  turn_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  canonical_payload TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  committed_at INTEGER NOT NULL,
  commit_version INTEGER NOT NULL
);
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`;

export class DesktopDatabase {
  readonly #database: DatabaseSync;

  constructor(path: string, options: DesktopDatabaseOptions = {}) {
    this.#database = new DatabaseSync(path, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
      timeout: 5000,
    });
    this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    this.#migrate(options.now?.() ?? Date.now());
  }

  run(sql: string, ...parameters: SQLInputValue[]): StatementResultingChanges {
    return this.#database.prepare(sql).run(...parameters);
  }

  get<Row extends object>(
    sql: string,
    ...parameters: SQLInputValue[]
  ): Row | undefined {
    return this.#database.prepare(sql).get(...parameters) as Row | undefined;
  }

  all<Row extends object>(
    sql: string,
    ...parameters: SQLInputValue[]
  ): Row[] {
    return this.#database.prepare(sql).all(...parameters) as Row[];
  }

  transaction<Result>(operation: () => Result): Result {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  #migrate(appliedAt: number): void {
    const table = this.get<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    );
    const current = table === undefined
      ? 0
      : (this.get<{ version: number }>(
          "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
        )?.version ?? 0);

    if (current > 1) {
      throw new Error("desktop_schema_newer_than_runtime");
    }
    if (current === 1) {
      return;
    }

    this.transaction(() => {
      this.#database.exec(MIGRATION_1);
      this.run(
        "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
        1,
        appliedAt,
      );
    });
  }
}
