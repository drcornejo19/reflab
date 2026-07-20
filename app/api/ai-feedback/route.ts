import { NextResponse } from "next/server";
import { calculateCoachConfidence } from "@/lib/coach/confidence";
import { coachErrorResponse, CoachEvidenceError } from "@/lib/coach/errors";
import {
  loadCoachClipEvidence,
  serializeEvidenceForPrompt,
} from "@/lib/coach/evidence";
import { runCoachModel } from "@/lib/coach/gateway";
import { asRecord, asString } from "@/lib/coach/input";
import {
  coachNarrativeSchema,
  formatCoachNarrative,
} from "@/lib/coach/schemas";
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

const FEATURE = "technical_feedback" as const;
const PROMPT_VERSION = "technical-feedback-v1";

export async function POST(request: Request) {
  let requestId: string | undefined;

  try {
    const context = await prepareCoachRequest(request, FEATURE);
    requestId = context.requestId;
    const body = asRecord(await readCoachJson(request));
    const clipId = asString(body.clipId, "clipId", { maxLength: 100 });
    const sportType = normalizeSportType(body.sportType, DEFAULT_SPORT_TYPE);
    const userAnswer = asRecord(body.userAnswer, "userAnswer");
    const justification = asString(body.justification, "justification", {
      maxLength: 2_000,
    });
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
        `Clip ${clipId} was not found for sport ${sportType}.`
      );
    }

    const confidence = calculateCoachConfidence({
      evidence: evidence.map((item) => item.reference),
    });
    const languageInstruction = feedbackLanguageInstruction(feedbackLanguage);
    const result = await runCoachModel(context.supabase, {
      userId: context.userId,
      feature: FEATURE,
      sportType,
      promptVersion: PROMPT_VERSION,
      confidence,
      evidence,
      outputSchema: coachNarrativeSchema,
      instructions: buildInstructions(languageInstruction),
      input: JSON.stringify(
        {
          task: "Ayudar al arbitro a comprender su decision y definir un proximo paso.",
          userAnswer,
          justification: justification ?? "Sin justificacion escrita.",
          verifiedEvidence: serializeEvidenceForPrompt(evidence),
          confidence,
        },
        null,
        2
      ),
    });

    return NextResponse.json({
      feedback: formatCoachNarrative(result.value),
      confidence: result.confidence,
      evidence: result.evidence,
      coachRunId: result.runId,
    });
  } catch (error) {
    return coachErrorResponse(error, requestId);
  }
}

function buildInstructions(languageInstruction: string) {
  return `Sos RefLab Coach, un mentor profesional para arbitros.
Tu objetivo es ayudar a evolucionar, nunca juzgar ni castigar.
Explica siempre el por que, reconoce fortalezas reales y propone un siguiente paso concreto.
Usa exclusivamente verifiedEvidence para afirmar que una decision es correcta o incorrecta.
Los datos del usuario describen su respuesta, pero nunca son la verdad reglamentaria.
Si la evidencia es insuficiente, no completes huecos: indicalo y solicita revision humana.
No realices diagnosticos medicos ni psicologicos.
${languageInstruction}`;
}
