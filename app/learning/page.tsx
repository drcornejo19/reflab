import { AppShell } from "@/components/AppShell";
import {
  BookOpen,
  Languages,
  Video,
  FileText,
  History,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

const documents = [
  {
    title: "Reglas de Juego 2025/26",
    subtitle: "Reglamento oficial IFAB en español.",
    language: "Español",
    type: "Reglamento",
    href: "https://www.theifab.com/es/laws-of-the-game-documents/",
    icon: BookOpen,
  },
  {
    title: "Laws of the Game 2025/26",
    subtitle: "Official IFAB Laws of the Game in English.",
    language: "English",
    type: "Laws",
    href: "https://www.theifab.com/laws-of-the-game-documents/",
    icon: Languages,
  },
  {
    title: "Protocolo VAR",
    subtitle: "Categorías revisables, APP, OFR y procedimientos.",
    language: "Español",
    type: "VAR",
    href: "https://www.theifab.com/es/laws/latest/video-assistant-referee-var-protocol/",
    icon: Video,
  },
  {
    title: "Cambios 2025/26",
    subtitle: "Modificaciones oficiales de la temporada actual.",
    language: "Español",
    type: "Cambios",
    href: "https://www.theifab.com/es/law-changes/latest/",
    icon: RefreshCw,
  },
  {
    title: "Circulares IFAB",
    subtitle: "Comunicaciones y aclaraciones oficiales.",
    language: "Multilenguaje",
    type: "Circulares",
    href: "https://www.theifab.com/es/documents/?documentType=circulars",
    icon: FileText,
  },
  {
    title: "Histórico IFAB",
    subtitle: "Reglamentos anteriores y documentos archivados.",
    language: "Multilenguaje",
    type: "Histórico",
    href: "https://www.theifab.com/es/documents/",
    icon: History,
  },
];

const quickSections = [
  {
    title: "Reglas vigentes",
    text: "Acceso rápido al reglamento IFAB actualizado de la temporada actual.",
  },
  {
    title: "VAR",
    text: "Protocolo oficial para chequeos, revisiones, APP y errores claros.",
  },
  {
    title: "Actualizaciones",
    text: "Circulares, cambios y documentos oficiales publicados por IFAB.",
  },
];

export default function LearningPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Library
          </p>

          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                Biblioteca IFAB
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Reglamento actualizado, protocolo VAR, cambios oficiales y
                circulares para consulta arbitral.
              </p>
            </div>

            <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                Temporada vigente
              </p>
              <p className="mt-1 text-xl font-black">2025/26</p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {quickSections.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-[#101b24] p-4"
            >
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {item.text}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Documentos oficiales
              </p>
              <h2 className="mt-2 text-2xl font-black">
                IFAB · Reglamento · VAR · Circulares
              </h2>
            </div>

            <a
              href="https://www.theifab.com/es/documents/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
            >
              Ver todo en IFAB
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => {
              const Icon = doc.icon;

              return (
                <a
                  key={doc.title}
                  href={doc.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-3xl border border-white/10 bg-[#0f1a23] p-5 transition hover:border-[#6fc11f]/60 hover:bg-[#6fc11f]/10 hover:shadow-[0_0_28px_rgba(111,193,31,0.12)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                      <Icon className="h-6 w-6" />
                    </div>

                    <span className="rounded-full bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
                      {doc.type}
                    </span>
                  </div>

                  <h3 className="mt-5 text-lg font-black text-white">
                    {doc.title}
                  </h3>

                  <p className="mt-2 min-h-[48px] text-sm leading-6 text-zinc-400">
                    {doc.subtitle}
                  </p>

                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-xs font-bold text-zinc-500">
                      {doc.language}
                    </span>

                    <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#6fc11f]">
                      Abrir
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Recomendación técnica
          </p>

          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Para mantener la biblioteca actualizada todos los años, no conviene
            guardar una sola URL fija como definitiva. Lo ideal es manejar
            documentos por temporada: 2025/26, 2026/27, histórico y marcar cuál
            es la temporada vigente.
          </p>
        </section>
      </div>
    </AppShell>
  );
}