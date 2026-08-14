import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_INVOKE_CHANNELS,
  registerDesktopIpc,
  type DesktopIpcDependencies,
  type IpcMainEventPort,
} from "./ipc.js";

class FakeIpcMain {
  readonly handlers = new Map<string, (event: IpcMainEventPort, payload?: unknown) => unknown>();
  handle(channel: string, handler: (event: IpcMainEventPort, payload?: unknown) => unknown) {
    this.handlers.set(channel, handler);
  }
}

const dependencies = (): DesktopIpcDependencies => ({
  trustedWebContentsId: 7,
  repository: {
    list: () => [],
    create: (input) => ({
      id: input.id,
      title: "新对话",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    }),
    rename: (input) => ({
      id: input.id,
      title: input.title,
      createdAt: 1,
      updatedAt: input.updatedAt,
    }),
    loadMessages: () => [],
  },
  chatService: {
    sendMessage: async () => ({
      turnId: "turn-1",
      status: "failed",
      errorCode: "desktop_run_failed",
    }),
    retryMessage: async () => ({
      turnId: "turn-2",
      status: "failed",
      errorCode: "desktop_run_failed",
    }),
    deleteConversation: () => undefined,
    subscribe: () => () => undefined,
  },
  connectionStore: {
    getStatus: async () => ({
      model: "deepseek/deepseek-v4-flash",
      configured: false,
      keySource: "none",
      baseUrlSource: "default",
      baseUrl: "https://api.deepseek.com",
      requiresExternalHostConfirmation: false,
      lastProbeStatus: "untested",
    }),
    save: async () => undefined,
    resolveForRun: async () => ({
      configured: false,
      keySource: "none",
      baseUrlSource: "default",
      baseUrl: "https://api.deepseek.com",
      requiresExternalHostConfirmation: false,
    }),
    setLastProbeStatus: () => undefined,
  },
  createConversationId: () => "conversation-1",
  now: () => 1,
  testConnection: async () => "ok",
});

const trustedEvent = () => ({ sender: { id: 7, send: vi.fn() } });

describe("registerDesktopIpc", () => {
  it("registers exactly the fixed command allowlist", () => {
    const ipc = new FakeIpcMain();
    registerDesktopIpc(ipc, dependencies());
    expect([...ipc.handlers.keys()]).toEqual(DESKTOP_INVOKE_CHANNELS);
  });

  it.each([
    ["conversation:rename", { conversationId: "", title: "title" }],
    ["conversation:delete", { conversationId: "x".repeat(129) }],
    ["message:send", { conversationId: "c", content: "x".repeat(32_001) }],
    ["message:retry", { conversationId: "c", messageId: "m", extra: true }],
  ])("rejects malformed %s payloads", async (channel, payload) => {
    const ipc = new FakeIpcMain();
    registerDesktopIpc(ipc, dependencies());
    await expect(ipc.handlers.get(channel)?.(trustedEvent(), payload)).resolves.toEqual({
      ok: false,
      errorCode: "desktop_invalid_request",
    });
  });

  it("rejects another window before calling a service", async () => {
    const ipc = new FakeIpcMain();
    const deps = dependencies();
    const list = vi.spyOn(deps.repository, "list");
    registerDesktopIpc(ipc, deps);

    await expect(
      ipc.handlers.get("conversation:list")?.({
        sender: { id: 8, send: vi.fn() },
      }),
    ).resolves.toEqual({ ok: false, errorCode: "desktop_forbidden_window" });
    expect(list).not.toHaveBeenCalled();
  });

  it("contains raw service failures and malformed outputs", async () => {
    const ipc = new FakeIpcMain();
    const deps = dependencies();
    deps.repository.list = () => [{ path: "C:\\secret", apiKey: "secret" }] as never;
    registerDesktopIpc(ipc, deps);

    await expect(
      ipc.handlers.get("conversation:list")?.(trustedEvent()),
    ).resolves.toEqual({ ok: false, errorCode: "desktop_internal_error" });
  });

  it("delivers turn events only to the invoking window", async () => {
    const ipc = new FakeIpcMain();
    const deps = dependencies();
    deps.chatService.subscribe = (_conversationId, listener) => {
      listener({
        conversationId: "c",
        turnId: "t",
        sequence: 0,
        type: "started",
      });
      return () => undefined;
    };
    registerDesktopIpc(ipc, deps);
    const event = trustedEvent();

    await ipc.handlers.get("message:send")?.(event, {
      conversationId: "c",
      content: "hello",
    });

    expect(event.sender.send).toHaveBeenCalledWith("turn:event", {
      conversationId: "c",
      turnId: "t",
      sequence: 0,
      type: "started",
    });
  });

  it("requires explicit confirmation before saving an external host", async () => {
    const ipc = new FakeIpcMain();
    const deps = dependencies();
    const save = vi.spyOn(deps.connectionStore, "save");
    registerDesktopIpc(ipc, deps);

    await expect(
      ipc.handlers.get("connection:save")?.(trustedEvent(), {
        baseUrl: "https://external.example/v1",
      }),
    ).resolves.toEqual({
      ok: false,
      errorCode: "external_host_confirmation_required",
    });
    expect(save).not.toHaveBeenCalled();
  });
});
