import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  BookOpenCheck,
  ChevronRight,
  Clock,
  Languages,
  MonitorCheck,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";

type EvaluationCard = {
  title: string;
  category: string;
  description: string;
  status: "Disponible" | "Próximamente" | "Beta";
  href?: string;
  icon: LucideIcon;
};

const evaluations: EvaluationCard[] = [
  {
    title: "Examen arbitral",
    category: "Formal",
    description:
      "Clips consecutivos sin feedback inmediato, score final y análisis global con IA.",
    status: "Disponible",
    href: "/training/exam",
    icon: ShieldCheck,
  },
  {
    title: "Examen de reglas",
    category: "IFAB",
    description:
      "20 preguntas exigentes para medir interpretación reglamentaria bajo tiempo.",
    status: "Disponible",
    href: "/training/rules-exam",
    icon: BookOpenCheck,
  },
  {
    title: "Examen VAR",
    category: "VAR",
    description:
      "Evaluación formal de protocolo VAR, OFR, APP, factual e interpretativo.",
    status: "Próximamente",
    icon: MonitorCheck,
  },
  {
    title: "Examen de inglés",
    category: "Comunicación",
    description:
      "Situaciones para explicar decisiones en inglés técnico arbitral.",
    status: "Próximamente",
    icon: Languages,
  },
  {
    title: "Simulación cronometrada",
    category: "Tiempo real",
    description:
      "Práctica bajo presión con reloj, bloques de clips y cierre de rendimiento.",
    status: "Próximamente",
    icon: Timer,
  },
  {
    title: "Feedback final con IA",
    category: "Analisis",
    description:
      "Lectura final de fortalezas, puntos críticos y plan recomendado luego del examen.",
    status: "Beta",
    href: "/training/exam",
    icon: Sparkles,
  },
];

export default function EvaluationsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB EVALUATIONS
          </p>

          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-4xl font-black md:text-5xl">
                Evaluaciones
              </h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
                Rendí simulaciones y exámenes para medir tu criterio arbitral
                bajo condiciones formales.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-[#6fc11f]" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                    Acceso principal
                  </p>
                  <p className="text-sm font-black text-white">
                    /evaluations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evaluations.map((evaluation) => (
            <EvaluationModuleCard key={evaluation.title} item={evaluation} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function EvaluationModuleCard({ item }: { item: EvaluationCard }) {
  const Icon = item.icon;
  const content = (
    <>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
            {item.status}
          </span>
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {item.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{item.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {item.description}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {item.href ? "Abrir" : "Próximamente"}
        </span>
        <ChevronRight
          className={`text-zinc-600 transition ${
            item.href ? "group-hover:translate-x-1 group-hover:text-[#6fc11f]" : ""
          }`}
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
      className="group flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      {content}
    </Link>
  );
}
