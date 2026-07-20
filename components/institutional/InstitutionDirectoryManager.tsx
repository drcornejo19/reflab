"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CircleAlert,
  Layers3,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { InstitutionCohortsPanel } from "@/components/institutional/InstitutionCohortsPanel";
import { InstitutionGroupsPanel } from "@/components/institutional/InstitutionGroupsPanel";
import { InstitutionMembersPanel } from "@/components/institutional/InstitutionMembersPanel";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import type { InstitutionDirectory } from "@/lib/institutional/types";

type DirectoryTab = "members" | "groups" | "cohorts";

export function InstitutionDirectoryManager() {
  const { currentDiscipline } = useDiscipline();
  const discipline = getDisciplineDefinition(currentDiscipline);
  const { activeContext, loading: loadingContext } = useInstitution();
  const [directory, setDirectory] = useState<InstitutionDirectory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DirectoryTab>("members");

  async function loadDirectory() {
    const institutionId = activeContext?.institution.id;
    if (!institutionId) {
      setDirectory(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/directory?institutionId=${encodeURIComponent(institutionId)}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        directory?: InstitutionDirectory;
        error?: string;
      };
      if (!response.ok || !data.directory) {
        throw new Error(data.error || "No se pudo cargar la gestion institucional.");
      }
      setDirectory(data.directory);
      return data.directory;
    } catch (loadError) {
      setDirectory(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la gestion institucional."
      );
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDirectory();
    // The active tenant id is the only server-state input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id]);

  const accent = discipline.theme.accent;

  return (
    <AppShell>
      <div className="space-y-5 pb-8">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#08121b] p-5 sm:p-7">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full blur-[90px]"
            style={{ backgroundColor: `${accent}22` }}
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Link
                href="/institution"
                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-zinc-500 transition hover:text-white"
              >
                <ArrowLeft size={15} />
                Panel institucional
              </Link>
              <p
                className="mt-5 text-[10px] font-black uppercase tracking-[0.28em]"
                style={{ color: accent }}
              >
                Fase 4 · Organizacion
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Usuarios, grupos y cohortes
              </h1>
              <p className="mt-3 max-w-[720px] text-sm leading-6 text-zinc-400">
                {activeContext
                  ? `Gestion operativa de ${activeContext.institution.name}.`
                  : "Selecciona una institucion para administrar su estructura."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDirectory()}
              disabled={loading || !activeContext}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:bg-white/[0.08] disabled:opacity-40"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Actualizar
            </button>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-3 rounded-[22px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
            <CircleAlert className="mt-0.5 shrink-0" size={18} />
            <p>{error}</p>
          </div>
        ) : null}

        {loadingContext || loading ? <DirectorySkeleton /> : null}

        {!loadingContext && !activeContext ? (
          <div className="rounded-[28px] border border-dashed border-white/15 bg-[#0a131c] p-8 text-center text-sm text-zinc-500">
            No tenes una institucion activa para gestionar.
          </div>
        ) : null}

        {!loading && directory ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                icon={UsersRound}
                label="Miembros visibles"
                value={directory.members.length}
                accent={accent}
              />
              <SummaryCard
                icon={Layers3}
                label="Grupos activos"
                value={directory.groups.filter((group) => group.status === "active").length}
                accent={accent}
              />
              <SummaryCard
                icon={ShieldCheck}
                label="Cohortes"
                value={directory.cohorts.length}
                accent={accent}
              />
            </section>

            <nav
              aria-label="Gestion institucional"
              className="grid grid-cols-3 gap-1 rounded-[22px] border border-white/10 bg-[#08121b] p-1.5"
            >
              <TabButton
                active={tab === "members"}
                label="Miembros"
                onClick={() => setTab("members")}
                accent={accent}
              />
              <TabButton
                active={tab === "groups"}
                label="Grupos"
                onClick={() => setTab("groups")}
                accent={accent}
              />
              <TabButton
                active={tab === "cohorts"}
                label="Cohortes"
                onClick={() => setTab("cohorts")}
                accent={accent}
              />
            </nav>

            {tab === "members" ? (
              <InstitutionMembersPanel
                directory={directory}
                accent={accent}
                onChanged={loadDirectory}
              />
            ) : null}
            {tab === "groups" ? (
              <InstitutionGroupsPanel
                directory={directory}
                accent={accent}
                onChanged={loadDirectory}
              />
            ) : null}
            {tab === "cohorts" ? (
              <InstitutionCohortsPanel
                directory={directory}
                accent={accent}
                onChanged={loadDirectory}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function TabButton({
  active,
  label,
  onClick,
  accent,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-2xl px-2 text-xs font-black transition sm:text-sm"
      style={
        active
          ? { backgroundColor: `${accent}20`, color: accent }
          : { color: "#71717a" }
      }
    >
      {label}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-[#0a131c] p-5">
      <Icon size={19} style={{ color: accent }} />
      <p className="mt-4 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
    </article>
  );
}

function DirectorySkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Cargando directorio">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-32 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.035]"
        />
      ))}
    </div>
  );
}
