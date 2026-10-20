import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    deps: {
      inline: [/@tauri-apps/],
    },
    server: {
      deps: {
        inline: [/@tauri-apps/],
      },
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@tauri-apps/api/app", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-api.ts") },
      { find: "@tauri-apps/api/core", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-api.ts") },
      { find: "@tauri-apps/api/event", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-api.ts") },
      { find: "@tauri-apps/api", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-api.ts") },
      { find: "@tauri-apps/plugin-dialog", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-plugins.ts") },
      { find: "@tauri-apps/plugin-fs", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-plugins.ts") },
      { find: "@tauri-apps/plugin-shell", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-plugins.ts") },
      { find: "@tauri-apps/plugin-notification", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-plugins.ts") },
      { find: "@tauri-apps/plugin-updater", replacement: path.resolve(__dirname, "src/__tests__/mocks/tauri-plugins.ts") },
    ],
  },
});
