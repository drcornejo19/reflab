import Link from "next/link";
import {
  BookOpen,
  ChartNoAxesCombined,
  Crosshair,
  MonitorCheck,
  Activity,
} from "lucide-react";

const heroItems = [
  {
    label: "ENTRENA",
    href: "/training",
    icon: MonitorCheck,
  },
  {
    label: "ANALIZA",
    href: "/training/video-analysis",
    icon: Activity,
  },
  {
    label: "DECIDI",
    href: "/training/decision",
    icon: Crosshair,
  },
  {
    label: "MEJORA",
    href: "/dashboard",
    icon: ChartNoAxesCombined,
  },
  {
    label: "APRENDE",
    href: "/learning",
    icon: BookOpen,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-[100svh] w-full max-w-full overflow-hidden bg-[#020b14] text-white">
      <section className="mx-auto flex min-h-[100svh] w-full max-w-[1100px] flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
        <div className="w-full max-w-full">
          <h1 className="break-words text-5xl font-black tracking-tight sm:text-7xl md:text-8xl">
            REF<span className="text-[#6fc11f]">LAB</span>
          </h1>

          <p className="mt-4 break-words text-[10px] font-black uppercase tracking-[0.32em] text-zinc-400 sm:text-sm sm:tracking-[0.45em]">
            Referee Decision Lab
          </p>

          <div className="mx-auto mt-3 flex max-w-[220px] items-center justify-center gap-4">
            <div className="h-[2px] flex-1 bg-[#6fc11f]" />
            <div className="h-[2px] flex-1 bg-[#6fc11f]" />
          </div>

          <p className="mx-auto mt-6 max-w-[640px] text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7">
            Plataforma integral de entrenamiento, evaluacion y desarrollo profesional para arbitros de futbol.
          </p>

          <div className="mx-auto mt-8 grid w-full max-w-[840px] grid-cols-2 gap-3 min-[430px]:grid-cols-3 sm:grid-cols-5 sm:gap-4">
            {heroItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-white/[0.04] px-2 py-4 transition hover:-translate-y-1 hover:border-[#6fc11f]/50 hover:bg-[#6fc11f]/10 hover:shadow-[0_0_30px_rgba(111,193,31,0.22)] active:scale-95"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f] transition group-hover:bg-[#6fc11f]/20 sm:h-14 sm:w-14">
                    <Icon size={30} strokeWidth={2.4} />
                  </div>

                  <p className="max-w-full break-words text-center text-[10px] font-black tracking-[0.18em] text-zinc-300 sm:text-xs">
                    {item.label}
                  </p>
                </Link>
              );
            })}
          </div>

          <p className="mt-8 break-words text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f] sm:text-lg sm:tracking-[0.45em]">
            Entrena. Analiza. Decidi. Mejora.
          </p>

          <div className="mx-auto mt-8 grid w-full max-w-[520px] gap-3 sm:grid-cols-2">
            <Link
              href="/dashboard"
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] active:scale-95"
            >
              Ir al Dashboard
            </Link>
            <Link
              href="/training"
              className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f] active:scale-95"
            >
              Comenzar entrenamiento
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
