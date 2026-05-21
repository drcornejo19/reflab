import { AppShell } from "@/components/AppShell";
import { TrainingClient } from "@/components/TrainingClient";

export default function VarPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab VAR
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            VAR Lab
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Practicá protocolo VAR, OFR, APP, errores claros y obvios,
            factual vs interpretativo y decisión final.
          </p>
        </header>

        <TrainingClient mode="var" />
      </div>
    </AppShell>
  );
}
