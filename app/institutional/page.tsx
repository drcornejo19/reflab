import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  ClipboardCheck,
  GraduationCap,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Share2,
  UploadCloud,
  UsersRound,
  Video,
} from "lucide-react";
import { InstitutionalLeadForm } from "@/components/InstitutionalLeadForm";
import {
  activeInstitutionTypes,
  institutionalExperiences,
  institutionTypeLabels,
  type InstitutionType,
} from "@/lib/institutionalExperience";

const institutionUseCases = [
  {
    title: "Escuelas arbitrales",
    text: "Digitaliza clases, examenes, clips y seguimiento de alumnos con una metodologia moderna.",
    icon: GraduationCap,
  },
  {
    title: "Ligas",
    text: "Sostiene capacitacion continua, evaluaciones periodicas, videos y estadisticas para arbitros activos.",
    icon: Building2,
  },
  {
    title: "Asociaciones",
    text: "Prioriza video analisis, clips propios, VAR Lab, toma de decisiones y evaluaciones tecnicas avanzadas.",
    icon: Landmark,
  },
];

const platformFeatures = [
  "Panel institucional",
  "Seguimiento de arbitros",
  "Cohortes y grupos",
  "Evaluaciones formales",
  "Video analisis",
  "Biblioteca IFAB para escuelas",
  "Clips propios para asociaciones",
  "Licencias semestrales/anuales",
];

const modules = [
  { title: "Formacion", icon: ClipboardCheck },
  { title: "Evaluaciones", icon: ShieldCheck },
  { title: "Video analisis", icon: Video },
  { title: "Metricas", icon: BarChart3 },
  { title: "Cohortes", icon: UsersRound },
  { title: "Licencias", icon: BadgeCheck },
];

const institutionTypes: InstitutionType[] = activeInstitutionTypes;

const audiovisualFlow = [
  {
    title: "La institucion sube material real",
    text: "Video, contexto, minuto de la jugada, categoria, topico y decision esperada.",
    icon: UploadCloud,
  },
  {
    title: "RefLab revisa y procesa",
    text: "El equipo tecnico adapta el clip, corrige metadata y lo convierte en experiencia interactiva.",
    icon: ShieldCheck,
  },
  {
    title: "Privado o compartido",
    text: "Cada institucion decide si el clip queda privado o puede entrar a la biblioteca global RefLab.",
    icon: Share2,
  },
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
          <div className="grid h-16 w-16 place-items-center rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-lg font-black text-[#6fc11f] shadow-[0_0_34px_rgba(111,193,31,0.18)]">
            RF
          </div>
          <h1 className="mt-4 max-w-[760px] break-words text-4xl font-black leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-6xl">
            RefLab para instituciones arbitrales
          </h1>
          <p className="mt-5 max-w-[680px] text-base leading-7 text-zinc-300 sm:text-lg">
            Digitaliza, medi y profesionaliza la formacion arbitral de tu escuela, liga o asociacion.
          </p>
          <p className="mt-4 max-w-[680px] text-sm leading-6 text-zinc-500">
            Converti la formacion arbitral en un sistema medible, digital y escalable: reglas, evaluaciones, videos, programas academicos y seguimiento en una misma infraestructura.
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

          <div className="mt-4 grid w-full gap-3 sm:max-w-[520px] sm:grid-cols-2">
            <Link
              href="/demo/institution"
              className="flex min-h-12 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-5 text-xs font-black text-[#b7ff67] transition hover:border-[#6fc11f]"
            >
              Ver demo institucional
            </Link>
            <Link
              href="/demo/student"
              className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-xs font-black text-white transition hover:border-[#6fc11f]/40"
            >
              Ver demo como alumno
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

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-[#6fc11f]/20 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.15),transparent_42%),#0b131b] p-5 sm:p-7 lg:p-9">
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
            Experiencia adaptable
          </p>
          <h2 className="mt-4 max-w-[820px] text-3xl font-black leading-tight sm:text-4xl">
            RefLab cambia segun la realidad de cada institucion arbitral.
          </h2>
          <p className="mt-4 max-w-[820px] text-sm leading-7 text-zinc-400">
            Una escuela necesita formacion inicial. Una liga necesita continuidad.
            Una asociacion necesita entrenamiento tecnico avanzado. La plataforma prepara
            modulos, metricas y flujo operativo para cada perfil.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {institutionTypes.map((type) => {
              const profile = institutionalExperiences[type];
              return (
                <article
                  key={type}
                  className="rounded-[26px] border border-white/10 bg-white/[0.035] p-5"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6fc11f]">
                    {institutionTypeLabels[type]}
                  </p>
                  <h3 className="mt-4 text-xl font-black leading-tight">
                    {profile.headline}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {profile.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">
                      {profile.trainingLevel}
                    </span>
                    {profile.customVideoEnabled ? (
                      <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7ff67]">
                        Videos propios
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 rounded-[32px] border border-white/10 bg-[#0b131b] p-5 sm:p-7 lg:grid-cols-[0.8fr_1.2fr] lg:p-9">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
              Videos institucionales
            </p>
            <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
              Las asociaciones pueden trabajar con sus propios clips.
            </h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">
              RefLab no reemplaza la realidad competitiva de cada institucion:
              la convierte en material formativo, medible y reutilizable.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/institution/videos"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
              >
                Panel audiovisual
                <ArrowRight size={18} />
              </Link>
              <span className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-zinc-300">
                <LockKeyhole size={16} className="text-[#6fc11f]" />
                Privado o publico
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {audiovisualFlow.map((item) => {
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
            Programas, cupos y seguimiento academico en una misma estructura.
          </h2>
          <p className="mt-4 text-sm leading-7 text-zinc-400">
            RefLab permite vender pilotos, cohortes, licencias semestrales o anuales y planes de formacion digital para escuelas, ligas y asociaciones.
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

      <section className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 rounded-[32px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#b7ff67]">
              Demo institucional funcional
            </p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">
              Mostra como compra la institucion y como entrena cada alumno.
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Usa estas pantallas para presentar el modelo de licencias, cupos, instructores, cohortes y seguimiento.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[380px]">
            <Link
              href="/demo/institution"
              className="flex min-h-12 items-center justify-center rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              Demo institucion
            </Link>
            <Link
              href="/demo/student"
              className="flex min-h-12 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-black/20 px-4 text-sm font-black text-[#b7ff67] transition hover:border-[#6fc11f]"
            >
              Demo alumno
            </Link>
          </div>
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
