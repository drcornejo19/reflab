"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
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
    image: "/home-module-var.png",
    position: "center",
  },
  {
    title: "Video Análisis",
    description: "Analizá jugadas en profundidad y mejorá tus decisiones.",
    icon: Video,
    image: "/home-module-video-analysis.png",
    position: "center",
  },
  {
    title: "Entrenamiento Arbitral",
    description: "Clips por tópico y dificultad para entrenar tu criterio arbitral.",
    icon: ClipboardCheck,
    image: "/home-module-training.png",
    position: "center",
  },
  {
    title: "Exámenes",
    description: "Evaluaciones basadas en IFAB para certificar tu nivel técnico.",
    icon: FileCheck2,
    image: "/home-module-exams.png",
    position: "center",
  },
  {
    title: "Biblioteca IFAB",
    description: "Reglas de Juego, circulares, protocolos VAR y material académico.",
    icon: BookOpen,
    image: "/home-module-library.png",
    position: "center",
  },
  {
    title: "Ref Performance",
    description: "Dashboard avanzado con métricas, estadísticas y evolución.",
    icon: BarChart3,
    image: "/home-module-performance.png",
    position: "center",
  },
];

const trustItems = [
  { value: "Entrenamiento", label: "arbitral", icon: ShieldCheck },
  { value: "Métricas reales", label: "para tu evolución", icon: BarChart3 },
  { value: "Acceso", label: "individual", icon: UserRound },
  { value: "Acceso", label: "institucional", icon: Building2 },
  { value: "Criterio", label: "profesional", icon: CheckCircle2 },
];

export default function HomePage() {
  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#02070c] text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#02070c]">
        <Image
          src="/home-hero-referee.png"
          alt="Árbitro RefLab señalando en un estadio oscuro"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_top]"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#02070c_0%,rgba(2,7,12,0.86)_22%,rgba(2,7,12,0.34)_52%,rgba(2,7,12,0.38)_78%,#02070c_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,7,12,0.06)_0%,rgba(2,7,12,0.08)_48%,#02070c_100%)]" />

        <div className="relative z-10 mx-auto max-w-[1536px] px-5 pb-0 pt-5 sm:px-8 lg:px-10">
          <Header />
          <AuthSync />

          <div className="grid min-h-[540px] gap-8 pt-12 lg:pt-16">
            <div className="max-w-[660px]">
              <h1 className="text-balance text-5xl font-black leading-[1.02] text-white sm:text-6xl lg:text-[64px]">
                Entrená decisiones.
                <br />
                Medí tu evolución.
                <br />
                <span className="text-[#6fc11f] drop-shadow-[0_0_22px_rgba(111,193,31,0.25)]">
                  Mejorá tu criterio.
                </span>
              </h1>
              <p className="mt-6 max-w-[560px] border-l-2 border-[#6fc11f] pl-4 text-lg leading-7 text-zinc-100">
                La plataforma integral para árbitros de fútbol.
              </p>

              <div className="mt-9 grid gap-3 sm:grid-cols-3">
                {benefits.map((item) => (
                  <BenefitPill key={item.title} {...item} />
                ))}
              </div>
            </div>

          </div>

          <div className="relative z-20 mx-auto mt-2 max-w-[980px] pb-8 lg:mt-0">
            <AccessChooser />
          </div>
        </div>
      </section>

      <section className="relative bg-[#02070c] px-5 pb-8 pt-5 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1536px]">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[#6fc11f]">
              <Lock size={18} />
              <h2 className="text-balance text-2xl font-black text-white sm:text-3xl">
                Explorá todos los módulos de RefLab
              </h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400 sm:text-base">
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
  const { isLoaded, isSignedIn } = useUser();
  const signInHref = isLoaded && isSignedIn ? "/dashboard" : "/sign-in";

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/home" className="flex min-w-0 items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#6fc11f] bg-black/50 text-base font-black text-[#6fc11f] shadow-[0_0_24px_rgba(111,193,31,0.25)]">
          RF
        </div>
        <div className="min-w-0">
          <p className="break-words text-3xl font-black leading-none tracking-tight">
            REF<span className="text-[#6fc11f]">LAB</span>
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-[0.27em] text-zinc-300">
            Referee Decision Lab
          </p>
        </div>
      </Link>

      <nav className="flex gap-2 sm:gap-3" aria-label="Acceso de usuario">
        <Link
          href={signInHref}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-white/45 bg-black/35 px-4 text-sm font-black text-white backdrop-blur transition hover:border-[#6fc11f]/60 hover:text-[#6fc11f] sm:flex-none sm:px-5"
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

function AuthSync() {
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    fetch("/api/profile", { cache: "no-store" }).catch(() => {
      // Dashboard and Profile also sync; Home should never block on this.
    });
  }, [isLoaded, isSignedIn]);

  return null;
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
    <div className="flex min-w-0 gap-3 rounded-lg border border-white/10 bg-black/26 p-3 backdrop-blur-sm">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#6fc11f]">
        <Icon size={21} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-300">{description}</p>
      </div>
    </div>
  );
}

function AccessChooser() {
  const { isLoaded, isSignedIn } = useUser();
  const refereeHref = isLoaded && isSignedIn ? "/dashboard" : "/sign-in";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#6fc11f]/35 bg-[#041018]/82 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="grid lg:grid-cols-2">
        <AccessPanel
          icon={Timer}
          title="Soy árbitro"
          description="Entrená, evaluá y medí tu rendimiento individual."
          button="Ingresar como árbitro"
          href={refereeHref}
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
    <article className="min-w-0 border-b border-white/10 p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:p-7">
      <div className="grid gap-5 sm:grid-cols-[96px_1fr] sm:items-center">
        <div
          className={`grid h-20 w-20 place-items-center rounded-full border ${
            isReferee
              ? "border-[#6fc11f]/55 bg-[#6fc11f]/10 text-[#6fc11f]"
              : "border-sky-400/55 bg-sky-500/10 text-sky-400"
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

function LockedModule({
  title,
  description,
  icon: Icon,
  image,
  position,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  image: string;
  position: string;
}) {
  return (
    <article className="group relative min-h-[250px] overflow-hidden rounded-xl border border-white/14 bg-[#071019]">
      <Image
        src={image}
        alt=""
        fill
        sizes="(min-width: 1280px) 16vw, (min-width: 768px) 33vw, 100vw"
        className="scale-105 object-cover opacity-80 blur-[1px] transition group-hover:scale-110"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 bg-black/58" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(2,7,12,0.68)_56%,#02070c_100%)]" />
      <div className="absolute left-1/2 top-[35%] grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_0_28px_rgba(255,255,255,0.08)] backdrop-blur-md">
        <Lock size={24} />
      </div>
      <div className="relative z-10 flex h-full min-h-[250px] flex-col justify-end p-5">
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
            <div key={`${item.value}-${item.label}`} className="flex items-center justify-center gap-3 border-white/10 py-2 lg:border-r lg:last:border-r-0">
              <Icon className="text-[#6fc11f]" size={25} />
              <div className="text-center">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-white">
                  {item.value}
                </p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
