import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../assistant-ui/thread.js", () => ({
  Thread: ({ composerDisabled }: { composerDisabled?: boolean }) => <><h1>在这里，慢慢说就好。</h1><textarea aria-label="给遐蝶发送消息" disabled={composerDisabled} /></>,
}));
vi.mock("../assistant-ui/thread-list-sidebar.js", () => ({
  ThreadListSidebar: () => <nav aria-label="对话列表">新对话</nav>,
}));
vi.mock("./right-sidebar.js", async () => {
  const actual = await vi.importActual<typeof import("./right-sidebar.js")>("./right-sidebar.js");
  return { ...actual, ConnectedRightSidebar: () => <aside aria-label="遐蝶信息">当前对话</aside> };
});

import { DesktopShell } from "./desktop-shell.js";

afterEach(cleanup);

describe("DesktopShell", () => {
  it("renders the locked three regions without excluded controls", () => {
    render(<DesktopShell connectionConfigured={false} />);
    expect(screen.getByLabelText("对话列表")).toBeTruthy();
    expect(screen.getByRole("main", { name: "遐蝶对话" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "遐蝶信息" })).toBeTruthy();
    expect((screen.getByLabelText("给遐蝶发送消息") as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByText(/Live2D|情绪分数|模型选择|工具进度/i)).toBeNull();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("supports the four keyboard shortcuts and restores composer focus", () => {
    render(<DesktopShell connectionConfigured />);
    const composer = screen.getByLabelText("给遐蝶发送消息");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(composer);
    fireEvent.keyDown(window, { key: "e", ctrlKey: true, shiftKey: true });
    expect(screen.queryByLabelText("对话列表")).toBeNull();
    fireEvent.keyDown(window, { key: "i", ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole("complementary", { name: "遐蝶信息" })).toBeNull();
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(screen.getByTestId("new-conversation-shortcut").textContent).toBe("1");
  });

  it("shows a stable empty state and failed-message retry action", () => {
    const retry = vi.fn();
    render(<DesktopShell connectionConfigured failedMessages={[{ id: "m1", content: "再试一次", errorCode: "desktop_run_failed" }]} onRetry={retry} />);
    expect(screen.getByText("在这里，慢慢说就好.".replace(".", "。"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试：再试一次" }));
    expect(retry).toHaveBeenCalledWith("m1");
  });
});
