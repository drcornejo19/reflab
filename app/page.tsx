"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/dashboard");
    }, 2200);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#030712] text-white">
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.12),transparent_35%)]" />
        <div className="absolute bottom-0 h-48 w-full bg-gradient-to-t from-[#173a0d]/45 to-transparent" />

        <section className="relative z-10 flex animate-splashIn flex-col items-center">
          <div className="relative grid h-40 w-40 place-items-center rounded-full border-[6px] border-[#6fc11f] shadow-[0_0_45px_rgba(111,193,31,0.35)]">
            <div className="absolute -top-2 h-5 w-8 bg-[#030712]" />
            <div className="absolute -bottom-2 h-5 w-8 bg-[#030712]" />

            <div className="text-6xl font-black tracking-tighter">
              <span className="text-white">R</span>
              <span className="text-[#6fc11f]">F</span>
            </div>
          </div>

          <div className="mt-16 text-center">
            <h1 className="text-5xl font-black tracking-tight">
              <span className="text-white">REF</span>
              <span className="text-[#6fc11f]">LAB</span>
            </h1>

            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.45em] text-zinc-400">
              Referee Decision Lab
            </p>

            <div className="mx-auto mt-3 h-[2px] w-28 bg-[#6fc11f]" />
          </div>

          <p className="mt-14 animate-pulse text-center text-xs font-black uppercase tracking-[0.5em] text-[#6fc11f]">
            Entrená. Analizá. Decidí. Mejorá.
          </p>
        </section>
      </div>
    </main>
  );
}