import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  ClipboardCheck,
  ShieldCheck,
  Target,
  Video,
} from "lucide-react";

const assignedModules = [
  { title: "Reglas de Juego IFAB", status: "Asignado", progress: 62, icon: BookOpen },
  { title: "Examenes", status: "Prioridad", progress: 48, icon: ClipboardCheck },
  { title: "Videos: Fuera de juego", status: "Prioridad", progress: 38, icon: Target },
  { title: "Videos: Manos", status: "Activo", progress: 74, icon: ShieldCheck },
  { title: "Videos: Disputas", status: "Asignado", progress: 44, icon: Video },
  { title: "Videos: Faltas tacticas", status: "Asignado", progress: 52, icon: Video },
  { title: "Estadisticas del alumno", status: "Activo", progress: 58, icon: BadgeCheck },
  { title: "Gestion academica", status: "Asignado", progress: 64, icon: BookOpen },
];

const progressCards = [
  { label: "Avance general", value: "58%", detail: "programa Inicial 2026" },
  { label: "Evaluaciones", value: "6", detail: "completadas" },
  { label: "Mejor topico", value: "Manos", detail: "92% de precision" },
  { label: "A mejorar", value: "Fuera de juego", detail: "pendiente de refuerzo" },
  { label: "Score actual", value: "84/100", detail: "nivel en desarrollo" },
  { label: "Ultima actividad", value: "Hoy", detail: "training de reglas" },
];

const instructorFeedback = [
  "Completar 5 videos de fuera de juego antes del viernes.",
  "Repasar Regla 11 y senalizacion del asistente.",
  "Proxima evaluacion asignada: Reglas de Juego - Bloque 2.",
];

export default function StudentDemoPage() {
  return (
    <main className="min-h-screen w-full max-w-full overflow-hidden bg-[#020b14] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-18%] top-[-20%] h-[500px] w-[500px] rounded-full bg-[#6fc11f]/10 blur-[130px]" />
        <div className="absolute bottom-[-20%] right-[-20%] h-[520px] w-[520px] rounded-full bg-[#6fc11f]/8 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-5 rounded-[32px] border border-white/10 bg-[#0b131b]/95 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-7 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
              Demo alumno institucional
            </p>
            <h1 className="mt-3 break-words text-3xl font-black leading-tight sm:text-5xl">
              Mateo Roldan
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Institucion: <span className="font-bold text-white">Escuela Arbitral Demo</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Cohorte Inicial 2026", "Licencia activa", "Rol: Arbitro", "Alumno institucional"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#b7ff67]"
                  >
                    {item}
                  </span>
                )
              )}
            </div>
          </div>

          <RefCardDemo />
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {progressCards.map((card) => (
            <article
              key={card.label}
              className="rounded-[26px] border border-white/10 bg-[#0b131b] p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                {card.label}
              </p>
              <p className="mt-3 break-words text-3xl font-black text-white">{card.value}</p>
              <p className="mt-2 text-sm font-semibold text-zinc-400">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-[#0b131b] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                Modulos asignados
              </p>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">Plan de entrenamiento institucional</h2>
            </div>
            <Link
              href="/demo/institution"
              className="flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:border-[#6fc11f]/40"
            >
              Ver demo institucional
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {assignedModules.map((module) => {
              const Icon = module.icon;
              return (
                <article
                  key={module.title}
                  className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                      <Icon size={23} />
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">
                      {module.status}
                    </span>
                  </div>
                  <h3 className="mt-5 min-h-10 break-words text-base font-black">{module.title}</h3>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-[#6fc11f]"
                      style={{ width: `${module.progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs font-bold text-zinc-500">{module.progress}% completado</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <Panel title="Feedback institucional" kicker="Instructor">
            <div className="grid gap-3">
              {instructorFeedback.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <BadgeCheck className="mt-0.5 shrink-0 text-[#6fc11f]" size={18} />
                  <p className="text-sm font-semibold leading-6 text-zinc-300">{item}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Acciones del alumno" kicker="Siguiente paso">
            <div className="grid gap-3">
              <ActionButton label="Continuar entrenamiento" href="/training" primary />
              <ActionButton label="Rendir evaluacion" href="/evaluations" />
              <ActionButton label="Abrir biblioteca IFAB" href="/institution/rules" />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function RefCardDemo() {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-[#6fc11f]/30 bg-[#061019] p-5 shadow-[0_30px_90px_rgba(111,193,31,0.12)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(111,193,31,0.22),transparent_34%),linear-gradient(135deg,rgba(111,193,31,0.08),transparent_45%)]" />
      <div className="relative grid gap-5 sm:grid-cols-[0.72fr_1fr]">
        <div className="min-h-[230px] rounded-[24px] border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-4">
          <div className="flex h-full flex-col justify-end rounded-[20px] bg-[#6fc11f]/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#b7ff67]">
              Alumno institucional
            </p>
            <p className="mt-2 text-3xl font-black">Mateo</p>
            <p className="text-3xl font-black text-[#6fc11f]">Roldan</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-zinc-500">
            RefCard
          </p>
          <h2 className="mt-2 text-3xl font-black">84/100</h2>
          <p className="mt-1 text-sm font-semibold text-zinc-400">Nivel inicial - en desarrollo</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Tests" value="6" />
            <MiniMetric label="Best" value="91" />
            <MiniMetric label="Estado" value="Activo" />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f]">
              Radar
            </p>
            <div className="mt-4 flex items-center gap-4">
              <RadarShape />
              <div className="grid gap-1 text-xs font-bold text-zinc-300">
                <span>Reglas 84</span>
                <span>FDJ 68</span>
                <span>Manos 92</span>
                <span>Disputas 74</span>
                <span>Faltas 86</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
    </div>
  );
}

function RadarShape() {
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0 overflow-visible">
      <polygon points="60,8 108,43 90,104 30,104 12,43" fill="none" stroke="rgba(255,255,255,0.16)" />
      <polygon points="60,28 88,49 78,86 42,86 32,49" fill="none" stroke="rgba(255,255,255,0.10)" />
      <polygon
        points="60,22 84,50 82,88 45,82 30,50"
        fill="rgba(111,193,31,0.36)"
        stroke="#6fc11f"
        strokeWidth="3"
      />
      <circle cx="60" cy="22" r="4" fill="#b7ff67" />
      <circle cx="84" cy="50" r="4" fill="#b7ff67" />
      <circle cx="82" cy="88" r="4" fill="#b7ff67" />
      <circle cx="45" cy="82" r="4" fill="#b7ff67" />
      <circle cx="30" cy="50" r="4" fill="#b7ff67" />
    </svg>
  );
}

function Panel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
        {kicker}
      </p>
      <h2 className="mt-3 break-words text-2xl font-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ActionButton({
  label,
  href,
  primary = false,
}: {
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition active:scale-[0.98] ${
        primary
          ? "bg-[#6fc11f] text-black hover:bg-[#82dc2a]"
          : "border border-white/10 bg-white/[0.04] text-white hover:border-[#6fc11f]/40"
      }`}
    >
      {label}
      <ArrowRight size={18} />
    </Link>
  );
}
