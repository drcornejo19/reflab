import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Activity,
  ChartNoAxesCombined,
  ChevronRight,
  History,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type PerformanceArea = {
  title: string;
  category: string;
  description: string;
  href: string;
  status: "Disponible" | "Agrupado";
  icon: LucideIcon;
};

const performanceAreas: PerformanceArea[] = [
  {
    title: "Mi evolución",
    category: "Progreso",
    description:
      "Resumen de exámenes, respuestas, promedio, mejor score y tendencia general.",
    href: "/stats",
    status: "Disponible",
    icon: Activity,
  },
  {
    title: "Por tópicos",
    category: "Lectura técnica",
    description:
      "Rendimiento por disputas, faltas tácticas, manos, fuera de juego y VAR.",
    href: "/stats",
    status: "Disponible",
    icon: ChartNoAxesCombined,
  },
  {
    title: "Por criterio",
    category: "Precision",
    description:
      "Precisión por decisión técnica, reanudación, disciplina y subtipo técnico.",
    href: "/dashboard",
    status: "Agrupado",
    icon: Target,
  },
  {
    title: "Historial",
    category: "Respuestas",
    description:
      "Últimas respuestas registradas y datos de exámenes reales del usuario.",
    href: "/stats",
    status: "Disponible",
    icon: History,
  },
  {
    title: "Ranking",
    category: "Comunidad",
    description:
      "Clasificación general por promedio, mejor score y cantidad de intentos.",
    href: "/ranking",
    status: "Disponible",
    icon: Trophy,
  },
];

export default function PerformancePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB PERFORMANCE
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-5xl">
            Rendimiento
          </h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Analizá tu evolución, precisión por criterio, rendimiento por
            tópico, historial y ranking.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {performanceAreas.map((area) => (
            <PerformanceCard key={area.title} area={area} />
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Rutas preservadas
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Las páginas originales de estadísticas y ranking siguen disponibles
            en /stats y /ranking. Este hub solo ordena el acceso principal para
            que el sidebar muestre una única sección de rendimiento.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function PerformanceCard({ area }: { area: PerformanceArea }) {
  const Icon = area.icon;

  return (
    <Link
      href={area.href}
      className="group flex min-h-[250px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
            {area.status}
          </span>
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {area.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{area.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {area.description}
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
