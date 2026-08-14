import type { ChatModelAdapter, ChatModelRunOptions } from "@assistant-ui/react";

import type { DesktopClient } from "./desktop-client.js";

const userText = (options: ChatModelRunOptions): string => {
  const last = [...options.messages].reverse().find((message) => message.role === "user");
  if (!last) throw new Error("desktop_message_empty");
  return last.content
    .filter((part): part is Extract<(typeof last.content)[number], { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
};

export const createDesktopChatModelAdapter = (
  client: DesktopClient,
  conversationId: string,
): ChatModelAdapter => ({
  async *run(options) {
    let text = "";
    for await (const event of client.runTurn(
      { conversationId, content: userText(options) },
      options.abortSignal,
    )) {
      if (event.type === "delta") {
        text += event.delta;
        yield { content: [{ type: "text", text }] };
      } else if (event.type === "committed") {
        yield {
          content: [{ type: "text", text: event.message.content }],
          status: { type: "complete", reason: "stop" },
        };
      } else if (event.type === "failed") {
        yield {
          content: text ? [{ type: "text", text }] : [],
          status: { type: "incomplete", reason: "error", error: event.errorCode },
        };
      }
    }
  },
});
