import { NextResponse } from "next/server";
import { calculateCoachConfidence } from "@/lib/coach/confidence";
import { coachErrorResponse } from "@/lib/coach/errors";
import {
  loadCoachClipEvidence,
  serializeEvidenceForPrompt,
} from "@/lib/coach/evidence";
import { runCoachModel } from "@/lib/coach/gateway";
import {
  asArray,
  asBoolean,
  asRecord,
  asString,
} from "@/lib/coach/input";
import {
  coachNarrativeSchema,
  formatCoachNarrative,
} from "@/lib/coach/schemas";
import {
  prepareCoachRequest,
  readCoachJson,
} from "@/lib/coach/security";
import {
  DEFAULT_SPORT_TYPE,
  normalizeSportType,
} from "@/lib/sports";
import { normalizeDiscipline } from "@/lib/scoring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FEATURE = "exam_analysis" as const;
const PROMPT_VERSION = "exam-analysis-v1";

type ExamAnswer = {
  clipId: string | null;
  foul: boolean | null;
  restart: string | null;
  discipline: string | null;
};

export async function POST(request: Request) {
  let requestId: string | undefined;

  try {
    const context = await prepareCoachRequest(request, FEATURE);
    requestId = context.requestId;
    const body = asRecord(await readCoachJson(request));
    const sportType = normalizeSportType(body.sportType, DEFAULT_SPORT_TYPE);
    const answers = asArray(body.answers, "answers", { maxItems: 20 }).map(
      parseAnswer
    );
    const evidence = await loadCoachClipEvidence(
      context.supabase,
      answers.flatMap((answer) => (answer.clipId ? [answer.clipId] : [])),
      sportType
    );
    const analysis = buildVerifiedExamAnalysis(answers, evidence);
    const confidence = calculateCoachConfidence({
      evidence: evidence.map((item) => item.reference),
      sampleSize: analysis.verifiedAnswers,
      minimumSampleSize: 5,
    });
    const result = await runCoachModel(context.supabase, {
      userId: context.userId,
      feature: FEATURE,
      sportType,
      promptVersion: PROMPT_VERSION,
      confidence,
      evidence,
      outputSchema: coachNarrativeSchema,
      instructions: `Sos RefLab Coach, mentor profesional para arbitros.
Analiza patrones sin juzgar ni convertir al arbitro en un perfil unico.
Usa solo los resultados verificados por el servidor y la evidencia asociada.
No inventes reglas, causas ni tendencias. Una muestra pequena no permite conclusiones estables.
Reconoce fortalezas, explica cada oportunidad de mejora y propone una accion medible.
Escribi toda la devolucion en espanol.`,
      input: JSON.stringify(
        {
          task: "Interpretar un examen arbitral y proponer entrenamiento.",
          verifiedAnalysis: analysis,
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
      verifiedSummary: analysis.summary,
    });
  } catch (error) {
    return coachErrorResponse(error, requestId);
  }
}

function parseAnswer(value: unknown): ExamAnswer {
  const answer = asRecord(value, "answers[]");
  return {
    clipId: asString(answer.clipId, "answers[].clipId", { maxLength: 100 }),
    foul: asBoolean(answer.foul, "answers[].foul"),
    restart: asString(answer.restart, "answers[].restart", { maxLength: 120 }),
    discipline: asString(answer.discipline, "answers[].discipline", {
      maxLength: 120,
    }),
  };
}

function buildVerifiedExamAnalysis(
  answers: ExamAnswer[],
  evidence: Awaited<ReturnType<typeof loadCoachClipEvidence>>
) {
  const byClipId = new Map(
    evidence.map((item) => [item.reference.sourceId, item])
  );
  const rows = answers.map((answer) => {
    const source = answer.clipId ? byClipId.get(answer.clipId) : null;
    if (!source) {
      return {
        clipId: answer.clipId,
        verified: false,
        score: null,
        criteria: null,
      };
    }

    const correctFoul =
      typeof source.facts.correctFoul === "boolean"
        ? source.facts.correctFoul
        : null;
    const correctRestart =
      typeof source.facts.correctRestart === "string"
        ? source.facts.correctRestart
        : null;
    const correctDiscipline =
      typeof source.facts.correctDiscipline === "string"
        ? source.facts.correctDiscipline
        : null;
    const criteria = {
      technical:
        correctFoul === null || answer.foul === null
          ? null
          : answer.foul === correctFoul,
      restart:
        !correctRestart || !answer.restart
          ? null
          : normalizedText(answer.restart) === normalizedText(correctRestart),
      discipline:
        !correctDiscipline || !answer.discipline
          ? null
          : normalizeDiscipline(answer.discipline) ===
            normalizeDiscipline(correctDiscipline),
    };
    const comparable = Object.values(criteria).filter(
      (value): value is boolean => typeof value === "boolean"
    );
    const correct = comparable.filter(Boolean).length;

    return {
      clipId: answer.clipId,
      verified: comparable.length > 0,
      score: comparable.length
        ? Math.round((correct / comparable.length) * 100)
        : null,
      criteria,
    };
  });
  const verifiedRows = rows.filter(
    (row): row is typeof row & { score: number } =>
      row.verified && typeof row.score === "number"
  );
  const average = verifiedRows.length
    ? Math.round(
        verifiedRows.reduce((total, row) => total + row.score, 0) /
          verifiedRows.length
      )
    : null;

  return {
    summary: {
      submittedAnswers: answers.length,
      verifiedAnswers: verifiedRows.length,
      average,
      correctAnswers: verifiedRows.filter((row) => row.score >= 85).length,
    },
    verifiedAnswers: verifiedRows.length,
    rows,
  };
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
