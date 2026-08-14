import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@xiadie/agent-runtime",
          "@xiadie/application",
          "@xiadie/mastra-self-runtime",
          "@xiadie/self-runtime",
          "@xiadie/xiadie-core",
        ],
      }),
    ],
    build: {
      rollupOptions: {
        input: `${desktopRoot}/src/main/index.ts`,
        external: ["@ast-grep/napi"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    build: {
      rollupOptions: {
        input: `${desktopRoot}/src/preload/index.ts`,
      },
    },
  },
  renderer: {
    root: `${desktopRoot}/src/renderer`,
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: `${desktopRoot}/src/renderer/index.html`,
      },
    },
  },
});
