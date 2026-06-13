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
  "Decision arbitral",
  "Video analisis",
  "VAR Lab",
  "Comunicacion arbitral",
  "Preparacion del arbitro",
];

const storyBlocks: StoryBlock[] = [
  {
    title: "Que es",
    text: "Una plataforma disenada para profesionalizar el entrenamiento arbitral mediante simulacion, analisis, evaluacion y seguimiento del rendimiento.",
  },
  {
    title: "Que problema resuelve",
    text: "El arbitraje amateur y semiprofesional muchas veces no cuenta con una estructura accesible, continua e integral para entrenar toma de decisiones, comunicacion, preparacion mental, analisis tecnico y evolucion individual.",
  },
  {
    title: "Nuestra vision",
    text: "Entrenar arbitros capaces de decidir mejor, comunicar mejor y evolucionar con datos.",
  },
];

const originParagraphs = [
  "RefLab nace mucho antes de ser una plataforma. Nace en un cuartito, viendo la Regla 11 junto a mi padre, cuando el arbitraje aparecio en mi vida como una manera de empezar a construir algo propio.",
  "Lo que empezo por necesidad, con el tiempo se transformo en pasion, formacion y proposito. Desde mi ciudad natal, dentro de una estructura arbitral con poca infraestructura y muchas limitaciones, entendi que no siempre alcanza con tener ganas, saber el reglamento o esforzarse. Tambien hace falta acceso, guia, oportunidades y una estructura que acompane el crecimiento real del arbitro.",
  "Despues de formarme en una de las escuelas mas prestigiosas de Argentina, y de haber podido entrenar, capacitarme y recorrer categorias durante mas de 16 anos, comprendi que el arbitraje es mucho mas que tomar decisiones dentro de una cancha. Es lectura, comunicacion, liderazgo, percepcion, preparacion mental, manejo del conflicto, etica y capacidad de sostenerse bajo presion.",
  "RefLab nace para transformar esa experiencia en una herramienta para otros arbitros. Una plataforma pensada para profesionalizar el entrenamiento arbitral en todos los niveles, desde quienes recien empiezan hasta quienes buscan crecer en estructuras mas competitivas.",
];

export default function AboutPage() {
  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden pb-3 lg:space-y-7">
        <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.12),transparent_34%),#05070d] p-4 shadow-2xl sm:rounded-[34px] sm:p-7 lg:p-8">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center">
            <div className="order-2 text-center lg:order-1 lg:text-left">
              <h1 className="sr-only text-4xl font-black leading-none tracking-normal text-white sm:text-5xl lg:not-sr-only lg:text-6xl">
                Ref<span className="text-[#6fc11f]">Lab</span>
              </h1>

              <p className="hidden text-xs font-black uppercase tracking-[0.34em] text-zinc-400 sm:text-sm lg:mt-3 lg:block">
                Referee Decision Lab
              </p>

              <p className="mx-auto max-w-md break-words text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7 lg:mx-0 lg:mt-6 lg:text-lg lg:leading-8">
                Plataforma integral de entrenamiento, evaluacion y desarrollo profesional para arbitros de futbol.
              </p>

              <div className="mt-6 grid w-full gap-3 sm:grid-cols-2 lg:flex">
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

            <div className="order-1 flex items-center justify-center lg:order-2 lg:justify-end">
              <div className="relative w-full max-w-full overflow-hidden rounded-[24px] border border-[#6fc11f]/25 bg-[#02060b] shadow-[0_0_55px_rgba(111,193,31,0.13)] sm:max-w-[860px] sm:rounded-[26px]">
                <div className="relative aspect-[1536/448] w-full min-h-[96px] overflow-hidden rounded-[20px] min-[390px]:min-h-[116px] sm:min-h-[170px] sm:rounded-[22px] lg:min-h-0">
                  <Image
                    src="/reflab-wordmark-wide.png"
                    alt="Imagen institucional de RefLab"
                    fill
                    priority
                    className="object-contain p-2 sm:p-4"
                    sizes="(max-width: 768px) 100vw, 800px"
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
              className="min-w-0 rounded-[28px] border border-white/10 bg-[#0d1720] p-4 shadow-2xl transition hover:border-[#6fc11f]/30 sm:p-5 lg:p-6"
            >
              <p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f] sm:text-xs sm:tracking-[0.3em]">
                {block.title}
              </p>

              <p className="mt-4 text-sm leading-7 text-zinc-300">{block.text}</p>
            </article>
          ))}
        </section>

        <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[#071019] p-4 shadow-2xl sm:p-5 lg:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Areas de entrenamiento
              </p>

              <h2 className="mt-4 break-words text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">
                Un laboratorio completo para entrenar criterio arbitral.
              </h2>

              <p className="mt-4 text-sm leading-7 text-zinc-400">
                La plataforma combina clips, reglas, evaluaciones, comunicacion, datos y desarrollo profesional en una experiencia disenada para arbitros.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {trainingAreas.map((area) => (
                <div
                  key={area}
                  className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[#6fc11f]" />
                  <span className="min-w-0 break-words text-sm font-black text-zinc-200">{area}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_right,rgba(111,193,31,0.1),transparent_34%),#05070d] p-4 shadow-2xl sm:p-5 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Nuestra historia</p>

              <h2 className="mt-4 break-words text-2xl font-black leading-tight text-white sm:text-4xl lg:text-5xl">
                Como nacio RefLab
              </h2>

              <div className="mt-6 space-y-4 text-sm leading-7 text-zinc-300 sm:text-base sm:leading-8">
                {originParagraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <blockquote className="mt-7 border-l-4 border-[#6fc11f] pl-5 text-lg font-black leading-7 text-white lg:text-xl">
                &quot;RefLab existe para visualizar lo que no se ve y profesionalizar el camino del arbitro.&quot;
              </blockquote>

              <div className="mt-7">
                <p className="text-base font-black text-white">David Cornejo</p>
                <p className="mt-1 text-sm text-zinc-500">Arbitro de futbol - Fundador de RefLab</p>
              </div>
            </div>

            <FounderPhoto />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
