import { NextResponse } from "next/server";
import { calculateCoachConfidence } from "@/lib/coach/confidence";
import {
  CommunicationFeedbackError,
  createCommunicationFeedbackDatabaseDependencies,
  submitCanonicalCommunicationFeedback,
  type CanonicalCommunicationInput,
  type CommunicationFeedbackMode,
} from "@/lib/coach/communicationFeedback";
import { coachErrorResponse, CoachEvidenceError } from "@/lib/coach/errors";
import {
  loadCoachClipEvidence,
  serializeEvidenceForPrompt,
} from "@/lib/coach/evidence";
import { runCoachModel } from "@/lib/coach/gateway";
import { coachCommunicationSchema } from "@/lib/coach/schemas";
import {
  prepareCoachRequest,
  readCoachJson,
} from "@/lib/coach/security";
import { feedbackLanguageInstruction } from "@/lib/feedbackLanguage";
import type { CoachEvidence } from "@/lib/coach/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEATURE = "communication_feedback" as const;
const PROMPT_VERSION = "communication-feedback-v1";

export async function POST(request: Request) {
  let requestId: string | undefined;

  try {
    const context = await prepareCoachRequest(request, FEATURE);
    requestId = context.requestId;
    const database = createCommunicationFeedbackDatabaseDependencies(
      context.supabase
    );
    const result = await submitCanonicalCommunicationFeedback(
      context.userId,
      await readCoachJson(request),
      {
        ...database,
        loadEvidence: (clipId, sportType) =>
          loadCoachClipEvidence(context.supabase, [clipId], sportType, {
            requirePublishedActive: true,
          }),
        generate: (input, evidence) =>
          generateCommunicationFeedback(
            context,
            input,
            evidence
          ),
      }
    );

    return NextResponse.json({ ...result, saved: true });
  } catch (error) {
    if (error instanceof CommunicationFeedbackError) {
      if (error.diagnostic) {
        console.error("REFLAB_COMMUNICATION_PERSISTENCE_ERROR", {
          requestId: requestId ?? null,
          ...error.diagnostic,
        });
      }
      return NextResponse.json(
        { error: error.publicMessage, code: error.code },
        { status: error.status }
      );
    }
    return coachErrorResponse(error, requestId);
  }
}

async function generateCommunicationFeedback(
  context: Awaited<ReturnType<typeof prepareCoachRequest>>,
  input: CanonicalCommunicationInput,
  evidence: CoachEvidence[]
) {
  if (evidence.length === 0) {
    throw new CoachEvidenceError(
      `Communication clip was not found for ${input.sportType}.`
    );
  }
  const confidence = calculateCoachConfidence({
    evidence: input.answer
      ? evidence.map((item) => item.reference)
      : [],
  });
  const languageInstruction = feedbackLanguageInstruction(
    input.feedbackLanguage
  );

  return runCoachModel(context.supabase, {
    userId: context.userId,
    feature: FEATURE,
    sportType: input.sportType,
    promptVersion: PROMPT_VERSION,
    confidence,
    evidence,
    outputSchema: coachCommunicationSchema,
    instructions: buildInstructions(input.mode, languageInstruction),
    input: JSON.stringify(
      {
        mode: input.mode,
        answer:
          input.answer ??
          "Existe una grabacion sin transcripcion; no es posible evaluar su contenido.",
        hasVoiceRecording: input.hasVoiceRecording,
        oralEvidenceAvailable: false,
        verifiedEvidence: serializeEvidenceForPrompt(evidence),
        confidence,
      },
      null,
      2
    ),
  });
}

function buildInstructions(
  mode: CommunicationFeedbackMode,
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
