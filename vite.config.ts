import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        id: "/",
        name: "DayFlow — Personal Operations",
        short_name: "DayFlow",
        description: "A private, local-first personal operations workspace.",
        theme_color: "#f4f5ee",
        background_color: "#f4f5ee",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true
      },
      devOptions: { enabled: false }
    })
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  },
  build: {
    sourcemap: false,
    target: "es2022"
  }
});
