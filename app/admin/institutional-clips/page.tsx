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
import {
  getGoverningBodyForSport,
  normalizeSportType,
  type SportType,
} from "@/lib/sports";
import { useUserRole } from "@/lib/useUserRole";
import {
  institutionalClipStatusLabels,
  institutionalClipStatuses,
  type InstitutionalClipStatus,
} from "@/lib/institutionalExperience";
import {
  getVideoTopicOptionsForSport,
  languageOptions,
  normativeStatusOptions,
  sportTypeOptions,
} from "@/lib/sportFormOptions";

type InstitutionalClip = {
  id: string;
  institution_id: string | null;
  uploaded_by: string;
  sport_type: string;
  title: string;
  description: string | null;
  match_context: string | null;
  incident_minute: string | null;
  category: string | null;
  topic: string | null;
  subtopic: string | null;
  rule_reference: string | null;
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
  season: string | null;
  source_version: string | null;
  source_official: string | null;
  governing_body: string | null;
  technical_resolution: string | null;
  disciplinary_resolution: string | null;
  normative_status: string | null;
  language: string | null;
  reviewed_at: string | null;
  source_url: string | null;
  storage_path: string | null;
  original_filename: string | null;
  created_at: string;
};

type Draft = {
  status: InstitutionalClipStatus;
  is_public: boolean;
  sport_type: SportType;
  topic: string;
  subtopic: string;
  rule_reference: string;
  correct_decision: string;
  correct_restart: string;
  correct_discipline: string;
  final_expected_answer: string;
  explanation: string;
  ifab_var_criteria: string;
  review_notes: string;
  season: string;
  source_version: string;
  source_official: string;
  governing_body: string;
  technical_resolution: string;
  disciplinary_resolution: string;
  normative_status: string;
  language: string;
  reviewed_at: string;
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
  const [sportFilter, setSportFilter] = useState<"all" | SportType>("all");
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

  const visibleClips = useMemo(() => {
    if (sportFilter === "all") return clips;

    return clips.filter(
      (clip) => normalizeSportType(clip.sport_type) === sportFilter
    );
  }, [clips, sportFilter]);

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

        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={sportFilter === "all"}
            label="Todas las disciplinas"
            onClick={() => setSportFilter("all")}
          />
          {sportTypeOptions.map((item) => (
            <FilterChip
              key={item.value}
              active={sportFilter === item.value}
              label={item.label}
              onClick={() => setSportFilter(item.value)}
            />
          ))}
        </div>

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
        ) : visibleClips.length === 0 ? (
          <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            Todavia no hay clips institucionales para este filtro.
          </div>
        ) : (
          <section className="grid gap-5">
            {visibleClips.map((clip) => {
              const draft = drafts[clip.id] ?? toDraft(clip);
              const draftSportType = normalizeSportType(draft.sport_type);
              const topicOptions = getVideoTopicOptionsForSport(draftSportType);
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
                        <Info
                          label="Disciplina"
                          value={clip.sport_type === "futsal" ? "Futsal" : "Futbol 11"}
                        />
                        <Info label="Topico" value={clip.topic || "s/d"} />
                        <Info label="Subtopico" value={clip.subtopic || "s/d"} />
                        <Info label="Categoria" value={clip.category || "s/d"} />
                        <Info label="Minuto" value={clip.incident_minute || "s/d"} />
                        <Info label="Archivo" value={clip.original_filename || clip.source_url || clip.storage_path || "s/d"} />
                        <Info label="Temporada" value={clip.season || "s/d"} />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Disciplina">
                          <select
                            value={draft.sport_type}
                            onChange={(event) => {
                              const nextSportType = event.target.value as SportType;
                              updateDraft(clip.id, "sport_type", nextSportType);
                              updateDraft(
                                clip.id,
                                "governing_body",
                                getGoverningBodyForSport(nextSportType)
                              );
                              updateDraft(clip.id, "topic", "");
                            }}
                            className={inputClass}
                          >
                            {sportTypeOptions.map((item) => (
                              <option key={item.value} value={item.value} className="bg-[#0b131b]">
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </Field>
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
                          <select
                            value={draft.topic}
                            onChange={(event) => updateDraft(clip.id, "topic", event.target.value)}
                            className={inputClass}
                          >
                            <option value="" className="bg-[#0b131b]">Seleccionar topico</option>
                            {topicOptions.map((option) => (
                              <option key={option.value} value={option.value} className="bg-[#0b131b]">
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Subtopico">
                          <input
                            value={draft.subtopic}
                            onChange={(event) => updateDraft(clip.id, "subtopic", event.target.value)}
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
                        <Field label="Referencia reglamentaria">
                          <input
                            value={draft.rule_reference}
                            onChange={(event) => updateDraft(clip.id, "rule_reference", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Organismo rector">
                          <input
                            value={draft.governing_body}
                            onChange={(event) =>
                              updateDraft(clip.id, "governing_body", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Temporada">
                          <input
                            value={draft.season}
                            onChange={(event) => updateDraft(clip.id, "season", event.target.value)}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Version fuente">
                          <input
                            value={draft.source_version}
                            onChange={(event) =>
                              updateDraft(clip.id, "source_version", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Fuente oficial">
                          <input
                            value={draft.source_official}
                            onChange={(event) =>
                              updateDraft(clip.id, "source_official", event.target.value)
                            }
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Idioma">
                          <select
                            value={draft.language}
                            onChange={(event) => updateDraft(clip.id, "language", event.target.value)}
                            className={inputClass}
                          >
                            {languageOptions.map((item) => (
                              <option key={item.value} value={item.value} className="bg-[#0b131b]">
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Estado normativo">
                          <select
                            value={draft.normative_status}
                            onChange={(event) =>
                              updateDraft(clip.id, "normative_status", event.target.value)
                            }
                            className={inputClass}
                          >
                            {normativeStatusOptions.map((item) => (
                              <option key={item.value} value={item.value} className="bg-[#0b131b]">
                                {item.label}
                              </option>
                            ))}
                          </select>
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

                      <Field label="Resolucion tecnica">
                        <textarea
                          value={draft.technical_resolution}
                          onChange={(event) =>
                            updateDraft(clip.id, "technical_resolution", event.target.value)
                          }
                          className={`${inputClass} min-h-20 resize-y`}
                        />
                      </Field>

                      <Field label="Resolucion disciplinaria">
                        <textarea
                          value={draft.disciplinary_resolution}
                          onChange={(event) =>
                            updateDraft(clip.id, "disciplinary_resolution", event.target.value)
                          }
                          className={`${inputClass} min-h-20 resize-y`}
                        />
                      </Field>

                      <Field label="Explicacion / criterios">
                        <textarea
                          value={draft.explanation}
                          onChange={(event) => updateDraft(clip.id, "explanation", event.target.value)}
                          className={`${inputClass} min-h-24 resize-y`}
                        />
                      </Field>

                      <Field label="Fecha de revision">
                        <input
                          type="date"
                          value={draft.reviewed_at}
                          onChange={(event) => updateDraft(clip.id, "reviewed_at", event.target.value)}
                          className={inputClass}
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
    sport_type: normalizeSportType(clip.sport_type),
    topic: clip.topic || "",
    subtopic: clip.subtopic || "",
    rule_reference: clip.rule_reference || "",
    correct_decision: clip.correct_decision || "",
    correct_restart: clip.correct_restart || "",
    correct_discipline: clip.correct_discipline || "",
    final_expected_answer: clip.final_expected_answer || "",
    explanation: clip.explanation || "",
    ifab_var_criteria: clip.ifab_var_criteria || "",
    review_notes: clip.review_notes || "",
    season: clip.season || "",
    source_version: clip.source_version || "",
    source_official: clip.source_official || "",
    governing_body:
      clip.governing_body ||
      getGoverningBodyForSport(normalizeSportType(clip.sport_type)),
    technical_resolution: clip.technical_resolution || "",
    disciplinary_resolution: clip.disciplinary_resolution || "",
    normative_status: clip.normative_status || "vigente",
    language: clip.language || "es",
    reviewed_at: clip.reviewed_at ? clip.reviewed_at.slice(0, 10) : "",
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

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition ${
        active
          ? "border-[#6fc11f]/40 bg-[#6fc11f]/10 text-[#b7ff67]"
          : "border-white/10 bg-black/20 text-zinc-400 hover:border-[#6fc11f]/30"
      }`}
    >
      {label}
    </button>
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
