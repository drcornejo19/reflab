import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getDisciplineDefinition } from "@/lib/discipline";
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
    category: "Decision tecnica",
    description:
      "Practica faltas, reanudaciones, disciplina, manos, fuera de juego, SPA y DOGSO con clips reales.",
    href: "/training/field",
    status: "Disponible",
    icon: ClipboardCheck,
  },
  {
    title: "Practica de reglas",
    category: "IFAB",
    description:
      "Entrena preguntas rapidas de reglamento con feedback inmediato para afinar criterio.",
    href: "/training/rules-practice",
    status: "Disponible",
    icon: GraduationCap,
  },
  {
    title: "Reglas premium",
    category: "Avanzado",
    description:
      "Accede a practica ampliada para consolidar interpretacion, disciplina y reanudaciones.",
    href: "/training/rules-premium-practice",
    status: "Premium",
    icon: Trophy,
  },
];

export default function DecisionTrainingPage() {
  const theme = getDisciplineDefinition("football_11").theme;

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
            REFLAB CLIPS
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-5xl">
            Entrenamiento con clips
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Practica reglas, interpretacion, disciplina, reanudaciones, manos,
            faltas, fuera de juego, SPA y DOGSO desde los modos que ya existen
            en RefLab.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {decisionPaths.map((path) => (
            <DecisionCard key={path.href} path={path} />
          ))}
        </section>

        <section
          className="rounded-3xl p-5"
          style={{
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.accentSoft,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border bg-black/20"
              style={{ borderColor: theme.border, color: theme.accent }}
            >
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.3em]"
                style={{ color: theme.accent }}
              >
                Criterio tecnico
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
  const theme = getDisciplineDefinition("football_11").theme;

  return (
    <Link
      href={path.href}
      className="group flex min-h-[250px] flex-col justify-between rounded-[30px] bg-[#101b24] p-6 shadow-2xl transition hover:bg-[#13212b]"
      style={{ border: `1px solid ${theme.border}` }}
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div
            className="grid h-14 w-14 place-items-center rounded-2xl border"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
            }}
          >
            <Icon size={30} />
          </div>

          <span
            className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.accentSoft,
              color: theme.accent,
            }}
          >
            {path.status}
          </span>
        </div>

        <p
          className="mt-6 text-xs font-black uppercase tracking-[0.3em]"
          style={{ color: theme.accent }}
        >
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
        <ChevronRight
          className="text-zinc-600 transition group-hover:translate-x-1"
          style={{ color: theme.accent }}
        />
      </div>
    </Link>
  );
}
