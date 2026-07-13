import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SportDisciplineSwitch } from "@/components/SportDisciplineSwitch";
import {
  Activity,
  BookOpenCheck,
  ChevronRight,
  Clapperboard,
  LibraryBig,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type FutsalModule = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: "Disponible" | "Base lista" | "Proxima fase";
};

const futsalModules: FutsalModule[] = [
  {
    title: "Videoanalisis de futsal",
    description:
      "Clips especificos de futsal con formulario dinamico por topico, reinicio, disciplina, cuatro segundos y faltas acumuladas.",
    href: "/futsal/video-analysis",
    icon: Clapperboard,
    status: "Disponible",
  },
  {
    title: "Trivia de Reglas FIFA Futsal",
    description:
      "Preguntas practicas con feedback inmediato, explicacion y referencia reglamentaria oficial FIFA.",
    href: "/futsal/rules-practice",
    icon: BookOpenCheck,
    status: "Disponible",
  },
  {
    title: "Examen de Reglas de Futsal",
    description:
      "Modalidad formal sin feedback inmediato, con tiempo, resultado final y persistencia separada por disciplina.",
    href: "/futsal/rules-exam",
    icon: ShieldCheck,
    status: "Disponible",
  },
  {
    title: "Rendimiento de futsal",
    description:
      "Motor de metricas, radar tecnico y recomendaciones reales de futsal sincronizadas con Dashboard, Perfil y Ref Performance.",
    href: "/futsal/performance",
    icon: Activity,
    status: "Disponible",
  },
  {
    title: "Biblioteca de futsal",
    description:
      "Biblioteca FIFA Futsal con documentos oficiales, temporadas, estados y filtros separados de IFAB.",
    href: "/futsal/library",
    icon: LibraryBig,
    status: "Disponible",
  },
];

export default function FutsalPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <SportDisciplineSwitch
          title="Disciplina"
          items={[
            {
              key: "football_11",
              label: "Futbol 11",
              description:
                "Entrenamiento y evaluaciones del arbitraje tradicional de futbol 11.",
              href: "/training",
              active: false,
            },
            {
              key: "futsal",
              label: "Futsal",
              description:
                "Entrenamiento tecnico, reglamentario y audiovisual especifico para futsal.",
              href: "/futsal",
              active: true,
            },
          ]}
        />

        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB FUTSAL
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-5xl">Futsal</h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Entrenamiento tecnico, reglamentario y audiovisual especifico para
            futsal.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {[
              "Faltas y contactos",
              "Faltas acumuladas",
              "Cuatro segundos",
              "Guardameta",
              "Sustituciones",
              "Posicionamiento arbitral",
            ].map((item) => (
              <span
                key={item}
                className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#6fc11f]"
              >
                {item}
              </span>
            ))}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {futsalModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="group flex min-h-[250px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                    <module.icon size={30} />
                  </div>

                  <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
                    {module.status}
                  </span>
                </div>

                <h2 className="mt-6 text-2xl font-black">{module.title}</h2>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {module.description}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Abrir
                </span>
                <ChevronRight className="text-zinc-600 transition group-hover:translate-x-1 group-hover:text-[#6fc11f]" />
              </div>
            </Link>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
            Arquitectura preparada
          </p>
          <p className="mt-3 text-sm leading-7 text-zinc-300">
            El modulo queda listo para incorporar comunicacion arbitral de
            futsal, preparacion fisica, mecanica arbitral, posicionamiento,
            trabajo en equipo arbitral, manejo del cronometrador y tercer
            arbitro, portero-jugador y analisis institucional sin mezclar la
            disciplina con futbol 11.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
