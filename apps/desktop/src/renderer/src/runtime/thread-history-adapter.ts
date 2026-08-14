import {
  fromThreadMessageLike,
  type ExportedMessageRepository,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";

import type { MessageDto } from "../../../shared/contracts.js";
import type { DesktopClient } from "./desktop-client.js";

const toThreadMessage = (dto: MessageDto): ThreadMessage => {
  const like: ThreadMessageLike = {
    id: dto.id,
    role: dto.role,
    content: dto.content,
    createdAt: new Date(dto.createdAt),
    metadata: {
      custom: {
        desktopStatus: dto.status,
        ...(dto.errorCode ? { errorCode: dto.errorCode } : {}),
      },
    },
    ...(dto.role === "assistant"
      ? { status: dto.status === "committed"
          ? { type: "complete", reason: "stop" }
          : dto.status === "failed"
            ? { type: "incomplete", reason: "error", error: dto.errorCode ?? "desktop_run_failed" }
            : { type: "running" } }
      : {}),
  };
  return fromThreadMessageLike(like, dto.id, { type: "complete", reason: "unknown" });
};

export const createDesktopThreadHistoryAdapter = (
  client: DesktopClient,
  conversationId: string,
): ThreadHistoryAdapter => ({
  load: async (): Promise<ExportedMessageRepository> => {
    const messages = (await client.loadMessages(conversationId)).map(toThreadMessage);
    return {
      headId: messages.at(-1)?.id ?? null,
      messages: messages.map((item, index) => ({
        message: item,
        parentId: index === 0 ? null : messages[index - 1]!.id,
      })),
    };
  },
  // Main owns durable history. LocalRuntime append calls are intentionally ephemeral.
  append: async () => undefined,
});
