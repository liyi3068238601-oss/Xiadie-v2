import type { ModelConnectionStatusDto } from "../../../../shared/contracts.js";
import { useEffect, useMemo, useState } from "react";
import type { DesktopClient } from "../../runtime/desktop-client.js";
import { Button } from "../ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog.js";
import { Input } from "../ui/input.js";

const sourceLabel = (status: ModelConnectionStatusDto): string => {
  if (status.keySource === "application") return "来源：应用安全存储";
  if (status.keySource === "environment") return "来源：环境变量";
  return "来源：尚未配置";
};

const probeLabel: Record<ModelConnectionStatusDto["lastProbeStatus"], string> = {
  untested: "尚未测试", ok: "连接正常", unauthorized: "认证失败", rate_limited: "请求过于频繁",
  unavailable: "服务暂不可用", timeout: "连接超时", invalid_endpoint: "服务地址无效",
};

const inspectBaseUrl = (input: string): { valid: boolean; external: boolean } => {
  try {
    const url = new URL(input);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    const validProtocol = url.protocol === "https:" || (url.protocol === "http:" && loopback.has(url.hostname));
    const valid = validProtocol && !url.username && !url.password && !url.search && !url.hash;
    return { valid, external: valid && url.hostname !== "api.deepseek.com" };
  } catch { return { valid: false, external: false }; }
};

export function SettingsDialog({ open, onOpenChange, client, onStatusChange }: { open: boolean; onOpenChange?: (open: boolean) => void; client: DesktopClient; onStatusChange?: (status: ModelConnectionStatusDto) => void }) {
  const [status, setStatus] = useState<ModelConnectionStatusDto>();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [probe, setProbe] = useState<ModelConnectionStatusDto["lastProbeStatus"]>("untested");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const applyStatus = (next: ModelConnectionStatusDto) => {
    setStatus(next); setBaseUrl(next.baseUrl); setProbe(next.lastProbeStatus); setConfirmed(false); onStatusChange?.(next);
  };
  useEffect(() => {
    if (!open) return;
    let live = true;
    void client.getConnectionStatus().then((next) => { if (live) applyStatus(next); });
    return () => { live = false; };
  }, [client, open]);

  const base = useMemo(() => inspectBaseUrl(baseUrl), [baseUrl]);
  const external = base.external;
  const save = async () => {
    if (!base.valid || (external && !confirmed)) return;
    setBusy(true); setError(undefined);
    try {
      const next = await client.saveConnectionSettings({
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        baseUrl: baseUrl.trim(),
        confirmExternalHost: external && confirmed,
      });
      setApiKey(""); applyStatus(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "desktop_internal_error"); }
    finally { setBusy(false); }
  };
  const clearKey = async () => { setBusy(true); try { applyStatus(await client.clearSavedApiKey()); setApiKey(""); } finally { setBusy(false); } };
  const resetUrl = async () => { setBusy(true); try { applyStatus(await client.resetBaseUrl()); } finally { setBusy(false); } };
  const test = async () => { setBusy(true); try { const next = await client.testConnection({ confirmExternalHost: external && confirmed }); setProbe(next); } finally { setBusy(false); } };

  return <Dialog open={open} {...(onOpenChange ? { onOpenChange } : {})}><DialogContent aria-label="连接设置">
    <DialogTitle>连接设置</DialogTitle><DialogDescription>API Key 只写入系统安全存储，不会回显到界面。</DialogDescription>
    <div className="settings-form">
      <label>模型<Input value="deepseek/deepseek-v4-flash" readOnly aria-label="模型" /></label>
      <label>API Key<Input type="password" aria-label="API Key" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={status?.configured ? "已由应用安全保存" : "输入 DeepSeek API Key"} /></label>
      <small>{status ? sourceLabel(status) : "正在读取设置……"}</small>
      <label>Base URL<Input aria-label="Base URL" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setConfirmed(false); }} /></label>
      {!base.valid && baseUrl && <p className="settings-error">请输入 HTTPS 地址；仅 localhost 可使用 HTTP。</p>}
      {external && <label className="external-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />我理解 API Key、当前消息、已提交的近期历史和编译后 Persona 将发送给该服务</label>}
      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="settings-status"><span>连接状态</span><strong>{probeLabel[probe]}</strong></div>
      <div className="settings-actions"><Button variant="outline" disabled={busy || !status?.configured || (external && !confirmed)} onClick={() => void test()}>测试连接</Button><Button disabled={busy || !base.valid || (external && !confirmed)} onClick={() => void save()}>{external ? "保存到非官方服务" : "保存设置"}</Button></div>
      <div className="settings-secondary"><Button variant="ghost" disabled={busy} onClick={() => void clearKey()}>清除应用保存的 Key</Button><Button variant="ghost" disabled={busy} onClick={() => void resetUrl()}>恢复官方 Base URL</Button></div>
    </div>
  </DialogContent></Dialog>;
}
