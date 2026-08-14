import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelConnectionStatusDto } from "../../../../shared/contracts.js";
import { createDesktopClient } from "../../runtime/desktop-client.js";
import { SettingsDialog } from "./settings-dialog.js";

afterEach(cleanup);

const status = (overrides: Partial<ModelConnectionStatusDto> = {}): ModelConnectionStatusDto => ({
  model: "deepseek/deepseek-v4-flash",
  configured: true,
  keySource: "application",
  baseUrlSource: "application",
  baseUrl: "https://api.deepseek.com",
  requiresExternalHostConfirmation: false,
  lastProbeStatus: "untested",
  ...overrides,
});

const fakeClient = (initial: ModelConnectionStatusDto) => {
  let current = initial;
  return {
    getConnectionStatus: vi.fn(async () => current),
    saveConnectionSettings: vi.fn(async (input) => {
      current = status({ configured: input.apiKey !== null, baseUrl: input.baseUrl || current.baseUrl, requiresExternalHostConfirmation: Boolean(input.baseUrl && !input.baseUrl.includes("api.deepseek.com")) });
      return current;
    }),
    clearSavedApiKey: vi.fn(async () => { current = status({ configured: false, keySource: "none" }); return current; }),
    resetBaseUrl: vi.fn(async () => { current = status({ baseUrlSource: "default", baseUrl: "https://api.deepseek.com" }); return current; }),
    testConnection: vi.fn(async () => "ok" as const),
  } as unknown as ReturnType<typeof createDesktopClient>;
};

describe("SettingsDialog", () => {
  it("never hydrates a secret and labels source priority", async () => {
    const client = fakeClient(status());
    render(<SettingsDialog open client={client} />);
    await screen.findByDisplayValue("deepseek/deepseek-v4-flash");
    const password = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.value).toBe("");
    expect(password.placeholder).toBe("已由应用安全保存");
    expect(screen.queryByDisplayValue("sk-secret")).toBeNull();
    expect(screen.getByText("来源：应用安全存储")).toBeTruthy();
  });

  it("requires explicit disclosure confirmation for an external host", async () => {
    const client = fakeClient(status({ baseUrl: "https://proxy.example.com", requiresExternalHostConfirmation: true }));
    render(<SettingsDialog open client={client} />);
    const save = await screen.findByRole("button", { name: "保存到非官方服务" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /我理解 API Key、当前消息、已提交的近期历史和编译后 Persona/ }));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(client.saveConnectionSettings).toHaveBeenCalledWith(expect.objectContaining({ confirmExternalHost: true })));
  });

  it("retains a blank saved key, replaces a nonblank key and validates Base URL", async () => {
    const client = fakeClient(status());
    render(<SettingsDialog open client={client} />);
    await screen.findByLabelText("API Key");
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(client.saveConnectionSettings).toHaveBeenLastCalledWith({ baseUrl: "https://api.deepseek.com", confirmExternalHost: false }));

    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-replacement" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(client.saveConnectionSettings).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: "sk-replacement" })));

    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://unsafe.example.com" } });
    expect(screen.getByText("请输入 HTTPS 地址；仅 localhost 可使用 HTTP。")).toBeTruthy();
    expect((screen.getByRole("button", { name: "保存设置" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears, resets and tests only on explicit actions", async () => {
    const client = fakeClient(status());
    render(<SettingsDialog open client={client} />);
    await screen.findByText("尚未测试");
    expect(client.testConnection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await screen.findByText("连接正常");
    fireEvent.click(screen.getByRole("button", { name: "清除应用保存的 Key" }));
    await waitFor(() => expect(client.clearSavedApiKey).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "恢复官方 Base URL" }));
    await waitFor(() => expect(client.resetBaseUrl).toHaveBeenCalledTimes(1));
  });
});
