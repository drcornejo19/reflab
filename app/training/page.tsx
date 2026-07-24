"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useDiscipline } from "@/components/DisciplineProvider";
import {
  getDisciplineDefinition,
  getDisciplineTrainingModules,
  type DisciplineModule,
  type DisciplineModuleIconKey,
} from "@/lib/discipline";
import { useUserRole } from "@/lib/useUserRole";
import {
  Activity,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  MonitorCheck,
  PlaySquare,
  Timer,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<DisciplineModuleIconKey, LucideIcon> = {
  decision: ClipboardCheck,
  video: PlaySquare,
  var: MonitorCheck,
  communication: MessageCircle,
  preparation: Activity,
  rules: BookOpen,
  performance: Activity,
  library: BookOpen,
  timer: Timer,
};

export default function TrainingPage() {
  const { currentDiscipline } = useDiscipline();
  const { isPro, loadingRole } = useUserRole();
  const definition = getDisciplineDefinition(currentDiscipline);
  const modules = getDisciplineTrainingModules(currentDiscipline);
  const theme = definition.theme;
  const isFutsal = currentDiscipline === "futsal";

  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden lg:space-y-6">

        <section
          className="rounded-[30px] border border-white/10 p-4 shadow-2xl sm:rounded-[34px] sm:p-6 lg:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), #0d1720`,
          }}
        >
          <p
            className="break-words text-[10px] font-black uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.45em]"
            style={{ color: theme.accent }}
          >
            {isFutsal ? "REFLAB FUTSAL" : "REFLAB TRAINING"}
          </p>

          <div className="mt-5 flex min-w-0 flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-black leading-tight md:text-5xl lg:text-6xl">
                {isFutsal ? "Entrenamiento Futsal" : "Entrenamiento"}
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                {isFutsal
                  ? "Videoanalisis, trivia reglamentaria, biblioteca y rendimiento especifico para arbitraje de futsal."
                  : "Elegi actividades practicas para entrenar habilidades tecnicas, comunicacionales y de preparacion del arbitraje."}
              </p>
            </div>

            <div
              className="min-w-0 rounded-2xl px-4 py-3 lg:max-w-[320px]"
              style={{
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.accentSoft,
              }}
            >
              <p
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                style={{ color: theme.accent }}
              >
                {loadingRole ? "Validando plan" : isPro ? "RefLab Pro" : "RefLab Basic"}
              </p>
              <p className="mt-1 break-words text-sm font-black leading-5">
                {isFutsal
                  ? "Entrena casos reales, fortalece criterio y prepara tu mapa tecnico de futsal."
                  : "Entrena decisiones, mejora tu criterio y evoluciona con datos."}
              </p>
            </div>
          </div>
        </section>

        {!loadingRole && !isPro && (
          <ProUpgradeCard
            compact
            title={isFutsal ? "Entrenamiento Futsal activo" : "Entrenamiento Basic activo"}
            description={
              isFutsal
                ? "Puedes practicar videoanalisis y reglas de futsal con trazabilidad propia. Las instancias formales se concentran en Evaluaciones."
                : "Podes probar RefLab con entrenamiento con clips y contenidos base. Las evaluaciones por video ahora viven en el modulo Evaluaciones."
            }
            reason={
              isFutsal
                ? "Plan Basic: acceso inicial a entrenamiento reglamentario y audiovisual por disciplina."
                : "Plan Basic: hasta 5 clips por semana y 1 examen semanal."
            }
          />
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <TrainingModuleCard
              key={`${currentDiscipline}-${module.title}`}
              module={module}
              isPro={isPro}
              loadingRole={loadingRole}
              theme={theme}
            />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function TrainingModuleCard({
  module,
  isPro,
  loadingRole,
  theme,
}: {
  module: DisciplineModule;
  isPro: boolean;
  loadingRole: boolean;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  const Icon = iconMap[module.iconKey];
  const locked = module.proOnly && !loadingRole && !isPro;

  const content = (
    <>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14"
            style={{
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
            }}
          >
            <Icon size={28} />
          </div>

          <div className="flex flex-col items-end gap-2">
            {module.proOnly && (
              <span className="max-w-[150px] shrink-0 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-center text-[9px] font-black uppercase tracking-[0.12em] text-yellow-100 sm:text-[10px] sm:tracking-[0.18em]">
                Pro
              </span>
            )}
            <StatusBadge status={module.status} theme={theme} />
          </div>
        </div>

        <p
          className="mt-5 break-words text-[10px] font-black uppercase tracking-[0.18em] sm:mt-6 sm:text-xs sm:tracking-[0.3em]"
          style={{ color: theme.accent }}
        >
          {module.category}
        </p>

        <h2 className="mt-3 break-words text-xl font-black leading-tight sm:text-2xl">
          {module.title}
        </h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {module.description}
        </p>

        {locked && module.freeNote && (
          <p className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-3 text-xs font-bold leading-5 text-yellow-100">
            {module.freeNote}
          </p>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="break-words text-xs font-black uppercase tracking-[0.14em] text-zinc-500 sm:tracking-[0.18em]">
          {locked ? "Disponible en Pro" : "Acceder"}
        </span>
        <ChevronRight
          className="shrink-0 text-zinc-600 transition group-hover:translate-x-1"
          style={{ color: locked ? undefined : theme.accent }}
        />
      </div>
    </>
  );

  if (locked || !module.href) {
    return (
      <div className="group flex min-w-0 flex-col justify-between rounded-[28px] border border-white/10 bg-[#101b24] p-4 opacity-95 shadow-2xl sm:min-h-[240px] sm:p-5 lg:min-h-[260px] lg:p-6">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={module.href}
      className="group flex min-w-0 flex-col justify-between rounded-[28px] border border-white/10 bg-[#101b24] p-4 shadow-2xl transition sm:min-h-[240px] sm:p-5 lg:min-h-[260px] lg:p-6"
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = theme.border;
        event.currentTarget.style.backgroundColor = "#13212b";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
        event.currentTarget.style.backgroundColor = "#101b24";
      }}
    >
      {content}
    </Link>
  );
}

function StatusBadge({
  status,
  theme,
}: {
  status: DisciplineModule["status"];
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  return (
    <span
      className="max-w-[150px] shrink-0 rounded-full px-3 py-1 text-center text-[9px] font-black uppercase tracking-[0.12em] sm:text-[10px] sm:tracking-[0.18em]"
      style={{
        border: `1px solid ${theme.border}`,
        backgroundColor: theme.accentSoft,
        color: theme.accent,
      }}
    >
      {status}
    </span>
  );
}
