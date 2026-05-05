import { AppShell } from "@/components/AppShell";
import { BookOpenCheck } from "lucide-react";

export default function RulesExamPage() {
  return (
    <AppShell>
      <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-7 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
          REGLAS DE JUEGO
        </p>

        <div className="mt-5 flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <BookOpenCheck size={34} />
          </div>

          <div>
            <h1 className="text-4xl font-black">Examen de Reglas</h1>
            <p className="mt-2 text-zinc-400">
              Próximamente: preguntas multiple choice con 4 opciones y estadísticas por regla.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}