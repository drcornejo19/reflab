"use client";

import { useMemo, useState } from "react";
import type { Clip } from "@/lib/types";

type VarDecision = "check_complete" | "recommend_ofr" | "factual_review";
type Incident =
  | "possible_goal"
  | "possible_penalty"
  | "possible_red_card"
  | "mistaken_identity"
  | "possible_offside"
  | "app_offence"
  | "ball_out";

type AppStatus = "same_app" | "new_app" | "not_relevant";
type ClearError = "yes" | "no" | "unclear";

type VarExerciseProps = {
  clip: Clip & {
    incident_type?: string | null;
    correct_var_decision?: string | null;
    correct_app_status?: AppStatus | null;
    correct_clear_error?: ClearError | null;
    explanation?: string | null;
  };
};

const incidentButtons: {
  key: Incident;
  label: string;
  sub: string;
  color: string;
}[] = [
  {
    key: "possible_goal",
    label: "Posible gol / no gol",
    sub: "Gol, balón no en juego, APP",
    color: "bg-emerald-500",
  },
  {
    key: "possible_penalty",
    label: "Posible penal",
    sub: "Penal / no penal",
    color: "bg-yellow-400",
  },
  {
    key: "possible_red_card",
    label: "Posible roja directa",
    sub: "SFP, VC, DOGSO",
    color: "bg-red-500",
  },
  {
    key: "mistaken_identity",
    label: "Identidad errónea",
    sub: "Jugador equivocado",
    color: "bg-purple-500",
  },
  {
    key: "possible_offside",
    label: "Posible FDJ",
    sub: "Posición / interferencia",
    color: "bg-blue-400",
  },
  {
    key: "app_offence",
    label: "Falta en APP",
    sub: "Ataque previo revisable",
    color: "bg-orange-400",
  },
  {
    key: "ball_out",
    label: "Balón no en juego",
    sub: "Previo a gol/penal/DOGSO",
    color: "bg-cyan-400",
  },
];

export function VarExercise({ clip }: VarExerciseProps) {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [clearError, setClearError] = useState<ClearError | null>(null);
  const [varDecision, setVarDecision] = useState<VarDecision | null>(null);
  const [finalDecision, setFinalDecision] = useState("");
  const [communication, setCommunication] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const protocolAdvice = useMemo(() => {
    if (!selectedIncident) return "Seleccioná primero qué está chequeando el VAR.";

    if (clearError === "no") {
      return "Si no hay error claro y manifiesto, corresponde Check Complete.";
    }

    if (selectedIncident === "possible_offside" || selectedIncident === "ball_out") {
      return "Decisión factual: ubicación, balón en juego/no en juego o posición. Puede resolverse con información VAR.";
    }

    if (
      selectedIncident === "possible_penalty" ||
      selectedIncident === "possible_red_card" ||
      selectedIncident === "app_offence"
    ) {
      return "Decisión interpretativa: intensidad, mano, contacto o APP. Normalmente requiere OFR si hay error claro.";
    }

    return "Aplicá mínima interferencia, máximo beneficio.";
  }, [selectedIncident, clearError]);

  const suggestedDecision: VarDecision = useMemo(() => {
    if (clearError === "no") return "check_complete";

    if (selectedIncident === "possible_offside" || selectedIncident === "ball_out") {
      return "factual_review";
    }

    if (
      selectedIncident === "possible_penalty" ||
      selectedIncident === "possible_red_card" ||
      selectedIncident === "app_offence" ||
      selectedIncident === "possible_goal"
    ) {
      return "recommend_ofr";
    }

    return "check_complete";
  }, [selectedIncident, clearError]);

  const score = useMemo(() => {
    if (!submitted) return null;

    let value = 0;

    if (selectedIncident) value += 15;
    if (appStatus) value += 15;
    if (clearError) value += 20;
    if (varDecision === suggestedDecision) value += 30;
    if (communication.trim().length >= 30) value += 20;

    return value;
  }, [submitted, selectedIncident, appStatus, clearError, varDecision, suggestedDecision, communication]);

  function submit() {
    setSubmitted(true);
  }

  function reset() {
    setSelectedIncident(null);
    setAppStatus(null);
    setClearError(null);
    setVarDecision(null);
    setFinalDecision("");
    setCommunication("");
    setSubmitted(false);
  }

  if (submitted && score !== null) {
    return (
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[26px] border border-[#6fc11f]/30 bg-[#07130b] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-[#6fc11f]">
            VAR Review Result
          </p>

          <h2 className="mt-5 text-7xl font-black text-white">
            {score}
            <span className="text-2xl text-zinc-500">/100</span>
          </h2>

          <p className="mt-3 text-2xl font-black text-[#6fc11f]">
            {score >= 85
              ? "Nivel VOR avanzado"
              : score >= 65
              ? "Criterio aceptable"
              : "Revisión débil"}
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-300">
            <p className="font-black text-white">Decisión recomendada:</p>
            <p className="mt-1 text-[#6fc11f]">{translateVarDecision(suggestedDecision)}</p>

            <p className="mt-4 font-black text-white">Fundamento:</p>
            <p className="mt-1">
              {clip.explanation ||
                "Aplicar protocolo VAR: categoría revisable, APP, error claro y manifiesto y tipo de revisión."}
            </p>
          </div>

          <button
            onClick={reset}
            className="mt-6 w-full rounded-xl bg-white/10 px-5 py-4 font-black text-white transition hover:bg-white/15"
          >
            REINTENTAR
          </button>
        </section>

        <section className="rounded-[26px] border border-white/10 bg-[#0b131b] p-6">
          <h3 className="text-2xl font-black">Informe VOR</h3>

          <div className="mt-5 space-y-3 text-sm text-zinc-300">
            <ReviewLine label="Incidente chequeado" value={selectedIncident ? translateIncident(selectedIncident) : "Sin marcar"} />
            <ReviewLine label="APP" value={appStatus ? translateApp(appStatus) : "Sin definir"} />
            <ReviewLine label="Error claro y manifiesto" value={clearError ? translateClearError(clearError) : "Sin definir"} />
            <ReviewLine label="Intervención VAR" value={varDecision ? translateVarDecision(varDecision) : "Sin definir"} />
            <ReviewLine label="Comunicación" value={communication || "Sin comunicación registrada"} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-[#1d2a34] bg-[#071019] p-4 shadow-2xl">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.4em] text-[#6fc11f]">
            VOR Console
          </p>
          <h2 className="mt-2 text-2xl font-black">Modo VAR</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Check automático · Error claro y manifiesto · APP · OFR / factual
          </p>
        </div>

        <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-3 text-right">
          <p className="text-xs font-black text-[#6fc11f]">LIVE CHECK</p>
          <p className="text-[11px] text-zinc-400">VOR activo</p>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <div className="absolute z-10 m-4 rounded-full bg-black/75 px-4 py-2 text-xs font-black">
              <span className="mr-2 text-[#6fc11f]">●</span>
              MAIN CAMERA
            </div>

            <video
              src={clip.video_url}
              controls
              className="aspect-video w-full bg-black object-cover"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <InfoBox title="Principio">
              Mínima interferencia, máximo beneficio. El VAR no busca la mejor decisión, corrige errores claros.
            </InfoBox>
            <InfoBox title="APP">
              Para gol, penal o DOGSO, revisá el inicio de la fase de ataque y cómo se obtuvo la posesión.
            </InfoBox>
          </div>
        </section>

        <section className="space-y-3">
          <Panel title="1. Botón VOR: incidente a chequear">
            <div className="grid grid-cols-2 gap-3">
              {incidentButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={() => setSelectedIncident(btn.key)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    selectedIncident === btn.key
                      ? "border-[#6fc11f] bg-[#6fc11f]/15"
                      : "border-white/10 bg-[#13202a] hover:border-white/25"
                  }`}
                >
                  <div className={`mb-2 h-3 w-3 rounded-full ${btn.color}`} />
                  <p className="text-sm font-black">{btn.label}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{btn.sub}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2. APP">
            <div className="grid gap-2">
              <Choice active={appStatus === "same_app"} onClick={() => setAppStatus("same_app")} title="Misma APP" sub="La fase de ataque continúa." />
              <Choice active={appStatus === "new_app"} onClick={() => setAppStatus("new_app")} title="Nueva APP" sub="Hubo posesión controlada defensiva o reinicio." />
              <Choice active={appStatus === "not_relevant"} onClick={() => setAppStatus("not_relevant")} title="No aplica" sub="Roja directa / identidad / incidente aislado." />
            </div>
          </Panel>

          <Panel title="3. Error claro y manifiesto">
            <div className="grid grid-cols-3 gap-2">
              <MiniChoice active={clearError === "yes"} onClick={() => setClearError("yes")} label="Sí" />
              <MiniChoice active={clearError === "no"} onClick={() => setClearError("no")} label="No" />
              <MiniChoice active={clearError === "unclear"} onClick={() => setClearError("unclear")} label="Dudoso" />
            </div>

            <p className="mt-3 rounded-xl bg-black/30 p-3 text-xs leading-5 text-zinc-400">
              {protocolAdvice}
            </p>
          </Panel>

          <Panel title="4. Intervención VAR">
            <div className="grid gap-2">
              <Choice active={varDecision === "check_complete"} onClick={() => setVarDecision("check_complete")} title="Check complete" sub="No hay error claro." />
              <Choice active={varDecision === "recommend_ofr"} onClick={() => setVarDecision("recommend_ofr")} title="Recomendar OFR" sub="Decisión interpretativa." />
              <Choice active={varDecision === "factual_review"} onClick={() => setVarDecision("factual_review")} title="Factual review" sub="Dato objetivo: lugar, FDJ, balón." />
            </div>
          </Panel>

          <Panel title="5. Comunicación VAR">
            <textarea
              value={communication}
              onChange={(e) => setCommunication(e.target.value)}
              placeholder='Ej: "Chequeando posible penal de blanco 5. Punto de contacto dentro del área. Recomiendo OFR. Cambio."'
              className="min-h-24 w-full rounded-xl border border-white/10 bg-[#17222b] p-3 text-sm text-white outline-none placeholder:text-zinc-600"
            />

            <input
              value={finalDecision}
              onChange={(e) => setFinalDecision(e.target.value)}
              placeholder="Decisión final del árbitro..."
              className="mt-3 w-full rounded-xl border border-white/10 bg-[#17222b] p-3 text-sm text-white outline-none placeholder:text-zinc-600"
            />
          </Panel>

          <button
            onClick={submit}
            disabled={!selectedIncident || !appStatus || !clearError || !varDecision}
            className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            CONFIRMAR CHECK VAR
          </button>
        </section>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1a23] p-4">
      <h3 className="mb-3 text-sm font-black uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? "border-[#6fc11f] bg-[#6fc11f]/15"
          : "border-white/10 bg-[#17222b] hover:border-white/25"
      }`}
    >
      <p className="text-sm font-black">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </button>
  );
}

function MiniChoice({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
        active
          ? "border-[#6fc11f] bg-[#6fc11f]/15 text-white"
          : "border-white/10 bg-[#17222b] text-zinc-400 hover:border-white/25"
      }`}
    >
      {label}
    </button>
  );
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <p className="text-sm font-black text-[#6fc11f]">{title}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{children}</p>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

function translateIncident(value: Incident) {
  const map: Record<Incident, string> = {
    possible_goal: "Posible gol / no gol",
    possible_penalty: "Posible penal",
    possible_red_card: "Posible roja directa",
    mistaken_identity: "Identidad errónea",
    possible_offside: "Posible fuera de juego",
    app_offence: "Falta en APP",
    ball_out: "Balón no en juego",
  };

  return map[value];
}

function translateApp(value: AppStatus) {
  const map: Record<AppStatus, string> = {
    same_app: "Misma APP",
    new_app: "Nueva APP",
    not_relevant: "No aplica",
  };

  return map[value];
}

function translateClearError(value: ClearError) {
  const map: Record<ClearError, string> = {
    yes: "Sí",
    no: "No",
    unclear: "Dudoso",
  };

  return map[value];
}

function translateVarDecision(value: VarDecision) {
  const map: Record<VarDecision, string> = {
    check_complete: "Check complete",
    recommend_ofr: "Recomendar OFR",
    factual_review: "Factual review",
  };

  return map[value];
}