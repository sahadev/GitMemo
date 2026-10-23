import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        quickPaste: resolve(__dirname, "quick-paste.html"),
      },
    },
  },
  server: {
    port: 4000,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 设计提案、验收截图和临时快照会频繁写入；让它们触发整页重载会把
      // 正在编辑的笔记冲掉（实测一次会话 21 次 reload）。
      ignored: ["**/src-tauri/**", "**/design-proposals/**", "**/.design-baseline/**"],
    },
  },
}));
