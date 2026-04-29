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
    <main className="min-h-screen bg-[#020b14] text-white flex flex-col items-center justify-center px-6 overflow-hidden">
      <div className="text-center mb-14">
        <h1 className="text-7xl md:text-8xl font-extrabold tracking-tight">
          <span className="text-white">REF</span>
          <span className="text-[#6fc11f]">LAB</span>
        </h1>

        <p className="mt-4 text-sm tracking-[0.35em] text-gray-400">
          REFEREE DECISION LAB
        </p>

        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="w-16 h-[2px] bg-[#6fc11f]" />
          <div className="w-16 h-[2px] bg-[#6fc11f]" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-10 md:gap-14">
        {modules.map(({ href, label, Icon }, i) => (
          <Link
            key={i}
            href={href}
            className="group flex flex-col items-center gap-4 relative"
          >
            <div className="relative flex items-center justify-center">
              <div className="absolute top-[63%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-[#6fc11f] opacity-0 blur-2xl transition-all duration-300 group-hover:opacity-40" />

              <Icon
                size={48}
                strokeWidth={2.2}
                className="text-[#6fc11f] transition-all duration-300 group-hover:scale-110"
              />
            </div>

            <span className="text-xs tracking-[0.4em] text-gray-300 group-hover:text-[#6fc11f] transition">
              {label}
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-16 text-sm md:text-base tracking-[0.4em] text-[#6fc11f] text-center">
        ENTRENÁ. ANALIZÁ. DECIDÍ. MEJORÁ.
      </p>
    </main>
  );
}