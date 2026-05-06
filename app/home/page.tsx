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
    <main className="min-h-screen bg-[#020b14] px-4 py-6 text-white sm:px-5 sm:py-8">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1100px] flex-col items-center justify-center text-center">
        <div className="w-full rounded-[36px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_34%),#050b12] px-4 py-8 shadow-2xl sm:px-6 sm:py-10">
          <h1 className="text-5xl font-black tracking-tight sm:text-8xl lg:text-9xl">
            REF<span className="text-[#6fc11f]">LAB</span>
          </h1>

          <div className="mx-auto mt-5 flex max-w-[760px] items-center justify-center gap-3 sm:gap-4">
            <div className="h-[3px] flex-1 bg-[#6fc11f]" />

            <p className="text-[11px] font-black tracking-[0.35em] text-zinc-300 sm:text-xl sm:tracking-[0.45em]">
              REFEREE DECISION LAB
            </p>

            <div className="h-[3px] flex-1 bg-[#6fc11f]" />
          </div>

          <div className="mx-auto mt-10 flex w-full max-w-[980px] items-center justify-between gap-1 overflow-hidden rounded-[28px] border border-white/10 bg-black/20 px-2 py-5 sm:mt-12 sm:gap-2 sm:px-8">
            <HeroItem
              icon={<MonitorCheck />}
              label="ENTRENÁ"
            />

            <Divider />

            <HeroItem
              icon={<Siren />}
              label="ANALIZÁ"
            />

            <Divider />

            <HeroItem
              icon={<Crosshair />}
              label="DECIDÍ"
            />

            <Divider />

            <HeroItem
              icon={<ChartNoAxesCombined />}
              label="MEJORÁ"
            />

            <Divider />

            <HeroItem
              icon={<BookOpen />}
              label="APRENDÉ"
            />
          </div>

          <p className="mt-10 text-sm font-black tracking-[0.28em] text-[#6fc11f] sm:mt-12 sm:text-lg sm:tracking-[0.35em]">
            ENTRENÁ. ANALIZÁ. DECIDÍ. MEJORÁ.
          </p>

          <Link
            href="/training"
            className="mx-auto mt-10 flex h-14 w-full max-w-[360px] items-center justify-center rounded-2xl bg-[#6fc11f] px-8 text-base font-black text-black shadow-[0_0_35px_rgba(111,193,31,0.3)] transition hover:bg-[#82dc2a] sm:h-16 sm:text-lg"
          >
            ENTRAR A MÓDULOS
          </Link>
        </div>
      </section>
    </main>
  );
}

function Divider() {
  return (
    <div className="hidden h-16 w-px bg-white/10 sm:block" />
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
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 px-1 text-center">
      <div className="text-[#6fc11f] [&_svg]:h-7 [&_svg]:w-7 sm:[&_svg]:h-14 sm:[&_svg]:w-14">
        {icon}
      </div>

      <p className="text-[8px] font-black tracking-[0.18em] text-zinc-300 sm:text-sm sm:tracking-[0.25em]">
        {label}
      </p>
    </div>
  );
}