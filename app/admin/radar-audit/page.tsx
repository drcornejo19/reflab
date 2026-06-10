"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";

type RadarAuditEntry = {
  id: string;
  source: "attempts" | "exam_results.details" | "rules_exam_results.details";
  userId: string;
  storedTopic: string;
  currentTopic: string;
  clipId: string;
  clipTitle: string;
  score: number | null;
  date: string;
  valid: boolean;
  reason: string;
  clipExists: boolean;
  clipActive: boolean;
  clipStatus: string;
  clipUpdatedAt: string;
  topicChanged: boolean;
  mode: string;
};

type RadarAuditTopic = {
  topic: string;
  totalAttempts: number;
  validAttempts: number;
  invalidAttempts: number;
  activeClipCount: number;
  lastDate: string;
  clipsUsed: {
    id: string;
    title: string;
    active: boolean;
    exists: boolean;
    usedCount: number;
    lastDate: string;
  }[];
  entries: RadarAuditEntry[];
};

type RadarAuditResponse = {
  generatedAt: string;
  sourceTables: string[];
  warnings?: string[];
  totals: {
    attemptsRows: number;
    examRows: number;
    rulesExamRows: number;
    clips: number;
    activeClips: number;
  };
  topics: RadarAuditTopic[];
  error?: string;
  technical?: string;
};

export default function RadarAuditPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isSuperAdmin, loadingRole } = useUserRole();
  const [data, setData] = useState<RadarAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSuperAdmin, loadingRole, router, user]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isSuperAdmin) return;
    void loadAudit();
  }, [isLoaded, isSuperAdmin, loadingRole, user]);

  const varTopic = useMemo(
    () => data?.topics.find((topic) => topic.topic === "VAR"),
    [data]
  );

  async function loadAudit() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/radar-audit", { cache: "no-store" });
      const payload = (await response.json()) as RadarAuditResponse;

      if (!response.ok) {
        throw new Error(payload.technical || payload.error || "No se pudo cargar la auditoria.");
      }

      setData(payload);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded || loadingRole || loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#101b24] p-6 text-zinc-400">
          <Loader2 className="mb-3 animate-spin text-[#6fc11f]" />
          Cargando auditoria del radar...
        </div>
      </AppShell>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1320px] space-y-5 overflow-hidden">
        <header className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                <ShieldCheck size={18} />
                Super Admin
              </p>
              <h1 className="mt-3 text-3xl font-black text-white md:text-4xl">
                Auditoria del radar arbitral
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Esta vista temporal separa intentos historicos de intentos validos para radar.
                Un intento solo es valido si conserva un clip activo asociado al mismo topico.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/admin/users"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 px-4 text-sm font-black text-white transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f]"
              >
                Usuarios
              </Link>
              <button
                type="button"
                onClick={loadAudit}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a]"
              >
                <RefreshCw size={17} />
                Actualizar
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Filas attempts" value={data.totals.attemptsRows} />
              <Metric label="Examenes" value={data.totals.examRows} />
              <Metric label="Reglas IFAB" value={data.totals.rulesExamRows} />
              <Metric label="Clips totales" value={data.totals.clips} />
              <Metric label="Clips activos" value={data.totals.activeClips} />
            </section>

            <section className="rounded-[30px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
              <div className="flex items-start gap-3">
                {varTopic?.validAttempts ? (
                  <CheckCircle2 className="mt-1 shrink-0 text-[#6fc11f]" />
                ) : (
                  <AlertTriangle className="mt-1 shrink-0 text-yellow-300" />
                )}
                <div>
                  <h2 className="text-xl font-black text-white">Diagnostico VAR</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    VAR tiene {varTopic?.totalAttempts ?? 0} registros historicos,
                    {` ${varTopic?.validAttempts ?? 0}`} validos para radar y
                    {` ${varTopic?.activeClipCount ?? 0}`} clips activos. Si no hay clips activos,
                    el radar debe mostrar <span className="font-black text-white">Sin datos</span>.
                  </p>
                </div>
              </div>
            </section>

            {data.warnings && data.warnings.length > 0 && (
              <section className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm font-bold leading-6 text-yellow-100">
                {data.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </section>
            )}

            <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[#101b24] shadow-2xl">
              <div className="grid grid-cols-[1.1fr_0.7fr_0.8fr_1.3fr_0.9fr] gap-3 border-b border-white/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-zinc-500">
                <span>Topico</span>
                <span>Intentos</span>
                <span>Validos</span>
                <span>Clips utilizados</span>
                <span>Ultima fecha</span>
              </div>
              <div className="divide-y divide-white/10">
                {data.topics.map((topic) => (
                  <TopicAuditBlock key={topic.topic} topic={topic} />
                ))}
              </div>
            </section>

            <p className="text-xs text-zinc-500">
              Fuente: {data.sourceTables.join(", ")}. Generado: {formatDate(data.generatedAt)}.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <Database className="text-[#6fc11f]" size={22} />
      <p className="mt-3 text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function TopicAuditBlock({ topic }: { topic: RadarAuditTopic }) {
  const validLabel =
    topic.validAttempts > 0 ? `${topic.validAttempts} validos` : "Sin datos";

  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-[1.1fr_0.7fr_0.8fr_1.3fr_0.9fr] gap-3 px-4 py-4 text-sm transition hover:bg-white/[0.03]">
        <div>
          <p className="font-black text-white">{topic.topic}</p>
          {topic.invalidAttempts > 0 && (
            <p className="mt-1 text-xs font-bold text-yellow-300">
              {topic.invalidAttempts} historicos no validos
            </p>
          )}
        </div>
        <p className="font-black text-white">{topic.totalAttempts}</p>
        <p className={topic.validAttempts > 0 ? "font-black text-[#6fc11f]" : "font-black text-zinc-500"}>
          {validLabel}
        </p>
        <div className="min-w-0 space-y-1">
          {topic.clipsUsed.length === 0 ? (
            <p className="text-zinc-500">Sin clips utilizados</p>
          ) : (
            topic.clipsUsed.slice(0, 4).map((clip) => (
              <p key={clip.id} className="truncate text-zinc-300">
                {clip.id} - {clip.usedCount} - {clip.active ? "activo" : clip.exists ? "inactivo" : "eliminado"}
              </p>
            ))
          )}
        </div>
        <p className="text-zinc-300">{formatDate(topic.lastDate)}</p>
      </summary>

      <div className="border-t border-white/10 bg-black/20 px-4 py-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              <tr>
                <th className="pb-3">Estado</th>
                <th className="pb-3">Fuente</th>
                <th className="pb-3">Clip</th>
                <th className="pb-3">Topico guardado</th>
                <th className="pb-3">Topico actual</th>
                <th className="pb-3">Clip actualizado</th>
                <th className="pb-3">Score</th>
                <th className="pb-3">Fecha</th>
                <th className="pb-3">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {topic.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-3">
                    <span className={entry.valid ? "text-[#6fc11f]" : "text-yellow-300"}>
                      {entry.valid ? "Valido" : "Historico"}
                    </span>
                  </td>
                  <td className="py-3 text-zinc-300">{entry.source}</td>
                  <td className="max-w-[260px] py-3">
                    <p className="truncate font-bold text-white">{entry.clipId}</p>
                    <p className="truncate text-xs text-zinc-500">{entry.clipTitle}</p>
                  </td>
                  <td className="py-3 text-zinc-300">{entry.storedTopic}</td>
                  <td className={entry.topicChanged ? "py-3 text-yellow-300" : "py-3 text-zinc-300"}>
                    {entry.currentTopic}
                  </td>
                  <td className="py-3 text-zinc-300">
                    <p>{formatDate(entry.clipUpdatedAt)}</p>
                    <p className="text-xs text-zinc-500">{entry.clipStatus}</p>
                  </td>
                  <td className="py-3 text-zinc-300">{entry.score ?? "-"}</td>
                  <td className="py-3 text-zinc-300">{formatDate(entry.date)}</td>
                  <td className="py-3 text-zinc-400">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
