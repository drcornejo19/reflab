"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";
import {
  BookOpen,
  CalendarClock,
  ExternalLink,
  FileText,
  History,
  Languages,
  RefreshCw,
  ShieldCheck,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react";

type LibraryDocument = {
  title: string;
  subtitle: string;
  language: string;
  type: string;
  href?: string;
  icon: LucideIcon;
  status?: "vigente" | "proxima_actualizacion" | "archivado";
};

const documents: LibraryDocument[] = [
  {
    title: "Reglas de Juego 2025/26",
    subtitle: "Reglamento oficial IFAB en espanol para la temporada vigente.",
    language: "Espanol",
    type: "Reglamento",
    href: "https://www.theifab.com/es/laws-of-the-game-documents/",
    icon: BookOpen,
    status: "vigente",
  },
  {
    title: "Laws of the Game 2025/26",
    subtitle: "Official IFAB Laws of the Game in English.",
    language: "English",
    type: "Laws",
    href: "https://www.theifab.com/laws-of-the-game-documents/",
    icon: Languages,
    status: "vigente",
  },
  {
    title: "Protocolo VAR",
    subtitle: "Categorias revisables, APP, OFR y procedimientos oficiales.",
    language: "Espanol",
    type: "VAR",
    href: "https://www.theifab.com/es/laws/latest/video-assistant-referee-var-protocol/",
    icon: Video,
    status: "vigente",
  },
  {
    title: "Cambios 2025/26",
    subtitle: "Modificaciones oficiales publicadas para la temporada actual.",
    language: "Espanol",
    type: "Cambios",
    href: "https://www.theifab.com/es/law-changes/latest/",
    icon: RefreshCw,
    status: "vigente",
  },
  {
    title: "Circulares IFAB",
    subtitle: "Comunicaciones, aclaraciones y circulares oficiales.",
    language: "Multilenguaje",
    type: "Circulares",
    href: "https://www.theifab.com/es/documents/?documentType=circulars",
    icon: FileText,
    status: "vigente",
  },
  {
    title: "Historico IFAB",
    subtitle: "Reglamentos anteriores y documentos archivados.",
    language: "Multilenguaje",
    type: "Historico",
    href: "https://www.theifab.com/es/documents/",
    icon: History,
    status: "archivado",
  },
  {
    title: "Reglas IFAB 2026/2027",
    subtitle: "Disponible cuando IFAB publique el material oficial.",
    language: "Pendiente",
    type: "Proxima",
    icon: CalendarClock,
    status: "proxima_actualizacion",
  },
];

const quickSections = [
  {
    title: "Reglas vigentes",
    text: "Acceso rapido al reglamento IFAB publicado para la temporada activa.",
  },
  {
    title: "Circulares IFAB",
    text: "Espacio preparado para comunicaciones oficiales y aclaraciones reglamentarias.",
  },
  {
    title: "Protocolos VAR",
    text: "Consulta de protocolo, chequeos, OFR, APP y errores claros.",
  },
  {
    title: "Cambios reglamentarios",
    text: "Seguimiento por temporada sin publicar cambios no confirmados.",
  },
  {
    title: "Mundial",
    text: "Seccion lista para actualizaciones relevantes cuando exista fuente oficial.",
  },
  {
    title: "Resumenes por regla",
    text: "Material practico para convertir reglamento en estudio aplicado.",
  },
];

export default function LearningPage() {
  const { isSuperAdmin } = useUserRole();

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            REFLAB LIBRARY
          </p>

          <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                Biblioteca IFAB
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Centro reglamentario vivo para reglas, protocolo VAR,
                circulares, cambios de temporada y material de consulta.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                  Temporada vigente
                </p>
                <p className="mt-1 text-xl font-black">2025/26</p>
              </div>

              {isSuperAdmin && (
                <Link
                  href="/admin/library"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a]"
                >
                  <Upload size={18} />
                  Cargar material
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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

        <section className="rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Proxima actualizacion IFAB 2026/2027
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Seccion preparada, contenido pendiente
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Disponible cuando IFAB publique el material oficial. RefLab no
                muestra reglas, circulares ni cambios no confirmados.
              </p>
            </div>

            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-black/25 text-[#6fc11f]">
              <ShieldCheck size={28} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Documentos oficiales
              </p>
              <h2 className="mt-2 text-2xl font-black">
                IFAB, VAR, circulares y temporadas
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
            {documents.map((doc) => (
              <DocumentCard key={doc.title} document={doc} />
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101b24] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Criterio de publicacion
          </p>

          <p className="mt-3 text-sm leading-6 text-zinc-300">
            La biblioteca se organiza por temporada, categoria, idioma, fecha de
            vigencia, fuente oficial y estado. Los documentos pueden estar como
            vigente, proxima actualizacion o archivado para evitar material
            viejo mezclado con contenido actual.
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function DocumentCard({ document }: { document: LibraryDocument }) {
  const Icon = document.icon;
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon className="h-6 w-6" />
        </div>

        <span className="rounded-full bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
          {document.type}
        </span>
      </div>

      <h3 className="mt-5 text-lg font-black text-white">{document.title}</h3>

      <p className="mt-2 min-h-[48px] text-sm leading-6 text-zinc-400">
        {document.subtitle}
      </p>

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-bold text-zinc-500">
          {document.language}
        </span>

        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#6fc11f]">
          {document.href ? "Abrir" : "Pendiente"}
          {document.href && <ExternalLink className="h-3.5 w-3.5" />}
        </span>
      </div>
    </>
  );

  const cardClass =
    document.status === "proxima_actualizacion"
      ? "rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-5"
      : "rounded-3xl border border-white/10 bg-[#0f1a23] p-5 transition hover:border-[#6fc11f]/60 hover:bg-[#6fc11f]/10 hover:shadow-[0_0_28px_rgba(111,193,31,0.12)]";

  if (!document.href) {
    return <article className={cardClass}>{content}</article>;
  }

  return (
    <a
      href={document.href}
      target="_blank"
      rel="noreferrer"
      className={`group ${cardClass}`}
    >
      {content}
    </a>
  );
}
