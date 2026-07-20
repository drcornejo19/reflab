"use client";

import {
  CheckCircle2,
  Eye,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import type {
  InstitutionDemoWorkspace,
  InstitutionRoleKey,
} from "@/lib/institutional/types";

export function InstitutionDemoManager() {
  const router = useRouter();
  const { currentDiscipline } = useDiscipline();
  const {
    activeContext,
    loading: institutionLoading,
    refreshInstitutions,
  } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] =
    useState<InstitutionDemoWorkspace | null>(null);
  const [selectedRole, setSelectedRole] =
    useState<InstitutionRoleKey>("student");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContext) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    void loadWorkspace();
    // Active institution is the complete demo boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/demo", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        workspace?: InstitutionDemoWorkspace;
        error?: string;
      };
      if (!response.ok || !data.workspace) {
        throw new Error(data.error || "No se pudo cargar el modo demo.");
      }
      setWorkspace(data.workspace);
      if (data.workspace.simulatedRole) {
        setSelectedRole(data.workspace.simulatedRole);
      }
    } catch (loadError) {
      setWorkspace(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar el modo demo."
      );
    } finally {
      setLoading(false);
    }
  }

  async function startDemo() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulatedRole: selectedRole }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo iniciar el modo demo.");
      }
      await refreshInstitutions();
      await loadWorkspace();
      router.refresh();
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "No se pudo iniciar el modo demo."
      );
    } finally {
      setSaving(false);
    }
  }

  async function endDemo() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cerrar el modo demo.");
      }
      await refreshInstitutions();
      await loadWorkspace();
      router.refresh();
    } catch (endError) {
      setError(
        endError instanceof Error
          ? endError.message
          : "No se pudo cerrar el modo demo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-8">
        <header
          className="rounded-[34px] border border-amber-300/20 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), radial-gradient(circle at top right, rgba(251,191,36,.12), transparent 34%), #08131c`,
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">
            Fase 11 · Entorno seguro
          </p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Modo demo</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Recorre la experiencia de un rol institucional sin modificar
                contenidos, evaluaciones, personas ni resultados reales.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black"
            >
              <RefreshCw size={17} />
              Actualizar
            </button>
          </div>
        </header>

        {error ? (
          <div className="flex gap-3 rounded-[22px] border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
            <ShieldAlert size={19} className="shrink-0" />
            {error}
          </div>
        ) : null}

        {institutionLoading || loading ? (
          <LoadingState />
        ) : !workspace ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <InfoCard
                icon={Eye}
                title="Vista simulada"
                text="La interfaz adopta el rol seleccionado y lo identifica en todo momento."
                accent={theme.accent}
              />
              <InfoCard
                icon={LockKeyhole}
                title="Solo lectura"
                text="Las rutas de escritura rechazan cambios mientras el modo demo esta activo."
                accent={theme.accent}
              />
              <InfoCard
                icon={CheckCircle2}
                title="Sesion trazable"
                text="La activacion, el rol y el cierre quedan registrados en auditoria."
                accent={theme.accent}
              />
            </section>

            {!workspace.institution.isDemo ? (
              <div className="rounded-[28px] border border-amber-300/20 bg-amber-300/10 p-6 text-amber-100">
                <p className="font-black">Institucion no habilitada como demo</p>
                <p className="mt-2 text-sm leading-6 text-amber-100/75">
                  Para proteger datos reales, solo las instituciones creadas
                  expresamente como demo pueden iniciar una simulacion.
                </p>
              </div>
            ) : (
              <section className="rounded-[30px] border border-white/10 bg-[#09131c] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p
                      className="text-[10px] font-black uppercase tracking-[0.2em]"
                      style={{ color: theme.accent }}
                    >
                      {workspace.active ? "Sesion activa" : "Seleccion de rol"}
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      {workspace.active
                        ? `Vista: ${
                            workspace.availableRoles.find(
                              (role) =>
                                role.key === workspace.simulatedRole
                            )?.label ?? workspace.simulatedRole
                          }`
                        : "¿Que experiencia queres revisar?"}
                    </h2>
                    {workspace.expiresAt ? (
                      <p className="mt-2 text-xs text-zinc-500">
                        Finaliza automaticamente:{" "}
                        {formatDate(workspace.expiresAt)}
                      </p>
                    ) : null}
                  </div>
                  {workspace.active ? (
                    <button
                      type="button"
                      onClick={() => void endDemo()}
                      disabled={saving}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 text-sm font-black text-amber-100 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <Square size={17} />
                      )}
                      Salir del modo demo
                    </button>
                  ) : null}
                </div>

                {!workspace.active ? (
                  <>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {workspace.availableRoles.map((role) => (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => setSelectedRole(role.key)}
                          className="rounded-[22px] border p-4 text-left transition hover:bg-white/[0.06]"
                          style={{
                            borderColor:
                              selectedRole === role.key
                                ? theme.border
                                : "rgba(255,255,255,.1)",
                            backgroundColor:
                              selectedRole === role.key
                                ? theme.accentSoft
                                : "rgba(255,255,255,.025)",
                          }}
                        >
                          <p className="font-black">{role.label}</p>
                          <p className="mt-2 text-xs text-zinc-500">
                            {role.permissionCount} capacidades visibles
                          </p>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void startDemo()}
                      disabled={saving}
                      className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:opacity-50"
                      style={{
                        backgroundColor: theme.button,
                        color: theme.onAccent,
                      }}
                    >
                      {saving ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <Play size={18} />
                      )}
                      Iniciar vista segura
                    </button>
                  </>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
  accent,
}: {
  icon: typeof Eye;
  title: string;
  text: string;
  accent: string;
}) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-[#09131c] p-5">
      <span
        className="grid h-11 w-11 place-items-center rounded-2xl"
        style={{ color: accent, backgroundColor: `${accent}18` }}
      >
        <Icon size={20} />
      </span>
      <p className="mt-4 font-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[28px] border border-white/10 bg-[#09131c] text-zinc-400">
      <Loader2 className="mr-3 animate-spin" size={20} />
      Preparando entorno seguro...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 p-10 text-center">
      <Eye className="mx-auto text-zinc-600" size={38} />
      <p className="mt-4 font-black">Sin institucion activa</p>
      <p className="mt-2 text-sm text-zinc-500">
        Selecciona una institucion vinculada para revisar el modo demo.
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
