import { contextBridge } from "electron";

const desktopBridge = Object.freeze({ version: "1" as const });

contextBridge.exposeInMainWorld("xiadieDesktop", desktopBridge);
