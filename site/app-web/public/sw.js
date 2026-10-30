// Service worker do SisEng — só recebe e mostra os avisos na tela (Web Push).
// Não faz cache nenhum: não interfere em como o sistema carrega.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (e) {
    dados = { title: "SisEng", body: event.data ? event.data.text() : "" };
  }
  const titulo = dados.title || "SisEng";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.body || "",
      icon: "/logo-192.png",
      badge: "/logo-192.png",
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      data: { url: dados.url || "/" }
    })
  );
});

// Clicar no aviso abre a tela do card. Se já houver uma aba do sistema nessa
// mesma tela, só traz ela para a frente; senão abre uma aba nova (não troca a
// tela de outra aba para não perder o que a pessoa estiver digitando).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      const igual = abas.find((c) => c.url === alvo);
      if (igual && "focus" in igual) return igual.focus();
      return self.clients.openWindow(alvo);
    })
  );
});
