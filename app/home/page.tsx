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
    label: "ENTRENÁ",
    href: "/training/field",
    icon: MonitorCheck,
  },
  {
    label: "ANALIZÁ",
    href: "/mobile-var",
    icon: Activity,
  },
  {
    label: "DECIDÍ",
    href: "/training/video-analysis",
    icon: Crosshair,
  },
  {
    label: "MEJORÁ",
    href: "/dashboard",
    icon: ChartNoAxesCombined,
  },
  {
    label: "APRENDÉ",
    href: "/learning",
    icon: BookOpen,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020b14] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-[1100px] flex-col items-center justify-center px-4 text-center">
        <div className="w-full">
          <h1 className="text-5xl font-black tracking-tight sm:text-7xl md:text-8xl">
            REF<span className="text-[#6fc11f]">LAB</span>
          </h1>

          <p className="mt-5 text-[10px] font-black tracking-[0.45em] text-zinc-400 sm:text-sm">
            REFEREE DECISION LAB
          </p>

          <div className="mx-auto mt-3 flex max-w-[220px] items-center justify-center gap-4">
            <div className="h-[2px] flex-1 bg-[#6fc11f]" />
            <div className="h-[2px] flex-1 bg-[#6fc11f]" />
          </div>

          <div className="mt-10 w-full overflow-x-auto pb-2 scrollbar-hide">
  <div className="mx-auto flex min-w-[720px] items-center justify-center">
            {heroItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <div key={item.href} className="flex items-center">
                  <Link
                    href={item.href}
                    className="group flex min-w-[86px] flex-col items-center justify-center gap-3 px-2 transition hover:scale-105 sm:min-w-[130px]"
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-2xl text-[#6fc11f] transition group-hover:bg-[#6fc11f]/10 group-hover:shadow-[0_0_30px_rgba(111,193,31,0.35)] sm:h-16 sm:w-16">
                      <Icon size={38} strokeWidth={2.4} />
                    </div>

                    <p className="text-[9px] font-black tracking-[0.32em] text-zinc-300 sm:text-sm">
                      {item.label}
                    </p>
                  </Link>

                  {index < heroItems.length - 1 && (
                    <div className="h-16 w-px bg-white/10" />
                  )}
                </div>
              );
            })}
          </div>
          </div>

          <p className="mt-12 text-xs font-black tracking-[0.45em] text-[#6fc11f] sm:text-lg">
            ENTRENÁ. ANALIZÁ. DECIDÍ. MEJORÁ.
          </p>
        </div>
      </section>
    </main>    
  );
}