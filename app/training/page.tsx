import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import {
  ClipboardCheck,
  PlaySquare,
  BookOpenCheck,
  ChevronRight,
} from "lucide-react";

const modules = [
  {
    title: "Modo Entrenamiento",
    subtitle: "Practicá decisiones técnicas con clips de juego.",
    href: "/training/field",
    icon: ClipboardCheck,
    tag: "Decisión arbitral",
  },
  {
    title: "Video Análisis",
    subtitle: "Analizá jugadas, fundamentos y criterios de decisión.",
    href: "/training/video-analysis",
    icon: PlaySquare,
    tag: "Análisis técnico",
  },
  {
    title: "Examen Reglas de Juego",
    subtitle: "Respondé preguntas tipo multiple choice sobre reglas IFAB.",
    href: "/training/rules-exam",
    icon: BookOpenCheck,
    tag: "4 opciones",
  },
];

export default function TrainingPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB MODULES
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-6xl">
            Centro de Entrenamiento
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">
            Elegí un módulo para entrenar decisiones, analizar videos o responder
            preguntas sobre las Reglas de Juego.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <Link
                key={module.href}
                href={module.href}
                className="group rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
              >
                <div className="flex items-center justify-between">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                    <Icon size={30} />
                  </div>

                  <ChevronRight className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
                </div>

                <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                  {module.tag}
                </p>

                <h2 className="mt-3 text-2xl font-black">{module.title}</h2>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {module.subtitle}
                </p>
              </Link>
            );
          })}
        </section>
      </div>
    </AppShell>
  );
}