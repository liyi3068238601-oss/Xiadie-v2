import { contextBridge, ipcRenderer } from "electron";
import {
  desktopPublicErrorCodeSchema,
  turnEventSchema,
  type DesktopIpcResult,
  type TurnEventDto,
  type XiadieDesktopBridge,
} from "../shared/contracts.js";

export interface PreloadIpcPort {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, value: unknown) => void,
  ): unknown;
}

type BridgeResult<Method extends keyof XiadieDesktopBridge> =
  XiadieDesktopBridge[Method] extends (...args: never[]) => Promise<infer Value>
    ? Value
    : never;

const unwrap = async <Value>(promise: Promise<unknown>): Promise<Value> => {
  const result = await promise;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error("desktop_internal_error");
  }
  const envelope = result as Partial<DesktopIpcResult<Value>>;
  if (envelope.ok === true && "value" in envelope) return envelope.value as Value;
  if (envelope.ok === false) {
    const parsed = desktopPublicErrorCodeSchema.safeParse(envelope.errorCode);
    throw new Error(parsed.success ? parsed.data : "desktop_internal_error");
  }
  throw new Error("desktop_internal_error");
};

export const createDesktopBridge = (
  ipc: PreloadIpcPort,
): XiadieDesktopBridge => {
  const bridge: XiadieDesktopBridge = {
    version: "1" as const,
    listConversations: () =>
      unwrap<BridgeResult<"listConversations">>(ipc.invoke("conversation:list")),
    createConversation: () =>
      unwrap<BridgeResult<"createConversation">>(ipc.invoke("conversation:create")),
    renameConversation: (input) =>
      unwrap<BridgeResult<"renameConversation">>(
        ipc.invoke("conversation:rename", input),
      ),
    deleteConversation: (input) =>
      unwrap<BridgeResult<"deleteConversation">>(
        ipc.invoke("conversation:delete", input),
      ),
    loadMessages: (input) =>
      unwrap<BridgeResult<"loadMessages">>(ipc.invoke("message:list", input)),
    sendMessage: (input) =>
      unwrap<BridgeResult<"sendMessage">>(ipc.invoke("message:send", input)),
    retryMessage: (input) =>
      unwrap<BridgeResult<"retryMessage">>(ipc.invoke("message:retry", input)),
    getConnectionStatus: () =>
      unwrap<BridgeResult<"getConnectionStatus">>(ipc.invoke("connection:status")),
    saveConnectionSettings: (input) =>
      unwrap<BridgeResult<"saveConnectionSettings">>(
        ipc.invoke("connection:save", input),
      ),
    clearSavedApiKey: () =>
      unwrap<BridgeResult<"clearSavedApiKey">>(
        ipc.invoke("connection:clear-key"),
      ),
    resetBaseUrl: () =>
      unwrap<BridgeResult<"resetBaseUrl">>(
        ipc.invoke("connection:reset-base-url"),
      ),
    testConnection: (input) =>
      unwrap<BridgeResult<"testConnection">>(
        ipc.invoke("connection:test", input),
      ),
    getSidebar: (input) =>
      unwrap<BridgeResult<"getSidebar">>(ipc.invoke("sidebar:get", input)),
    subscribeToTurnEvents: (listener) => {
      const lastSequence = new Map<string, number>();
      const handler = (_event: unknown, value: unknown): void => {
        const parsed = turnEventSchema.safeParse(value);
        if (!parsed.success) return;
        const event = parsed.data;
        const key = `${event.conversationId}\u0000${event.turnId}`;
        const previous = lastSequence.get(key);
        if (previous !== undefined && event.sequence <= previous) return;
        lastSequence.set(key, event.sequence);
        listener(event as TurnEventDto);
      };
      ipc.on("turn:event", handler);
      return () => {
        lastSequence.clear();
        ipc.removeListener("turn:event", handler);
      };
    },
  };
  return Object.freeze(bridge);
};

contextBridge.exposeInMainWorld(
  "xiadieDesktop",
  createDesktopBridge(ipcRenderer),
);
