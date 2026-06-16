"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useUserRole } from "@/lib/useUserRole";
import {
  Activity,
  Brain,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  MonitorCheck,
  PlaySquare,
  type LucideIcon,
} from "lucide-react";

type TrainingModule = {
  title: string;
  category: string;
  description: string;
  href: string;
  status: "Disponible" | "Beta" | "Proximamente" | "En construccion";
  icon: LucideIcon;
  proOnly?: boolean;
  freeNote?: string;
};

const modules: TrainingModule[] = [
  {
    title: "Decision arbitral",
    category: "Tecnica",
    description:
      "Entrena reglas, interpretacion, reanudaciones, disciplina, manos, fuera de juego y faltas tacticas.",
    href: "/training/decision",
    status: "Disponible",
    icon: ClipboardCheck,
  },
  {
    title: "Video analisis",
    category: "Clips",
    description:
      "Analiza clips reales, justifica decisiones y mejora tu lectura tecnica.",
    href: "/training/video-analysis",
    status: "Disponible",
    icon: PlaySquare,
  },
  {
    title: "VAR Lab",
    category: "Protocolo",
    description:
      "Practica protocolo VAR, OFR, APP, factual vs interpretativo y decision final.",
    href: "/training/var",
    status: "Beta",
    icon: MonitorCheck,
    proOnly: true,
    freeNote: "VAR Lab es exclusivo de RefLab Pro.",
  },
  {
    title: "Comunicacion arbitral",
    category: "Comunicacion",
    description:
      "Explica decisiones en espanol, entrena ingles arbitral IFAB y aprende vocabulario tecnico.",
    href: "/training/english",
    status: "Beta",
    icon: MessageCircle,
    proOnly: true,
    freeNote: "Comunicacion arbitral se desbloquea con RefLab Pro.",
  },
  {
    title: "Preparacion del arbitro",
    category: "Desarrollo",
    description:
      "Psicologia, fisico, nutricion, recuperacion, etica y carrera arbitral.",
    href: "/training/referee-preparation",
    status: "En construccion",
    icon: Activity,
    proOnly: true,
    freeNote: "La preparacion arbitral completa se desbloquea con RefLab Pro.",
  },
  {
    title: "Psicologia arbitral",
    category: "Mental",
    description:
      "Check-ins pre y post partido, gestion del error, foco, confianza y presion competitiva.",
    href: "/training/psychology",
    status: "Beta",
    icon: Brain,
    proOnly: true,
    freeNote: "Psicologia arbitral se desbloquea con RefLab Pro.",
  },
];

export default function TrainingPage() {
  const { isPro, loadingRole } = useUserRole();

  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden lg:space-y-6">
        <section className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-4 shadow-2xl sm:rounded-[34px] sm:p-6 lg:p-7">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.45em]">
            REFLAB TRAINING
          </p>

          <div className="mt-5 flex min-w-0 flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <h1 className="break-words text-3xl font-black leading-tight md:text-5xl lg:text-6xl">
                Entrenamiento
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">
                Elegi un area para entrenar habilidades tecnicas, cognitivas, comunicacionales y fisicas del arbitraje.
              </p>
            </div>

            <div className="min-w-0 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3 lg:max-w-[300px]">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f]">
                {loadingRole ? "Validando plan" : isPro ? "RefLab Pro" : "RefLab Free"}
              </p>
              <p className="mt-1 break-words text-sm font-black leading-5">
                Entrena decisiones. Mejora tu criterio. Evoluciona con datos.
              </p>
            </div>
          </div>
        </section>

        {!loadingRole && !isPro && (
          <ProUpgradeCard
            compact
            title="Entrenamiento FREE activo"
            description="Podes probar RefLab con decision arbitral, video analisis y contenidos base. Cuando quieras entrenar sin limites, desbloqueas la experiencia completa."
            reason="Plan FREE: hasta 5 clips por semana y 1 examen semanal."
          />
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <TrainingModuleCard
              key={module.href}
              module={module}
              isPro={isPro}
              loadingRole={loadingRole}
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
}: {
  module: TrainingModule;
  isPro: boolean;
  loadingRole: boolean;
}) {
  const Icon = module.icon;
  const locked = module.proOnly && !loadingRole && !isPro;

  const content = (
    <>
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f] sm:h-14 sm:w-14">
            <Icon size={28} />
          </div>

          <div className="flex flex-col items-end gap-2">
            {module.proOnly && (
              <span className="max-w-[150px] shrink-0 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-center text-[9px] font-black uppercase tracking-[0.12em] text-yellow-100 sm:text-[10px] sm:tracking-[0.18em]">
                Pro
              </span>
            )}
            <StatusBadge status={module.status} />
          </div>
        </div>

        <p className="mt-5 break-words text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f] sm:mt-6 sm:text-xs sm:tracking-[0.3em]">
          {module.category}
        </p>

        <h2 className="mt-3 break-words text-xl font-black leading-tight sm:text-2xl">{module.title}</h2>

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
        <ChevronRight className="shrink-0 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
      </div>
    </>
  );

  if (locked) {
    return (
      <div className="group flex min-w-0 flex-col justify-between rounded-[28px] border border-yellow-400/20 bg-[#101b24] p-4 opacity-95 shadow-2xl sm:min-h-[240px] sm:p-5 lg:min-h-[260px] lg:p-6">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={module.href}
      className="group flex min-w-0 flex-col justify-between rounded-[28px] border border-white/10 bg-[#101b24] p-4 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b] sm:min-h-[240px] sm:p-5 lg:min-h-[260px] lg:p-6"
    >
      {content}
    </Link>
  );
}

function StatusBadge({ status }: { status: TrainingModule["status"] }) {
  return (
    <span className="max-w-[150px] shrink-0 rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-center text-[9px] font-black uppercase tracking-[0.12em] text-[#6fc11f] sm:text-[10px] sm:tracking-[0.18em]">
      {status}
    </span>
  );
}
