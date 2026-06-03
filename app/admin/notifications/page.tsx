"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { BellRing, Loader2, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isSuperAdmin, loadingRole } = useUserRole();
  const [title, setTitle] = useState("Nuevo contenido RefLab");
  const [message, setMessage] = useState(
    "Hay una nueva actualizacion disponible para seguir entrenando tu criterio arbitral."
  );
  const [actionLabel, setActionLabel] = useState("Abrir RefLab");
  const [actionUrl, setActionUrl] = useState("/dashboard");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSuperAdmin, loadingRole, router, user]);

  async function sendGlobalNotification() {
    setSending(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, actionLabel, actionUrl }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.technical || data.error || "No se pudo enviar la notificacion.");
      }

      setResult(
        `Notificacion procesada. Enviadas: ${data.sent}. Omitidas: ${data.skipped}. Fallidas: ${data.failed}.`
      );
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Error desconocido.");
    } finally {
      setSending(false);
    }
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.2),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            SUPER ADMIN
          </p>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Notificaciones globales
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Envia avisos utiles a usuarios con notificaciones activadas:
                nuevo contenido, actualizaciones de reglas, examenes o avisos
                generales de la plataforma.
              </p>
            </div>
            <div className="grid h-16 w-16 place-items-center rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <BellRing size={30} />
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
            <div className="space-y-4">
              <Field label="Titulo">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none transition focus:border-[#6fc11f]/50"
                />
              </Field>

              <Field label="Mensaje">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold leading-6 text-white outline-none transition focus:border-[#6fc11f]/50"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Texto del boton">
                  <input
                    value={actionLabel}
                    onChange={(event) => setActionLabel(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none transition focus:border-[#6fc11f]/50"
                  />
                </Field>

                <Field label="Ruta dentro de RefLab">
                  <input
                    value={actionUrl}
                    onChange={(event) => setActionUrl(event.target.value)}
                    placeholder="/dashboard"
                    className="min-h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none transition focus:border-[#6fc11f]/50"
                  />
                </Field>
              </div>

              {result && (
                <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
                  {result}
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={sendGlobalNotification}
                disabled={sending}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                {sending ? "Enviando..." : "Enviar notificacion global"}
              </button>
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
              Criterio RefLab
            </p>
            <h2 className="mt-3 text-2xl font-black">Avisos con proposito</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Usalo para avisos relacionados con entrenamiento, evaluaciones,
              nuevos clips, actualizaciones IFAB o continuidad arbitral. Evita
              mensajes genericos sin accion concreta.
            </p>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
