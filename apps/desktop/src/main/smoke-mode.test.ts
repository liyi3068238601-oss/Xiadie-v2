import { describe, expect, it, vi } from "vitest";
import { runDesktopSmokeMode } from "./smoke-mode.js";

describe("runDesktopSmokeMode", () => {
  it("activates only for the exact value 1 and quits after ready-to-show", async () => {
    const log = vi.fn();
    const quit = vi.fn();
    const close = vi.fn();
    let ready: (() => void) | undefined;
    const createWindow = vi.fn(async (onReady: () => void) => { ready = onReady; return { close }; });

    await expect(runDesktopSmokeMode({ value: "true", createWindow, log, quit })).resolves.toBe(false);
    expect(createWindow).not.toHaveBeenCalled();
    await expect(runDesktopSmokeMode({ value: "1", createWindow, log, quit })).resolves.toBe(true);
    expect(log).not.toHaveBeenCalled();
    ready?.();
    expect(log).toHaveBeenCalledWith("XIADIE_DESKTOP_SMOKE_READY");
    expect(close).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
});
