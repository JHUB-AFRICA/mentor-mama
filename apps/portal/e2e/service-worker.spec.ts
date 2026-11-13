import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";

/**
 * The service worker must never touch API calls (stale data, and one person's responses replayed to the next), must try
 * the network first for pages, may cache built files under /assets/, and must delete caches left by older versions.
 * These tests run the real public/sw.js against a small fake worker environment.
 */
type Handler = (event: Record<string, unknown>) => void;

function loadWorker(options: { online: boolean; cacheNames?: string[] }) {
  const listeners: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, string>>();
  for (const name of options.cacheNames ?? []) stores.set(name, new Map([["/api/v1/auth/demo", "stale"]]));
  const fetched: string[] = [];
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { addAll: async (urls: string[]) => urls.forEach((u) => store.set(u, `shell:${u}`)), put: async (request: { url: string }, response: { body: string }) => void store.set(new URL(request.url).pathname, response.body) };
    },
    match: async (request: { url: string } | string) => {
      const key = typeof request === "string" ? request : new URL(request.url).pathname;
      for (const store of stores.values()) if (store.has(key)) return { ok: true, body: store.get(key)!, clone() { return this; } };
      return undefined;
    },
  };
  const fetchFn = async (request: { url: string }) => {
    fetched.push(new URL(request.url).pathname);
    if (!options.online) throw new Error("offline");
    return { ok: true, body: `network:${new URL(request.url).pathname}`, clone() { return this; } };
  };
  const self = {
    location: { origin: "https://portal.example.org" },
    addEventListener: (type: string, handler: Handler) => void (listeners[type] = handler),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8"), { self, caches, fetch: fetchFn, URL, Promise });
  return { listeners, stores, fetched };
}

function request(url: string, init: { method?: string; mode?: string } = {}) {
  return { url, method: init.method ?? "GET", mode: init.mode ?? "cors" };
}

/** Fire an install/activate event and wait for whatever the worker passed to waitUntil. */
async function lifecycle(worker: ReturnType<typeof loadWorker>, type: "install" | "activate") {
  let pending: Promise<unknown> | undefined;
  worker.listeners[type]({ waitUntil: (promise: Promise<unknown>) => void (pending = promise) });
  await pending;
}

function dispatchFetch(worker: ReturnType<typeof loadWorker>, req: ReturnType<typeof request>) {
  let responded: Promise<{ body: string }> | undefined;
  worker.listeners.fetch({ request: req, respondWith: (promise: Promise<{ body: string }>) => void (responded = promise) });
  return responded;
}

test.describe("service worker", () => {
  test("never intercepts API calls, other methods or other origins", () => {
    const worker = loadWorker({ online: true });
    for (const url of ["https://portal.example.org/api/v1/auth/demo", "https://portal.example.org/api/v1/auth/session", "https://portal.example.org/api/v1/me"]) {
      expect(dispatchFetch(worker, request(url)), url).toBeUndefined();
    }
    expect(dispatchFetch(worker, request("https://portal.example.org/api/v1/follow-ups", { method: "POST" }))).toBeUndefined();
    expect(dispatchFetch(worker, request("https://elsewhere.example.com/x.js"))).toBeUndefined();
    expect(worker.fetched).toEqual([]); // it never even asked the network itself: the browser does that
  });

  test("pages: network first, cached shell only when offline", async () => {
    const online = loadWorker({ online: true });
    await lifecycle(online, "install");
    expect((await dispatchFetch(online, request("https://portal.example.org/mentor", { mode: "navigate" })))?.body).toBe("network:/mentor");
    const offline = loadWorker({ online: false });
    await lifecycle(offline, "install");
    expect((await dispatchFetch(offline, request("https://portal.example.org/mentor", { mode: "navigate" })))?.body).toBe("shell:/index.html");
  });

  test("built files under /assets/ are cached first and stored once fetched", async () => {
    const worker = loadWorker({ online: true });
    const first = await dispatchFetch(worker, request("https://portal.example.org/assets/index-abc123.js"));
    expect(first?.body).toBe("network:/assets/index-abc123.js");
    const second = await dispatchFetch(worker, request("https://portal.example.org/assets/index-abc123.js"));
    expect(second?.body).toBe("network:/assets/index-abc123.js");
    expect(worker.fetched).toEqual(["/assets/index-abc123.js"]); // the second answer came from the cache
  });

  test("activation deletes every cache from older versions, including any stored API answers", async () => {
    const worker = loadWorker({ online: true, cacheNames: ["mentormama-portal-shell-v1", "mentormama-portal-shell-v2"] });
    await lifecycle(worker, "activate");
    expect([...worker.stores.keys()]).toEqual(["mentormama-portal-shell-v2"]);
  });
});
