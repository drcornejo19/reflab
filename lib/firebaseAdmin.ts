import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { SmartNotification } from "@/lib/notifications";

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

export async function sendFcmNotification(
  token: string,
  notification: SmartNotification
) {
  const app = getFirebaseAdminApp();

  if (!app) {
    return {
      ok: false,
      error:
        "Firebase Admin no esta configurado. Agrega FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.",
    };
  }

  try {
    const id = await getMessaging(app).send({
      token,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        type: notification.type,
        category: notification.category,
        actionUrl: notification.actionUrl,
        actionLabel: notification.actionLabel,
      },
      webpush: {
        fcmOptions: {
          link: getAbsoluteUrl(notification.actionUrl),
        },
        notification: {
          title: notification.title,
          body: notification.message,
          icon: "/icon-512.png",
          badge: "/icon-512.png",
          tag: `reflab-${notification.type}`,
          requireInteraction: false,
          actions: [
            {
              action: "open",
              title: notification.actionLabel,
            },
          ],
          data: {
            url: getAbsoluteUrl(notification.actionUrl),
          },
        },
      },
    });

    return { ok: true, id };
  } catch (error) {
    console.error("FCM notificationError", {
      tokenPreview: `${token.slice(0, 12)}...`,
      type: notification.type,
      error,
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al enviar notificacion push.",
      details: error,
    };
  }
}

function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null;

  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

function getAbsoluteUrl(path: string) {
  const appUrl = process.env.APP_URL || "https://reflab.app";
  return new URL(path, appUrl).toString();
}
