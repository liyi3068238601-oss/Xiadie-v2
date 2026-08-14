import { useAuiState } from "@assistant-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { SidebarDto, TurnEventDto } from "../../../../shared/contracts.js";
import type { FailedMessageView } from "./error-message.js";
import { ErrorMessage } from "./error-message.js";

export function RightSidebar({ title = "当前对话", failedMessages = [], sharedProjects = [], onRetry }: { title?: string; failedMessages?: readonly FailedMessageView[]; sharedProjects?: readonly string[]; onRetry?: (id: string) => void }) {
  return <aside className="right-sidebar" aria-label="遐蝶信息"><section><span className="portrait" aria-hidden="true">蝶</span><h2>遐蝶</h2><p>温柔、克制，也保留自己的判断。</p></section><section><h3>当前对话</h3><p>{title}</p></section>{sharedProjects.length > 0 && <section><h3>共同项目</h3><ul>{sharedProjects.map((project) => <li key={project}>{project}</li>)}</ul></section>}{failedMessages.length > 0 && <section><h3>待重试</h3>{failedMessages.map((message) => <ErrorMessage key={message.id} message={message} {...(onRetry ? { onRetry } : {})} />)}</section>}</aside>;
}

export function ConnectedRightSidebar() {
  const conversationId = useAuiState((state) => state.threadListItem.remoteId);
  const [sidebar, setSidebar] = useState<SidebarDto | undefined>();
  const load = useCallback(async () => {
    if (!conversationId) { setSidebar(undefined); return; }
    setSidebar(await window.xiadieDesktop.getSidebar({ conversationId }));
  }, [conversationId]);
  useEffect(() => {
    void load();
    return window.xiadieDesktop.subscribeToTurnEvents((event: TurnEventDto) => {
      if (event.conversationId === conversationId && (event.type === "committed" || event.type === "failed")) void load();
    });
  }, [conversationId, load]);
  const retry = useCallback(async (messageId: string) => {
    if (!conversationId) return;
    await window.xiadieDesktop.retryMessage({ conversationId, messageId });
    await load();
  }, [conversationId, load]);
  return <RightSidebar {...(sidebar ? { title: sidebar.conversationTitle, failedMessages: sidebar.failedMessages, sharedProjects: sidebar.sharedProjects } : {})} onRetry={retry} />;
}
