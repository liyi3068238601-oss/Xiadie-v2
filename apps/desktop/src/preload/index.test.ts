import { beforeEach, describe, expect, it, vi } from "vitest";

const { exposeInMainWorld } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { createDesktopBridge, type PreloadIpcPort } from "./index.js";

const ipc = () => {
  const invoke = vi.fn(
    async (_channel: string, _payload?: unknown): Promise<unknown> => ({
      ok: true,
      value: [],
    }),
  );
  const on = vi.fn(
    (_channel: string, _listener: (event: unknown, value: unknown) => void) =>
      undefined,
  );
  const removeListener = vi.fn(
    (_channel: string, _listener: (event: unknown, value: unknown) => void) =>
      undefined,
  );
  return { invoke, on, removeListener } satisfies PreloadIpcPort & {
    invoke: typeof invoke;
    on: typeof on;
    removeListener: typeof removeListener;
  };
};

describe("createDesktopBridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes only versioned named capabilities", () => {
    const bridge = createDesktopBridge(ipc());
    expect(Object.keys(bridge)).toEqual([
      "version",
      "listConversations",
      "createConversation",
      "renameConversation",
      "deleteConversation",
      "loadMessages",
      "sendMessage",
      "retryMessage",
      "getConnectionStatus",
      "saveConnectionSettings",
      "clearSavedApiKey",
      "resetBaseUrl",
      "testConnection",
      "getSidebar",
      "subscribeToTurnEvents",
    ]);
    expect(bridge).not.toHaveProperty("invoke");
    expect(bridge).not.toHaveProperty("ipcRenderer");
  });

  it("maps named methods to fixed channels and unwraps stable results", async () => {
    const port = ipc();
    const bridge = createDesktopBridge(port);
    await bridge.sendMessage({ conversationId: "c", content: "hello" });
    expect(port.invoke).toHaveBeenCalledWith("message:send", {
      conversationId: "c",
      content: "hello",
    });
  });

  it("validates events and drops non-monotonic or malformed values", () => {
    const port = ipc();
    const bridge = createDesktopBridge(port);
    const listener = vi.fn();
    const unsubscribe = bridge.subscribeToTurnEvents(listener);
    const handler = port.on.mock.calls[0]?.[1] as
      | ((event: unknown, value: unknown) => void)
      | undefined;

    handler?.({}, { conversationId: "c", turnId: "t", sequence: 0, type: "started" });
    handler?.({}, { conversationId: "c", turnId: "t", sequence: 0, type: "started" });
    handler?.({}, { conversationId: "c", turnId: "t", sequence: -1, type: "delta" });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(port.removeListener).toHaveBeenCalledWith("turn:event", handler);
  });

  it("throws only the stable error code returned by Main", async () => {
    const port = ipc();
    port.invoke.mockResolvedValueOnce({
      ok: false,
      errorCode: "desktop_invalid_request",
      stack: "C:\\secret",
    });
    const bridge = createDesktopBridge(port);
    await expect(bridge.listConversations()).rejects.toThrowError(
      "desktop_invalid_request",
    );
  });
});
