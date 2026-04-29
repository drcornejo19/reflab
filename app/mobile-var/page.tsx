import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { Languages, MonitorCheck } from "lucide-react";

export default function MobileVarPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-3xl font-black">VAR</h1>
        <p className="text-zinc-400">Elegí el modo de entrenamiento.</p>

        <div className="grid gap-4">
          <Link
            href="/training/var"
            className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-6"
          >
            <MonitorCheck className="text-[#6fc11f]" size={40} />
            <h2 className="mt-4 text-2xl font-black">Modo VAR</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Check, APP, OFR, factual review y error claro.
            </p>
          </Link>

          <Link
            href="/training/english"
            className="rounded-3xl border border-white/10 bg-[#101b24] p-6"
          >
            <Languages className="text-[#6fc11f]" size={40} />
            <h2 className="mt-4 text-2xl font-black">Modo Inglés</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Comunicación técnica arbitral en inglés.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}