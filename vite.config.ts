import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

function dayFlowServiceWorker(): Plugin {
  return {
    name: "dayflow-service-worker",
    apply: "build",
    generateBundle(_output, bundle) {
      const files = Object.keys(bundle)
        .filter((file) => /\\.(?:js|css|html|svg|woff2|wasm|data)$/i.test(file))
        .sort();
      const precacheUrls = [
        "/",
        "/index.html",
        "/manifest.webmanifest",
        "/icon.svg",
        ...files.map((file) => "/" + file)
      ];
      const uniqueUrls = [...new Set(precacheUrls)];
      const buildId = createHash("sha256")
        .update(JSON.stringify(uniqueUrls))
        .digest("hex")
        .slice(0, 12);

      const serviceWorker = `
const CACHE_NAME = "dayflow-shell-${buildId}";
const PRECACHE_URLS = ${JSON.stringify(uniqueUrls)};
const PRECACHE_PATHS = new Set(PRECACHE_URLS.map((entry) => new URL(entry, self.location.origin).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    // First install activates immediately. Updates wait until the app explicitly approves them.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("dayflow-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "DAYFLOW_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match("/index.html") || await cache.match("/");
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response("DayFlow is offline and this page is not cached yet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      return fetch(request);
    })());
  }
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorker });
    }
  };
}

export default defineConfig({
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"]
  },
  worker: {
    format: "es"
  },
  plugins: [
    react(),
    dayFlowServiceWorker()
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
