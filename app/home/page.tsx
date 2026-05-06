import Link from "next/link";
import {
  BookOpen,
  ChartNoAxesCombined,
  Crosshair,
  MonitorCheck,
  Siren,
} from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#020b14] px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1100px] flex-col items-center justify-center text-center">
        <div className="w-full rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_34%),#050b12] px-6 py-10 shadow-2xl">
          <h1 className="text-6xl font-black tracking-tight sm:text-8xl lg:text-9xl">
            REF<span className="text-[#6fc11f]">LAB</span>
          </h1>

          <div className="mx-auto mt-5 flex max-w-[760px] items-center justify-center gap-4">
            <div className="h-[3px] flex-1 bg-[#6fc11f]" />
            <p className="text-sm font-black tracking-[0.45em] text-zinc-300 sm:text-xl">
              REFEREE DECISION LAB
            </p>
            <div className="h-[3px] flex-1 bg-[#6fc11f]" />
          </div>

          <div className="mx-auto mt-12 grid max-w-[820px] grid-cols-5 gap-3">
            <HeroItem icon={<MonitorCheck />} label="ENTRENÁ" />
            <HeroItem icon={<Siren />} label="ANALIZÁ" />
            <HeroItem icon={<Crosshair />} label="DECIDÍ" />
            <HeroItem icon={<ChartNoAxesCombined />} label="MEJORÁ" />
            <HeroItem icon={<BookOpen />} label="APRENDÉ" />
          </div>

          <p className="mt-12 text-lg font-black tracking-[0.35em] text-[#6fc11f]">
            ENTRENÁ. ANALIZÁ. DECIDÍ. MEJORÁ.
          </p>

          <Link
            href="/training"
            className="mx-auto mt-10 flex h-16 max-w-[360px] items-center justify-center rounded-2xl bg-[#6fc11f] px-8 font-black text-black shadow-[0_0_35px_rgba(111,193,31,0.3)] transition hover:bg-[#82dc2a]"
          >
            ENTRAR A MÓDULOS
          </Link>
        </div>
      </section>
    </main>
  );
}

function HeroItem({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-r border-white/15 last:border-r-0">
      <div className="text-[#6fc11f] [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-14 sm:[&_svg]:w-14">
        {icon}
      </div>
      <p className="text-[10px] font-black tracking-[0.25em] text-zinc-300 sm:text-sm">
        {label}
      </p>
    </div>
  );
}