import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  LockKeyhole,
  PlayCircle,
  Video,
} from "lucide-react";
import {
  schoolAcademicProgram,
  schoolContentAccess,
  schoolCourseProgress,
  schoolScheduleBlocks,
  type SchoolProgramItemStatus,
} from "@/lib/institutionalExperience";

const studentIdentity = [
  "Escuela Arbitral Demo",
  "Cohorte Inicial 2026",
  "Licencia activa",
  "Alumno institucional",
];

const progressCards = [
  {
    label: "Curso",
    value: `${schoolCourseProgress.percent}%`,
    detail: "completado",
  },
  {
    label: "Modulos realizados",
    value: String(schoolCourseProgress.completedModules),
    detail: "actividades cerradas",
  },
  {
    label: "Modulos pendientes",
    value: String(schoolCourseProgress.pendingModules),
    detail: "por completar",
  },
  {
    label: "Evaluaciones pendientes",
    value: String(schoolCourseProgress.pendingEvaluations),
    detail: "habilitadas por la escuela",
  },
  {
    label: "Actividades pendientes",
    value: String(schoolCourseProgress.pendingActivities),
    detail: "esta semana",
  },
];

const instructorFeedback = [
  "Completar el bloque de Reglas 3 y 4 antes del viernes.",
  "Ver el video habilitado de fuera de juego inicial.",
  "La proxima evaluacion se abre el 10/06 y cierra el 14/06.",
];

const accessIcons = [BookOpen, Video, PlayCircle, ClipboardCheck, BadgeCheck];

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
              Demo alumno de escuela
            </p>
            <h1 className="mt-3 break-words text-3xl font-black leading-tight sm:text-5xl">
              Mi Programa
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Mateo Roldan ve solo el contenido asignado por su escuela:
              material IFAB, videos habilitados, entrenamientos, examenes y
              evaluaciones, dentro de un recorrido academico claro.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {studentIdentity.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#b7ff67]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <CourseProgressPanel />
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {schoolScheduleBlocks.map((block) => (
            <article
              key={block.title}
              className="rounded-[28px] border border-white/10 bg-[#0b131b] p-5"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                <CalendarDays size={23} />
              </div>
              <h2 className="mt-5 break-words text-xl font-black">{block.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{block.description}</p>
              <div className="mt-4 grid gap-2">
                {block.items.map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                  >
                    <CheckCircle2 className="mt-0.5 shrink-0 text-[#6fc11f]" size={16} />
                    <p className="text-sm font-semibold leading-5 text-zinc-300">{item}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-[#0b131b] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                Cronograma academico
              </p>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                Programa asignado por la escuela
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                Cada actividad puede tener fecha de inicio, fecha de apertura y
                fecha limite. Fuera de ese periodo, el alumno no puede realizarla.
              </p>
            </div>
            <Link
              href="/demo/institution"
              className="flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:border-[#6fc11f]/40"
            >
              Ver panel escuela
            </Link>
          </div>

          <div className="mt-6 grid gap-4">
            {schoolAcademicProgram.map((week) => (
              <article
                key={week.week}
                className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-black">{week.week}</p>
                    <p className="mt-1 text-xs font-bold text-zinc-500">{week.range}</p>
                  </div>
                  <StatusBadge status={week.status} />
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  {week.items.map((item) => (
                    <ProgramItemCard key={`${week.week}-${item.title}`} item={item} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Accesos habilitados" kicker="Contenido del alumno">
            <div className="grid gap-3 sm:grid-cols-2">
              {schoolContentAccess.map((item, index) => {
                const Icon = accessIcons[index] ?? BookOpen;
                return (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                  >
                    <Icon className="shrink-0 text-[#6fc11f]" size={20} />
                    <p className="text-sm font-black text-zinc-200">{item}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
              El alumno no navega libremente por toda la plataforma: ve lo que la
              escuela habilita dentro de su programa.
            </div>
          </Panel>

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
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <Panel title="Biblioteca oficial RefLab" kicker="Videos escuela">
            <p className="text-sm leading-6 text-zinc-400">
              La escuela no necesita subir videos para funcionar. Usa la biblioteca
              oficial RefLab con fuera de juego, manos, disputas y faltas tacticas.
              El contenido propio se envia a revision de RefLab antes de integrarse.
            </p>
          </Panel>

          <Panel title="Acciones del alumno" kicker="Siguiente paso">
            <div className="grid gap-3">
              <ActionButton label="Abrir material IFAB" href="/institution/rules" primary />
              <ActionButton label="Ver videos habilitados" href="/training" />
              <ActionButton label="Rendir evaluacion" href="/evaluations" />
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function CourseProgressPanel() {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-[#6fc11f]/30 bg-[#061019] p-5 shadow-[0_30px_90px_rgba(111,193,31,0.12)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(111,193,31,0.22),transparent_34%),linear-gradient(135deg,rgba(111,193,31,0.08),transparent_45%)]" />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-zinc-500">
          Progreso del curso
        </p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-5xl font-black text-[#6fc11f]">{schoolCourseProgress.percent}%</p>
            <p className="mt-2 text-sm font-semibold text-zinc-400">
              Programa Inicial 2026
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
              Estado
            </p>
            <p className="mt-1 text-sm font-black text-[#b7ff67]">En curso</p>
          </div>
        </div>
        <div className="mt-6 h-4 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#6fc11f] shadow-[0_0_20px_rgba(111,193,31,0.45)]"
            style={{ width: `${schoolCourseProgress.percent}%` }}
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SmallProgress label="Realizados" value={String(schoolCourseProgress.completedModules)} />
          <SmallProgress label="Pendientes" value={String(schoolCourseProgress.pendingModules)} />
        </div>
      </div>
    </div>
  );
}

function ProgramItemCard({
  item,
}: {
  item: {
    title: string;
    type: string;
    status: SchoolProgramItemStatus;
    startDate: string;
    openDate: string;
    dueDate: string;
  };
}) {
  const locked = item.status === "locked";
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">
          {item.type}
        </span>
        {locked ? (
          <LockKeyhole className="shrink-0 text-zinc-500" size={16} />
        ) : (
          <CheckCircle2 className="shrink-0 text-[#6fc11f]" size={16} />
        )}
      </div>
      <h3 className="mt-4 min-h-12 break-words text-sm font-black leading-5 text-white">
        {item.title}
      </h3>
      <div className="mt-4 grid gap-2 text-xs font-semibold text-zinc-500">
        <span>Inicio: {item.startDate}</span>
        <span>Apertura: {item.openDate}</span>
        <span>Limite: {item.dueDate}</span>
      </div>
      <div className="mt-4">
        <ItemStatusBadge status={item.status} />
      </div>
    </div>
  );
}

function SmallProgress({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "completada" | "activa" | "programada" }) {
  const className =
    status === "activa"
      ? "border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#b7ff67]"
      : status === "completada"
        ? "border-white/10 bg-white/[0.04] text-zinc-300"
        : "border-yellow-500/25 bg-yellow-500/10 text-yellow-100";

  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${className}`}>
      {status}
    </span>
  );
}

function ItemStatusBadge({ status }: { status: SchoolProgramItemStatus }) {
  const labels: Record<SchoolProgramItemStatus, string> = {
    done: "Realizado",
    available: "Disponible",
    locked: "Bloqueado por fecha",
  };
  const className =
    status === "available"
      ? "border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#b7ff67]"
      : status === "done"
        ? "border-white/10 bg-white/[0.04] text-zinc-300"
        : "border-yellow-500/25 bg-yellow-500/10 text-yellow-100";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${className}`}>
      {status === "locked" ? <Clock size={13} /> : <CheckCircle2 size={13} />}
      {labels[status]}
    </span>
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
