import type { ThreadMessage } from "@assistant-ui/react";
import { describe, expect, it, vi } from "vitest";

import type {
  ConversationDto,
  MessageDto,
  SendMessageResultDto,
  TurnEventDto,
  XiadieDesktopBridge,
} from "../../../shared/contracts.js";
import { createDesktopClient } from "./desktop-client.js";
import { createDesktopChatModelAdapter } from "./chat-model-adapter.js";
import { createDesktopThreadHistoryAdapter } from "./thread-history-adapter.js";
import { createDesktopThreadListAdapter } from "./thread-list-adapter.js";

const conversation = (id: string, title = "新对话"): ConversationDto => ({
  id,
  title,
  createdAt: 1,
  updatedAt: 2,
});

const message = (
  id: string,
  conversationId: string,
  turnId: string,
  role: "user" | "assistant",
  content: string,
  status: MessageDto["status"] = "committed",
): MessageDto => ({
  id,
  conversationId,
  turnId,
  role,
  content,
  status,
  createdAt: 3,
  ...(status === "committed" ? { committedAt: 4 } : {}),
  ...(status === "failed" ? { errorCode: "desktop_run_failed" } : {}),
});

class FakeBridge implements XiadieDesktopBridge {
  readonly version = "1" as const;
  readonly listeners = new Set<(event: TurnEventDto) => void>();
  conversations: ConversationDto[] = [conversation("c1", "第一轮")];
  messages: MessageDto[] = [];
  send = vi.fn<(input: { conversationId: string; content: string }) => Promise<SendMessageResultDto>>();
  retry = vi.fn<(input: { conversationId: string; messageId: string }) => Promise<SendMessageResultDto>>();

  emit(event: TurnEventDto) {
    for (const listener of this.listeners) listener(event);
  }

  async listConversations() { return this.conversations; }
  async createConversation() {
    const created = conversation(`c${this.conversations.length + 1}`);
    this.conversations.push(created);
    return created;
  }
  async renameConversation(input: { conversationId: string; title: string }) {
    const renamed = { ...this.conversations.find((item) => item.id === input.conversationId)!, title: input.title };
    this.conversations = this.conversations.map((item) => item.id === renamed.id ? renamed : item);
    return renamed;
  }
  async deleteConversation(input: { conversationId: string }) {
    this.conversations = this.conversations.filter((item) => item.id !== input.conversationId);
  }
  async loadMessages(input: { conversationId: string }) {
    return this.messages.filter((item) => item.conversationId === input.conversationId);
  }
  sendMessage(input: { conversationId: string; content: string }) { return this.send(input); }
  retryMessage(input: { conversationId: string; messageId: string }) { return this.retry(input); }
  async getConnectionStatus() {
    return { model: "deepseek/deepseek-v4-flash" as const, configured: false, keySource: "none" as const, baseUrlSource: "default" as const, baseUrl: "https://api.deepseek.com", requiresExternalHostConfirmation: false, lastProbeStatus: "untested" as const };
  }
  async saveConnectionSettings() { return this.getConnectionStatus(); }
  async clearSavedApiKey() { return this.getConnectionStatus(); }
  async resetBaseUrl() { return this.getConnectionStatus(); }
  async testConnection() { return "untested" as const; }
  async getSidebar(input: { conversationId: string }) {
    return { conversationTitle: input.conversationId, failedMessages: [], sharedProjects: [] };
  }
  subscribeToTurnEvents(listener: (event: TurnEventDto) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const userMessage = (text: string): ThreadMessage => ({
  id: "u1",
  role: "user",
  content: [{ type: "text", text }],
  attachments: [],
  createdAt: new Date(1),
  metadata: { custom: {} },
});

describe("desktop assistant-ui adapters", () => {
  it("maps list/create/fetch/rename/delete and creates a local 40-code-point title", async () => {
    const bridge = new FakeBridge();
    const adapter = createDesktopThreadListAdapter(createDesktopClient(bridge));

    expect((await adapter.list()).threads[0]).toMatchObject({ remoteId: "c1", title: "第一轮", status: "regular" });
    expect(await adapter.initialize("optimistic-id")).toEqual({ remoteId: "c2" });
    await adapter.rename("c1", "改名");
    expect((await adapter.fetch("c1")).title).toBe("改名");

    const longTitle = "蝶".repeat(41);
    const stream = await adapter.generateTitle("c1", [userMessage(longTitle)]);
    const chunks: unknown[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(JSON.stringify(chunks)).toContain("蝶".repeat(40));
    expect(JSON.stringify(chunks)).not.toContain("蝶".repeat(41));

    await adapter.archive("c1");
    expect((await adapter.list()).threads).toHaveLength(1);
    await adapter.delete("c2");
    expect((await adapter.list()).threads).toHaveLength(0);
    await expect(adapter.unarchive("c1")).rejects.toThrow("desktop_unarchive_unsupported");
  });

  it("hydrates committed, pending and failed messages without persisting transient deltas", async () => {
    const bridge = new FakeBridge();
    bridge.messages = [
      message("u1", "c1", "t1", "user", "你好"),
      message("a1", "c1", "t1", "assistant", "我在"),
      message("u2", "c1", "t2", "user", "继续", "pending"),
      message("u3", "c1", "t3", "user", "重试", "failed"),
    ];

    const history = await createDesktopThreadHistoryAdapter(createDesktopClient(bridge), "c1").load();
    expect(history.messages.map((item) => [item.message.id, item.message.role])).toEqual([
      ["u1", "user"], ["a1", "assistant"], ["u2", "user"], ["u3", "user"],
    ]);
    expect(history.headId).toBe("u3");
    expect(history.messages[3]?.message.metadata.custom).toMatchObject({ desktopStatus: "failed" });
  });

  it("accumulates only increasing events for the selected conversation and active turn", async () => {
    const bridge = new FakeBridge();
    bridge.send.mockImplementation(async () => new Promise<SendMessageResultDto>(() => undefined));
    const adapter = createDesktopChatModelAdapter(createDesktopClient(bridge), "c1");
    const outputs: string[] = [];
    const run = adapter.run({ messages: [userMessage("来吧")], abortSignal: new AbortController().signal } as never);
    const consume = (async () => {
      for await (const update of run as AsyncGenerator<{ content?: readonly { type: string; text?: string }[] }>) {
        outputs.push(update.content?.[0]?.text ?? "");
        if (outputs.length === 2) break;
      }
    })();
    await Promise.resolve();

    bridge.emit({ type: "started", conversationId: "c1", turnId: "t1", sequence: 1 });
    bridge.emit({ type: "delta", conversationId: "c2", turnId: "t1", sequence: 2, delta: "错" });
    bridge.emit({ type: "delta", conversationId: "c1", turnId: "other", sequence: 2, delta: "错" });
    bridge.emit({ type: "delta", conversationId: "c1", turnId: "t1", sequence: 2, delta: "蝶" });
    bridge.emit({ type: "delta", conversationId: "c1", turnId: "t1", sequence: 2, delta: "重" });
    bridge.emit({ type: "delta", conversationId: "c1", turnId: "t1", sequence: 3, delta: "来" });
    await consume;

    expect(outputs).toEqual(["蝶", "蝶来"]);
    expect(bridge.listeners.size).toBe(0);
  });

  it("returns the terminal commit, exposes stable failures, supports retry and isolates abort", async () => {
    const bridge = new FakeBridge();
    const client = createDesktopClient(bridge);
    bridge.send.mockResolvedValue({ status: "committed", turnId: "t1", message: message("a1", "c1", "t1", "assistant", "完成") });
    const committed = [];
    for await (const event of client.runTurn({ conversationId: "c1", content: "做吧" }, new AbortController().signal)) committed.push(event);
    expect(committed.at(-1)).toMatchObject({ type: "committed", message: { content: "完成" } });

    bridge.retry.mockResolvedValue({ status: "failed", turnId: "t2", errorCode: "desktop_run_failed" });
    const failed = [];
    for await (const event of client.retryTurn({ conversationId: "c1", messageId: "u3" }, new AbortController().signal)) failed.push(event);
    expect(failed.at(-1)).toMatchObject({ type: "failed", errorCode: "desktop_run_failed" });

    bridge.send.mockImplementation(async () => new Promise<SendMessageResultDto>(() => undefined));
    const controller = new AbortController();
    const iterator = client.runTurn({ conversationId: "c1", content: "仍在主进程运行" }, controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    await Promise.resolve();
    expect(bridge.listeners.size).toBe(1);
    controller.abort();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(bridge.listeners.size).toBe(0);
  });
});
