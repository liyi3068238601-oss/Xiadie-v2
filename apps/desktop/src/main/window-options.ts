import type { BrowserWindowConstructorOptions } from "electron";

export interface RendererTargetInput {
  readonly developmentUrl?: string;
  readonly rendererFile: string;
}

export type RendererTarget = Readonly<
  | { kind: "url"; value: string }
  | { kind: "file"; value: string }
>;

export function createSecureWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 640,
    show: false,
    backgroundColor: "#f8f7fb",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  };
}

export function resolveRendererTarget({
  developmentUrl,
  rendererFile,
}: RendererTargetInput): RendererTarget {
  if (developmentUrl === undefined) {
    return Object.freeze({ kind: "file", value: rendererFile });
  }

  let url: URL;
  try {
    url = new URL(developmentUrl);
  } catch {
    throw new Error("desktop_renderer_url_invalid");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("desktop_renderer_url_invalid");
  }

  return Object.freeze({ kind: "url", value: url.href.replace(/\/$/, "") });
}
