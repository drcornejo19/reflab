import { AppShell } from "@/components/AppShell";
import { ExamClient } from "@/components/ExamClient";

export default function ExamPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-full space-y-5 overflow-hidden lg:max-w-[1180px]">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-4 shadow-2xl sm:p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="break-words text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
                RefLab Exam
              </p>

              <h1 className="mt-3 break-words text-2xl font-black leading-tight tracking-tight md:text-4xl">
                Examen arbitral
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Responde clips consecutivos sin feedback inmediato. Al final
                recibis tu score, nivel y analisis global con IA.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-center min-[360px]:grid-cols-3 md:gap-3">
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
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:px-4">
      <p className="break-words text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500 sm:text-[10px] sm:tracking-[0.2em]">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}
