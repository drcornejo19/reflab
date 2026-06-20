"use client";

import { getApps, initializeApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";
import { RF_LOGO_SRC } from "@/lib/brand";

type FirebasePublicConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

export type ForegroundNotificationPayload = {
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
  type?: string;
};

export type PushEnvironment = {
  isIos: boolean;
  isStandalone: boolean;
  isSecure: boolean;
  hasNotificationApi: boolean;
  hasServiceWorker: boolean;
  permission: NotificationPermission | "unsupported";
  ready: boolean;
  message: string;
};

type PushDiagnosticDetails = Record<string, string | number | boolean | null | undefined>;

export function logPushDiagnostic(event: string, details: PushDiagnosticDetails = {}) {
  // Temporary structured diagnostics for the mobile Web Push rollout.
  console.info("[RefLab Push]", event, details);
}

export function getFirebasePublicConfig() {
  const firebaseConfig: FirebasePublicConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  const isConfigured =
    Boolean(firebaseConfig.apiKey) &&
    Boolean(firebaseConfig.projectId) &&
    Boolean(firebaseConfig.messagingSenderId) &&
    Boolean(firebaseConfig.appId) &&
    Boolean(vapidKey);

  return { firebaseConfig, vapidKey, isConfigured };
}

export function hasFirebasePublicConfig() {
  return getFirebasePublicConfig().isConfigured;
}

export function getPushEnvironment(): PushEnvironment {
  if (typeof window === "undefined") {
    return {
      isIos: false,
      isStandalone: false,
      isSecure: false,
      hasNotificationApi: false,
      hasServiceWorker: false,
      permission: "unsupported",
      ready: false,
      message: "Disponible al abrir RefLab desde el dispositivo.",
    };
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const isIos =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true;
  const isSecure = window.isSecureContext;
  const hasNotificationApi = "Notification" in window;
  const hasServiceWorker = "serviceWorker" in navigator;
  const permission = hasNotificationApi ? Notification.permission : "unsupported";
  const ready =
    isSecure &&
    hasNotificationApi &&
    hasServiceWorker &&
    (!isIos || isStandalone) &&
    permission !== "denied";

  let message = "El dispositivo es compatible con Web Push.";
  if (!isSecure) message = "Web Push requiere HTTPS.";
  else if (isIos && !isStandalone) {
    message = "En iPhone o iPad, instala RefLab en la pantalla de inicio y abre la app instalada.";
  } else if (!hasNotificationApi || !hasServiceWorker) {
    message = "Este navegador no ofrece las APIs necesarias para Web Push.";
  } else if (permission === "denied") {
    message = "El permiso está bloqueado en la configuración del dispositivo o navegador.";
  } else if (permission === "granted") {
    message = "Permiso concedido en este dispositivo.";
  }

  return {
    isIos,
    isStandalone,
    isSecure,
    hasNotificationApi,
    hasServiceWorker,
    permission,
    ready,
    message,
  };
}

export async function requestFcmToken() {
  return getFcmToken(true);
}

export async function refreshFcmToken() {
  return getFcmToken(false);
}

async function getFcmToken(requestPermission: boolean) {
  if (typeof window === "undefined") {
    throw new Error("Las notificaciones push solo pueden activarse desde el navegador.");
  }

  const { firebaseConfig, vapidKey, isConfigured } = getFirebasePublicConfig();
  if (!isConfigured || !vapidKey) {
    throw new Error("Firebase Cloud Messaging no esta configurado en las variables de entorno.");
  }

  const environment = getPushEnvironment();
  logPushDiagnostic("environment_checked", {
    isIos: environment.isIos,
    isStandalone: environment.isStandalone,
    isSecure: environment.isSecure,
    hasNotificationApi: environment.hasNotificationApi,
    hasServiceWorker: environment.hasServiceWorker,
    permission: environment.permission,
    ready: environment.ready,
  });
  if (!environment.ready) {
    logPushDiagnostic("environment_blocked", { reason: environment.message });
    throw new Error(environment.message);
  }

  const supported = await isSupported();
  logPushDiagnostic("firebase_support_checked", { supported });
  if (!supported) {
    throw new Error("Firebase Cloud Messaging no esta disponible en este navegador.");
  }

  logPushDiagnostic("permission_before_request", {
    permission: Notification.permission,
    requestPermission,
  });
  const permission =
    Notification.permission === "default" && requestPermission
      ? await Notification.requestPermission()
      : Notification.permission;
  logPushDiagnostic("permission_resolved", { permission });
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "El permiso de notificaciones está bloqueado en este dispositivo."
        : "Activa las notificaciones desde el botón para conceder el permiso."
    );
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  logPushDiagnostic("service_worker_registered", {
    scope: registration.scope,
    state:
      registration.active?.state ??
      registration.waiting?.state ??
      registration.installing?.state ??
      "unknown",
  });
  await registration.update().catch(() => undefined);
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("No se pudo obtener el token de notificaciones.");
  }

  logPushDiagnostic("fcm_token_obtained", {
    fingerprint: getTokenFingerprint(token),
  });

  return token;
}

export async function showForegroundPush(notification: ForegroundNotificationPayload) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  logPushDiagnostic("foreground_notification_display", {
    type: notification.type,
    actionUrl: notification.actionUrl,
  });
  await registration.showNotification(notification.title, {
    body: notification.body,
    icon: RF_LOGO_SRC,
    badge: RF_LOGO_SRC,
    tag: notification.type ? `reflab-${notification.type}` : "reflab",
    data: { url: notification.actionUrl },
  });
}

export async function subscribeToForegroundMessages(
  callback: (notification: ForegroundNotificationPayload, raw: MessagePayload) => void
) {
  if (typeof window === "undefined") return () => undefined;

  const { firebaseConfig, isConfigured } = getFirebasePublicConfig();
  if (!isConfigured) return () => undefined;

  const supported = await isSupported();
  if (!supported) return () => undefined;

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  return onMessage(messaging, (payload) => {
    const notification = normalizeForegroundPayload(payload);
    logPushDiagnostic("foreground_message_received", {
      messageId: payload.messageId,
      type: notification.type,
    });
    callback(notification, payload);
  });
}

export function getTokenFingerprint(token: string) {
  if (token.length <= 16) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function normalizeForegroundPayload(
  payload: MessagePayload
): ForegroundNotificationPayload {
  return {
    title: payload.notification?.title || payload.data?.title || "RefLab",
    body: payload.notification?.body || payload.data?.body || "",
    actionUrl: payload.fcmOptions?.link || payload.data?.actionUrl || "/dashboard",
    actionLabel: payload.data?.actionLabel || "Abrir",
    type: payload.data?.type,
  };
}
