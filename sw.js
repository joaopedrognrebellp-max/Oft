// Oftalmo Update — service worker (offline + notificações)
const CACHE = "oftalmo-update-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./feed.json", "./icon-192.png", "./badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Rede primeiro (pega sempre o mais novo); sem internet, usa a cópia salva
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
  );
});

// Chegou notificação do robô
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = data.title || "Oftalmo Update";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Novidades em oftalmologia",
    icon: "icon-192.png",
    badge: "badge-96.png",
    tag: data.tag || "oftalmo",
    data: { url: data.url || "./#aovivo" },
  }));
});

// Tocou na notificação → abre o app na aba Ao vivo
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#aovivo", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
