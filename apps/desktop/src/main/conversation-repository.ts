import type { ConversationHistoryMessage } from "@xiadie/xiadie-core";
import type {
  ConversationDto,
  DesktopErrorCode,
  MessageDto,
  MessageStatus,
} from "../shared/contracts.js";
import { DesktopDatabase } from "./database.js";

interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  turn_id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  created_at: number;
  committed_at: number | null;
  error_code: DesktopErrorCode | null;
}

export interface CreateConversationInput {
  readonly id: string;
  readonly firstUserContent: string;
  readonly createdAt: number;
}

export interface RenameConversationInput {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
}

export interface SoftDeleteConversationInput {
  readonly id: string;
  readonly deletedAt: number;
}

export interface PendingUserInput {
  readonly id: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly content: string;
  readonly createdAt: number;
}

export interface CommitAssistantInput extends PendingUserInput {
  readonly committedAt: number;
}

export interface MarkFailedInput {
  readonly turnId: string;
  readonly errorCode: DesktopErrorCode;
}

const titleFrom = (content: string): string => {
  const title = Array.from(content).slice(0, 40).join("");
  return title.length === 0 ? "新对话" : title;
};

const conversationFromRow = (row: ConversationRow): ConversationDto =>
  Object.freeze({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
  });

const messageFromRow = (row: MessageRow): MessageDto =>
  Object.freeze({
    id: row.id,
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    ...(row.committed_at === null ? {} : { committedAt: row.committed_at }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
  });

export class DesktopConversationRepository {
  constructor(private readonly database: DesktopDatabase) {}

  list(): readonly ConversationDto[] {
    return Object.freeze(
      this.database
        .all<ConversationRow>(
          `SELECT id, title, created_at, updated_at, deleted_at
           FROM conversations
           WHERE deleted_at IS NULL
           ORDER BY updated_at DESC, id ASC`,
        )
        .map(conversationFromRow),
    );
  }

  create(input: CreateConversationInput): ConversationDto {
    const title = titleFrom(input.firstUserContent);
    this.database.run(
      `INSERT INTO conversations(id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      input.id,
      title,
      input.createdAt,
      input.createdAt,
    );
    return Object.freeze({
      id: input.id,
      title,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  }

  rename(input: RenameConversationInput): ConversationDto {
    const title = titleFrom(input.title);
    const result = this.database.run(
      `UPDATE conversations
       SET title = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      title,
      input.updatedAt,
      input.id,
    );
    if (Number(result.changes) !== 1) {
      throw new Error("desktop_conversation_missing");
    }
    return this.#getActive(input.id);
  }

  softDelete(input: SoftDeleteConversationInput): void {
    const result = this.database.run(
      `UPDATE conversations
       SET deleted_at = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      input.deletedAt,
      input.deletedAt,
      input.id,
    );
    if (Number(result.changes) !== 1) {
      throw new Error("desktop_conversation_missing");
    }
  }

  loadMessages(conversationId: string): readonly MessageDto[] {
    return Object.freeze(
      this.database
        .all<MessageRow>(
          `SELECT m.id, m.conversation_id, m.turn_id, m.role, m.content,
                  m.status, m.created_at, m.committed_at, m.error_code
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.conversation_id = ? AND c.deleted_at IS NULL
           ORDER BY m.created_at ASC, m.id ASC`,
          conversationId,
        )
        .map(messageFromRow),
    );
  }

  insertPendingUser(input: PendingUserInput): MessageDto {
    const result = this.database.run(
      `INSERT INTO messages
        (id, conversation_id, turn_id, role, content, status, created_at)
       SELECT ?, id, ?, 'user', ?, 'pending', ?
       FROM conversations
       WHERE id = ? AND deleted_at IS NULL`,
      input.id,
      input.turnId,
      input.content,
      input.createdAt,
      input.conversationId,
    );
    if (Number(result.changes) !== 1) {
      throw new Error("desktop_conversation_missing");
    }
    return Object.freeze({
      id: input.id,
      conversationId: input.conversationId,
      turnId: input.turnId,
      role: "user",
      content: input.content,
      status: "pending",
      createdAt: input.createdAt,
    });
  }

  commitAssistant(input: CommitAssistantInput): MessageDto {
    return this.database.transaction(() => {
      this.database.run(
        `INSERT INTO messages
          (id, conversation_id, turn_id, role, content, status, created_at, committed_at)
         VALUES (?, ?, ?, 'assistant', ?, 'committed', ?, ?)`,
        input.id,
        input.conversationId,
        input.turnId,
        input.content,
        input.createdAt,
        input.committedAt,
      );

      const user = this.database.run(
        `UPDATE messages
         SET status = 'committed', committed_at = ?, error_code = NULL
         WHERE conversation_id = ? AND turn_id = ?
           AND role = 'user' AND status = 'pending'`,
        input.committedAt,
        input.conversationId,
        input.turnId,
      );
      if (Number(user.changes) !== 1) {
        throw new Error("desktop_pending_user_missing");
      }

      const conversation = this.database.run(
        `UPDATE conversations
         SET title = (
           SELECT substr(content, 1, 40)
           FROM messages
           WHERE conversation_id = ? AND turn_id = ? AND role = 'user'
         ), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        input.conversationId,
        input.turnId,
        input.committedAt,
        input.conversationId,
      );
      if (Number(conversation.changes) !== 1) {
        throw new Error("desktop_conversation_missing");
      }

      return Object.freeze({
        id: input.id,
        conversationId: input.conversationId,
        turnId: input.turnId,
        role: "assistant",
        content: input.content,
        status: "committed",
        createdAt: input.createdAt,
        committedAt: input.committedAt,
      });
    });
  }

  markFailed(input: MarkFailedInput): void {
    const result = this.database.run(
      `UPDATE messages
       SET status = 'failed', error_code = ?
       WHERE turn_id = ? AND role = 'user' AND status = 'pending'`,
      input.errorCode,
      input.turnId,
    );
    if (Number(result.changes) !== 1) {
      throw new Error("desktop_pending_user_missing");
    }
  }

  recoverPending(input: Readonly<{ errorCode: DesktopErrorCode }>): number {
    const result = this.database.run(
      `UPDATE messages
       SET status = 'failed', error_code = ?
       WHERE role = 'user' AND status = 'pending'`,
      input.errorCode,
    );
    return Number(result.changes);
  }

  loadCommittedHistory(
    conversationId: string,
  ): readonly ConversationHistoryMessage[] {
    return Object.freeze(
      this.database
        .all<Pick<MessageRow, "id" | "role" | "content">>(
          `SELECT m.id, m.role, m.content
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.conversation_id = ? AND m.status = 'committed'
             AND c.deleted_at IS NULL
           ORDER BY m.created_at ASC, m.id ASC`,
          conversationId,
        )
        .map((row) =>
          Object.freeze({ id: row.id, role: row.role, content: row.content }),
        ),
    );
  }

  #getActive(id: string): ConversationDto {
    const row = this.database.get<ConversationRow>(
      `SELECT id, title, created_at, updated_at, deleted_at
       FROM conversations
       WHERE id = ? AND deleted_at IS NULL`,
      id,
    );
    if (row === undefined) {
      throw new Error("desktop_conversation_missing");
    }
    return conversationFromRow(row);
  }
}
