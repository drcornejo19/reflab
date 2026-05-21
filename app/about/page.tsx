import { AppShell } from "@/components/AppShell";
import { HowRefLabWasBorn } from "@/components/HowRefLabWasBorn";

export default function AboutPage() {
  return (
    <AppShell>
      <main className="min-h-screen bg-[#020b14] px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <HowRefLabWasBorn />
        </div>
      </main>
    </AppShell>
  );
}