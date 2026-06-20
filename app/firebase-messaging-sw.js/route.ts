export const dynamic = "force-dynamic";

export async function GET() {
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const body = `
self.addEventListener("notificationclick", (event) => {
  console.info("[RefLab Push SW] notification_clicked", {
    tag: event.notification.tag,
    url: event.notification.data?.url,
  });
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === absoluteUrl && "focus" in client) {
            return client.focus();
          }
        }

        return clients.openWindow ? clients.openWindow(absoluteUrl) : undefined;
      })
  );
});

importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js");

const firebaseConfig = ${JSON.stringify(firebaseConfig)};
const isConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId;

if (isConfigured && self.firebase && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  console.info("[RefLab Push SW] firebase_initialized", {
    projectId: firebaseConfig.projectId,
  });

  messaging.onBackgroundMessage((payload) => {
    console.info("[RefLab Push SW] background_message_received", {
      messageId: payload.messageId,
      type: payload.data?.type,
      hasNotificationPayload: Boolean(payload.notification),
    });

    // Notification payloads are displayed automatically by FCM in background.
    if (payload.notification) return;

    const title = payload.notification?.title || payload.data?.title || "RefLab";
    const body = payload.notification?.body || payload.data?.body || "";
    const url = payload.fcmOptions?.link || payload.data?.actionUrl || "/dashboard";
    const actionLabel = payload.data?.actionLabel || "Abrir";

    self.registration.showNotification(title, {
      body,
      icon: "/RF%20LOGO.png",
      badge: "/RF%20LOGO.png",
      tag: payload.data?.type ? "reflab-" + payload.data.type : "reflab",
      data: { url },
      actions: [{ action: "open", title: actionLabel }],
    });
  });
} else {
  console.error("[RefLab Push SW] firebase_not_configured");
}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
    },
  });
}
