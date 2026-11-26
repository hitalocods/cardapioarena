// Service Worker estritamente no escopo /admin.
// Não faz cache de páginas nem de rotas /api.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Novo pedido — Arena Home Beach",
    body: "Abra o painel para conferir o pedido.",
    url: "/admin?tab=pedidos",
    tag: "ahb-novo-pedido",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) data.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/admin-icons/icon-192.png",
      badge: "/admin-icons/icon-192.png",
      tag: data.tag,
      renotify: true,
      data: { url: data.url || "/admin?tab=pedidos" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) ||
    "/admin?tab=pedidos";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/admin") && "focus" in client) {
            if ("navigate" in client) {
              return client.navigate(targetUrl).then((c) => c && c.focus());
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
