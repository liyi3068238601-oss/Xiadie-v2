import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  InMemoryCheckpointStore,
  loadCharacterAssets,
} from "@xiadie/application";
import { createMastraTextAgent, MastraSelfRuntime } from "@xiadie/mastra-self-runtime";
import { asTurnId, compileCharacter } from "@xiadie/xiadie-core";
import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { DesktopConversationRepository } from "./conversation-repository.js";
import { DesktopDatabase } from "./database.js";
import {
  DesktopChatService,
  createDesktopTurnRunnerFactory,
} from "./desktop-chat-service.js";
import {
  createDeepSeekModel,
  testDeepSeekConnection,
} from "./deepseek-model.js";
import { registerDesktopIpc } from "./ipc.js";
import { ModelConnectionStore } from "./model-connection-store.js";
import { SqliteVerifiedTurnStore } from "./verified-turn-store.js";
import { runDesktopSmokeMode } from "./smoke-mode.js";
import {
  createSecureWindowOptions,
  resolveRendererTarget,
} from "./window-options.js";

let desktopDatabase: DesktopDatabase | undefined;
let desktopChatService: DesktopChatService | undefined;
let trustedWebContentsId = -1;
const mainDirectory = dirname(fileURLToPath(import.meta.url));

const initializeDesktopServices = async () => {
  const characterRoot = app.isPackaged
    ? join(process.resourcesPath, "character", "xiadie", "v1")
    : join(
        app.getAppPath(),
        "..",
        "..",
        "packages",
        "xiadie-core",
        "character",
        "xiadie",
        "v1",
      );
  const compiled = compileCharacter(await loadCharacterAssets(characterRoot));
  const database = new DesktopDatabase(
    join(app.getPath("userData"), "xiadie-desktop.sqlite"),
  );
  desktopDatabase = database;
  const conversations = new DesktopConversationRepository(database);
  const audit = new SqliteVerifiedTurnStore(database);
  const checkpoints = new InMemoryCheckpointStore();
  const connectionStore = new ModelConnectionStore({
    settingsPath: join(app.getPath("userData"), "connection-settings.json"),
    safeStorage,
    environment: {
      ...(process.env.DEEPSEEK_API_KEY === undefined
        ? {}
        : { apiKey: process.env.DEEPSEEK_API_KEY }),
      ...(process.env.DEEPSEEK_BASE_URL === undefined
        ? {}
        : { baseUrl: process.env.DEEPSEEK_BASE_URL }),
    },
  });
  const createTurnRunner = createDesktopTurnRunnerFactory({
    persona: compiled.persona,
    createSelf: (settings) =>
      new MastraSelfRuntime({
        agent: createMastraTextAgent(createDeepSeekModel(settings)),
      }),
    conversations: audit,
    checkpoints,
    build: {
      coreVersion: "0.1.0",
      characterVersion: compiled.metadata.characterVersion,
      characterAssetHash: compiled.metadata.assetHash,
      personaCompilerVersion: "1",
      schema: {
        conversation: 1,
        memory: 1,
        relationship: 1,
        runtimeCheckpoint: 1,
      },
    },
  });
  const service = new DesktopChatService({
    repository: conversations,
    connectionStore,
    createTurnRunner,
    createTurnId: () => asTurnId(randomUUID()),
  });
  service.initialize();
  return Object.freeze({ service, conversations, connectionStore });
};

const createDesktopWindow = async (onReady?: () => void): Promise<BrowserWindow> => {
  const preloadPath = join(mainDirectory, "../preload/index.mjs");
  const rendererFile = join(mainDirectory, "../renderer/index.html");
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const target = resolveRendererTarget(
    developmentUrl === undefined
      ? { rendererFile }
      : { developmentUrl, rendererFile },
  );
  const window = new BrowserWindow(createSecureWindowOptions(preloadPath));
  trustedWebContentsId = window.webContents.id;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, nextUrl) => {
    if (nextUrl !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => {
    window.show();
    onReady?.();
  });

  if (target.kind === "url") {
    await window.loadURL(target.value);
  } else {
    await window.loadFile(target.value);
  }

  return window;
};

void app.whenReady().then(async () => {
  if (await runDesktopSmokeMode({
    value: process.env.XIADIE_DESKTOP_SMOKE,
    createWindow: (onReady) => createDesktopWindow(onReady),
    log: (marker) => console.log(marker),
    quit: () => app.quit(),
  })) return;
  const services = await initializeDesktopServices();
  desktopChatService = services.service;
  registerDesktopIpc(ipcMain, {
    get trustedWebContentsId() {
      return trustedWebContentsId;
    },
    repository: services.conversations,
    chatService: services.service,
    connectionStore: services.connectionStore,
    createConversationId: randomUUID,
    now: Date.now,
    testConnection: (settings) => testDeepSeekConnection(settings),
  });
  await createDesktopWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createDesktopWindow();
    }
  });
}).catch((error: unknown) => {
  if (process.env.XIADIE_DESKTOP_SMOKE === "1") {
    console.error("XIADIE_DESKTOP_SMOKE_ERROR", error instanceof Error ? error.message : "unknown");
    app.exit(1);
    return;
  }
  app.quit();
});

app.on("before-quit", () => {
  desktopChatService = undefined;
  desktopDatabase?.close();
  desktopDatabase = undefined;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
