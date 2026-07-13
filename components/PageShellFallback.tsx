import { AppShell } from "@/components/AppShell";

export function PageShellFallback({
  message = "Cargando vista...",
}: {
  message?: string;
}) {
  return (
    <AppShell>
      <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
        {message}
      </div>
    </AppShell>
  );
}
