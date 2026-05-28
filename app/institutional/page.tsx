import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardCheck,
  Gauge,
  GraduationCap,
  Landmark,
  Layers3,
  ShieldCheck,
  UsersRound,
  Video,
} from "lucide-react";
import { InstitutionalLeadForm } from "@/components/InstitutionalLeadForm";

const problemCards = [
  {
    title: "Formacion dispersa",
    text: "Muchas estructuras dependen de clases aisladas, archivos sueltos y seguimiento manual.",
    icon: Layers3,
  },
  {
    title: "Evaluacion poco medible",
    text: "Cuesta comparar evolucion, detectar patrones y sostener criterios comunes entre grupos.",
    icon: BarChart3,
  },
  {
    title: "Falta de continuidad",
    text: "El arbitro entrena, rinde y aprende en espacios separados, sin una lectura integral.",
    icon: Gauge,
  },
];

const institutionUseCases = [
  {
    title: "Escuelas arbitrales",
    text: "Digitaliza clases, examenes, clips y seguimiento de alumnos con una metodologia moderna.",
    icon: GraduationCap,
  },
  {
    title: "Asociaciones y ligas",
    text: "Organiza cohortes, mide rendimiento y estandariza criterios tecnicos para tus arbitros.",
    icon: Building2,
  },
  {
    title: "Federaciones",
    text: "Escala evaluaciones, contenidos y analitica de rendimiento con una plataforma institucional.",
    icon: Landmark,
  },
];

const platformFeatures = [
  "Panel institucional",
  "Seguimiento de arbitros",
  "Cohortes y grupos",
  "Evaluaciones formales",
  "Video analisis",
  "VAR Lab",
  "Ref Performance",
  "Licencias semestrales/anuales",
];

const modules = [
  { title: "Entrenamiento", icon: ClipboardCheck },
  { title: "Evaluaciones", icon: ShieldCheck },
  { title: "Video analisis", icon: Video },
  { title: "Metricas", icon: BarChart3 },
  { title: "Cohortes", icon: UsersRound },
  { title: "Licencias", icon: BadgeCheck },
];

export default function InstitutionalPage() {
  return (
    <main className="min-h-screen w-full max-w-full overflow-hidden bg-[#020b14] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-20%] top-[-10%] h-[420px] w-[420px] rounded-full bg-[#6fc11f]/10 blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[-16%] h-[460px] w-[460px] rounded-full bg-[#6fc11f]/8 blur-[130px]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1180px] items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href="/home" className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-sm font-black text-[#6fc11f] shadow-[0_0_24px_rgba(111,193,31,0.16)]">
            RF
          </div>
          <div className="min-w-0">
            <p className="text-lg font-black leading-none">
              REF<span className="text-[#6fc11f]">LAB</span>
            </p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Referee Decision Lab
            </p>
          </div>
        </Link>

        <Link
          href="/sign-in"
          className="hidden min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f] sm:flex"
        >
          Acceso individual
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-[1180px] gap-8 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#6fc11f]">
            Solucion B2B
          </p>
          <h1 className="mt-4 max-w-[760px] break-words text-4xl font-black leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-6xl">
            RefLab para instituciones arbitrales
          </h1>
          <p className="mt-5 max-w-[680px] text-base leading-7 text-zinc-300 sm:text-lg">
            Digitaliza, medi y profesionaliza la formacion arbitral de tu escuela, asociacion, liga o federacion.
          </p>
          <p className="mt-4 max-w-[680px] text-sm leading-6 text-zinc-500">
            Converti la formacion arbitral en un sistema medible, digital y escalable: contenido, evaluaciones, video analisis, rendimiento y seguimiento en una misma infraestructura.
          </p>

          <div className="mt-8 grid w-full gap-3 sm:max-w-[520px] sm:grid-cols-2">
            <a
              href="#demo-institucional"
              className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] active:scale-[0.98]"
            >
              Solicitar demo institucional
              <ArrowRight size={18} />
            </a>
            <Link
              href="/home"
              className="flex min-h-13 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f] active:scale-[0.98]"
            >
              Ver acceso individual
            </Link>
          </div>
        </div>

        <div className="min-w-0 rounded-[34px] border border-[#6fc11f]/25 bg-[#071019]/90 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.5)] sm:p-6">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-500">
              Panel institucional
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {modules.map((module) => {
                const Icon = module.icon;
                return (
                  <div
                    key={module.title}
                    className="min-h-[118px] rounded-3xl border border-white/10 bg-[#0d1720] p-4"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                      <Icon size={22} />
                    </div>
                    <p className="mt-4 text-sm font-black">{module.title}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full w-2/3 rounded-full bg-[#6fc11f]" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid w-full max-w-[1180px] gap-4 px-4 py-6 sm:px-6 md:grid-cols-3 lg:px-8">
        {problemCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="rounded-[28px] border border-white/10 bg-[#0b131b] p-5"
            >
              <Icon className="text-[#6fc11f]" size={26} />
              <h2 className="mt-5 text-xl font-black">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">{card.text}</p>
            </article>
          );
        })}
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/10 bg-[#0b131b] p-5 sm:p-7 lg:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
            Implementacion
          </p>
          <h2 className="mt-4 max-w-[760px] text-3xl font-black leading-tight sm:text-4xl">
            Una plataforma para ordenar la formacion, medir progreso y escalar criterios.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {institutionUseCases.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                    <Icon size={24} />
                  </div>
                  <h3 className="mt-5 text-lg font-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid w-full max-w-[1180px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
            Licencias institucionales
          </p>
          <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
            B2B no es solo acceso: es infraestructura metodologica.
          </h2>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            RefLab permite vender pilotos, cohortes, licencias semestrales o anuales y planes de formacion digital para escuelas, asociaciones y federaciones.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {platformFeatures.map((feature) => (
            <div
              key={feature}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4"
            >
              <BadgeCheck className="shrink-0 text-[#6fc11f]" size={20} />
              <span className="text-sm font-black text-zinc-100">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      <section
        id="demo-institucional"
        className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-14 pt-8 sm:px-6 lg:px-8"
      >
        <InstitutionalLeadForm />
      </section>
    </main>
  );
}
