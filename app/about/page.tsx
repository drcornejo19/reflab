import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AboutFeatureExplorer } from "@/components/AboutFeatureExplorer";
import { FounderPhoto } from "@/components/FounderPhoto";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type StoryBlock = {
  title: string;
  text: string;
};

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

const originParagraphs = [
  "RefLab nace mucho antes de ser una plataforma. Nace en un cuartito, viendo la Regla 11 junto a mi padre, cuando el arbitraje apareció en mi vida como una manera de empezar a construir algo propio.",
  "Lo que empezó por necesidad, con el tiempo se transformó en pasión, formación y propósito. Desde mi ciudad natal, dentro de una estructura arbitral con poca infraestructura y muchas limitaciones, entendí que no siempre alcanza con tener ganas, saber el reglamento o esforzarse. También hace falta acceso, guía, oportunidades y una estructura que acompañe el crecimiento real del árbitro.",
  "Después de formarme en una de las escuelas más prestigiosas de Argentina, y de haber podido entrenar, capacitarme y recorrer categorías durante más de 16 años, comprendí que el arbitraje es mucho más que tomar decisiones dentro de una cancha. Es lectura, comunicación, liderazgo, percepción, preparación mental, manejo del conflicto, ética y capacidad de sostenerse bajo presión.",
  "RefLab nace para transformar esa experiencia en una herramienta para otros árbitros. Una plataforma pensada para profesionalizar el entrenamiento arbitral en todos los niveles, desde quienes recién empiezan hasta quienes buscan crecer en estructuras más competitivas.",
];

export default function AboutPage() {
  return (
    <AppShell>
      <div className="space-y-5 pb-3 lg:space-y-7">
        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.12),transparent_34%),#05070d] p-5 shadow-2xl sm:p-7 lg:p-8">
          <div className="grid gap-7 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl font-black leading-none tracking-normal text-white sm:text-5xl lg:text-6xl">
                Ref<span className="text-[#6fc11f]">Lab</span>
              </h1>

              <p className="mt-3 text-xs font-black uppercase tracking-[0.34em] text-zinc-400 sm:text-sm">
                Referee Decision Lab
              </p>

              <p className="mx-auto mt-6 max-w-md text-base leading-7 text-zinc-300 lg:mx-0 lg:text-lg lg:leading-8">
                Plataforma integral de entrenamiento, evaluación y desarrollo
                profesional para árbitros de fútbol.
              </p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:flex">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] active:scale-[0.98]"
                >
                  Ir al Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/training"
                  className="inline-flex min-h-14 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-white transition hover:bg-white/10 active:scale-[0.98]"
                >
                  Comenzar entrenamiento
                </Link>
              </div>
            </div>

            <div className="flex items-center justify-center lg:-translate-y-6 lg:justify-end xl:-translate-y-7">
              <div className="relative w-full max-w-[820px] overflow-hidden rounded-[28px] border border-[#6fc11f]/25 bg-[#02060b] shadow-[0_0_55px_rgba(111,193,31,0.13)]">
                <div className="relative aspect-[1536/448] min-h-[152px] overflow-hidden rounded-[24px] sm:min-h-0">
                  <Image
                    src="/reflab-wordmark-wide.png"
                    alt="Imagen institucional de RefLab"
                    fill
                    priority
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 760px"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <AboutFeatureExplorer />

        <section className="grid gap-4 lg:grid-cols-3">
          {storyBlocks.map((block) => (
            <article
              key={block.title}
              className="rounded-[30px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl transition hover:border-[#6fc11f]/30 lg:p-6"
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

        <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_right,rgba(111,193,31,0.1),transparent_34%),#05070d] p-5 shadow-2xl lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Nuestra historia
              </p>

              <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                Cómo nació RefLab
              </h2>

              <div className="mt-6 space-y-4 text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                {originParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <blockquote className="mt-7 border-l-4 border-[#6fc11f] pl-5 text-lg font-black leading-7 text-white lg:text-xl">
                “RefLab existe para visualizar lo que no se ve y profesionalizar
                el camino del árbitro.”
              </blockquote>

              <div className="mt-7">
                <p className="text-base font-black text-white">David Cornejo</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Árbitro de fútbol — Fundador de RefLab
                </p>
              </div>
            </div>

            <FounderPhoto />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
