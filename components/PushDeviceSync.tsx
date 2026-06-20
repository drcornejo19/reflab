"use client";

import { useEffect } from "react";
import {
  getPushEnvironment,
  getTokenFingerprint,
  hasFirebasePublicConfig,
  logPushDiagnostic,
  refreshFcmToken,
} from "@/lib/firebaseClient";

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = "reflab-push-last-sync";

export function PushDeviceSync() {
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!hasFirebasePublicConfig()) return;

      const environment = getPushEnvironment();
      if (!environment.ready || environment.permission !== "granted") {
        logPushDiagnostic("background_device_sync_skipped", {
          permission: environment.permission,
          ready: environment.ready,
          reason: environment.message,
        });
        return;
      }

      const lastSyncAt = Number(window.localStorage.getItem(LAST_SYNC_KEY) ?? 0);
      if (Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return;

      try {
        const preferencesResponse = await fetch("/api/notifications/preferences", {
          cache: "no-store",
        });
        if (!preferencesResponse.ok) return;

        const preferencesData = await preferencesResponse.json();
        if (!preferencesData?.preferences?.pushEnabled || cancelled) return;

        const token = await refreshFcmToken();
        if (cancelled) return;

        const response = await fetch("/api/notifications/register-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            diagnostics: {
              isIos: environment.isIos,
              isStandalone: environment.isStandalone,
              isSecure: environment.isSecure,
              permission: environment.permission,
              hasServiceWorker: environment.hasServiceWorker,
            },
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.technical || data?.error || "No se pudo sincronizar push.");
        }

        window.localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        logPushDiagnostic("background_device_sync_succeeded", {
          fingerprint: getTokenFingerprint(token),
        });
      } catch (error) {
        console.warn("[RefLab Push] background_device_sync_failed", error);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
