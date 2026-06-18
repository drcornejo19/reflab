"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Archive,
  BookOpen,
  ExternalLink,
  FileText,
  FileUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";

type LibraryDocument = {
  id: string;
  title: string;
  category: string;
  language: string;
  source_official: string | null;
  effective_date: string | null;
  status: string;
  summary: string | null;
  file_url: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

const categories = [
  { value: "reglas", label: "Reglas de Juego" },
  { value: "circular", label: "Circular IFAB" },
  { value: "resumen", label: "Resumen practico" },
  { value: "protocolo_var", label: "Protocolo VAR" },
  { value: "cambios_reglamentarios", label: "Cambios reglamentarios" },
  { value: "mundial", label: "Actualizacion Mundial" },
  { value: "material_consulta", label: "Material de consulta" },
];

const statuses = [
  { value: "vigente", label: "Vigente" },
  { value: "proxima_actualizacion", label: "Proxima actualizacion" },
  { value: "archivado", label: "Archivado" },
];

const languages = [
  { value: "es", label: "Espanol" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portugues" },
  { value: "multi", label: "Multilenguaje" },
];

export default function AdminLibraryPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isSuperAdmin, loadingRole } = useUserRole();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("reglas");
  const [language, setLanguage] = useState("es");
  const [status, setStatus] = useState("vigente");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [sourceOfficial, setSourceOfficial] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSuperAdmin, loadingRole, router, user]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isSuperAdmin) return;
    void loadDocuments();
  }, [isLoaded, isSuperAdmin, loadingRole, user]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/library", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.technical || data.error || "No se pudo cargar la biblioteca.");
      }

      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function saveDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/admin/library", {
        method: "POST",
        body: form,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.technical || data.error || "No se pudo guardar el documento.");
      }

      setDocuments((current) => [data.document, ...current]);
      setSuccess("Documento IFAB guardado correctamente.");
      setTitle("");
      setEffectiveDate("");
      setSourceOfficial("");
      setSummary("");
      setFileInputKey((value) => value + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.2),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            SUPER ADMIN
          </p>

          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Biblioteca IFAB
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Carga documentos oficiales, circulares, protocolos, resumenes y
                vigencias. La seccion 2026/2027 queda preparada sin publicar
                contenido hasta que IFAB lo confirme.
              </p>
            </div>

            <Link
              href="/learning"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white transition hover:bg-white/10"
            >
              <BookOpen size={18} />
              Ver Biblioteca
            </Link>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            onSubmit={saveDocument}
            className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                <FileUp size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Nuevo material
                </p>
                <h2 className="text-2xl font-black">Cargar documento</h2>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Titulo">
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder="Reglas de Juego IFAB 2025/26"
                  className="control-input"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Categoria">
                  <select
                    name="category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="control-input"
                  >
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Idioma">
                  <select
                    name="language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                    className="control-input"
                  >
                    {languages.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Estado">
                  <select
                    name="status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="control-input"
                  >
                    {statuses.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Fecha de vigencia">
                  <input
                    name="effective_date"
                    type="date"
                    value={effectiveDate}
                    onChange={(event) => setEffectiveDate(event.target.value)}
                    className="control-input"
                  />
                </Field>
              </div>

              <Field label="Fuente oficial">
                <input
                  name="source_official"
                  value={sourceOfficial}
                  onChange={(event) => setSourceOfficial(event.target.value)}
                  placeholder="https://www.theifab.com/..."
                  className="control-input"
                />
              </Field>

              <Field label="Resumen / nota interna">
                <textarea
                  name="summary"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  rows={4}
                  placeholder="Descripcion breve del documento o criterio de uso."
                  className="control-input min-h-28 py-3"
                />
              </Field>

              <Field label="PDF">
                <input
                  key={fileInputKey}
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white file:mr-4 file:rounded-xl file:border-0 file:bg-[#6fc11f] file:px-4 file:py-2 file:text-sm file:font-black file:text-black"
                />
              </Field>

              {success && (
                <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
                  {success}
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <FileUp size={18} />}
                {saving ? "Guardando..." : "Guardar documento IFAB"}
              </button>
            </div>
          </form>

          <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Documentos cargados
                </p>
                <h2 className="mt-2 text-2xl font-black">Archivo IFAB</h2>
              </div>

              <button
                type="button"
                onClick={loadDocuments}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-60"
              >
                <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
                Actualizar
              </button>
            </div>

            <div className="space-y-3">
              {loading && (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
                  Cargando documentos...
                </div>
              )}

              {!loading && documents.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
                  Todavia no hay documentos cargados.
                </div>
              )}

              {documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-2xl border border-white/10 bg-[#071019] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{categoryLabel(document.category)}</Badge>
                        <Badge>{statusLabel(document.status)}</Badge>
                        <Badge>{document.language.toUpperCase()}</Badge>
                      </div>
                      <h3 className="mt-3 break-words text-lg font-black text-white">
                        {document.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        {document.summary || "Sin resumen cargado."}
                      </p>
                    </div>

                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                      {document.status === "archivado" ? <Archive size={20} /> : <FileText size={20} />}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Vigencia: {document.effective_date || "No definida"}
                    </span>

                    <div className="flex flex-wrap gap-3">
                      {document.source_official && (
                        <a
                          href={document.source_official}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-black text-[#6fc11f]"
                        >
                          Fuente
                          <ExternalLink size={13} />
                        </a>
                      )}

                      {document.file_url && (
                        <a
                          href={document.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-black text-[#6fc11f]"
                        >
                          PDF
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#6fc11f]">
      {children}
    </span>
  );
}

function categoryLabel(value: string) {
  return categories.find((item) => item.value === value)?.label ?? value;
}

function statusLabel(value: string) {
  return statuses.find((item) => item.value === value)?.label ?? value;
}
