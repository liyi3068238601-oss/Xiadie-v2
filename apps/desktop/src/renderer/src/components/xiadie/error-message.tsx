import { Button } from "../ui/button.js";

export interface FailedMessageView { readonly id: string; readonly content: string; readonly errorCode?: string }
export function ErrorMessage({ message, onRetry }: { message: FailedMessageView; onRetry?: (id: string) => void }) {
  return <div className="failed-message"><p>{message.content}</p><small>这条消息没有成功送达。</small>{onRetry && <Button variant="outline" size="sm" aria-label={`重试：${message.content}`} onClick={() => onRetry(message.id)}>重试</Button>}</div>;
}
