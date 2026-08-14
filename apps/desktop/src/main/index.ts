import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import {
  createSecureWindowOptions,
  resolveRendererTarget,
} from "./window-options.js";

const createDesktopWindow = async (): Promise<BrowserWindow> => {
  const preloadPath = join(__dirname, "../preload/index.mjs");
  const rendererFile = join(__dirname, "../renderer/index.html");
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const target = resolveRendererTarget(
    developmentUrl === undefined
      ? { rendererFile }
      : { developmentUrl, rendererFile },
  );
  const window = new BrowserWindow(createSecureWindowOptions(preloadPath));

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, nextUrl) => {
    if (nextUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => window.show());

  if (target.kind === "url") {
    await window.loadURL(target.value);
  } else {
    await window.loadFile(target.value);
  }

  return window;
};

void app.whenReady().then(async () => {
  await createDesktopWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createDesktopWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
