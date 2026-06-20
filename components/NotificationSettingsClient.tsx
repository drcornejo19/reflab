"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Download,
  Loader2,
  Send,
  Smartphone,
} from "lucide-react";
import {
  type NotificationPreferences,
  type SmartNotificationType,
} from "@/lib/notifications";
import {
  hasFirebasePublicConfig,
  getPushEnvironment,
  refreshFcmToken,
  requestFcmToken,
  showForegroundPush,
  subscribeToForegroundMessages,
  type ForegroundNotificationPayload,
  type PushEnvironment,
} from "@/lib/firebaseClient";

export function NotificationSettingsClient() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testingType, setTestingType] = useState<SmartNotificationType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foregroundNotification, setForegroundNotification] =
    useState<ForegroundNotificationPayload | null>(null);
  const [pushEnvironment, setPushEnvironment] = useState<PushEnvironment | null>(null);
  const firebaseConfigured = hasFirebasePublicConfig();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPushEnvironment(getPushEnvironment());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function loadPreferences() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/notifications/preferences");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.technical || data?.error || "No se pudieron cargar preferencias.");
        }

        setPreferences(data.preferences);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar preferencias."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPreferences();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    if (!firebaseConfigured || !preferences?.pushEnabled) return;

    subscribeToForegroundMessages((notification) => {
      setForegroundNotification(notification);
      setMessage(`Notificacion recibida: ${notification.title}`);
      void showForegroundPush(notification).catch((foregroundPushError) => {
        console.warn("Foreground push display unavailable", foregroundPushError);
      });
    })
      .then((nextUnsubscribe) => {
        if (cancelled) {
          nextUnsubscribe();
          return;
        }

        unsubscribe = nextUnsubscribe;
      })
      .catch((foregroundError) => {
        console.error("Foreground notification listener error", foregroundError);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [firebaseConfigured, preferences?.pushEnabled]);

  useEffect(() => {
    if (!firebaseConfigured || !preferences?.pushEnabled) return;

    const environment = getPushEnvironment();
    if (environment.permission !== "granted" || !environment.ready) return;

    let cancelled = false;

    refreshFcmToken()
      .then(async (token) => {
        if (cancelled) return;
        const response = await fetch("/api/notifications/register-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data?.technical || data?.error || "No se pudo renovar el dispositivo.");
        }
      })
      .catch((tokenError) => {
        console.warn("Push token refresh unavailable", tokenError);
      });

    return () => {
      cancelled = true;
    };
  }, [firebaseConfigured, preferences?.pushEnabled]);

  async function savePreferences(nextPreferences: NotificationPreferences) {
    setPreferences(nextPreferences);
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: nextPreferences }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.technical || data?.error || "No se pudieron guardar preferencias.");
      }

      setPreferences(data.preferences);
      setMessage("Preferencias guardadas correctamente.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudieron guardar preferencias."
      );
    } finally {
      setSaving(false);
    }
  }

  async function activatePush() {
    setActivating(true);
    setError(null);
    setMessage(null);

    try {
      const token = await requestFcmToken();
      const response = await fetch("/api/notifications/register-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.technical || data?.error || "No se pudo activar push.");
      }

      const nextPreferences = {
        ...(preferences ?? {}),
        training: true,
        exams: true,
        evolution: true,
        matches: true,
        newContent: true,
        pushEnabled: true,
      };
      setPreferences(nextPreferences);
      setPushEnvironment(getPushEnvironment());
      setMessage("Notificaciones push activadas para este dispositivo.");
    } catch (pushError) {
      setError(
        pushError instanceof Error
          ? pushError.message
          : "No se pudo activar las notificaciones push."
      );
    } finally {
      setActivating(false);
    }
  }

  async function sendTest(type: SmartNotificationType) {
    setTestingType(type);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.technical || data?.error || "No se pudo enviar la prueba.");
      }

      setMessage(
        data?.skipped
          ? data.reason || "La notificacion quedo omitida por configuracion."
          : "Notificacion de prueba enviada."
      );
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "No se pudo enviar la prueba."
      );
    } finally {
      setTestingType(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <div className="flex items-center gap-3 text-zinc-300">
          <Loader2 className="animate-spin text-[#6fc11f]" size={20} />
          Cargando preferencias de notificaciones...
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[32px] border border-[#6fc11f]/20 bg-[#071019] p-5 shadow-[0_0_42px_rgba(111,193,31,0.08)] md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
              Centro de notificaciones
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
              Notificaciones inteligentes
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-400 md:text-base">
              RefLab solo debe avisarte cuando haya una accion util: entrenar, rendir,
              revisar una debilidad, registrar un partido o ver tu evolucion.
            </p>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#6fc11f] text-black">
                <BellRing size={22} />
              </div>
              <div>
                <p className="text-sm font-black text-white">
                  {preferences?.pushEnabled ? "Push activo" : "Push inactivo"}
                </p>
                <p className="text-xs text-zinc-500">
                  {firebaseConfigured
                    ? "Listo para activar en este dispositivo."
                    : "Faltan variables publicas de Firebase."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (preferences?.pushEnabled) {
                  savePreferences({ ...preferences, pushEnabled: false });
                } else {
                  activatePush();
                }
              }}
              disabled={activating || saving || (!firebaseConfigured && !preferences?.pushEnabled)}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#7de026] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preferences?.pushEnabled
                ? saving
                  ? "Desactivando..."
                  : "Desactivar push"
                : activating
                  ? "Activando..."
                  : "Activar push"}
            </button>
          </div>
        </div>
      </section>

      {(message || error) && (
        <div
          className={`flex items-start gap-3 rounded-[22px] border p-4 text-sm ${
            error
              ? "border-red-500/25 bg-red-500/10 text-red-100"
              : "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-lime-100"
          }`}
        >
          {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{error || message}</span>
        </div>
      )}

      {pushEnvironment && (
        <section className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
              {pushEnvironment.isIos && !pushEnvironment.isStandalone ? <Download size={20} /> : <Smartphone size={20} />}
            </div>
            <div className="min-w-0">
              <p className="font-black text-white">
                {pushEnvironment.isIos ? "Estado push en iPhone / iPad" : "Estado push de este dispositivo"}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{pushEnvironment.message}</p>
              {pushEnvironment.isIos && !pushEnvironment.isStandalone && (
                <p className="mt-2 text-xs font-bold leading-5 text-[#b7ff8a]">
                  Abrí Compartir, elegí “Agregar a pantalla de inicio” y activá push dentro de la app instalada.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {foregroundNotification && (
        <button
          type="button"
          onClick={() => {
            window.location.href = foregroundNotification.actionUrl;
          }}
          className="flex w-full items-start gap-3 rounded-[22px] border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-left text-sm text-lime-100 transition hover:bg-[#6fc11f]/15"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#6fc11f] text-black">
            <BellRing size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-black text-white">{foregroundNotification.title}</p>
            <p className="mt-1 leading-6 text-lime-100/80">
              {foregroundNotification.body || "Notificacion recibida en este dispositivo."}
            </p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">
              {foregroundNotification.actionLabel}
            </p>
          </div>
        </button>
      )}

      <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <BellRing size={21} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                Recibir notificaciones de RefLab
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
                RefLab decide automaticamente que avisos enviarte segun tu actividad:
                continuidad, examenes, nuevos clips, partidos y evolucion.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!preferences) return;

              if (preferences.pushEnabled) {
                savePreferences({ ...preferences, pushEnabled: false });
              } else {
                activatePush();
              }
            }}
            disabled={activating || saving || (!firebaseConfigured && !preferences?.pushEnabled)}
            className={`relative flex h-12 w-24 shrink-0 items-center rounded-full border p-1 transition ${
              preferences?.pushEnabled
                ? "justify-end border-[#6fc11f]/40 bg-[#6fc11f]"
                : "justify-start border-white/10 bg-white/10"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-pressed={Boolean(preferences?.pushEnabled)}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-black text-xs font-black text-white shadow-lg">
              {preferences?.pushEnabled ? "ON" : "OFF"}
            </span>
          </button>
        </div>

        <div className="mt-5 rounded-[24px] border border-[#6fc11f]/20 bg-[#6fc11f]/8 p-4">
          <p className="text-sm font-black text-white">
            {preferences?.pushEnabled
              ? "Notificaciones activas"
              : "Notificaciones desactivadas"}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {preferences?.pushEnabled
              ? "Vas a recibir avisos utiles relacionados con progreso, entrenamiento, evaluaciones y preparacion arbitral."
              : "No se enviaran notificaciones push a este dispositivo hasta que vuelvas a activar esta opcion."}
          </p>

          <button
            type="button"
            onClick={() => sendTest("training_pending")}
            disabled={testingType !== null || saving || !preferences?.pushEnabled}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 px-4 text-xs font-black text-white transition hover:border-[#6fc11f]/50 hover:text-[#6fc11f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testingType ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <Send size={15} />
            )}
            Enviar prueba
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            "Entrenamiento pendiente por inactividad.",
            "Nuevo clip o examen habilitado.",
            "Debilidad detectada por topico.",
            "Recordatorios pre y post partido.",
            "Rachas y resumen semanal.",
            "Avisos institucionales importantes.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
