import Link from "next/link";

export default async function PublicRefCardPage({
  params,
}: {
  params: Promise<{ refCardId: string }>;
}) {
  const { refCardId } = await params;
  const decodedRefCardId = decodeURIComponent(refCardId);

  return (
    <main className="min-h-screen bg-[#050b12] px-4 py-10 text-white">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(163,230,53,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_38%),#071019] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-8">
        <p className="bg-gradient-to-r from-lime-300 to-sky-300 bg-clip-text text-xs font-black uppercase tracking-[0.35em] text-transparent">
          RefCard RefLab
        </p>
        <h1 className="mt-4 break-words text-3xl font-black sm:text-5xl">
          Credencial arbitral
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-300">
          Esta URL queda preparada como punto publico de validacion para la RefCard.
          La informacion publica del arbitro se mostrara aca cuando se active la vista
          de verificacion completa.
        </p>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
            RefCard
          </p>
          <p className="mt-2 break-words bg-gradient-to-r from-lime-300 to-sky-300 bg-clip-text text-2xl font-black text-transparent">
            {decodedRefCardId}
          </p>
        </div>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-lime-300 to-sky-300 px-5 font-black text-[#04110a] sm:w-auto"
        >
          Ir a RefLab
        </Link>
      </section>
    </main>
  );
}
