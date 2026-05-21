import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  BookOpenCheck,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type DecisionPath = {
  title: string;
  category: string;
  description: string;
  href: string;
  status: "Disponible" | "Premium";
  icon: LucideIcon;
};

const decisionPaths: DecisionPath[] = [
  {
    title: "Entrenamiento con clips",
    category: "Decisión técnica",
    description:
      "Practicá faltas, reanudaciones, disciplina, manos, fuera de juego, SPA y DOGSO con clips reales.",
    href: "/training/field",
    status: "Disponible",
    icon: ClipboardCheck,
  },
  {
    title: "Práctica de reglas",
    category: "IFAB",
    description:
      "Entrená preguntas rápidas de reglamento con feedback inmediato para afinar criterio.",
    href: "/training/rules-practice",
    status: "Disponible",
    icon: GraduationCap,
  },
  {
    title: "Reglas premium",
    category: "Avanzado",
    description:
      "Accedé a práctica ampliada para consolidar interpretación, disciplina y reanudaciones.",
    href: "/training/rules-premium-practice",
    status: "Premium",
    icon: Trophy,
  },
];

export default function DecisionTrainingPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB DECISION
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-5xl">
            Decisión arbitral
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Entrená reglas, interpretación, disciplina, reanudaciones, manos,
            faltas, fuera de juego, SPA y DOGSO desde los modos que ya existen
            en RefLab.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {decisionPaths.map((path) => (
            <DecisionCard key={path.href} path={path} />
          ))}
        </section>

        <section className="rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-black/20 text-[#6fc11f]">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                Criterio técnico
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Esta pantalla organiza los accesos existentes sin mover ni
                borrar los entrenamientos originales. Las rutas antiguas siguen
                disponibles para no romper enlaces ni datos guardados.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function DecisionCard({ path }: { path: DecisionPath }) {
  const Icon = path.icon;

  return (
    <Link
      href={path.href}
      className="group flex min-h-[250px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
            {path.status}
          </span>
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {path.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{path.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {path.description}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          Abrir
        </span>
        <ChevronRight className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
      </div>
    </Link>
  );
}
