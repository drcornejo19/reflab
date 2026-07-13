"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Languages,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { SportPageSwitch } from "@/components/SportPageSwitch";
import {
  officialLibraryDocuments,
  type OfficialLibraryDocument,
} from "@/lib/officialLibrary";
import {
  getLibraryTitleForSport,
  getSportDefinition,
} from "@/lib/sports";
import { useUserRole } from "@/lib/useUserRole";

export const dynamic = "force-dynamic";

type LibraryRecord = {
  id: string;
  title: string;
  sport_type: string;
  governing_body: string;
  category: string;
  language: string;
  season: string | null;
  published_at: string | null;
  source_official: string | null;
  source_version: string | null;
  effective_date: string | null;
  status: "vigente" | "proxima_actualizacion" | "archivado";
  summary: string | null;
  file_url: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type LibraryCard = {
  id: string;
  title: string;
  subtitle: string;
  language: string;
  type: string;
  href: string | null;
  status: "vigente" | "proxima_actualizacion" | "archivado";
  season: string;
  governingBody: string;
  origin: "official" | "admin";
};

const emptyDocuments: LibraryRecord[] = [];

export default function LearningPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando biblioteca..." />}>
      <LearningPageContent />
    </Suspense>
  );
}

function LearningPageContent() {
  const { currentDiscipline: sportType } = useDiscipline();
  const { isSuperAdmin } = useUserRole();
  const sportDefinition = getSportDefinition(sportType);
  const [documents, setDocuments] = useState<LibraryRecord[]>(emptyDocuments);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [language, setLanguage] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadLibrary() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/library?sport=${sportType}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          documents?: LibraryRecord[];
          error?: string;
          technical?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.technical || payload.error || "No se pudo cargar la biblioteca."
          );
        }

        if (!active) return;
        setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
      } catch (loadError) {
        if (!active) return;
        setDocuments([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar la biblioteca."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadLibrary();

    return () => {
      active = false;
    };
  }, [sportType]);

  const cards = useMemo(() => {
    const official = officialLibraryDocuments[sportType].map(mapOfficialDocument);
    const admin = documents.map(mapAdminDocument);
    return dedupeDocuments([...official, ...admin]);
  }, [documents, sportType]);

  const categories = useMemo(() => {
    return Array.from(new Set(cards.map((card) => card.type))).sort();
  }, [cards]);

  const languages = useMemo(() => {
    return Array.from(new Set(cards.map((card) => card.language))).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${card.title} ${card.subtitle} ${card.season}`.toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === "all" || card.type === category;
      const matchesLanguage = language === "all" || card.language === language;
      return matchesSearch && matchesCategory && matchesLanguage;
    });
  }, [cards, category, language, search]);

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
                {getLibraryTitleForSport(sportType)}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Documentacion reglamentaria oficial y material revisado para la disciplina seleccionada.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                  Temporada visible
                </p>
                <p className="mt-1 text-xl font-black">
                  {sportDefinition.library.activeSeasonLabel}
                </p>
              </div>

              {isSuperAdmin ? (
                <Link
                  href="/admin/library"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a]"
                >
                  <Upload size={18} />
                  Cargar material
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <SportPageSwitch title="Disciplina de biblioteca" />

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
                  Documentos oficiales
                </p>
                <h2 className="text-2xl font-black">
                  Fuente rectora: {sportDefinition.governingBody}
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-zinc-400">
              RefLab distingue la biblioteca de futbol 11 y la de futsal para no mezclar normativa ni temporadas.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-[#101b24] p-5 shadow-2xl">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Documentos" value={String(cards.length)} />
              <StatCard
                label="Oficiales"
                value={String(cards.filter((card) => card.origin === "official").length)}
              />
              <StatCard
                label="Revisados"
                value={String(cards.filter((card) => card.origin === "admin").length)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0f1a23] p-5 shadow-2xl">
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr_0.7fr]">
            <label className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                <Search size={14} />
                Buscar
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Titulo, resumen o temporada"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              />
            </label>

            <FilterSelect
              label="Categoria"
              value={category}
              onChange={setCategory}
              options={["all", ...categories]}
            />

            <FilterSelect
              label="Idioma"
              value={language}
              onChange={setLanguage}
              options={["all", ...languages]}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400"
              >
                {item}
              </span>
            ))}
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                Biblioteca
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {loading ? "Cargando documentos..." : `${filteredCards.length} documentos visibles`}
              </h2>
            </div>

            <a
              href={sportDefinition.library.officialSourceBase}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
            >
              Ver fuente oficial
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-400">
              Cargando biblioteca...
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-6 text-center">
              <p className="text-lg font-black text-white">Sin documentos para esos filtros</p>
              <p className="mt-2 text-sm text-zinc-400">
                Ajusta la busqueda o cambia la disciplina para ver otra biblioteca.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCards.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function mapOfficialDocument(document: OfficialLibraryDocument): LibraryCard {
  return {
    id: document.id,
    title: document.title,
    subtitle: document.subtitle,
    language: document.language,
    type: document.type,
    href: document.href,
    status: document.status,
    season: document.season,
    governingBody: document.governingBody,
    origin: "official",
  };
}

function mapAdminDocument(document: LibraryRecord): LibraryCard {
  return {
    id: document.id,
    title: document.title,
    subtitle: document.summary || "Documento cargado desde biblioteca institucional.",
    language: document.language || "Sin idioma",
    type: normalizeCategory(document.category),
    href: document.file_url || document.source_official,
    status: document.status,
    season: document.season || "Sin temporada",
    governingBody: document.governing_body,
    origin: "admin",
  };
}

function dedupeDocuments(cards: LibraryCard[]) {
  const map = new Map<string, LibraryCard>();

  cards.forEach((card) => {
    const key = `${card.title}-${card.season}-${card.language}`.toLowerCase();
    if (!map.has(key) || card.origin === "admin") {
      map.set(key, card);
    }
  });

  return Array.from(map.values());
}

function normalizeCategory(value: string) {
  const labels: Record<string, string> = {
    reglas: "Reglamento",
    circular: "Circular",
    resumen: "Resumen",
    protocolo_var: "VAR",
    cambios_reglamentarios: "Cambios",
    mundial: "Mundial",
    material_consulta: "Consulta",
  };

  return labels[value] ?? value;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-sm text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#071019]">
            {option === "all" ? "Todos" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DocumentCard({ document }: { document: LibraryCard }) {
  const statusTone =
    document.status === "vigente"
      ? "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#b7ff8a]"
      : document.status === "archivado"
        ? "border-white/10 bg-black/30 text-zinc-400"
        : "border-yellow-400/20 bg-yellow-400/10 text-yellow-200";

  return (
    <article className="rounded-3xl border border-white/10 bg-[#0f1a23] p-5 transition hover:border-[#6fc11f]/50 hover:bg-[#12202b]">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          {document.language.toLowerCase().includes("english") ? (
            <Languages className="h-6 w-6" />
          ) : (
            <FileText className="h-6 w-6" />
          )}
        </div>

        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusTone}`}>
          {document.status}
        </span>
      </div>

      <h3 className="mt-5 text-lg font-black text-white">{document.title}</h3>
      <p className="mt-2 min-h-[48px] text-sm leading-6 text-zinc-400">
        {document.subtitle}
      </p>

      <div className="mt-5 grid gap-2 text-xs text-zinc-500">
        <span>Temporada: {document.season}</span>
        <span>Idioma: {document.language}</span>
        <span>Organismo: {document.governingBody}</span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-bold text-zinc-500">{document.type}</span>

        {document.href ? (
          <a
            href={document.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#6fc11f]"
          >
            Abrir
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-zinc-500">
            Sin enlace
          </span>
        )}
      </div>

      {document.origin === "official" ? (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#6fc11f]/20 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-[#b7ff8a]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Fuente oficial
        </div>
      ) : null}
    </article>
  );
}
