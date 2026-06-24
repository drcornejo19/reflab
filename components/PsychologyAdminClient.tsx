"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft, Brain, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  psychologyModuleDefinitions,
  type PsychologyModuleOverview,
  type PsychologyModuleSlug,
  type PsychologyUnifiedRecord,
} from "@/lib/psychology";
import { useUserRole } from "@/lib/useUserRole";

type AdminPsychologyPayload = {
  records: PsychologyUnifiedRecord[];
  modules: PsychologyModuleOverview[];
  pendingClassification: number;
};

export function PsychologyAdminClient() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();

  const [data, setData] = useState<AdminPsychologyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending">("pending");
  const [drafts, setDrafts] = useState<Record<string, PsychologyModuleSlug>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isLoaded, user, isVideoAdmin, router]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isVideoAdmin) return;

    async function loadAdminPsychology() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/psychology", { cache: "no-store" });
        const payload = (await response.json()) as AdminPsychologyPayload & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "No se pudo cargar Admin de Psicologia.");
        }

        setData(payload);
        setDrafts(
          Object.fromEntries(
            (payload.records ?? []).map((record) => [
              buildRecordKey(record),
              record.moduleSlug,
            ])
          )
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar Admin de Psicologia."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadAdminPsychology();
  }, [isLoaded, isVideoAdmin, loadingRole, user]);

  const records = data?.records ?? [];
  const visibleRecords =
    filter === "all"
      ? records
      : records.filter((record) => record.classificationStatus === "Sin clasificar");

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user) return null;

  if (!isVideoAdmin) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          No tenes permisos para acceder a Admin de Psicologia.
        </div>
      </AppShell>
    );
  }

  async function saveCategory(record: PsychologyUnifiedRecord) {
    const recordKey = buildRecordKey(record);
    const moduleSlug = drafts[recordKey] ?? record.moduleSlug;

    setSavingKey(recordKey);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/psychology", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: record.source,
          recordId: record.id,
          moduleSlug,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo actualizar la categoria.");
      }

      setData((current) => {
        if (!current) return current;
        const updatedRecords = current.records.map((item) =>
          buildRecordKey(item) === recordKey
            ? {
                ...item,
                moduleSlug,
                moduleTitle:
                  psychologyModuleDefinitions.find(
                    (moduleDefinition) => moduleDefinition.slug === moduleSlug
                  )?.title ?? item.moduleTitle,
                classificationStatus:
                  moduleSlug === "sin-clasificar"
                    ? ("Sin clasificar" as const)
                    : ("Clasificado" as const),
              }
            : item
        );

        return {
          ...current,
          records: updatedRecords,
          pendingClassification: updatedRecords.filter(
            (item) => item.classificationStatus === "Sin clasificar"
          ).length,
        };
      });

      setMessage("Categoria actualizada.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar la categoria."
      );
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-500 transition hover:text-[#6fc11f]"
          >
            <ArrowLeft size={16} />
            Volver a Admin
          </Link>

          <p className="mt-5 text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB ADMIN
          </p>

          <h1 className="mt-4 text-4xl font-black md:text-5xl">
            Psicologia Arbitral
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Revisa registros, detecta items sin clasificar y reasigna cada contenido
            al modulito correcto.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <AdminStat
              label="Pendientes"
              value={String(data?.pendingClassification ?? 0)}
              detail="Sin categoria final"
            />
            <AdminStat
              label="Registros visibles"
              value={String(records.length)}
              detail="Ultimos items cargados"
            />
            <AdminStat
              label="Modulos"
              value="7 + sin clasificar"
              detail="Estructura activa"
            />
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
            {message}
          </div>
        )}

        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
              filter === "pending"
                ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                : "border-white/10 bg-white/[0.04] text-zinc-300"
            }`}
          >
            Solo sin clasificar
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
              filter === "all"
                ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                : "border-white/10 bg-white/[0.04] text-zinc-300"
            }`}
          >
            Ver todo
          </button>
        </section>

        <section className="grid gap-4">
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-[#101b24] p-5 text-sm text-zinc-400">
              Cargando registros de Psicologia Arbitral...
            </div>
          )}

          {!loading && visibleRecords.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#101b24] p-5 text-sm text-zinc-400">
              No hay registros para este filtro.
            </div>
          )}

          {!loading &&
            visibleRecords.map((record) => {
              const recordKey = buildRecordKey(record);
              const currentValue = drafts[recordKey] ?? record.moduleSlug;

              return (
                <article
                  key={recordKey}
                  className="rounded-[28px] border border-white/10 bg-[#101b24] p-5 shadow-2xl"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#6fc11f]">
                          {record.sourceLabel}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">
                          {record.subtypeLabel}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                            record.classificationStatus === "Sin clasificar"
                              ? "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
                              : "border-white/10 bg-white/[0.04] text-zinc-300"
                          }`}
                        >
                          {record.classificationStatus}
                        </span>
                      </div>

                      <h2 className="mt-4 text-2xl font-black">{record.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">
                        {record.summary}
                      </p>
                      {record.detail && (
                        <p className="mt-2 text-sm leading-6 text-[#b7ff8a]">
                          {record.detail}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-zinc-500">
                        <span>Modulo actual: {record.moduleTitle}</span>
                        <span>Fecha: {formatCompactDate(record.createdAt)}</span>
                        {record.userId && <span>Usuario: {record.userId}</span>}
                      </div>
                    </div>

                    <div className="w-full max-w-sm space-y-3 rounded-[24px] border border-white/10 bg-black/20 p-4">
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                          Categoria
                        </span>
                        <select
                          value={currentValue}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [recordKey]: event.target.value as PsychologyModuleSlug,
                            }))
                          }
                          className="control-input mt-2"
                        >
                          {psychologyModuleDefinitions.map((moduleDefinition) => (
                            <option key={moduleDefinition.slug} value={moduleDefinition.slug}>
                              {moduleDefinition.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        type="button"
                        onClick={() => void saveCategory(record)}
                        disabled={savingKey === recordKey}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
                      >
                        <Save size={18} />
                        {savingKey === recordKey ? "Guardando..." : "Guardar categoria"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </AppShell>
  );
}

function AdminStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  const Icon = label === "Pendientes" ? ShieldCheck : Brain;

  return (
    <article className="rounded-[24px] border border-white/10 bg-[#101b24] p-4">
      <Icon className="text-[#6fc11f]" size={22} />
      <p className="mt-3 text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#6fc11f]">{detail}</p>
    </article>
  );
}

function buildRecordKey(record: PsychologyUnifiedRecord) {
  return `${record.source}:${record.id}`;
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
