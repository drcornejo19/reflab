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
      <section className="mx-auto max-w-2xl overflow-hidden rounded-[34px] border border-[#6fc11f]/35 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.24),transparent_35%),#071019] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.55)] sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
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

        <div className="mt-6 rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
            RefCard
          </p>
          <p className="mt-2 break-words text-2xl font-black text-[#b7ff8a]">
            {decodedRefCardId}
          </p>
        </div>

        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#6fc11f] px-5 font-black text-black sm:w-auto"
        >
          Ir a RefLab
        </Link>
      </section>
    </main>
  );
}
