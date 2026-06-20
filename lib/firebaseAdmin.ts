import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { SmartNotification } from "@/lib/notifications";
import { RF_LOGO_SRC } from "@/lib/brand";

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
    console.info("[RefLab Push] fcm_send_requested", {
      tokenFingerprint: tokenFingerprint(token),
      type: notification.type,
    });
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
          icon: RF_LOGO_SRC,
          badge: RF_LOGO_SRC,
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

    console.info("[RefLab Push] fcm_send_accepted", {
      tokenFingerprint: tokenFingerprint(token),
      type: notification.type,
      messageId: id,
    });

    return { ok: true, id };
  } catch (error) {
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    console.error("FCM notificationError", {
      tokenFingerprint: tokenFingerprint(token),
      type: notification.type,
      errorCode,
      error,
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al enviar notificacion push.",
      errorCode,
      details: error,
    };
  }
}

function tokenFingerprint(token: string) {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
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
