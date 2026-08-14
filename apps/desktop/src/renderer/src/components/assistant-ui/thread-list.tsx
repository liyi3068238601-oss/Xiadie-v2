import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useEffect, useRef, useState, type FC } from "react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";

export const ThreadList: FC = () => (
  <ThreadListPrimitive.Root className="thread-list">
    <ThreadListPrimitive.New asChild><Button variant="ghost" className="thread-list-new"><PlusIcon />新对话</Button></ThreadListPrimitive.New>
    <ThreadListPrimitive.Items components={{ ThreadListItem }} />
  </ThreadListPrimitive.Root>
);

const ThreadListItem: FC = () => {
  const [renaming, setRenaming] = useState(false);
  const title = useAuiState((state) => state.threadListItem.title) ?? "新对话";
  const aui = useAui();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);
  const commit = async () => {
    const next = inputRef.current?.value.trim();
    if (next && next !== title) await aui.threadListItem.rename(next);
    setRenaming(false);
  };
  return <ThreadListItemPrimitive.Root className="thread-list-item">
    {renaming ? <Input ref={inputRef} defaultValue={title} aria-label="重命名对话" onBlur={() => void commit()} onKeyDown={(event) => { if (event.key === "Enter") void commit(); if (event.key === "Escape") setRenaming(false); }} /> : <ThreadListItemPrimitive.Trigger className="thread-list-trigger"><ThreadListItemPrimitive.Title fallback="新对话" /></ThreadListItemPrimitive.Trigger>}
    <div className="thread-list-actions">
      <Button variant="ghost" size="icon" aria-label="重命名对话" onClick={() => setRenaming(true)}><PencilIcon /></Button>
      <ThreadListItemPrimitive.Delete asChild><Button variant="ghost" size="icon" aria-label="删除对话" onClick={(event) => { if (!window.confirm("确定删除这个对话吗？")) event.preventDefault(); }}><TrashIcon /></Button></ThreadListItemPrimitive.Delete>
      <span className="sr-only"><MoreHorizontalIcon /></span>
    </div>
  </ThreadListItemPrimitive.Root>;
};
