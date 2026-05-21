import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Megaphone,
  MonitorCheck,
  PlaySquare,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

type Feature = {
  title: string;
  icon: LucideIcon;
};

type StoryBlock = {
  title: string;
  text: string;
};

const features: Feature[] = [
  { title: "VAR", icon: MonitorCheck },
  { title: "Entrená", icon: ShieldCheck },
  { title: "Analizá", icon: PlaySquare },
  { title: "Decidí", icon: Target },
  { title: "Mejorá", icon: BarChart3 },
  { title: "Aprendé", icon: BookOpen },
];

const trainingAreas = [
  "Decisión arbitral",
  "Video análisis",
  "VAR Lab",
  "Inglés arbitral",
  "Comunicación y liderazgo",
  "Preparación del árbitro",
];

const storyBlocks: StoryBlock[] = [
  {
    title: "Qué es RefLab",
    text: "Una plataforma diseñada para profesionalizar el entrenamiento arbitral mediante simulación, análisis, evaluación y seguimiento del rendimiento.",
  },
  {
    title: "Qué problema resuelve",
    text: "El arbitraje amateur y semiprofesional muchas veces no cuenta con una estructura accesible, continua e integral para entrenar toma de decisiones, comunicación, preparación mental, análisis técnico y evolución individual.",
  },
  {
    title: "Nuestra visión",
    text: "Entrenar árbitros capaces de decidir mejor, comunicar mejor y evolucionar con datos.",
  },
];

export default function AboutPage() {
  return (
    <AppShell>
      <div className="space-y-5 pb-3 lg:space-y-7">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[#05070d] shadow-2xl">
          <div className="relative min-h-[360px] p-5 sm:p-7 lg:min-h-[560px] lg:p-10">
            <div className="absolute inset-0 opacity-30">
              <Image
                src="/reflab-hero.png"
                alt=""
                fill
                priority
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 1180px"
              />
            </div>

            <div className="relative flex min-h-[320px] flex-col justify-between lg:min-h-[500px]">
              <div className="flex justify-center lg:justify-start">
                <span className="rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Referee Decision Lab
                </span>
              </div>

              <div className="mx-auto max-w-[760px] text-center lg:mx-0 lg:text-left">
                <div className="flex items-center justify-center gap-3 lg:justify-start">
                  <Image
                    src="/logo.png"
                    alt="RefLab"
                    width={76}
                    height={76}
                    className="rounded-full shadow-[0_0_34px_rgba(111,193,31,0.24)]"
                    priority
                  />
                </div>

                <h1 className="mt-6 text-[54px] font-black leading-none tracking-normal text-white sm:text-[72px] lg:text-[126px]">
                  REF<span className="text-[#6fc11f]">LAB</span>
                </h1>

                <p className="mt-3 text-xs font-black uppercase tracking-[0.42em] text-white sm:text-sm">
                  Referee Decision Lab
                </p>

                <p className="mt-5 text-2xl font-black leading-tight text-white sm:text-3xl lg:text-5xl">
                  Entrená. Analizá. Decidí. Mejorá.
                </p>

                <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base lg:mx-0 lg:text-lg lg:leading-8">
                  RefLab es una plataforma integral de entrenamiento,
                  evaluación y desarrollo profesional para árbitros de fútbol.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:flex">
                  <Link
                    href="/dashboard"
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] active:scale-[0.98]"
                  >
                    Ir al Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <Link
                    href="/training"
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-white transition hover:bg-white/10 active:scale-[0.98]"
                  >
                    Comenzar entrenamiento
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className="rounded-[24px] border border-white/10 bg-[#101b24] p-4 text-center shadow-xl"
              >
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                  <Icon className="h-6 w-6" />
                </div>

                <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-white">
                  {feature.title}
                </p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {storyBlocks.map((block) => (
            <article
              key={block.title}
              className="rounded-[30px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl lg:p-6"
            >
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                {block.title}
              </p>

              <p className="mt-4 text-sm leading-7 text-zinc-300">
                {block.text}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Áreas de entrenamiento
              </p>

              <h2 className="mt-4 text-3xl font-black leading-tight lg:text-4xl">
                Un laboratorio completo para entrenar criterio arbitral.
              </h2>

              <p className="mt-4 text-sm leading-7 text-zinc-400">
                La plataforma combina clips, reglas, evaluaciones, comunicación,
                datos y desarrollo profesional en una experiencia diseñada para
                árbitros.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {trainingAreas.map((area) => (
                <div
                  key={area}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#6fc11f]" />
                  <span className="text-sm font-black text-zinc-200">
                    {area}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <IdentityCard
            icon={Brain}
            title="Preparación mental"
            text="Lectura, concentración, control emocional y preparación pre-partido."
          />
          <IdentityCard
            icon={Megaphone}
            title="Comunicación"
            text="Autoridad, liderazgo, manejo de protestas y explicación de decisiones."
          />
          <IdentityCard
            icon={Users}
            title="Desarrollo"
            text="Una estructura para crecer con evidencia, hábitos y seguimiento."
          />
        </section>
      </div>
    </AppShell>
  );
}

function IdentityCard({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-[28px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-5">
      <Icon className="h-8 w-8 text-[#6fc11f]" />
      <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p>
    </article>
  );
}
