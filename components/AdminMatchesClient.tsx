"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { MatchAppointmentListItem } from "@/lib/matches/api";
import type { MatchProviderReadiness } from "@/lib/matches/providers";

type AdminMatchesPayload = {
  appointments: MatchAppointmentListItem[];
};

export function AdminMatchesClient() {
  const [appointments, setAppointments] = useState<MatchAppointmentListItem[]>([]);
  const [providers, setProviders] = useState<MatchProviderReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [appointmentsResponse, providersResponse] = await Promise.all([
          fetch("/api/matches/appointments?scope=admin", { cache: "no-store" }),
          fetch("/api/matches/providers", { cache: "no-store" }),
        ]);

        const appointmentsPayload =
          (await appointmentsResponse.json().catch(() => ({}))) as AdminMatchesPayload & {
            error?: string;
            technical?: string;
          };
        const providersPayload =
          (await providersResponse.json().catch(() => ({}))) as {
            providers?: MatchProviderReadiness[];
            error?: string;
            technical?: string;
          };

        if (!appointmentsResponse.ok) {
          throw new Error(
            appointmentsPayload.technical || appointmentsPayload.error || "No se pudo cargar Admin de partidos."
          );
        }

        if (!providersResponse.ok) {
          throw new Error(
            providersPayload.technical || providersPayload.error || "No se pudo cargar el estado de proveedores."
          );
        }

        setAppointments(appointmentsPayload.appointments ?? []);
        setProviders(providersPayload.providers ?? []);
        setLoading(false);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar Admin de partidos."
        );
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-zinc-300">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-[#6fc11f]" />
          Cargando Admin de partidos...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-bold text-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.38em] text-[#6fc11f]">
          ADMIN MATCHES
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
          Panorama operativo de designaciones
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300">
          Auditoria rapida de citas creadas, estado por disciplina y readiness de proveedores.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard
          icon={ShieldCheck}
          label="Designaciones"
          value={String(appointments.length)}
          detail="Registros visibles en admin"
        />
        <MetricCard
          icon={Users}
          label="Institucionales"
          value={String(
            appointments.filter((item) => item.sourceType === "institutional").length
          )}
          detail="Asignadas por instituciones"
        />
        <MetricCard
          icon={Sparkles}
          label="Proveedores listos"
          value={String(providers.filter((item) => item.enabled).length)}
          detail="Capas activables"
        />
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <h2 className="text-2xl font-black text-white">Proveedores</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {providers.map((provider) => (
            <article
              key={provider.id}
              className="rounded-[26px] border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap gap-2">
                <Badge label={provider.label} tone="green" />
                <Badge label={provider.readinessLabel} tone="dark" />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{provider.reason}</p>
              <p className="mt-3 text-xs font-bold text-zinc-500">
                Cobertura declarada: {provider.sports.join(" / ")}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <h2 className="text-2xl font-black text-white">Ultimas designaciones</h2>
        <div className="mt-5 space-y-3">
          {appointments.slice(0, 15).map((item) => (
            <article
              key={item.appointmentId}
              className="flex flex-col gap-4 rounded-[26px] border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="text-lg font-black text-white">{item.matchLabel}</p>
                <p className="mt-1 text-sm font-bold text-zinc-400">
                  {item.userDisplayName} · {item.roleLabel} · {item.statusLabel}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  {item.competitionName || "Competicion manual"} · {item.sportType}
                </p>
              </div>
              <Link
                href={`/matches/${item.appointmentId}`}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#6fc11f] px-4 font-black text-black"
              >
                Abrir ficha
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
      <Icon className="h-5 w-5 text-[#6fc11f]" />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs font-bold text-zinc-400">{detail}</p>
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "dark";
}) {
  const classes =
    tone === "green"
      ? "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#b7ff8a]"
      : "border-white/10 bg-white/[0.04] text-zinc-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${classes}`}
    >
      {label}
    </span>
  );
}
