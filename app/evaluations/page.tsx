"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import {
  getDisciplineDefinition,
  getDisciplineEvaluationModules,
  type DisciplineModule,
  type DisciplineModuleIconKey,
} from "@/lib/discipline";
import {
  BookOpenCheck,
  ChevronRight,
  Languages,
  MonitorCheck,
  PlaySquare,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<DisciplineModuleIconKey, LucideIcon> = {
  decision: ShieldCheck,
  video: PlaySquare,
  var: MonitorCheck,
  communication: Languages,
  preparation: ShieldCheck,
  rules: BookOpenCheck,
  performance: ShieldCheck,
  library: BookOpenCheck,
  timer: Timer,
};

export default function EvaluationsPage() {
  const { currentDiscipline } = useDiscipline();
  const definition = getDisciplineDefinition(currentDiscipline);
  const evaluations = getDisciplineEvaluationModules(currentDiscipline);
  const theme = definition.theme;
  const isFutsal = currentDiscipline === "futsal";

  return (
    <AppShell>
      <div className="space-y-6">

        <header
          className="rounded-[34px] border border-white/10 p-7 shadow-2xl"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), #0d1720`,
          }}
        >
          <p
            className="text-xs font-black uppercase tracking-[0.45em]"
            style={{ color: theme.accent }}
          >
            {isFutsal ? "EVALUACIONES FUTSAL" : "REFLAB EVALUATIONS"}
          </p>

          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-4xl font-black md:text-5xl">
                {isFutsal ? "Evaluaciones Futsal" : "Evaluaciones"}
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
                {isFutsal
                  ? "Acceso a videoanalisis, trivia y examen formal de reglas FIFA Futsal con trazabilidad independiente."
                  : "Instancias audiovisuales y reglamentarias para medir criterio, consistencia y calidad de decision."}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evaluations.map((evaluation) => (
            <EvaluationModuleCard
              key={`${currentDiscipline}-${evaluation.title}`}
              item={evaluation}
              theme={theme}
            />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function EvaluationModuleCard({
  item,
  theme,
}: {
  item: DisciplineModule;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  const Icon = iconMap[item.iconKey];

  const content = (
    <>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
            }}
          >
            <Icon size={30} />
          </div>

          <span
            className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
            style={{
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
            }}
          >
            {item.status}
          </span>
        </div>

        <p
          className="mt-6 text-xs font-black uppercase tracking-[0.3em]"
          style={{ color: theme.accent }}
        >
          {item.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{item.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">{item.description}</p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {item.href ? "Abrir" : "Proximamente"}
        </span>
        <ChevronRight
          className="text-zinc-600 transition"
          style={{ color: item.href ? theme.accent : undefined }}
        />
      </div>
    </>
  );

  if (!item.href) {
    return (
      <div className="flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 opacity-80 shadow-2xl">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="group flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition"
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
