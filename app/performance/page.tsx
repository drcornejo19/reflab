import type { ReactNode } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  Activity,
  BarChart3,
  Brain,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  History,
  Languages,
  MessageCircle,
  MonitorCheck,
  PlaySquare,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type PerformanceArea = {
  title: string;
  category: string;
  description: string;
  href: string;
  status: "Disponible" | "Agrupado" | "Preparado";
  icon: LucideIcon;
  metrics: string[];
  insight: string;
};

type ModuleMetricArea = {
  title: string;
  status: "Datos actuales" | "Métricas futuras" | "Métricas en construcción";
  description: string;
  icon: LucideIcon;
  metrics: string[];
};

const performanceAreas: PerformanceArea[] = [
  {
    title: "Mi evolución",
    category: "Progreso general",
    description:
      "Visualizá tu progreso general, tendencia de rendimiento y evolución a lo largo del tiempo.",
    href: "/stats",
    status: "Disponible",
    icon: Activity,
    insight: "Ideal para entender si tu rendimiento sube, se estabiliza o necesita refuerzo.",
    metrics: [
      "Promedio general",
      "Entrenamientos realizados",
      "Evaluaciones completadas",
      "Mejor score",
      "Último score",
      "Tendencia semanal o mensual",
      "Racha de entrenamiento",
    ],
  },
  {
    title: "Por tópicos",
    category: "Tipo de jugada",
    description:
      "Analizá tu rendimiento según el tipo de jugada o situación arbitral.",
    href: "/stats",
    status: "Disponible",
    icon: ChartNoAxesCombined,
    insight: "Separa el rendimiento por temas para detectar qué situación entrenar después.",
    metrics: [
      "Manos",
      "Faltas tácticas",
      "Disputas",
      "Fuera de juego",
      "VAR",
      "Mejor tópico",
      "Tópico recomendado",
    ],
  },
  {
    title: "Por criterio",
    category: "Precisión técnica",
    description:
      "Medí la precisión de tus decisiones según el criterio arbitral aplicado.",
    href: "/dashboard",
    status: "Agrupado",
    icon: Target,
    insight: "No mide el tema de la jugada: mide cómo resolvés técnicamente cada decisión.",
    metrics: [
      "Decisión técnica",
      "Reanudación",
      "Sanción disciplinaria",
      "Subtipo técnico",
      "Interpretación",
      "Justificación",
      "Criterio VAR",
    ],
  },
  {
    title: "Historial",
    category: "Intentos concretos",
    description:
      "Revisá tus últimos intentos y detectá patrones en tus respuestas.",
    href: "/stats",
    status: "Preparado",
    icon: History,
    insight: "Pensado para revisar registros reales, no promedios repetidos.",
    metrics: [
      "Últimas respuestas",
      "Fecha",
      "Tópico",
      "Decisión tomada",
      "Decisión correcta",
      "Puntaje",
      "Modo usado",
      "Resultado",
    ],
  },
  {
    title: "Ranking",
    category: "Comunidad",
    description:
      "Compará tu rendimiento con otros árbitros dentro de la comunidad RefLab.",
    href: "/ranking",
    status: "Disponible",
    icon: Trophy,
    insight: "Agrupa comparación comunitaria sin mezclarla con el análisis individual.",
    metrics: [
      "Posición general",
      "Promedio",
      "Mejor score",
      "Cantidad de tests",
      "Entrenamientos",
      "Nivel RefLab",
      "Ranking semanal / mensual",
    ],
  },
];

const moduleMetricAreas: ModuleMetricArea[] = [
  {
    title: "Decisión arbitral",
    status: "Datos actuales",
    description:
      "Mide precisión técnica, disciplina y reanudación en jugadas de campo.",
    icon: ClipboardCheck,
    metrics: [
      "Precisión técnica",
      "Precisión disciplinaria",
      "Precisión en reanudación",
      "Tiempo promedio de decisión",
      "Aciertos en SPA / DOGSO",
      "Aciertos en manos",
      "Aciertos en fuera de juego",
    ],
  },
  {
    title: "Video análisis",
    status: "Métricas futuras",
    description:
      "Preparado para medir lectura técnica y calidad de justificación sobre clips reales.",
    icon: PlaySquare,
    metrics: [
      "Clips analizados",
      "Precisión de lectura técnica",
      "Calidad de justificación",
      "Detección de infracción",
      "Detección de intensidad",
      "Punto de contacto",
      "Errores frecuentes",
    ],
  },
  {
    title: "VAR Lab",
    status: "Datos actuales",
    description:
      "Enfocado en protocolo, intervención, revisión y decisión final dentro del flujo VAR.",
    icon: MonitorCheck,
    metrics: [
      "Precisión en intervención VAR",
      "Aciertos en OFR",
      "Aciertos en APP",
      "Factual vs interpretativo",
      "Decisión final correcta",
      "Uso correcto del protocolo",
    ],
  },
  {
    title: "Inglés arbitral",
    status: "Métricas futuras",
    description:
      "Preparado para evaluar claridad, vocabulario FIFA y terminología arbitral en inglés.",
    icon: Languages,
    metrics: [
      "Precisión técnica del texto",
      "Uso de vocabulario FIFA",
      "Claridad comunicacional",
      "Gramática básica",
      "Terminología VAR",
      "Respuestas habladas o escritas",
    ],
  },
  {
    title: "Comunicación y liderazgo",
    status: "Métricas en construcción",
    description:
      "Este módulo medirá habilidades de comunicación, liderazgo, lenguaje corporal y manejo de conflictos dentro del partido.",
    icon: MessageCircle,
    metrics: [
      "Manejo de protestas",
      "Puesta de límites",
      "Comunicación verbal",
      "Comunicación no verbal",
      "Control emocional",
      "Manejo de cuerpos técnicos",
      "Resolución de conflictos",
    ],
  },
  {
    title: "Preparación del árbitro",
    status: "Métricas en construcción",
    description:
      "Este módulo integrará indicadores de preparación mental, física y profesional del árbitro: pre-partido, recuperación, hábitos, foco, confianza y evolución personal.",
    icon: Dumbbell,
    metrics: [
      "Preparación pre-partido",
      "Estado físico percibido",
      "Carga de entrenamiento",
      "Recuperación",
      "Descanso e hidratación",
      "Foco mental",
      "Confianza y ansiedad pre-partido",
      "Autoevaluación post-partido",
      "Rutina semanal",
    ],
  },
];

export default function PerformancePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl lg:p-7">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB PERFORMANCE
          </p>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-4xl font-black md:text-5xl">Rendimiento</h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
                Centro de análisis para evolución, tópicos, criterios técnicos,
                historial y comparación comunitaria.
              </p>
            </div>

            <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                Sin datos inventados
              </p>
              <p className="mt-1 max-w-[260px] text-sm font-bold leading-5 text-zinc-200">
                Las métricas futuras quedan preparadas como estructura visual.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {performanceAreas.map((area) => (
            <PerformanceCard key={area.title} area={area} />
          ))}
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Métricas por módulo
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight">
                Cada entrenamiento necesita medir algo distinto.
              </h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400">
                Esta estructura deja preparado el crecimiento de RefLab sin
                mezclar métricas de campo, video, VAR, inglés, comunicación y
                preparación arbitral.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricPrinciple icon={Brain} title="Criterio" text="Qué decidió el árbitro." />
              <MetricPrinciple icon={BarChart3} title="Evolución" text="Cómo cambia con el tiempo." />
              <MetricPrinciple icon={Target} title="Precisión" text="Qué tan correcto fue el criterio." />
              <MetricPrinciple icon={History} title="Historial" text="Qué ocurrió en cada intento." />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moduleMetricAreas.map((module) => (
            <ModuleMetricCard key={module.title} module={module} />
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Rutas preservadas
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Las páginas originales de estadísticas y ranking siguen disponibles
            en /stats y /ranking. Este hub organiza el acceso principal y deja
            preparada la evolución analítica de cada módulo.
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
      className="group flex min-h-[360px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b] lg:p-6"
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

        <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-bold leading-5 text-zinc-300">
          {area.insight}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {area.metrics.map((metric) => (
            <MetricPill key={metric}>{metric}</MetricPill>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          Abrir análisis
        </span>
        <ChevronRight className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
      </div>
    </Link>
  );
}

function ModuleMetricCard({ module }: { module: ModuleMetricArea }) {
  const Icon = module.icon;

  return (
    <article className="flex min-h-[330px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl lg:p-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={28} />
          </div>

          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
              module.status === "Métricas en construcción"
                ? "border-yellow-300/25 bg-yellow-300/10 text-yellow-200"
                : "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]"
            }`}
          >
            {module.status}
          </span>
        </div>

        <h3 className="mt-5 text-xl font-black text-white">{module.title}</h3>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{module.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {module.metrics.map((metric) => (
            <MetricPill key={metric}>{metric}</MetricPill>
          ))}
        </div>
      </div>

      {(module.status === "Métricas en construcción" ||
        module.status === "Métricas futuras") && (
        <p className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-3 text-xs font-bold text-zinc-500">
          Sin datos todavía. Esta card prepara la estructura visual y conceptual.
        </p>
      )}
    </article>
  );
}

function MetricPrinciple({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Icon className="h-6 w-6 text-[#6fc11f]" />
      <p className="mt-3 text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}

function MetricPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-zinc-300">
      {children}
    </span>
  );
}
