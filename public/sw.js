// ============================================================================
// Menewoa service worker
//
// Principles
//  * It NEVER caches anything personal. Only the public, static app shell and
//    hashed build assets are cached. Cross-origin requests (Supabase API, auth,
//    functions) are not touched at all, so health data can't land in a cache.
//  * On logout the page posts {type:"LOGOUT"}; every cache is purged and any
//    displayed notification is closed, so nothing outlives the session on a
//    shared device.
//  * Push payloads are treated as untrusted input: only a fixed `type` from an
//    allowlist is honoured, the click target is always a same-origin path chosen
//    here (never taken from the payload), and notification text is generic unless
//    the user opted in to details (the server then sends a short fixed template).
// Bump CACHE_VERSION to ship a new worker; old caches are deleted on activate.
// ============================================================================

const CACHE_VERSION = "v2";
const SHELL_CACHE = `menewoa-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `menewoa-assets-${CACHE_VERSION}`;
const OFFLINE_URL = "/index.html";
const SHELL_URLS = [OFFLINE_URL, "/manifest.webmanifest", "/theme-init.js"];

// Cacheable, public, static paths only.
const STATIC_PREFIXES = ["/assets/", "/icons/", "/brand/"];

const NOTIFICATION_TEXT = {
  upcoming_period: "Your period may be starting soon.",
  period_started: "Your estimated period day has arrived.",
  tracking_reminder: "A quick moment to log your day?",
  partner_update: "You have an update in Menewoa.",
  announcement: "There's news from Menewoa.",
};
const GENERIC_BODY = "You have an update in Menewoa.";
const APP_URL = "/app";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  // Only accept messages from our own pages.
  if (event.source && event.source.url && new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data && event.data.type === "LOGOUT") {
    event.waitUntil(
      Promise.all([
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
        self.registration.getNotifications().then((list) => list.forEach((n) => n.close())),
      ])
    );
  }
});

function isStaticAsset(url) {
  return STATIC_PREFIXES.some((p) => url.pathname.startsWith(p));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept Supabase or any third party

  // Page navigations: network first (always fresh), offline fallback to the static shell.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed build assets and icons: cache first, filled on demand. Only successful, same-origin,
  // non-credentialed responses are stored.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok && res.type === "basic" && !res.headers.get("set-cookie")) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }
  // Everything else falls through to the network untouched.
});

// --------------------------------------------------------------------- push --
function parsePush(event) {
  if (!event.data) return null;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || payload.v !== 1) return null;
  const type = payload.type;
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(NOTIFICATION_TEXT, type)) return null;
  // `details: true` is only ever sent for users who opted in; even then the text is looked up
  // locally from a fixed table, so the payload can't inject arbitrary content.
  return { type, details: payload.details === true };
}

self.addEventListener("push", (event) => {
  const msg = parsePush(event);
  if (!msg) return; // malformed or unknown: show nothing rather than something misleading
  event.waitUntil(
    self.registration.showNotification("Menewoa", {
      body: msg.details ? NOTIFICATION_TEXT[msg.type] : GENERIC_BODY,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: msg.type,
      renotify: false,
      data: { url: APP_URL },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(APP_URL); // fixed same-origin path, never from the payload
    })
  );
});
