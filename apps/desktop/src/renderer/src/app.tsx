import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useEffect, useState } from "react";
import { DesktopShell } from "./components/xiadie/desktop-shell.js";
import { useDesktopRuntime } from "./runtime/desktop-runtime.js";

export function App() {
  const runtime = useDesktopRuntime();
  const [configured, setConfigured] = useState(false);
  useEffect(() => { void window.xiadieDesktop.getConnectionStatus().then((status) => setConfigured(status.configured)); }, []);
  return <AssistantRuntimeProvider runtime={runtime}><DesktopShell connectionConfigured={configured} onConnectionConfiguredChange={setConfigured} /></AssistantRuntimeProvider>;
}
