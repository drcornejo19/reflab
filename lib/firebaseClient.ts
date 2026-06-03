"use client";

import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

type FirebasePublicConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

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

export async function requestFcmToken() {
  if (typeof window === "undefined") {
    throw new Error("Las notificaciones push solo pueden activarse desde el navegador.");
  }

  const { firebaseConfig, vapidKey, isConfigured } = getFirebasePublicConfig();
  if (!isConfigured || !vapidKey) {
    throw new Error("Firebase Cloud Messaging no esta configurado en las variables de entorno.");
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("Este navegador no soporta notificaciones web push.");
  }

  const supported = await isSupported();
  if (!supported) {
    throw new Error("Firebase Cloud Messaging no esta disponible en este navegador.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones no concedido.");
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/",
  });
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error("No se pudo obtener el token de notificaciones.");
  }

  return token;
}
