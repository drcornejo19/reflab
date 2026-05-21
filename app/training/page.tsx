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
  status: "Disponible" | "Beta" | "Próximamente" | "En construcción";
  icon: LucideIcon;
};

const modules: TrainingModule[] = [
  {
    title: "Decisión arbitral",
    category: "Técnica",
    description:
      "Entrená reglas, interpretación, reanudaciones, disciplina, manos, fuera de juego, SPA y DOGSO.",
    href: "/training/decision",
    status: "Disponible",
    icon: ClipboardCheck,
  },
  {
    title: "Video análisis",
    category: "Clips",
    description:
      "Analizá clips reales, justificá decisiones y mejorá tu lectura técnica.",
    href: "/training/video-analysis",
    status: "Disponible",
    icon: PlaySquare,
  },
  {
    title: "VAR Lab",
    category: "Protocolo",
    description:
      "Practicá protocolo VAR, OFR, APP, factual vs interpretativo y decisión final.",
    href: "/training/var",
    status: "Beta",
    icon: MonitorCheck,
  },
  {
    title: "Inglés arbitral",
    category: "Comunicación",
    description:
      "Comunicá decisiones en inglés técnico con terminología FIFA.",
    href: "/training/english",
    status: "Beta",
    icon: Languages,
  },
  {
    title: "Comunicación y liderazgo",
    category: "Gestión",
    description:
      "Trabajá autoridad, protestas, lenguaje corporal, límites y manejo de conflictos.",
    href: "/training/communication",
    status: "En construcción",
    icon: MessageCircle,
  },
  {
    title: "Preparación del árbitro",
    category: "Desarrollo",
    description:
      "Psicología, físico, nutrición, recuperación, ética y carrera arbitral.",
    href: "/training/referee-preparation",
    status: "En construcción",
    icon: Activity,
  },
];

export default function TrainingPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB TRAINING
          </p>

          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-4xl font-black md:text-6xl">
                Entrenamiento
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
                Elegí un área para entrenar habilidades técnicas, cognitivas,
                comunicacionales y físicas del arbitraje.
              </p>
            </div>

            <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                RefLab
              </p>
              <p className="mt-1 max-w-[260px] text-sm font-black leading-5">
                Entrená decisiones. Mejorá tu criterio. Evolucioná con datos.
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
      className="group flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <StatusBadge status={module.status} />
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {module.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{module.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {module.description}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          Acceder
        </span>
        <ChevronRight className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: TrainingModule["status"] }) {
  const label = status === "Próximamente" ? "Próximamente" : status;

  return (
    <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
      {label}
    </span>
  );
}
