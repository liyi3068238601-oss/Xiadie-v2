import { describe, expect, it } from "vitest";
import {
  createSecureWindowOptions,
  resolveRendererTarget,
} from "./window-options.js";

describe("createSecureWindowOptions", () => {
  it("locks the renderer behind an isolated sandboxed preload", () => {
    const options = createSecureWindowOptions("C:\\app\\preload.js");

    expect(options.webPreferences).toMatchObject({
      preload: "C:\\app\\preload.js",
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
    expect(options.webPreferences).not.toHaveProperty("webSecurity", false);
    expect(options.webPreferences).not.toHaveProperty("allowRunningInsecureContent", true);
    expect(options.webPreferences).not.toHaveProperty("webviewTag", true);
  });

  it("starts hidden so Main can wait for ready-to-show", () => {
    const options = createSecureWindowOptions("C:\\app\\preload.js");

    expect(options.show).toBe(false);
    expect(options.backgroundColor).toBe("#f8f7fb");
    expect(options.minWidth).toBeGreaterThanOrEqual(720);
    expect(options.minHeight).toBeGreaterThanOrEqual(640);
  });

  it("accepts only loopback development URLs", () => {
    expect(
      resolveRendererTarget({
        developmentUrl: "http://localhost:5173",
        rendererFile: "C:\\app\\renderer\\index.html",
      }),
    ).toEqual({ kind: "url", value: "http://localhost:5173" });

    expect(
      resolveRendererTarget({
        developmentUrl: "http://127.0.0.1:5173",
        rendererFile: "C:\\app\\renderer\\index.html",
      }),
    ).toEqual({ kind: "url", value: "http://127.0.0.1:5173" });

    expect(() =>
      resolveRendererTarget({
        developmentUrl: "https://example.com/xiadie",
        rendererFile: "C:\\app\\renderer\\index.html",
      }),
    ).toThrowError("desktop_renderer_url_invalid");
  });

  it("uses the packaged renderer when no development URL is present", () => {
    expect(
      resolveRendererTarget({
        rendererFile: "C:\\app\\renderer\\index.html",
      }),
    ).toEqual({
      kind: "file",
      value: "C:\\app\\renderer\\index.html",
    });
  });
});
