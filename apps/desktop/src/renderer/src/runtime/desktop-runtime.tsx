import {
  RuntimeAdapterProvider,
  useAuiState,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { type PropsWithChildren, useCallback, useMemo } from "react";

import { createDesktopChatModelAdapter } from "./chat-model-adapter.js";
import { createDesktopClient, type DesktopClient } from "./desktop-client.js";
import { createDesktopThreadHistoryAdapter } from "./thread-history-adapter.js";
import { createDesktopThreadListAdapter } from "./thread-list-adapter.js";

const createThreadProvider = (client: DesktopClient) => function ThreadProvider({ children }: PropsWithChildren) {
  const conversationId = useAuiState((state) => state.threadListItem.remoteId);
  const adapters = useMemo(
    () => conversationId ? { history: createDesktopThreadHistoryAdapter(client, conversationId) } : {},
    [conversationId],
  );
  return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
};

export const useDesktopRuntime = (): AssistantRuntime => {
  const client = useMemo(() => createDesktopClient(window.xiadieDesktop), []);
  const threadListAdapter = useMemo(() => ({
    ...createDesktopThreadListAdapter(client),
    unstable_Provider: createThreadProvider(client),
  }), [client]);

  const runtimeHook = useCallback(function DesktopThreadRuntime() {
    const conversationId = useAuiState((state) => state.threadListItem.remoteId);
    const chatModel = useMemo(
      () => createDesktopChatModelAdapter(client, conversationId ?? "desktop_thread_initializing"),
      [conversationId],
    );
    return useLocalRuntime(chatModel, { adapters: {} });
  }, [client]);

  return useRemoteThreadListRuntime({ runtimeHook, adapter: threadListAdapter });
};
