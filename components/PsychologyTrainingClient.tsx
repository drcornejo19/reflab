"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  Flame,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

type CheckInType = "pre_match" | "post_match" | "error_recovery";

type PsychologyFeedback = {
  summary: string;
  focus: string;
  action: string;
  risk: string;
};

type PsychologyEntry = {
  id: string;
  checkin_type: CheckInType;
  mental_score: number | null;
  mental_status: string | null;
  activation_score: number | null;
  confidence_score: number | null;
  pressure_score: number | null;
  concentration_score: number | null;
  emotional_control_score: number | null;
  mental_fatigue_score: number | null;
  error_impact_score: number | null;
  recovery_score: number | null;
  process_orientation_score: number | null;
  feedback: PsychologyFeedback | null;
  created_at: string;
};

type PsychologySummary = {
  total: number;
  average: number | null;
  latestScore: number | null;
  latestStatus: string | null;
  latestType: CheckInType | null;
  pressureAverage: number | null;
  confidenceAverage: number | null;
  recoveryAverage: number | null;
};

type FormState = {
  checkinType: CheckInType;
  matchContext: string;
  pressureSource: string;
  focusGoal: string;
  resetCue: string;
  incidentMinute: string;
  incidentSummary: string;
  errorFactors: string[];
  learning: string;
  nextAction: string;
  activationScore: number;
  confidenceScore: number;
  pressureScore: number;
  concentrationScore: number;
  emotionalControlScore: number;
  mentalFatigueScore: number;
  errorImpactScore: number;
  recoveryScore: number;
  processOrientationScore: number;
  notes: string;
};

type IconType = ComponentType<{ size?: number; className?: string }>;

const modeConfig: Record<
  CheckInType,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    icon: IconType;
  }
> = {
  pre_match: {
    label: "Pre partido",
    eyebrow: "Preparacion mental",
    title: "Llegar listo para decidir",
    description: "Activacion, confianza, foco y presion antes de competir.",
    icon: Target,
  },
  post_match: {
    label: "Post partido",
    eyebrow: "Cierre emocional",
    title: "Analizar y cerrar pagina",
    description: "Separar resultado, critica y aprendizaje para el proximo partido.",
    icon: CheckCircle2,
  },
  error_recovery: {
    label: "Gestion del error",
    eyebrow: "Del error al aprendizaje",
    title: "Reconstruir sin culpa",
    description: "Detectar factores, recuperar foco y convertir la situacion en mejora.",
    icon: RefreshCcw,
  },
};

const initialForm: FormState = {
  checkinType: "pre_match",
  matchContext: "",
  pressureSource: "Partido exigente",
  focusGoal: "Ver, interpretar y decidir la siguiente accion",
  resetCue: "Respiro, miro zona activa y vuelvo al juego",
  incidentMinute: "",
  incidentSummary: "",
  errorFactors: [],
  learning: "",
  nextAction: "",
  activationScore: 6,
  confidenceScore: 7,
  pressureScore: 5,
  concentrationScore: 7,
  emotionalControlScore: 7,
  mentalFatigueScore: 4,
  errorImpactScore: 5,
  recoveryScore: 6,
  processOrientationScore: 7,
  notes: "",
};

const pressureOptions = [
  "Partido exigente",
  "Jugadores",
  "Banco tecnico",
  "Publico",
  "Redes / medios",
  "Designacion importante",
  "Error anterior",
];

const errorFactorOptions = [
  "Fatiga",
  "Ubicacion",
  "Presion externa",
  "Comunicacion",
  "Interpretacion",
  "Contexto del partido",
  "Ayuda VAR / asistente",
];

export function PsychologyTrainingClient() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [checkins, setCheckins] = useState<PsychologyEntry[]>([]);
  const [summary, setSummary] = useState<PsychologySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPsychologyData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/psychology", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudo cargar Psicologia Arbitral.");
        }

        setCheckins(data.checkins ?? []);
        setSummary(data.summary ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Psicologia Arbitral.");
      } finally {
        setLoading(false);
      }
    }

    void loadPsychologyData();
  }, []);

  const latestFeedback = checkins[0]?.feedback ?? null;
  const mode = modeConfig[form.checkinType];
  const ModeIcon = mode.icon;
  const localScore = useMemo(() => estimateLocalScore(form), [form]);

  function setMode(nextMode: CheckInType) {
    setForm((current) => ({
      ...current,
      checkinType: nextMode,
    }));
    setMessage(null);
    setError(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toggleErrorFactor(factor: string) {
    setForm((current) => ({
      ...current,
      errorFactors: current.errorFactors.includes(factor)
        ? current.errorFactors.filter((item) => item !== factor)
        : [...current.errorFactors, factor],
    }));
  }

  async function saveCheckIn() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/psychology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_checkin",
          payload: {
            ...form,
            incidentMinute: form.incidentMinute ? Number(form.incidentMinute) : null,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el check-in.");
      }

      setCheckins(data.checkins ?? []);
      setSummary(data.summary ?? null);
      setMessage(data.message ?? "Check-in guardado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Psicologia arbitral
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight md:text-5xl">
              Preparacion mental del arbitro
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Rutinas breves para foco, confianza, presion, cierre post partido y aprendizaje despues del error.
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
            <div className="mb-2 flex items-center gap-2 font-black">
              <AlertTriangle size={18} />
              Orientativo
            </div>
            No reemplaza acompanamiento profesional. Si hay malestar persistente, buscá apoyo especializado.
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Brain} label="Readiness mental" value={formatScore(summary?.latestScore)} detail={summary?.latestStatus ?? "Sin registros"} active />
        <MetricCard icon={Flame} label="Presion promedio" value={formatScale(summary?.pressureAverage)} detail="Ultimos check-ins" />
        <MetricCard icon={ShieldCheck} label="Confianza" value={formatScale(summary?.confidenceAverage)} detail="Promedio personal" />
        <MetricCard icon={Sparkles} label="Recuperacion" value={formatScale(summary?.recoveryAverage)} detail={`${summary?.total ?? 0} registros`} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {(Object.keys(modeConfig) as CheckInType[]).map((key) => {
              const item = modeConfig[key];
              const Icon = item.icon;
              const active = form.checkinType === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded-[26px] border p-4 text-left transition ${
                    active
                      ? "border-[#6fc11f]/60 bg-[#6fc11f]/15 shadow-[0_0_28px_rgba(111,193,31,0.14)]"
                      : "border-white/10 bg-[#101b24] hover:border-[#6fc11f]/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                      <Icon size={22} />
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      MVP
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                    {item.eyebrow}
                  </p>
                  <h2 className="mt-2 text-lg font-black text-white">{item.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
                </button>
              );
            })}
          </div>

          <article className="rounded-[28px] border border-white/10 bg-[#071019] p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
              Feedback actual
            </p>
            {latestFeedback ? (
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                <p className="text-xl font-black text-white">{latestFeedback.summary}</p>
                <p>{latestFeedback.focus}</p>
                <p>{latestFeedback.action}</p>
                <p className="text-[#b7ff8a]">{latestFeedback.risk}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                Guarda tu primer check-in para recibir una devolucion basada en foco, presion, confianza y recuperacion.
              </p>
            )}
          </article>
        </div>

        <div className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                {mode.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-black">{mode.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{mode.description}</p>
            </div>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <ModeIcon size={28} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Field label="Contexto / partido">
              <input
                value={form.matchContext}
                onChange={(event) => updateField("matchContext", event.target.value)}
                placeholder="Ej: final cerrado, clasico, debut, partido normal"
                className="control-input"
              />
            </Field>

            <Field label="Fuente principal de presion">
              <select
                value={form.pressureSource}
                onChange={(event) => updateField("pressureSource", event.target.value)}
                className="control-input"
              >
                {pressureOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {form.checkinType === "error_recovery" && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[160px_1fr]">
              <Field label="Minuto">
                <input
                  type="number"
                  min={0}
                  max={130}
                  value={form.incidentMinute}
                  onChange={(event) => updateField("incidentMinute", event.target.value)}
                  className="control-input"
                />
              </Field>
              <Field label="Situacion">
                <input
                  value={form.incidentSummary}
                  onChange={(event) => updateField("incidentSummary", event.target.value)}
                  placeholder="Que paso en la jugada o decision"
                  className="control-input"
                />
              </Field>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ScaleControl label="Activacion" value={form.activationScore} low="Baja" high="Muy alta" onChange={(value) => updateField("activationScore", value)} />
            <ScaleControl label="Confianza" value={form.confidenceScore} low="Fragil" high="Solida" onChange={(value) => updateField("confidenceScore", value)} />
            <ScaleControl label="Presion" value={form.pressureScore} low="Baja" high="Alta" onChange={(value) => updateField("pressureScore", value)} />
            <ScaleControl label="Concentracion" value={form.concentrationScore} low="Dispersa" high="Foco total" onChange={(value) => updateField("concentrationScore", value)} />
            <ScaleControl label="Control emocional" value={form.emotionalControlScore} low="Inestable" high="Sereno" onChange={(value) => updateField("emotionalControlScore", value)} />
            <ScaleControl label="Fatiga mental" value={form.mentalFatigueScore} low="Baja" high="Alta" onChange={(value) => updateField("mentalFatigueScore", value)} />
          </div>

          {form.checkinType !== "pre_match" && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ScaleControl label="Recuperacion" value={form.recoveryScore} low="Arrastro carga" high="Cierro bien" onChange={(value) => updateField("recoveryScore", value)} />
              <ScaleControl label="Orientacion al proceso" value={form.processOrientationScore} low="Resultado/opinion" high="Proceso" onChange={(value) => updateField("processOrientationScore", value)} />
            </div>
          )}

          {form.checkinType === "error_recovery" && (
            <>
              <div className="mt-5 rounded-[26px] border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                  Factores posibles
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {errorFactorOptions.map((factor) => {
                    const active = form.errorFactors.includes(factor);
                    return (
                      <button
                        key={factor}
                        type="button"
                        onClick={() => toggleErrorFactor(factor)}
                        className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                          active
                            ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                            : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#6fc11f]/40"
                        }`}
                      >
                        {factor}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <ScaleControl label="Impacto del error" value={form.errorImpactScore} low="Bajo" high="Alto" onChange={(value) => updateField("errorImpactScore", value)} />
              </div>
            </>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Field label={form.checkinType === "pre_match" ? "Objetivo de proceso" : "Aprendizaje"}>
              <textarea
                value={form.checkinType === "pre_match" ? form.focusGoal : form.learning}
                onChange={(event) =>
                  form.checkinType === "pre_match"
                    ? updateField("focusGoal", event.target.value)
                    : updateField("learning", event.target.value)
                }
                rows={4}
                className="control-input min-h-28 resize-none"
              />
            </Field>

            <Field label={form.checkinType === "pre_match" ? "Frase de reset" : "Proxima accion"}>
              <textarea
                value={form.checkinType === "pre_match" ? form.resetCue : form.nextAction}
                onChange={(event) =>
                  form.checkinType === "pre_match"
                    ? updateField("resetCue", event.target.value)
                    : updateField("nextAction", event.target.value)
                }
                rows={4}
                className="control-input min-h-28 resize-none"
              />
            </Field>
          </div>

          <div className="mt-5">
            <Field label="Notas privadas">
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={3}
                placeholder="Detalle libre para revisar despues"
                className="control-input min-h-24 resize-none"
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                Lectura estimada
              </p>
              <p className="mt-1 text-3xl font-black">{localScore}/100</p>
            </div>
            <button
              type="button"
              onClick={saveCheckIn}
              disabled={saving}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
            >
              <Save size={20} />
              {saving ? "Guardando..." : "Guardar check-in"}
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
              {error}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <ClipboardList size={24} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
              Historial
            </p>
            <h2 className="text-2xl font-black">Ultimos registros</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Cargando registros...
            </div>
          )}

          {!loading && checkins.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Todavia no hay check-ins psicologicos guardados.
            </div>
          )}

          {!loading &&
            checkins.slice(0, 8).map((entry) => (
              <article key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[170px_1fr_120px] md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6fc11f]">
                    {modeConfig[entry.checkin_type]?.label ?? "Check-in"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(entry.created_at)}</p>
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  {entry.feedback?.focus ?? "Registro guardado."}
                </p>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                  <p className="text-xl font-black text-white">{formatScore(entry.mental_score)}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    {entry.mental_status ?? "Estado"}
                  </p>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  active = false,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <article className={`rounded-[26px] border p-4 shadow-2xl ${active ? "border-[#6fc11f]/40 bg-[#6fc11f]/10" : "border-white/10 bg-[#101b24]"}`}>
      <Icon className="text-[#6fc11f]" size={24} />
      <p className="mt-4 text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#6fc11f]">{detail}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ScaleControl({
  label,
  value,
  low,
  high,
  onChange,
}: {
  label: string;
  value: number;
  low: string;
  high: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">{label}</p>
        <span className="rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-1 text-xs font-black text-[#6fc11f]">
          {value}/10
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full accent-[#6fc11f]"
      />
      <div className="mt-2 flex justify-between text-[11px] font-bold text-zinc-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function estimateLocalScore(form: FormState) {
  let score = 70;
  score -= Math.abs(form.activationScore - 6) * 5;
  score += (form.confidenceScore - 5) * 4;
  score += (form.concentrationScore - 5) * 3;
  score += (form.emotionalControlScore - 5) * 3;
  score += (form.processOrientationScore - 5) * 2;
  score -= form.pressureScore * 2.8;
  score -= form.mentalFatigueScore * 2.5;

  if (form.checkinType !== "pre_match") score += (form.recoveryScore - 5) * 4;
  if (form.checkinType === "error_recovery") {
    score -= form.errorImpactScore * 2.5;
    score += form.learning ? 5 : -4;
    score += form.nextAction ? 4 : -3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "--";
}

function formatScale(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/10` : "--";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
