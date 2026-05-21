import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

type UnderConstructionProps = {
  title: string;
  description: string;
  items?: string[];
  backHref?: string;
  backLabel?: string;
};

export function UnderConstruction({
  title,
  description,
  items = [],
  backHref = "/training",
  backLabel = "Volver a Entrenamiento",
}: UnderConstructionProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-[900px] items-center">
      <section className="w-full rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl md:p-8">
        <span className="inline-flex rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#6fc11f]">
          Módulo en desarrollo
        </span>

        <h1 className="mt-6 text-3xl font-black tracking-tight md:text-5xl">
          {title}
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
          {description}
        </p>

        {items.length > 0 && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
              Contenidos previstos
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-zinc-300"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6fc11f]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        <Link
          href={backHref}
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#6fc11f] px-5 py-3 text-sm font-black text-black transition hover:bg-[#82dc2a]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </section>
    </div>
  );
}
