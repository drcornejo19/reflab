import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MatchesHubClient } from "@/components/MatchesHubClient";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const session = await auth();

  return (
    <AppShell>
      {!session.userId ? (
        <section className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-center shadow-2xl">
          <h1 className="text-3xl font-black text-white">Mis partidos</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
            Inicia sesion para registrar designaciones, preparar tus partidos y
            vincularlos con rendimiento, psicologia e historial.
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#6fc11f] px-6 font-black text-black"
          >
            Iniciar sesion
          </Link>
        </section>
      ) : (
        <MatchesHubClient />
      )}
    </AppShell>
  );
}
