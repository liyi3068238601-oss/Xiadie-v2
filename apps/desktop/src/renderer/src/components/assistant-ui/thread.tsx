import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import type { FC } from "react";
import { Button } from "../ui/button.js";
import { Tooltip } from "../ui/tooltip.js";
import { EmptyState } from "../xiadie/empty-state.js";

export const Thread: FC<{ composerDisabled?: boolean }> = ({ composerDisabled = false }) => (
  <ThreadPrimitive.Root className="chat-thread">
    <ThreadPrimitive.Viewport className="chat-viewport" turnAnchor="top">
      <AuiIf condition={(state) => state.thread.messages.length === 0}><EmptyState /></AuiIf>
      <div className="message-list"><ThreadPrimitive.Messages components={{ Message: ThreadMessage }} /></div>
      <ThreadPrimitive.ViewportFooter className="composer-footer">
        <ThreadPrimitive.ScrollToBottom asChild><Button variant="outline" size="icon" aria-label="滚动到底部" className="scroll-bottom"><ArrowDownIcon /></Button></ThreadPrimitive.ScrollToBottom>
        <Composer disabled={composerDisabled} />
      </ThreadPrimitive.ViewportFooter>
    </ThreadPrimitive.Viewport>
  </ThreadPrimitive.Root>
);

const ThreadMessage: FC = () => {
  const role = useAuiState((state) => state.message.role);
  return role === "user" ? <UserMessage /> : <AssistantMessage />;
};

const UserMessage: FC = () => (
  <MessagePrimitive.Root className="message message--user" data-role="user">
    <div className="message-bubble"><MessagePrimitive.Parts /></div>
  </MessagePrimitive.Root>
);

const AssistantMessage: FC = () => (
  <MessagePrimitive.Root className="message message--assistant" data-role="assistant">
    <div className="assistant-copy"><MessagePrimitive.Parts components={{ Text: MarkdownText }} /></div>
    <MessagePrimitive.Error><ErrorPrimitive.Root className="message-error"><ErrorPrimitive.Message /></ErrorPrimitive.Root></MessagePrimitive.Error>
    <ActionBarPrimitive.Root hideWhenRunning autohide="not-last" className="message-actions">
      <ActionBarPrimitive.Copy asChild><Button variant="ghost" size="icon" aria-label="复制回复"><AuiIf condition={(s) => s.message.isCopied}><CheckIcon /></AuiIf><AuiIf condition={(s) => !s.message.isCopied}><CopyIcon /></AuiIf></Button></ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  </MessagePrimitive.Root>
);

const MarkdownText: FC = () => <StreamdownTextPrimitive />;

const Composer: FC<{ disabled: boolean }> = ({ disabled }) => (
  <ComposerPrimitive.Root className="composer-root">
    <ComposerPrimitive.Input disabled={disabled} aria-label="给遐蝶发送消息" placeholder={disabled ? "请先在设置中配置 API Key" : "和遐蝶说些什么……"} rows={1} className="composer-input" />
    <AuiIf condition={(state) => !state.thread.isRunning}>
      <Tooltip content="发送"><ComposerPrimitive.Send asChild><Button disabled={disabled} size="icon" aria-label="发送消息"><ArrowUpIcon /></Button></ComposerPrimitive.Send></Tooltip>
    </AuiIf>
    <AuiIf condition={(state) => state.thread.isRunning}><span className="composer-running" role="status" aria-label="遐蝶正在回复"><Loader2Icon /></span></AuiIf>
  </ComposerPrimitive.Root>
);
