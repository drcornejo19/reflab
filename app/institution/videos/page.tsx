"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import {
  CheckCircle2,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Share2,
  UploadCloud,
  Video,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  institutionalClipStatusLabels,
  type InstitutionalClipStatus,
} from "@/lib/institutionalExperience";

type InstitutionalClip = {
  id: string;
  title: string;
  description: string | null;
  match_context: string | null;
  incident_minute: string | null;
  category: string | null;
  topic: string | null;
  correct_decision: string | null;
  correct_restart: string | null;
  correct_discipline: string | null;
  final_expected_answer: string | null;
  explanation: string | null;
  ifab_var_criteria: string | null;
  difficulty: string | null;
  mode: string | null;
  is_public: boolean;
  status: InstitutionalClipStatus;
  review_notes: string | null;
  source_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  created_at: string;
};

type FormState = {
  title: string;
  source_url: string;
  description: string;
  match_context: string;
  incident_minute: string;
  category: string;
  topic: string;
  correct_decision: string;
  correct_restart: string;
  correct_discipline: string;
  final_expected_answer: string;
  explanation: string;
  ifab_var_criteria: string;
  difficulty: string;
  is_public: boolean;
};

const initialForm: FormState = {
  title: "",
  source_url: "",
  description: "",
  match_context: "",
  incident_minute: "",
  category: "",
  topic: "",
  correct_decision: "",
  correct_restart: "",
  correct_discipline: "",
  final_expected_answer: "",
  explanation: "",
  ifab_var_criteria: "",
  difficulty: "",
  is_public: false,
};

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-[#6fc11f]/50";

const statusTone: Record<InstitutionalClipStatus, string> = {
  uploaded: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  under_review: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  processing: "border-purple-500/30 bg-purple-500/10 text-purple-200",
  approved: "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#b7ff67]",
  rejected: "border-red-500/30 bg-red-500/10 text-red-200",
  published: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

export default function InstitutionVideosPage() {
  const { user, isLoaded } = useUser();
  const [clips, setClips] = useState<InstitutionalClip[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) return;
    void loadClips();
  }, [isLoaded, user]);

  const counts = useMemo(() => {
    return clips.reduce(
      (acc, clip) => {
        acc.total += 1;
        acc[clip.status] += 1;
        return acc;
      },
      {
        total: 0,
        uploaded: 0,
        under_review: 0,
        processing: 0,
        approved: 0,
        rejected: 0,
        published: 0,
      } as Record<InstitutionalClipStatus | "total", number>
    );
  }, [clips]);

  async function loadClips() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/videos", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        clips?: InstitutionalClip[];
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(data.technical || data.error || "No se pudieron cargar los clips.");
      }

      setClips(data.clips ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function submitClip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        body.append(key, typeof value === "boolean" ? String(value) : value);
      });
      body.append("mode", "institutional_video");
      if (videoFile) body.append("video_file", videoFile);

      const response = await fetch("/api/institution/videos", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        clip?: InstitutionalClip;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.clip) {
        throw new Error(data.technical || data.error || "No se pudo guardar el clip.");
      }

      setMessage("Clip recibido. Quedo pendiente para revision del equipo RefLab.");
      setForm(initialForm);
      setVideoFile(null);
      setClips((current) => [data.clip!, ...current]);
      event.currentTarget.reset();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded || !user) {
    return (
      <AppShell>
        <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso institucional...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            ASSOCIATION VIDEO LAB
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Gestion audiovisual institucional
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Para asociaciones: subi jugadas reales de tu competencia,
                completa la decision tecnica y dejalas listas para revision RefLab.
              </p>
            </div>
            <button
              type="button"
              onClick={loadClips}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black text-white transition hover:border-[#6fc11f]/40"
            >
              <RefreshCw size={18} />
              Actualizar
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total enviados" value={counts.total} />
          <Metric label="Pendientes" value={counts.uploaded + counts.under_review} />
          <Metric label="Aprobados" value={counts.approved} />
          <Metric label="Publicados" value={counts.published} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <form
            onSubmit={submitClip}
            className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                <UploadCloud size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Nuevo clip
                </p>
                <h2 className="mt-2 text-2xl font-black">Enviar video para revision</h2>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <Field label="Titulo del clip" required>
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className={inputClass}
                  placeholder="Ej: Falta tactica que corta un ataque prometedor"
                  required
                />
              </Field>

              <Field label="Archivo de video">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                  className={`${inputClass} file:mr-3 file:rounded-xl file:border-0 file:bg-[#6fc11f] file:px-3 file:py-2 file:text-xs file:font-black file:text-black`}
                />
              </Field>

              <Field label="URL del video, si ya esta alojado">
                <input
                  value={form.source_url}
                  onChange={(event) => updateForm("source_url", event.target.value)}
                  className={inputClass}
                  placeholder="Drive, Vercel Blob, Supabase Storage, YouTube privado..."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Topico arbitral">
                  <input
                    value={form.topic}
                    onChange={(event) => updateForm("topic", event.target.value)}
                    className={inputClass}
                    placeholder="Fuera de juego, manos, disputas, faltas tacticas, VAR..."
                  />
                </Field>
                <Field label="Minuto de la jugada">
                  <input
                    value={form.incident_minute}
                    onChange={(event) => updateForm("incident_minute", event.target.value)}
                    className={inputClass}
                    placeholder="Ej: 62:30"
                  />
                </Field>
                <Field label="Categoria">
                  <input
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className={inputClass}
                    placeholder="Primera, juvenil, regional..."
                  />
                </Field>
                <Field label="Dificultad">
                  <select
                    value={form.difficulty}
                    onChange={(event) => updateForm("difficulty", event.target.value)}
                    className={inputClass}
                  >
                    <option value="" className="bg-[#0b131b]">Sin definir</option>
                    <option value="basic" className="bg-[#0b131b]">Basica</option>
                    <option value="intermediate" className="bg-[#0b131b]">Intermedia</option>
                    <option value="advanced" className="bg-[#0b131b]">Avanzada</option>
                    <option value="elite" className="bg-[#0b131b]">Elite</option>
                  </select>
                </Field>
              </div>

              <Field label="Contexto competitivo">
                <textarea
                  value={form.match_context}
                  onChange={(event) => updateForm("match_context", event.target.value)}
                  className={`${inputClass} min-h-24 resize-y`}
                  placeholder="Partido, fase, contexto tactico, consecuencia de la jugada..."
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Decision tecnica">
                  <input
                    value={form.correct_decision}
                    onChange={(event) => updateForm("correct_decision", event.target.value)}
                    className={inputClass}
                    placeholder="Falta / no falta / offside..."
                  />
                </Field>
                <Field label="Reanudacion">
                  <input
                    value={form.correct_restart}
                    onChange={(event) => updateForm("correct_restart", event.target.value)}
                    className={inputClass}
                    placeholder="Seguir juego / TLI / penal..."
                  />
                </Field>
                <Field label="Disciplina">
                  <input
                    value={form.correct_discipline}
                    onChange={(event) => updateForm("correct_discipline", event.target.value)}
                    className={inputClass}
                    placeholder="Sin tarjeta / amarilla / roja"
                  />
                </Field>
              </div>

              <Field label="Respuesta correcta final">
                <textarea
                  value={form.final_expected_answer}
                  onChange={(event) => updateForm("final_expected_answer", event.target.value)}
                  className={`${inputClass} min-h-20 resize-y`}
                  placeholder="Decision final esperada para el ejercicio interactivo."
                />
              </Field>

              <Field label="Explicacion tecnica / criterios IFAB o VAR">
                <textarea
                  value={form.explanation}
                  onChange={(event) => updateForm("explanation", event.target.value)}
                  className={`${inputClass} min-h-28 resize-y`}
                  placeholder="Fundamento tecnico, protocolo VAR, punto de contacto, intensidad, APP..."
                />
              </Field>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(event) => updateForm("is_public", event.target.checked)}
                  className="mt-1 h-5 w-5 accent-[#6fc11f]"
                />
                <span>
                  <span className="block text-sm font-black text-white">
                    Compartir con otras instituciones
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    Si queda aprobado, RefLab puede incorporarlo a la biblioteca global.
                    Si no, queda privado para tu institucion.
                  </span>
                </span>
              </label>

              <div className="rounded-2xl border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-4 text-xs font-bold leading-5 text-[#d8ff9b]">
                En escuelas, los videos se limitan a fuera de juego, manos,
                disputas y faltas tacticas. En asociaciones tambien puede
                trabajarse VAR Lab y clips propios de mayor complejidad.
              </div>

              {message && (
                <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff67]">
                  {message}
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
                className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                {saving ? "Guardando..." : "Enviar a revision RefLab"}
              </button>
            </div>
          </form>

          <section className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Pipeline RefLab
                </p>
                <h2 className="mt-2 text-2xl font-black">Clips enviados</h2>
              </div>
              <Video className="text-[#6fc11f]" size={28} />
            </div>

            <div className="mt-6 grid gap-4">
              {loading ? (
                <div className="flex min-h-52 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] text-zinc-400">
                  <Loader2 className="mr-2 animate-spin" size={18} />
                  Cargando clips...
                </div>
              ) : clips.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-zinc-400">
                  Todavia no hay clips enviados. Carga el primer video para activar
                  el circuito de revision audiovisual.
                </div>
              ) : (
                clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)
              )}
            </div>
          </section>
        </section>
      </div>
    </AppShell>
  );

  function updateForm<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-[#6fc11f]">{value}</p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
        {required ? <span className="text-[#6fc11f]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function ClipCard({ clip }: { clip: InstitutionalClip }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-black">{clip.title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {clip.description || clip.match_context || "Sin descripcion cargada."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone[clip.status]}`}
        >
          {institutionalClipStatusLabels[clip.status]}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip label={clip.topic || "Topico s/d"} />
        <Chip label={clip.category || "Categoria s/d"} />
        <Chip label={clip.incident_minute ? `Min ${clip.incident_minute}` : "Minuto s/d"} />
        <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">
          {clip.is_public ? (
            <>
              <Share2 size={13} className="text-[#6fc11f]" />
              Compartible
            </>
          ) : (
            <>
              <LockKeyhole size={13} className="text-[#6fc11f]" />
              Privado
            </>
          )}
        </span>
      </div>

      {clip.review_notes ? (
        <div className="mt-4 rounded-2xl border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-3 text-xs leading-5 text-[#d8ff9b]">
          {clip.review_notes}
        </div>
      ) : null}

      {(clip.storage_path || clip.source_url) && (
        <div className="mt-4 flex items-center gap-2 text-xs font-bold text-zinc-500">
          <CheckCircle2 size={16} className="text-[#6fc11f]" />
          Video recibido
        </div>
      )}
    </article>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
      {label}
    </span>
  );
}
