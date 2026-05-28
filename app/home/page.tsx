"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  Gauge,
  ShieldCheck,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";

const individualBenefits = [
  "Dashboard tecnico",
  "Entrenamiento arbitral",
  "Evaluaciones",
  "Ref Performance",
];

const institutionalBenefits = [
  "Panel institucional",
  "Cohortes y grupos",
  "Metricas por arbitro",
  "Licencias B2B",
];

const ecosystemItems = [
  { label: "Entrena", icon: ClipboardCheck },
  { label: "Evalua", icon: ShieldCheck },
  { label: "Analiza", icon: Video },
  { label: "Medi", icon: BarChart3 },
  { label: "Evoluciona", icon: Gauge },
  { label: "Aprende", icon: BookOpen },
];

export default function HomePage() {
  const { isLoaded, isSignedIn } = useUser();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const individualHref = useMemo(() => {
    if (!isLoaded || !isSignedIn) return "/sign-in";
    return isMobile ? "/mobile-dashboard" : "/dashboard";
  }, [isLoaded, isMobile, isSignedIn]);

  return (
    <main className="min-h-[100svh] w-full max-w-full overflow-hidden bg-[#020b14] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute left-[-20%] top-[-20%] h-[460px] w-[460px] rounded-full bg-[#6fc11f]/10 blur-[130px]" />
        <div className="absolute bottom-[-22%] right-[-14%] h-[520px] w-[520px] rounded-full bg-[#6fc11f]/8 blur-[140px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[1180px] flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[860px] text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-lg font-black text-[#6fc11f] shadow-[0_0_34px_rgba(111,193,31,0.18)]">
            RF
          </div>
          <h1 className="mt-6 break-words text-4xl font-black tracking-tight sm:text-6xl">
            REF<span className="text-[#6fc11f]">LAB</span>
          </h1>
          <p className="mt-3 break-words text-[10px] font-black uppercase tracking-[0.32em] text-zinc-500 sm:text-sm sm:tracking-[0.45em]">
            Referee Decision Lab
          </p>
          <p className="mx-auto mt-6 max-w-[720px] text-base leading-7 text-zinc-300 sm:text-lg">
            Elegi como queres usar RefLab.
          </p>
          <p className="mx-auto mt-2 max-w-[760px] text-sm leading-6 text-zinc-500">
            Una plataforma integral para entrenar arbitros individualmente y para profesionalizar estructuras institucionales.
          </p>
        </div>

        <div className="mt-9 grid w-full gap-5 lg:grid-cols-2">
          <ExperienceCard
            icon={UserRound}
            kicker="Acceso individual"
            title="Entrenamiento Individual"
            text="Para arbitros que quieren entrenar, evaluarse y evolucionar con una plataforma integral de desarrollo arbitral."
            button="Ingresar como arbitro"
            href={individualHref}
            benefits={individualBenefits}
            primary
          />
          <ExperienceCard
            icon={Building2}
            kicker="Acceso institucional"
            title="Instituciones / B2B"
            text="Para escuelas, asociaciones, ligas y federaciones que quieren digitalizar, medir y profesionalizar la formacion arbitral."
            button="Solicitar demo institucional"
            href="/institutional"
            benefits={institutionalBenefits}
          />
        </div>

        <div className="mt-9 grid gap-3 min-[430px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {ecosystemItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.035] px-3 py-4 text-center"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                  <Icon size={24} />
                </div>
                <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-zinc-300">
                  {item.label}
                </p>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-[760px] text-center text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-sm sm:tracking-[0.35em]">
          Entrena decisiones. Mejora tu criterio. Evoluciona con datos.
        </p>
      </section>
    </main>
  );
}

function ExperienceCard({
  icon: Icon,
  kicker,
  title,
  text,
  button,
  href,
  benefits,
  primary = false,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  text: string;
  button: string;
  href: string;
  benefits: string[];
  primary?: boolean;
}) {
  return (
    <article
      className={`group min-w-0 rounded-[32px] border p-5 transition hover:-translate-y-1 sm:p-7 ${
        primary
          ? "border-[#6fc11f]/35 bg-[#6fc11f]/10 shadow-[0_28px_100px_rgba(111,193,31,0.12)]"
          : "border-white/10 bg-[#0b131b]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={28} />
        </div>
        <ArrowRight className="mt-2 text-zinc-600 transition group-hover:text-[#6fc11f]" size={22} />
      </div>

      <p className="mt-7 text-[10px] font-black uppercase tracking-[0.3em] text-[#6fc11f]">
        {kicker}
      </p>
      <h2 className="mt-3 break-words text-3xl font-black leading-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-zinc-300">{text}</p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {benefits.map((benefit) => (
          <div
            key={benefit}
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-black text-zinc-300"
          >
            {benefit}
          </div>
        ))}
      </div>

      <Link
        href={href}
        className={`mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition active:scale-[0.98] ${
          primary
            ? "bg-[#6fc11f] text-black hover:bg-[#82dc2a]"
            : "border border-white/10 bg-white/[0.04] text-white hover:border-[#6fc11f]/40 hover:text-[#6fc11f]"
        }`}
      >
        {button}
        <ArrowRight size={18} />
      </Link>
    </article>
  );
}
