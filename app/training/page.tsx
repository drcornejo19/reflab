import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Activity,
  ChevronRight,
  ClipboardCheck,
  Languages,
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
};

const modules: TrainingModule[] = [
  {
    title: "Decision arbitral",
    category: "Tecnica",
    description:
      "Entrena reglas, interpretacion, reanudaciones, disciplina, manos, fuera de juego, SPA y DOGSO.",
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
  },
  {
    title: "Ingles arbitral",
    category: "Comunicacion",
    description:
      "Comunica decisiones en ingles tecnico con terminologia FIFA.",
    href: "/training/english",
    status: "Beta",
    icon: Languages,
  },
  {
    title: "Comunicacion y liderazgo",
    category: "Gestion",
    description:
      "Trabaja autoridad, protestas, lenguaje corporal, limites y manejo de conflictos.",
    href: "/training/communication",
    status: "En construccion",
    icon: MessageCircle,
  },
  {
    title: "Preparacion del arbitro",
    category: "Desarrollo",
    description:
      "Psicologia, fisico, nutricion, recuperacion, etica y carrera arbitral.",
    href: "/training/referee-preparation",
    status: "En construccion",
    icon: Activity,
  },
];

export default function TrainingPage() {
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
                RefLab
              </p>
              <p className="mt-1 break-words text-sm font-black leading-5">
                Entrena decisiones. Mejora tu criterio. Evoluciona con datos.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <TrainingModuleCard key={module.href} module={module} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function TrainingModuleCard({ module }: { module: TrainingModule }) {
  const Icon = module.icon;

  return (
    <Link
      href={module.href}
      className="group flex min-w-0 flex-col justify-between rounded-[28px] border border-white/10 bg-[#101b24] p-4 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b] sm:min-h-[240px] sm:p-5 lg:min-h-[260px] lg:p-6"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f] sm:h-14 sm:w-14">
            <Icon size={28} />
          </div>

          <StatusBadge status={module.status} />
        </div>

        <p className="mt-5 break-words text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f] sm:mt-6 sm:text-xs sm:tracking-[0.3em]">
          {module.category}
        </p>

        <h2 className="mt-3 break-words text-xl font-black leading-tight sm:text-2xl">{module.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {module.description}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <span className="break-words text-xs font-black uppercase tracking-[0.14em] text-zinc-500 sm:tracking-[0.18em]">
          Acceder
        </span>
        <ChevronRight className="shrink-0 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
      </div>
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
