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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEATURE = "var_feedback" as const;
const PROMPT_VERSION = "var-feedback-v1";

export async function POST(request: Request) {
  let requestId: string | undefined;

  try {
    const context = await prepareCoachRequest(request, FEATURE);
    requestId = context.requestId;
    const body = asRecord(await readCoachJson(request));
    const clipId = asString(body.clipId, "clipId", {
      required: true,
      maxLength: 100,
    }) as string;
    const evidence = await loadCoachClipEvidence(
      context.supabase,
      [clipId],
      "football_11"
    );
    if (evidence.length === 0) {
      throw new CoachEvidenceError(`VAR clip ${clipId} was not found.`);
    }

    const userDecision = {
      incidentType: asString(body.incidentType, "incidentType", {
        maxLength: 120,
      }),
      appStatus: asString(body.appStatus, "appStatus", { maxLength: 120 }),
      clearError: asString(body.clearError, "clearError", { maxLength: 120 }),
      varDecision: asString(body.varDecision, "varDecision", {
        maxLength: 120,
      }),
      finalDecision: asString(body.finalDecision, "finalDecision", {
        maxLength: 300,
      }),
      justification: asString(body.justification, "justification", {
        maxLength: 2_000,
      }),
    };
    const feedbackLanguage = asString(
      body.feedbackLanguage,
      "feedbackLanguage",
      { maxLength: 10 }
    );
    const confidence = calculateCoachConfidence({
      evidence: evidence.map((item) => item.reference),
    });
    const languageInstruction = feedbackLanguageInstruction(feedbackLanguage);
    const result = await runCoachModel(context.supabase, {
      userId: context.userId,
      feature: FEATURE,
      sportType: "football_11",
      promptVersion: PROMPT_VERSION,
      confidence,
      evidence,
      outputSchema: coachNarrativeSchema,
      instructions: `Sos RefLab Coach especializado en protocolo VAR.
Ayuda al arbitro a comprender check, APP, error claro y manifiesto, OFR y decisiones factuales.
No juzgues ni castigues. Reconoce aciertos, explica el por que y propone una practica concreta.
Usa exclusivamente verifiedEvidence para validar la decision.
No inventes criterios ni contradigas la evidencia oficial.
${languageInstruction}`,
      input: JSON.stringify(
        {
          task: "Analizar la aplicacion del protocolo VAR.",
          userDecision,
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
