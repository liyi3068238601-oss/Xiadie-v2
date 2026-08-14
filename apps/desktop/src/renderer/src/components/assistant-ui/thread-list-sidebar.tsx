import type { FC } from "react";
import { ThreadList } from "./thread-list.js";

export const ThreadListSidebar: FC = () => <nav className="thread-sidebar" aria-label="对话列表"><header><span className="brand-mark">蝶</span><div><strong>遐蝶</strong><small>Xiadie Desktop</small></div></header><ThreadList /></nav>;
