import { AppShell } from "@/components/AppShell";
import { TrainingClient } from "@/components/TrainingClient";

export default function VarPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-full space-y-5 overflow-hidden lg:max-w-[1180px]">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-4 shadow-2xl sm:p-5">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
            RefLab VAR
          </p>

          <h1 className="mt-3 break-words text-2xl font-black leading-tight tracking-tight md:text-4xl">
            VAR Lab
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Practica protocolo VAR, OFR, APP, errores claros y obvios,
            factual vs interpretativo y decision final.
          </p>
        </header>

        <TrainingClient mode="var" />
      </div>
    </AppShell>
  );
}

