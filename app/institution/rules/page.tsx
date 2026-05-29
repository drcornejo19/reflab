import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, TriangleAlert, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { institutionalRules } from "@/lib/institutionalRules";

export default function InstitutionRulesPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            Escuela arbitral
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="break-words text-3xl font-black sm:text-5xl">
                Biblioteca resumida IFAB
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Resumen pedagogico para alumnos en formacion inicial. No reemplaza
                el texto oficial IFAB: ayuda a estudiar conceptos, puntos clave y
                errores frecuentes.
              </p>
            </div>
            <Link
              href="/training/rules-exam"
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              Rendir examen
              <ArrowRight size={18} />
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {institutionalRules.map((rule) => (
            <article
              key={rule.number}
              className="rounded-[28px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-sm font-black text-[#6fc11f]">
                  {rule.number}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
                    Regla {rule.number}
                  </p>
                  <h2 className="mt-2 break-words text-xl font-black">{rule.title}</h2>
                </div>
              </div>

              <p className="mt-5 text-sm leading-6 text-zinc-300">
                {rule.simpleExplanation}
              </p>

              <div className="mt-5 grid gap-4">
                <RuleBlock
                  icon={BookOpen}
                  title="Conceptos principales"
                  items={rule.mainConcepts}
                />
                <RuleBlock
                  icon={CheckCircle2}
                  title="Puntos clave"
                  items={rule.keyPoints}
                />
                <RuleBlock
                  icon={TriangleAlert}
                  title="Errores frecuentes"
                  items={rule.commonMistakes}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b7ff67]">
                  Resumen rapido
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-zinc-200">
                  {rule.quickSummary}
                </p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function RuleBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[#6fc11f]" />
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-sm font-semibold leading-5 text-zinc-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
