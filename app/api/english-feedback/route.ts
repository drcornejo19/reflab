import { NextResponse } from "next/server";
import { calculateCoachConfidence } from "@/lib/coach/confidence";
import { coachErrorResponse, CoachEvidenceError } from "@/lib/coach/errors";
import {
  loadCoachClipEvidence,
  serializeEvidenceForPrompt,
} from "@/lib/coach/evidence";
import { runCoachModel } from "@/lib/coach/gateway";
import { asBoolean, asRecord, asString } from "@/lib/coach/input";
import { coachCommunicationSchema } from "@/lib/coach/schemas";
import {
  prepareCoachRequest,
  readCoachJson,
} from "@/lib/coach/security";
import { feedbackLanguageInstruction } from "@/lib/feedbackLanguage";
import {
  DEFAULT_SPORT_TYPE,
  normalizeSportType,
} from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedbackMode = "decision_explanation_es" | "ifab_english";

const FEATURE = "communication_feedback" as const;
const PROMPT_VERSION = "communication-feedback-v1";

export async function POST(request: Request) {
  let requestId: string | undefined;

  try {
    const context = await prepareCoachRequest(request, FEATURE);
    requestId = context.requestId;
    const body = asRecord(await readCoachJson(request));
    const mode: FeedbackMode =
      body.mode === "decision_explanation_es"
        ? "decision_explanation_es"
        : "ifab_english";
    const clipId = asString(body.clipId, "clipId", { maxLength: 100 });
    const sportType = normalizeSportType(body.sportType, DEFAULT_SPORT_TYPE);
    const answer = asString(body.answer, "answer", { maxLength: 4_000 });
    const hasVoiceRecording =
      asBoolean(body.hasVoiceRecording, "hasVoiceRecording") ?? false;
    const feedbackLanguage = asString(
      body.feedbackLanguage,
      "feedbackLanguage",
      { maxLength: 10 }
    );
    const evidence = await loadCoachClipEvidence(
      context.supabase,
      clipId ? [clipId] : [],
      sportType
    );

    if (clipId && evidence.length === 0) {
      throw new CoachEvidenceError(
        `Communication clip ${clipId} was not found for ${sportType}.`
      );
    }

    const confidence = calculateCoachConfidence({
      evidence:
        answer && !hasVoiceRecording
          ? evidence.map((item) => item.reference)
          : [],
    });
    const languageInstruction = feedbackLanguageInstruction(feedbackLanguage);
    const result = await runCoachModel(context.supabase, {
      userId: context.userId,
      feature: FEATURE,
      sportType,
      promptVersion: PROMPT_VERSION,
      confidence,
      evidence,
      outputSchema: coachCommunicationSchema,
      instructions: buildInstructions(mode, languageInstruction),
      input: JSON.stringify(
        {
          mode,
          answer:
            answer ??
            (hasVoiceRecording
              ? "Existe una grabacion sin transcripcion; no es posible evaluar su contenido."
              : "Sin respuesta textual."),
          hasVoiceRecording,
          verifiedEvidence: serializeEvidenceForPrompt(evidence),
          confidence,
        },
        null,
        2
      ),
    });

    return NextResponse.json({
      feedback: result.value.feedback,
      scores: result.value.scores,
      confidence: result.confidence,
      evidence: result.evidence,
      coachRunId: result.runId,
    });
  } catch (error) {
    return coachErrorResponse(error, requestId);
  }
}

function buildInstructions(
  mode: FeedbackMode,
  languageInstruction: string
) {
  const target =
    mode === "decision_explanation_es"
      ? "Evalua terminologia, claridad, precision y estructura en espanol."
      : "Evalua vocabulario, terminologia IFAB, claridad, gramatica y precision en ingles arbitral.";

  return `Sos RefLab Coach, mentor de comunicacion arbitral.
${target}
La puntuacion describe esta respuesta concreta; no define el valor ni el nivel total del arbitro.
Usa solo verifiedEvidence para validar el contenido tecnico.
Si solo existe audio sin transcripcion, no evalues su contenido: devuelve puntuaciones null y solicita revision humana.
No inventes una respuesta esperada ni una referencia reglamentaria.
Explica el por que y propone una frase modelo breve cuando exista evidencia suficiente.
${languageInstruction}`;
}
