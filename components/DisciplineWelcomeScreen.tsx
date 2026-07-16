"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { RF_LOGO_SIZE, RF_LOGO_SRC } from "@/lib/brand";
import {
  getAllDisciplines,
  getDisciplineDefinition,
  resolveDisciplinePath,
} from "@/lib/discipline";
import { type SportType } from "@/lib/sports";
import { useDiscipline } from "@/components/DisciplineProvider";

export function DisciplineWelcomeScreen({
  nextPath,
  initialDiscipline,
}: {
  nextPath?: string | null;
  initialDiscipline?: SportType | null;
}) {
  const router = useRouter();
  const { setDiscipline } = useDiscipline();
  const [pendingDiscipline, setPendingDiscipline] = useState<SportType | null>(
    null
  );
  const disciplines = useMemo(() => getAllDisciplines(), []);

  function handleSelect(discipline: SportType) {
    setPendingDiscipline(discipline);
    setDiscipline(discipline);
    router.push(resolveDisciplinePath(nextPath ?? "/dashboard", discipline));
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#060b10] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-12%] top-[-16%] h-[420px] w-[420px] rounded-full bg-[#6fc11f]/10 blur-[130px]" />
        <div className="absolute right-[-10%] top-[8%] h-[360px] w-[360px] rounded-full bg-[#0da7ff]/10 blur-[130px]" />
        <div className="absolute bottom-[-18%] left-[28%] h-[420px] w-[420px] rounded-full bg-white/[0.04] blur-[150px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute left-0 top-0 h-[260px] w-[260px] bg-[radial-gradient(circle,_rgba(111,193,31,0.7)_1px,_transparent_1px)] bg-[length:22px_22px] opacity-[0.16]" />
        <div className="absolute right-0 top-0 h-[260px] w-[260px] bg-[radial-gradient(circle,_rgba(34,195,255,0.8)_1px,_transparent_1px)] bg-[length:22px_22px] opacity-[0.14]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1540px] flex-col px-5 pb-8 pt-8 sm:px-8 lg:px-10 lg:pb-10">
        <header className="mx-auto max-w-[780px] text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#6fc11f]/35 bg-white/[0.02] shadow-[0_0_45px_rgba(111,193,31,0.1)]">
            <Image
              src={RF_LOGO_SRC}
              alt="RefLab"
              width={RF_LOGO_SIZE}
              height={RF_LOGO_SIZE}
              sizes="80px"
              priority
              className="h-20 w-20 object-contain drop-shadow-[0_0_18px_rgba(111,193,31,0.24)]"
            />
          </div>

          <p className="mt-6 text-[11px] font-black uppercase tracking-[0.42em] text-zinc-400 sm:text-xs">
            PLATAFORMA DE CAPACITACION ARBITRAL
          </p>

          <h1 className="mt-5 text-balance text-4xl font-black leading-[0.98] sm:text-5xl lg:text-6xl">
            Selecciona tu{" "}
            <span className="text-[#6fc11f] drop-shadow-[0_0_22px_rgba(111,193,31,0.18)]">
              disciplina
            </span>
          </h1>
        </header>

        <section className="mt-10 grid gap-5 lg:mt-12 lg:grid-cols-2">
          {disciplines.map((discipline) => (
            <DisciplineCard
              key={discipline.key}
              discipline={discipline.key}
              isCurrent={initialDiscipline === discipline.key}
              isPending={pendingDiscipline === discipline.key}
              onSelect={handleSelect}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function DisciplineCard({
  discipline,
  isCurrent,
  isPending,
  onSelect,
}: {
  discipline: SportType;
  isCurrent: boolean;
  isPending: boolean;
  onSelect: (discipline: SportType) => void;
}) {
  const definition = getDisciplineDefinition(discipline);
  const isFutsal = discipline === "futsal";
  const Icon = ShieldCheck;
  const accentStyle = {
    "--accent": definition.theme.accent,
    "--accent-soft": definition.theme.accentSoft,
    "--accent-border": definition.theme.border,
    "--accent-glow": definition.theme.glow,
    "--accent-button": definition.theme.button,
    "--accent-button-hover": definition.theme.buttonHover,
  } as CSSProperties & Record<string, string>;

  return (
    <button
      type="button"
      onClick={() => onSelect(discipline)}
      disabled={isPending}
      style={accentStyle}
      className="group relative min-h-[520px] overflow-hidden rounded-[34px] border border-[color:var(--accent-border)] bg-[#081019] text-left shadow-[0_24px_80px_rgba(0,0,0,0.5)] transition duration-500 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_30px_90px_var(--accent-glow)] disabled:cursor-wait disabled:opacity-80"
    >
      <div className="absolute inset-0 overflow-hidden">
        <Image
          src={definition.welcome.imageSrc}
          alt=""
          fill
          sizes="(min-width: 1280px) 46vw, 100vw"
          priority
          className={`object-cover transition duration-700 group-hover:scale-[1.04] ${
            isFutsal
              ? "object-[center_top] opacity-35 saturate-0 hue-rotate-[160deg]"
              : "object-cover opacity-52"
          }`}
          style={{ objectPosition: definition.welcome.imagePosition }}
        />

        {isFutsal ? <FutsalCardAtmosphere /> : <FootballCardAtmosphere />}

        <div
          className={`absolute inset-0 ${
            isFutsal
              ? "bg-[linear-gradient(90deg,rgba(3,10,18,0.92)_0%,rgba(3,10,18,0.74)_34%,rgba(3,10,18,0.16)_100%)]"
              : "bg-[linear-gradient(90deg,rgba(3,9,14,0.94)_0%,rgba(3,9,14,0.72)_36%,rgba(3,9,14,0.12)_100%)]"
          }`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.14)_0%,rgba(0,0,0,0.1)_54%,rgba(3,7,10,0.72)_100%)]" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border border-[color:var(--accent-border)] bg-black/35 text-[color:var(--accent)] shadow-[0_0_24px_var(--accent-soft)] backdrop-blur-md">
            {isFutsal ? (
              <Image
                src={definition.logoSrc}
                alt="RefLab Futsal"
                width={RF_LOGO_SIZE}
                height={RF_LOGO_SIZE}
                sizes="96px"
                className="h-full w-full scale-[1.42] object-cover"
              />
            ) : (
              <Icon size={42} />
            )}
          </div>

          {isCurrent ? (
            <span className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/90">
              Actual
            </span>
          ) : null}
        </div>

        <div className="max-w-[380px]">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[color:var(--accent)]">
            {definition.welcome.eyebrow}
          </p>

          <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
            {definition.sessionLabel.toUpperCase()}
          </h2>

          <div className="mt-5 h-[2px] w-16 bg-[color:var(--accent)]/80 shadow-[0_0_18px_var(--accent-glow)]" />

          <p className="mt-5 text-lg leading-8 text-zinc-200">
            {definition.welcome.description}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex min-h-14 items-center gap-3 rounded-2xl border border-[color:var(--accent-border)] bg-black/35 px-5 text-base font-black text-[color:var(--accent)] shadow-[0_0_30px_var(--accent-soft)] transition group-hover:border-[color:var(--accent)] group-hover:bg-black/45">
            {isPending ? "Ingresando..." : "Ingresar"}
            <ArrowRight size={20} className="transition group-hover:translate-x-1" />
          </span>

          <span className="text-xs font-black uppercase tracking-[0.24em] text-zinc-500">
            RefLab
          </span>
        </div>
      </div>
    </button>
  );
}

function FootballCardAtmosphere() {
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[radial-gradient(circle_at_bottom,rgba(111,193,31,0.25)_0%,rgba(10,24,12,0.2)_44%,transparent_80%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-[38%] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(12,42,16,0.42)_100%)]" />
      <div className="absolute bottom-[14%] left-[47%] h-[190px] w-[190px] rounded-full border border-black/45 bg-[conic-gradient(from_0deg,_#f7f7f7_0deg,_#f7f7f7_20deg,_#141414_20deg,_#141414_42deg,_#f7f7f7_42deg,_#f7f7f7_74deg,_#1c1c1c_74deg,_#1c1c1c_96deg,_#f7f7f7_96deg,_#f7f7f7_138deg,_#181818_138deg,_#181818_162deg,_#f7f7f7_162deg,_#f7f7f7_210deg,_#101010_210deg,_#101010_236deg,_#f7f7f7_236deg,_#f7f7f7_360deg)] shadow-[0_16px_44px_rgba(0,0,0,0.45)]" />
      <div className="absolute bottom-[13%] left-[10%] h-[2px] w-[46%] rotate-[-14deg] bg-white/35" />
    </>
  );
}

function FutsalCardAtmosphere() {
  return (
    <>
      <div className="absolute inset-x-0 bottom-0 h-[48%] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(8,28,46,0.72)_100%)]" />
      <div className="absolute inset-x-[10%] bottom-[12%] h-[42%] rounded-[28px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(21,77,124,0.12)_100%)]" />
      <div className="absolute bottom-[12%] left-[12%] right-[12%] h-[2px] bg-cyan-200/18" />
      <div className="absolute bottom-[12%] left-[50%] top-[46%] w-[2px] -translate-x-1/2 bg-cyan-200/18" />
      <div className="absolute bottom-[20%] left-[58%] h-[150px] w-[150px] rounded-full border border-cyan-100/15" />
      <div className="absolute right-[10%] top-[29%] h-[138px] w-[102px] rounded-[8px] border-[3px] border-cyan-200/35" />
      <div className="absolute right-[12%] top-[33%] h-[84px] w-[60px] rounded-[6px] border border-cyan-200/25" />
      <div className="absolute bottom-[14%] right-[12%] h-[150px] w-[150px] rounded-full border border-black/45 bg-[conic-gradient(from_0deg,_#f9fbff_0deg,_#f9fbff_22deg,_#0c4d92_22deg,_#0c4d92_46deg,_#f9fbff_46deg,_#f9fbff_82deg,_#113b71_82deg,_#113b71_106deg,_#f9fbff_106deg,_#f9fbff_146deg,_#0d457f_146deg,_#0d457f_176deg,_#f9fbff_176deg,_#f9fbff_220deg,_#0e3d73_220deg,_#0e3d73_248deg,_#f9fbff_248deg,_#f9fbff_360deg)] shadow-[0_16px_44px_rgba(0,0,0,0.48)]" />
    </>
  );
}
