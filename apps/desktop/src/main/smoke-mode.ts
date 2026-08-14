export interface SmokeWindow { close(): void }

export interface DesktopSmokeModeOptions {
  readonly value: string | undefined;
  readonly createWindow: (onReady: () => void) => Promise<SmokeWindow>;
  readonly log: (marker: string) => void;
  readonly quit: () => void;
}

export async function runDesktopSmokeMode(options: DesktopSmokeModeOptions): Promise<boolean> {
  if (options.value !== "1") return false;
  let completed = false;
  let readySeen = false;
  let window: SmokeWindow | undefined;
  const ready = () => {
    readySeen = true;
    if (completed || window === undefined) return;
    completed = true;
    options.log("XIADIE_DESKTOP_SMOKE_READY");
    window.close();
    options.quit();
  };
  window = await options.createWindow(ready);
  if (readySeen) ready();
  return true;
}
