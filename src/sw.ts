/// <reference lib="webworker" />
export {};
const worker = self as unknown as ServiceWorkerGlobalScope;
// No answer, API response, or navigation document is cached in this milestone.
// Replacing the old root worker also removes only its known legacy caches.
worker.addEventListener("install", () => {
  void worker.skipWaiting();
});
worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("zhongxiang-guide-"))
          .map((key) => caches.delete(key)),
      );
      await worker.clients.claim();
    })(),
  );
});
