"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Loader2,
  RefreshCw,
  Save,
  Share2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";
import {
  institutionalClipStatusLabels,
  institutionalClipStatuses,
  type InstitutionalClipStatus,
} from "@/lib/institutionalExperience";

type InstitutionalClip = {
  id: string;
  institution_id: string | null;
  uploaded_by: string;
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

type Draft = {
  status: InstitutionalClipStatus;
  is_public: boolean;
  topic: string;
  correct_decision: string;
  correct_restart: string;
  correct_discipline: string;
  final_expected_answer: string;
  explanation: string;
  ifab_var_criteria: string;
  review_notes: string;
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

export default function InstitutionalClipsAdminPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();
  const [clips, setClips] = useState<InstitutionalClip[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isVideoAdmin, loadingRole, router, user]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isVideoAdmin) return;
    void loadClips();
  }, [isLoaded, isVideoAdmin, loadingRole, user]);

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
      const response = await fetch("/api/admin/institutional-clips", {
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

      const nextClips = data.clips ?? [];
      setClips(nextClips);
      setDrafts(Object.fromEntries(nextClips.map((clip) => [clip.id, toDraft(clip)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function saveClip(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    setSavingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/institutional-clips", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...draft }),
      });
      const data = (await response.json()) as {
        clip?: InstitutionalClip;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.clip) {
        throw new Error(data.technical || data.error || "No se pudo actualizar el clip.");
      }

      setClips((current) => current.map((clip) => (clip.id === id ? data.clip! : clip)));
      setDrafts((current) => ({ ...current, [id]: toDraft(data.clip!) }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSavingId(null);
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

  if (!user || !isVideoAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB VIDEO REVIEW
          </p>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Clips institucionales
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Revision tecnica de videos aportados por instituciones: aprobar,
                rechazar, publicar y ajustar metadata.
              </p>
            </div>
            <button
              type="button"
              onClick={loadClips}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              <RefreshCw size={18} />
              Actualizar
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total" value={counts.total} />
          <Metric label="Pendientes" value={counts.uploaded + counts.under_review} />
          <Metric label="Aprobados" value={counts.approved} />
          <Metric label="Publicados" value={counts.published} />
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-[30px] border border-white/10 bg-[#0b131b] text-zinc-400">
            <Loader2 className="mr-2 animate-spin" size={20} />
            Cargando clips...
          </div>
        ) : clips.length === 0 ? (
          <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            Todavia no hay clips institucionales enviados.
          </div>
        ) : (
          <section className="grid gap-5">
            {clips.map((clip) => {
              const draft = drafts[clip.id] ?? toDraft(clip);
              return (
                <article
                  key={clip.id}
                  className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6"
                >
                  <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone[clip.status]}`}
                        >
                          {institutionalClipStatusLabels[clip.status]}
                        </span>
                        {clip.is_public ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#b7ff67]">
                            <Share2 size={13} />
                            Publicable
                          </span>
                        ) : null}
                      </div>

                      <h2 className="mt-4 break-words text-2xl font-black">{clip.title}</h2>
                      <p className="mt-3 text-sm leading-6 text-zinc-400">
                        {clip.match_context || clip.description || "Sin contexto cargado."}
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Info label="Topico" value={clip.topic || "s/d"} />
                        <Info label="Categoria" value={clip.category || "s/d"} />
                        <Info label="Minuto" value={clip.incident_minute || "s/d"} />
                        <Info label="Archivo" value={clip.original_filename || clip.source_url || clip.storage_path || "s/d"} />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Estado">
                          <select
                            value={draft.status}
                            onChange={(event) =>
                              updateDraft(clip.id, "status", event.target.value as InstitutionalClipStatus)
                            }
                            className={inputClass}
                          >
                            {institutionalClipStatuses.map((status) => (
                              <option key={status} value={status} className="bg-[#0b131b]">
                                {institutionalClipStatusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <label className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                          <input
                            type="checkbox"
                            checked={draft.is_public}
                            onChange={(event) =>
                              updateDraft(clip.id, "is_public", event.target.checked)
                            }
                            className="h-5 w-5 accent-[#6fc11f]"
                          />
                          <span className="text-sm font-black text-white">
                            Compartir en biblioteca global
                          </span>
                        </label>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Topico">
                          <input
                            value={draft.topic}
                            onChange={(event) => updateDraft(clip.id, "topic", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Decision tecnica">
                          <input
                            value={draft.correct_decision}
                            onChange={(event) =>
                              updateDraft(clip.id, "correct_decision", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Reanudacion">
                          <input
                            value={draft.correct_restart}
                            onChange={(event) =>
                              updateDraft(clip.id, "correct_restart", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Disciplina">
                          <input
                            value={draft.correct_discipline}
                            onChange={(event) =>
                              updateDraft(clip.id, "correct_discipline", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                      </div>

                      <Field label="Respuesta esperada">
                        <textarea
                          value={draft.final_expected_answer}
                          onChange={(event) =>
                            updateDraft(clip.id, "final_expected_answer", event.target.value)
                          }
                          className={`${inputClass} min-h-20 resize-y`}
                        />
                      </Field>

                      <Field label="Explicacion / criterios IFAB-VAR">
                        <textarea
                          value={draft.explanation}
                          onChange={(event) => updateDraft(clip.id, "explanation", event.target.value)}
                          className={`${inputClass} min-h-24 resize-y`}
                        />
                      </Field>

                      <Field label="Notas de revision RefLab">
                        <textarea
                          value={draft.review_notes}
                          onChange={(event) => updateDraft(clip.id, "review_notes", event.target.value)}
                          className={`${inputClass} min-h-20 resize-y`}
                          placeholder="Motivo de rechazo, ajuste necesario, aprobado con observaciones..."
                        />
                      </Field>

                      <button
                        type="button"
                        disabled={savingId === clip.id}
                        onClick={() => saveClip(clip.id)}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === clip.id ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <Save size={18} />
                        )}
                        Guardar revision
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AppShell>
  );

  function updateDraft<Key extends keyof Draft>(id: string, key: Key, value: Draft[Key]) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? toDraft(clips.find((clip) => clip.id === id)!)),
        [key]: value,
      },
    }));
  }
}

function toDraft(clip: InstitutionalClip): Draft {
  return {
    status: clip.status,
    is_public: clip.is_public,
    topic: clip.topic || "",
    correct_decision: clip.correct_decision || "",
    correct_restart: clip.correct_restart || "",
    correct_discipline: clip.correct_discipline || "",
    final_expected_answer: clip.final_expected_answer || "",
    explanation: clip.explanation || "",
    ifab_var_criteria: clip.ifab_var_criteria || "",
    review_notes: clip.review_notes || "",
  };
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-white">{value}</p>
    </div>
  );
}
