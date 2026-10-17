import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: { injectionPoint: undefined },
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        id: "/",
        name: "答案之间 · Between Answers",
        short_name: "答案之间",
        description: "我们各自回答人生，也在答案之间慢慢认识彼此。",
        lang: "zh-CN",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f6f4ee",
        theme_color: "#f6f4ee",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
