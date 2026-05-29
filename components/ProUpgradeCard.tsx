import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";
import { proBenefits } from "@/lib/subscription";

type ProUpgradeCardProps = {
  title?: string;
  description?: string;
  reason?: string;
  compact?: boolean;
};

export function ProUpgradeCard({
  title = "Disponible en RefLab Pro",
  description = "Desbloquea la experiencia completa para medir tu evolucion, entrenar sin limites y trabajar como en un centro de alto rendimiento arbitral.",
  reason,
  compact = false,
}: ProUpgradeCardProps) {
  const benefits = compact ? proBenefits.slice(0, 5) : proBenefits.slice(0, 8);

  return (
    <section className="relative max-w-full overflow-hidden rounded-[30px] border border-[#6fc11f]/35 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.22),transparent_34%),#071019] p-5 shadow-2xl sm:p-6">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#b7ff8a] to-transparent" />

      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[#b7ff8a]">
            <LockKeyhole size={14} />
            RefLab Pro
          </div>

          <h2 className="mt-4 break-words text-2xl font-black leading-tight text-white sm:text-3xl">
            {title}
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
            {description}
          </p>

          {reason && (
            <p className="mt-3 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-3 text-sm font-bold leading-6 text-yellow-100">
              {reason}
            </p>
          )}
        </div>

        <Link
          href="/profile"
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
        >
          <Sparkles size={18} />
          Actualizar a Pro
        </Link>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((benefit) => (
          <div
            key={benefit}
            className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-zinc-200"
          >
            <span className="mr-2 text-[#6fc11f]">OK</span>
            {benefit}
          </div>
        ))}
      </div>
    </section>
  );
}
