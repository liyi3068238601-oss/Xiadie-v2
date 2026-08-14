import { PanelLeftIcon, PanelRightIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Thread } from "../assistant-ui/thread.js";
import { ThreadListSidebar } from "../assistant-ui/thread-list-sidebar.js";
import { Button } from "../ui/button.js";
import type { FailedMessageView } from "./error-message.js";
import { ConnectedRightSidebar, RightSidebar } from "./right-sidebar.js";

export function DesktopShell({ connectionConfigured, failedMessages = [], onRetry }: { connectionConfigured: boolean; failedMessages?: readonly FailedMessageView[]; onRetry?: (id: string) => void }) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [newShortcutCount, setNewShortcutCount] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key.toLowerCase() === "n") { event.preventDefault(); (shellRef.current?.querySelector('[data-slot="aui_thread-list-new"]') as HTMLButtonElement | null)?.click(); setNewShortcutCount((value) => value + 1); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); (shellRef.current?.querySelector('[aria-label="给遐蝶发送消息"]') as HTMLTextAreaElement | null)?.focus(); }
      if (event.shiftKey && event.key.toLowerCase() === "e") { event.preventDefault(); setLeftOpen((value) => !value); }
      if (event.shiftKey && event.key.toLowerCase() === "i") { event.preventDefault(); setRightOpen((value) => !value); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  return <div ref={shellRef} className={`xiadie-shell ${leftOpen ? "left-open" : ""} ${rightOpen ? "right-open" : ""}`}>
    {leftOpen && <ThreadListSidebar />}
    <main className="conversation-panel" aria-label="遐蝶对话"><header className="conversation-header"><Button variant="ghost" size="icon" aria-label="切换对话列表" onClick={() => setLeftOpen((v) => !v)}><PanelLeftIcon /></Button><div><strong>遐蝶</strong><small>{connectionConfigured ? "已连接" : "等待配置连接"}</small></div><Button variant="ghost" size="icon" aria-label="切换遐蝶信息" onClick={() => setRightOpen((v) => !v)}><PanelRightIcon /></Button></header><Thread composerDisabled={!connectionConfigured} /></main>
    {rightOpen && (failedMessages.length > 0 || onRetry ? <RightSidebar failedMessages={failedMessages} {...(onRetry ? { onRetry } : {})} /> : <ConnectedRightSidebar />)}
    <output data-testid="new-conversation-shortcut" hidden>{newShortcutCount}</output>
  </div>;
}
