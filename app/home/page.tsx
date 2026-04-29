"use client";

import Link from "next/link";
import { Monitor, Activity, Target, BarChart3, BookOpen } from "lucide-react";

const modules = [
  { href: "/training/var", label: "ENTRENÁ", Icon: Monitor },
  { href: "/training/english", label: "ANALIZÁ", Icon: Activity },
  { href: "/training/exam", label: "DECIDÍ", Icon: Target },
  { href: "/dashboard", label: "MEJORÁ", Icon: BarChart3 },
  { href: "/learning", label: "APRENDÉ", Icon: BookOpen },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020b14] text-white">
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.08),transparent_45%)]" />

        <div className="relative z-10 w-full max-w-6xl text-center">
          <h1 className="text-6xl font-black tracking-tight sm:text-7xl md:text-8xl">
            <span className="text-white">REF</span>
            <span className="text-[#6fc11f]">LAB</span>
          </h1>

          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.45em] text-zinc-400 sm:text-xs">
            Referee Decision Lab
          </p>

          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="h-[2px] w-16 bg-[#6fc11f]" />
            <div className="h-[2px] w-16 bg-[#6fc11f]" />
          </div>

          <nav className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-5 sm:grid-cols-3 lg:flex lg:items-center lg:justify-center lg:gap-10">
            {modules.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group relative flex min-h-32 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#6fc11f]/60 hover:bg-[#6fc11f]/10 lg:min-h-0 lg:border-0 lg:bg-transparent lg:p-0"
              >
                <Icon
                  size={46}
                  strokeWidth={2.2}
                  className="text-[#6fc11f] transition group-hover:scale-110"
                />

                <span className="mt-4 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-300 transition group-hover:text-[#6fc11f] sm:text-xs">
                  {label}
                </span>
              </Link>
            ))}
          </nav>

          <p className="mt-14 text-center text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f] sm:text-sm md:text-base">
            Entrená. Analizá. Decidí. Mejorá.
          </p>

          <Link
            href="/dashboard"
            className="mt-8 inline-flex rounded-2xl bg-[#6fc11f] px-6 py-3 text-sm font-black text-black transition hover:bg-[#82dc2a]"
          >
            Entrar al dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}