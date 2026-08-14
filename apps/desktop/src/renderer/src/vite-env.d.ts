/// <reference types="vite/client" />

import type { XiadieDesktopBridge } from "../../../shared/contracts.js";

declare global {
  interface Window {
    readonly xiadieDesktop: XiadieDesktopBridge;
  }
}

export {};
