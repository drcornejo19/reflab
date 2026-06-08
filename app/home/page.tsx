"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Lock,
  LogIn,
  MonitorPlay,
  ScanLine,
  ShieldCheck,
  Timer,
  UserPlus,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";

const benefits = [
  {
    title: "Jugadas reales",
    description: "Entrenamiento con situaciones de partido.",
    icon: MonitorPlay,
  },
  {
    title: "Métricas avanzadas",
    description: "Medí tu rendimiento con datos reales.",
    icon: BarChart3,
  },
  {
    title: "Evolución continua",
    description: "Seguimiento técnico de tu progreso.",
    icon: Gauge,
  },
];

const lockedModules = [
  {
    title: "VAR Lab",
    description: "Entrenamiento específico con revisiones VAR y situaciones OFR.",
    icon: ScanLine,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.25), rgba(2,11,20,0.9)), repeating-linear-gradient(90deg, rgba(111,193,31,0.2) 0 2px, transparent 2px 70px), linear-gradient(145deg, #15212c, #041019)",
  },
  {
    title: "Video Análisis",
    description: "Analizá jugadas en profundidad y mejorá tus decisiones.",
    icon: Video,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.35), rgba(2,11,20,0.92)), linear-gradient(28deg, transparent 0 44%, rgba(111,193,31,0.38) 44% 46%, transparent 46%), linear-gradient(145deg, #192a21, #061018)",
  },
  {
    title: "Entrenamiento Arbitral",
    description: "Clips por tópico y dificultad para entrenar tu criterio arbitral.",
    icon: ClipboardCheck,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.35), rgba(2,11,20,0.92)), repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0 1px, transparent 1px 42px), linear-gradient(145deg, #1e2a18, #071019)",
  },
  {
    title: "Exámenes",
    description: "Evaluaciones basadas en IFAB para certificar tu nivel técnico.",
    icon: FileCheck2,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.35), rgba(2,11,20,0.94)), linear-gradient(115deg, transparent 0 26%, rgba(255,255,255,0.18) 26% 36%, transparent 36%), linear-gradient(145deg, #222a33, #071019)",
  },
  {
    title: "Biblioteca IFAB",
    description: "Reglas de Juego, circulares, protocolos VAR y material académico.",
    icon: BookOpen,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.35), rgba(2,11,20,0.92)), linear-gradient(90deg, rgba(255,255,255,0.12) 0 2px, transparent 2px 14px), linear-gradient(145deg, #2a261d, #071019)",
  },
  {
    title: "Ref Performance",
    description: "Dashboard avanzado con métricas, estadísticas y evolución.",
    icon: BarChart3,
    background:
      "linear-gradient(135deg, rgba(4,10,16,0.35), rgba(2,11,20,0.92)), repeating-linear-gradient(90deg, rgba(111,193,31,0.2) 0 3px, transparent 3px 34px), linear-gradient(145deg, #12251d, #061018)",
  },
];

const trustItems = [
  { label: "Entrenamiento arbitral", icon: ShieldCheck },
  { label: "Métricas de evolución", icon: BarChart3 },
  { label: "Acceso individual", icon: UserRound },
  { label: "Acceso institucional", icon: Building2 },
  { label: "Criterio profesional", icon: CheckCircle2 },
];

export default function HomePage() {
  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#02070c] text-white">
      <section className="relative min-h-[900px] border-b border-white/10 lg:min-h-[940px]">
        <Image
          src="/home-referee-hero.png"
          alt="Árbitro RefLab señalando en un estadio oscuro"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[62%_top]"
        />
        <div className="absolute inset-0 bg-black/28" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#02070c_0%,rgba(2,7,12,0.9)_18%,rgba(2,7,12,0.5)_45%,rgba(2,7,12,0.2)_72%,#02070c_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,7,12,0.08)_0%,rgba(2,7,12,0.25)_48%,#02070c_88%)]" />

        <div className="relative z-10 mx-auto flex min-h-[900px] w-full max-w-[1500px] flex-col px-4 py-5 sm:px-6 lg:min-h-[940px] lg:px-10">
          <Header />

          <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-8">
            <div className="max-w-[720px]">
              <h1 className="text-balance text-4xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
                Entrená decisiones.
                <br />
                Medí tu evolución.
                <br />
                <span className="text-[#6fc11f] drop-shadow-[0_0_22px_rgba(111,193,31,0.25)]">
                  Mejorá tu criterio.
                </span>
              </h1>
              <p className="mt-6 max-w-[560px] border-l-2 border-[#6fc11f] pl-4 text-base leading-7 text-zinc-200 sm:text-lg">
                La plataforma integral para árbitros de fútbol.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {benefits.map((item) => (
                  <BenefitPill key={item.title} {...item} />
                ))}
              </div>

              <div className="mt-8 grid gap-3 lg:hidden">
                <ScoreHud compact />
                <EvolutionHud />
              </div>
            </div>

            <div className="relative hidden min-h-[520px] lg:block">
              <div className="absolute right-0 top-6 xl:right-6">
                <ScoreHud />
              </div>
              <div className="absolute bottom-24 right-[24%]">
                <RadarHud />
              </div>
              <div className="absolute bottom-20 right-0 xl:right-8">
                <EvolutionHud />
              </div>
            </div>
          </div>

          <AccessChooser individualHref="/dashboard" />
        </div>
      </section>

      <section className="relative bg-[#02070c] px-4 pb-8 pt-8 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[#6fc11f]">
              <Lock size={18} />
              <h2 className="text-balance text-2xl font-black text-white sm:text-3xl">
                Explorá todos los módulos de RefLab
              </h2>
            </div>
            <p className="mt-2 text-sm text-zinc-400 sm:text-base">
              Iniciá sesión para <span className="text-[#6fc11f]">desbloquear</span> todas las herramientas.
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {lockedModules.map((module) => (
              <LockedModule key={module.title} {...module} />
            ))}
          </div>

          <TrustStrip />
        </div>
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/home" className="flex min-w-0 items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#6fc11f] bg-black/50 text-base font-black text-[#6fc11f] shadow-[0_0_24px_rgba(111,193,31,0.25)]">
          RF
        </div>
        <div className="min-w-0">
          <p className="break-words text-2xl font-black leading-none tracking-tight">
            REF<span className="text-[#6fc11f]">LAB</span>
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.27em] text-zinc-400">
            Referee Decision Lab
          </p>
        </div>
      </Link>

      <nav className="flex gap-2 sm:gap-3" aria-label="Acceso de usuario">
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/35 bg-black/35 px-4 text-sm font-black text-white backdrop-blur transition hover:border-[#6fc11f]/60 hover:text-[#6fc11f] sm:flex-none sm:px-5"
        >
          <LogIn size={17} />
          Iniciar sesión
        </Link>
        <Link
          href="/sign-up"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#6fc11f] px-4 text-sm font-black text-black shadow-[0_0_28px_rgba(111,193,31,0.25)] transition hover:bg-[#82dc2a] sm:flex-none sm:px-5"
        >
          <UserPlus size={17} />
          Crear cuenta
        </Link>
      </nav>
    </header>
  );
}

function BenefitPill({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-lg border border-white/10 bg-black/24 p-3 backdrop-blur-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#6fc11f]">
        <Icon size={21} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

function AccessChooser({ individualHref }: { individualHref: string }) {
  return (
    <section className="mx-auto mb-8 w-full max-w-[980px] overflow-hidden rounded-2xl border border-[#6fc11f]/35 bg-[#041018]/78 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md lg:mb-12">
      <div className="grid lg:grid-cols-2">
        <AccessPanel
          icon={Timer}
          title="Soy árbitro"
          description="Entrená, evaluá y medí tu rendimiento individual."
          button="Ingresar como árbitro"
          href={individualHref}
          tone="referee"
        />
        <AccessPanel
          icon={Building2}
          title="Soy institución"
          description="Gestioná tu escuela, liga o asociación y potenciá a tus árbitros."
          button="Ingresar como institución"
          href="/institutional"
          tone="institution"
        />
      </div>
    </section>
  );
}

function AccessPanel({
  icon: Icon,
  title,
  description,
  button,
  href,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  button: string;
  href: string;
  tone: "referee" | "institution";
}) {
  const isReferee = tone === "referee";

  return (
    <article className="min-w-0 border-b border-white/10 p-5 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:p-7">
      <div className="grid gap-5 sm:grid-cols-[80px_1fr] sm:items-center">
        <div
          className={`grid h-20 w-20 place-items-center rounded-full border ${
            isReferee
              ? "border-[#6fc11f]/45 bg-[#6fc11f]/10 text-[#6fc11f]"
              : "border-sky-400/45 bg-sky-500/10 text-sky-400"
          }`}
        >
          <Icon size={38} />
        </div>
        <div className="min-w-0">
          <h3
            className={`text-2xl font-black uppercase tracking-wide ${
              isReferee ? "text-[#6fc11f]" : "text-sky-400"
            }`}
          >
            {title}
          </h3>
          <p className="mt-2 max-w-[360px] text-base leading-7 text-white">{description}</p>
          <Link
            href={href}
            className={`mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-black transition active:scale-[0.99] sm:w-auto sm:min-w-[300px] ${
              isReferee
                ? "bg-[#6fc11f] text-black hover:bg-[#82dc2a]"
                : "bg-sky-500 text-white hover:bg-sky-400"
            }`}
          >
            {button}
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function ScoreHud({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-[#6fc11f]/25 bg-[#041018]/72 p-5 shadow-[0_0_45px_rgba(111,193,31,0.1)] backdrop-blur-md ${
        compact ? "" : "w-[250px]"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
        Rendimiento general
      </p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-5xl font-black leading-none text-[#6fc11f]">95</span>
        <span className="pb-1 text-xl font-black text-white">/100</span>
      </div>
      <p className="mt-3 text-sm font-black uppercase text-white">Élite</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/12">
        <div className="h-full w-[88%] rounded-full bg-[#6fc11f]" />
      </div>
    </div>
  );
}

function RadarHud() {
  const points = radarPoints([92, 78, 86, 82, 76], 70, 90);
  const ringValues = [100, 75, 50, 25];

  return (
    <div className="w-[260px] rounded-xl border border-white/10 bg-black/16 p-3 backdrop-blur-[2px]">
      <p className="mb-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
        Radar técnico
      </p>
      <svg viewBox="0 0 180 180" className="h-[190px] w-full">
        {ringValues.map((value) => (
          <polygon
            key={value}
            points={radarPoints([value, value, value, value, value], 70, 90)}
            fill="none"
            stroke="rgba(111,193,31,0.18)"
            strokeWidth="1"
          />
        ))}
        {["VAR", "F. juego", "Manos", "Disputas", "Faltas"].map((label, index) => {
          const point = radarAxisPoint(index, 81, 90);
          const line = radarAxisPoint(index, 70, 90);
          return (
            <g key={label}>
              <line x1="90" y1="90" x2={line.x} y2={line.y} stroke="rgba(111,193,31,0.18)" />
              <text
                x={point.x}
                y={point.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-[8px] font-black uppercase"
              >
                {label}
              </text>
            </g>
          );
        })}
        <polygon points={points} fill="rgba(111,193,31,0.26)" stroke="#6fc11f" strokeWidth="3" />
        <circle cx="90" cy="90" r="3.5" fill="#6fc11f" />
      </svg>
    </div>
  );
}

function EvolutionHud() {
  const values = [22, 38, 46, 42, 60, 76, 74, 95];

  return (
    <div className="rounded-xl border border-white/10 bg-[#041018]/56 p-4 backdrop-blur-md lg:w-[260px]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
        Evolución semanal
      </p>
      <div className="mt-4 grid h-24 grid-cols-8 items-end gap-2">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="h-full rounded-t bg-white/8">
            <div
              className="rounded-t bg-[#6fc11f]/85"
              style={{ height: `${value}%`, minHeight: 10 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LockedModule({
  title,
  description,
  icon: Icon,
  background,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  background: string;
}) {
  return (
    <article className="group relative min-h-[240px] overflow-hidden rounded-xl border border-white/12 bg-[#071019]">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center opacity-80 blur-[1px] transition group-hover:scale-110"
        style={{ backgroundImage: background }}
      />
      <div className="absolute inset-0 bg-black/54" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(2,7,12,0.68)_55%,#02070c_100%)]" />
      <div className="absolute left-1/2 top-[34%] grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_0_28px_rgba(255,255,255,0.08)] backdrop-blur-md">
        <Lock size={24} />
      </div>
      <div className="relative z-10 flex h-full min-h-[240px] flex-col justify-end p-5">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-md border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={21} />
        </div>
        <h3 className="text-base font-black uppercase tracking-wide text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p>
        <p className="mt-3 text-xs font-black text-[#6fc11f]">Disponible al registrarte</p>
      </div>
    </article>
  );
}

function TrustStrip() {
  return (
    <section className="mx-auto mt-6 max-w-[1180px] rounded-xl border border-white/10 bg-[#061018]/70 px-4 py-4 backdrop-blur">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {trustItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center justify-center gap-3 border-white/10 py-2 lg:border-r lg:last:border-r-0">
              <Icon className="text-[#6fc11f]" size={25} />
              <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-white">
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function radarPoints(values: number[], radius: number, center: number) {
  return values
    .map((value, index) => {
      const point = radarAxisPoint(index, radius * (Math.max(0, Math.min(value, 100)) / 100), center);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function radarAxisPoint(index: number, radius: number, center: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: Math.round((center + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((center + Math.sin(angle) * radius) * 10) / 10,
  };
}
