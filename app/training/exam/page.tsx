import { AppShell } from "@/components/AppShell";
import { ExamClient } from "@/components/ExamClient";

export default function ExamPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                RefLab Exam
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                Simulación de examen arbitral
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Respondé clips consecutivos sin feedback inmediato. Al final
                recibís tu score, nivel y análisis global con IA.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <HeaderStat label="Modo" value="Examen" />
              <HeaderStat label="Feedback" value="Final" />
              <HeaderStat label="IA" value="Post-test" />
            </div>
          </div>
        </header>

        <ExamClient />
      </div>
    </AppShell>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}