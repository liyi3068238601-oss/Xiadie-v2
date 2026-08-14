import type { RemoteThreadListAdapter, ThreadMessage } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";

import type { DesktopClient } from "./desktop-client.js";

const metadata = (item: Awaited<ReturnType<DesktopClient["createConversation"]>>) => ({
  status: "regular" as const,
  remoteId: item.id,
  title: item.title,
  lastMessageAt: new Date(item.updatedAt),
});

const firstUserText = (messages: readonly ThreadMessage[]): string => {
  const first = messages.find((message) => message.role === "user");
  if (!first) return "新对话";
  const text = first.content
    .filter((part): part is Extract<(typeof first.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  return Array.from(text || "新对话").slice(0, 40).join("");
};

export const createDesktopThreadListAdapter = (client: DesktopClient): RemoteThreadListAdapter => ({
  list: async () => ({ threads: (await client.listConversations()).map(metadata) }),
  initialize: async () => ({ remoteId: (await client.createConversation()).id }),
  rename: async (remoteId, newTitle) => { await client.renameConversation(remoteId, newTitle); },
  archive: async (remoteId) => { await client.deleteConversation(remoteId); },
  unarchive: async () => { throw new Error("desktop_unarchive_unsupported"); },
  delete: async (remoteId) => { await client.deleteConversation(remoteId); },
  fetch: async (threadId) => {
    const found = (await client.listConversations()).find((item) => item.id === threadId);
    if (!found) throw new Error("desktop_conversation_missing");
    return metadata(found);
  },
  generateTitle: async (_remoteId, messages) => {
    const title = firstUserText(messages);
    return createAssistantStream((controller) => controller.appendText(title));
  },
});
