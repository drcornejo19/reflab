"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  Library,
  LineChart,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  Target,
  Trophy,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";

const individualItems = [
  "Entrenamiento",
  "Evaluaciones",
  "Video analisis",
  "Ref Performance",
  "Estadisticas",
];

const institutionalItems = [
  "Escuelas",
  "Ligas",
  "Asociaciones",
  "Programas academicos",
  "Seguimiento de alumnos",
  "Evaluaciones",
  "Licencias institucionales",
];

const capabilityCards = [
  { title: "ENTRENA", icon: PlayCircle, items: ["Clips reales", "Decisiones arbitrales"] },
  { title: "ANALIZA", icon: Video, items: ["Video analisis", "Justificaciones"] },
  { title: "EVALUA", icon: FileCheck2, items: ["Examenes IFAB", "Evaluaciones tecnicas"] },
  { title: "MEDI", icon: BarChart3, items: ["Dashboard tecnico", "Metricas reales"] },
  { title: "EVOLUCIONA", icon: Trophy, items: ["Historial", "Progreso"] },
  { title: "APRENDE", icon: BookOpen, items: ["Biblioteca IFAB", "Material academico"] },
];

const modules = [
  { title: "VAR LAB", icon: ScanLine },
  { title: "VIDEO ANALISIS", icon: Video },
  { title: "REGLAS DE JUEGO", icon: BookOpen },
  { title: "ENTRENAMIENTO ARBITRAL", icon: ClipboardCheck },
  { title: "PREPARACION INTEGRAL", icon: Activity },
  { title: "REF PERFORMANCE", icon: Gauge },
  { title: "EXAMENES", icon: FileCheck2 },
  { title: "BIBLIOTECA", icon: Library },
];

const visualMetrics = [
  { label: "Score", value: "84" },
  { label: "Precision", value: "78%" },
  { label: "Evolucion", value: "+12" },
];

export default function HomePage() {
  const { isLoaded, isSignedIn } = useUser();
  const individualHref = isLoaded && isSignedIn ? "/dashboard" : "/sign-in";

  return (
    <main className="min-h-[100svh] w-full overflow-hidden bg-[#020b14] text-white">
      <section className="relative border-b border-white/10 bg-[linear-gradient(180deg,#07131d_0%,#020b14_82%)]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:52px_52px]" />
        <div className="relative mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-lg border border-[#6fc11f]/35 bg-black/45 p-2 shadow-[0_0_28px_rgba(111,193,31,0.18)]">
              <Image
                src="/rf-logo.png"
                alt="Logo RefLab"
                width={52}
                height={52}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="break-words text-2xl font-black tracking-tight">
                REF<span className="text-[#6fc11f]">LAB</span>
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-zinc-500 sm:text-xs">
                Referee Decision Lab
              </p>
            </div>
          </div>

          <div className="mt-10 max-w-[900px]">
            <h1 className="text-balance text-4xl font-black leading-[1.03] text-white sm:text-5xl lg:text-6xl">
              Entrena decisiones.
              <br />
              Medi tu evolucion.
              <br />
              Mejora tu criterio.
            </h1>
            <p className="mt-5 max-w-[620px] text-lg leading-8 text-zinc-300">
              La primera plataforma integral para arbitros de futbol.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <AccessCard
              icon={UserRound}
              kicker="Acceso individual"
              title="Arbitros"
              items={individualItems}
              href={individualHref}
              button="Ingresar como arbitro"
              primary
            />
            <AccessCard
              icon={Building2}
              kicker="Acceso institucional"
              title="Instituciones"
              items={institutionalItems}
              href="/institutional"
              button="Ingresar como institucion"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="RefLab"
          title="Que podes hacer en RefLab"
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {capabilityCards.map((item) => (
            <CapabilityCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#07111a]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Ecosistema"
            title="Modulos disponibles"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((item) => (
              <ModuleTile key={item.title} {...item} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:pb-10">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
              Desarrollo arbitral
            </p>
            <h2 className="mt-3 max-w-[560px] text-3xl font-black leading-tight sm:text-4xl">
              Tu desarrollo arbitral en un solo lugar
            </h2>
            <p className="mt-4 max-w-[620px] text-sm leading-7 text-zinc-400">
              Radar tecnico, metricas, score y evolucion conviven en una lectura clara para entrenar con foco.
            </p>
          </div>

          <PerformanceMockup />
        </div>
      </section>
    </main>
  );
}

function AccessCard({
  icon: Icon,
  kicker,
  title,
  items,
  href,
  button,
  primary = false,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  items: string[];
  href: string;
  button: string;
  primary?: boolean;
}) {
  return (
    <article
      className={`min-w-0 rounded-lg border p-5 shadow-2xl sm:p-6 ${
        primary
          ? "border-[#6fc11f]/40 bg-[#6fc11f]/10"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={26} />
        </div>
        <ArrowRight className="mt-2 text-zinc-600" size={22} />
      </div>
      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.26em] text-[#6fc11f]">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-black sm:text-3xl">{title}</h2>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item}
            className="flex min-h-11 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 text-sm font-bold text-zinc-300"
          >
            <ShieldCheck size={16} className="shrink-0 text-[#6fc11f]" />
            <span className="min-w-0 break-words">{item}</span>
          </div>
        ))}
      </div>
      <Link
        href={href}
        className={`mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-black transition active:scale-[0.99] ${
          primary
            ? "bg-[#6fc11f] text-black hover:bg-[#82dc2a]"
            : "border border-white/10 bg-white/[0.04] text-white hover:border-[#6fc11f]/45 hover:text-[#6fc11f]"
        }`}
      >
        {button}
        <ArrowRight size={18} />
      </Link>
    </article>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h2>
    </div>
  );
}

function CapabilityCard({ title, icon: Icon, items }: { title: string; icon: LucideIcon; items: string[] }) {
  return (
    <article className="min-w-0 rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-[#6fc11f]/12 text-[#6fc11f]">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 break-words text-sm font-black tracking-[0.18em] text-white">
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-400">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function ModuleTile({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <article className="group flex min-h-24 min-w-0 items-center gap-4 rounded-lg border border-white/10 bg-[#0b151e] p-4 transition hover:border-[#6fc11f]/45">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/10 bg-black/25 text-[#6fc11f]">
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <h3 className="break-words text-sm font-black tracking-[0.16em] text-white">
          {title}
        </h3>
        <p className="mt-1 text-xs font-bold text-zinc-500 group-hover:text-[#6fc11f]">
          Disponible
        </p>
      </div>
    </article>
  );
}

function PerformanceMockup() {
  return (
    <div className="rounded-lg border border-white/10 bg-[#07111a] p-4 shadow-2xl sm:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg border border-[#6fc11f]/20 bg-[#020b14] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
                Perfil tecnico
              </p>
              <p className="mt-1 text-sm text-zinc-500">Radar de criterio</p>
            </div>
            <Target className="text-[#6fc11f]" size={24} />
          </div>
          <div className="mx-auto mt-3 aspect-square w-full max-w-[260px]">
            <svg viewBox="0 0 220 220" className="h-full w-full">
              {[96, 72, 48, 24].map((radius) => (
                <polygon
                  key={radius}
                  points={mockRadarPoints([100, 100, 100, 100, 100], radius)}
                  fill="none"
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                />
              ))}
              {[0, 1, 2, 3, 4].map((index) => {
                const point = mockRadarPoint(index, 96);
                return (
                  <line
                    key={index}
                    x1="110"
                    y1="110"
                    x2={point.x}
                    y2={point.y}
                    stroke="rgba(255,255,255,0.12)"
                  />
                );
              })}
              <polygon
                points={mockRadarPoints([86, 72, 78, 64, 82], 96)}
                fill="rgba(111,193,31,0.3)"
                stroke="#6fc11f"
                strokeWidth="3"
              />
              <circle cx="110" cy="110" r="4" fill="#6fc11f" />
            </svg>
          </div>
        </div>

        <div className="grid gap-3">
          {visualMetrics.map((item) => (
            <div key={item.label} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-bold text-zinc-500">{item.label}</p>
              <p className="mt-2 text-3xl font-black text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
              Evolucion
            </p>
            <p className="mt-1 text-sm text-zinc-500">Ultimas sesiones</p>
          </div>
          <LineChart className="text-[#6fc11f]" size={24} />
        </div>
        <div className="grid h-32 grid-cols-8 items-end gap-2">
          {[38, 54, 48, 66, 58, 76, 72, 88].map((height, index) => (
            <div key={`${height}-${index}`} className="rounded-t bg-[#6fc11f]/25">
              <div
                className="rounded-t bg-[#6fc11f]"
                style={{ height: `${height}%`, minHeight: 18 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mockRadarPoints(values: number[], radius: number) {
  return values
    .map((value, index) => {
      const point = mockRadarPoint(index, radius * (value / 100));
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function mockRadarPoint(index: number, radius: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: Math.round((110 + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((110 + Math.sin(angle) * radius) * 10) / 10,
  };
}
