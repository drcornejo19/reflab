import OpenAI from "openai";
import { NextResponse } from "next/server";
import { feedbackLanguageInstruction } from "@/lib/feedbackLanguage";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type FeedbackMode = "decision_explanation_es" | "ifab_english";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Falta OPENAI_API_KEY en .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const mode: FeedbackMode =
      body.mode === "decision_explanation_es" ? "decision_explanation_es" : "ifab_english";
    const languageInstruction = feedbackLanguageInstruction(body.feedbackLanguage);
    const prompt = buildPrompt({
      mode,
      answer: String(body.answer ?? ""),
      clipTitle: body.clipTitle,
      topic: body.topic,
      expected: body.expected,
      hasVoiceRecording: Boolean(body.hasVoiceRecording),
      languageInstruction,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are RefLab's referee communication evaluator. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content ?? "";
    const parsed = parseFeedback(raw);

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    console.error("COMMUNICATION FEEDBACK ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error generando feedback de comunicacion.",
      },
      { status: 500 }
    );
  }
}

function buildPrompt({
  mode,
  answer,
  clipTitle,
  topic,
  expected,
  hasVoiceRecording,
  languageInstruction,
}: {
  mode: FeedbackMode;
  answer: string;
  clipTitle?: string | null;
  topic?: string | null;
  expected?: unknown;
  hasVoiceRecording: boolean;
  languageInstruction: string;
}) {
  const expectedText = stringifyExpected(expected);

  if (mode === "decision_explanation_es") {
    return `
Evalua una explicacion arbitral en espanol.

CLIP:
${clipTitle ?? "Sin titulo"}

TOPICO:
${topic ?? "Sin topico"}

RESPUESTA DEL USUARIO:
${answer || (hasVoiceRecording ? "El usuario registro audio, sin transcripcion textual." : "Sin respuesta textual.")}

CONTEXTO ESPERADO:
${expectedText}

Criterios:
- Terminologia arbitral: uso correcto de infraccion, reanudacion, sancion disciplinaria y protocolo.
- Claridad: que se entienda en voz de estadio.
- Precision: decision tecnica final correcta y sin contradicciones.
- Estructura: observacion breve + decision final.

Devuelve JSON estricto con esta forma:
{
  "feedback": "texto breve en espanol",
  "scores": {
    "terminology": 0-10,
    "clarity": 0-10,
    "precision": 0-10,
    "structure": 0-10,
    "global": 0-10,
    "globalLabel": "Excelente | Muy bueno | Correcto | A mejorar",
    "modelAnswer": "modelo breve en espanol"
  }
}
`;
  }

  return `
Evaluate this referee decision explanation in technical IFAB English.

CLIP:
${clipTitle ?? "Untitled"}

TOPIC:
${topic ?? "No topic"}

USER ANSWER:
${answer || (hasVoiceRecording ? "The user recorded audio, without text transcription." : "No text answer.")}

EXPECTED CONTEXT:
${expectedText}

${languageInstruction}

Criteria:
- Vocabulary: refereeing terms used by IFAB/FIFA/CONMEBOL/UEFA.
- IFAB terminology: correct use of restart, disciplinary sanction, offence/no offence, DOGSO, SPA, VAR terms.
- Clarity: concise and understandable match communication.
- Basic grammar: enough grammar to communicate accurately.
- Technical precision: final decision is coherent with the context.

Return strict JSON:
{
  "feedback": "concise feedback in the requested UI language",
  "scores": {
    "vocabulary": 0-10,
    "terminology": 0-10,
    "clarity": 0-10,
    "grammar": 0-10,
    "precision": 0-10,
    "global": 0-10,
    "globalLabel": "Excellent | Very good | Correct | Needs work",
    "modelAnswer": "short model answer in English"
  }
}
`;
}

function stringifyExpected(value: unknown) {
  if (!value) return "No especificado";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "No especificado";
  }
}

function parseFeedback(raw: string) {
  try {
    const parsed = JSON.parse(raw) as {
      feedback?: unknown;
      scores?: unknown;
    };

    return {
      feedback:
        typeof parsed.feedback === "string"
          ? parsed.feedback
          : "No se pudo generar feedback estructurado.",
      scores: normalizeScores(parsed.scores),
    };
  } catch {
    return {
      feedback: raw || "No se pudo generar feedback.",
      scores: null,
    };
  }
}

function normalizeScores(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  return {
    terminology: cleanOutOf10(record.terminology),
    clarity: cleanOutOf10(record.clarity),
    precision: cleanOutOf10(record.precision),
    structure: cleanOutOf10(record.structure),
    vocabulary: cleanOutOf10(record.vocabulary),
    grammar: cleanOutOf10(record.grammar),
    global: cleanOutOf10(record.global),
    globalLabel: typeof record.globalLabel === "string" ? record.globalLabel : null,
    modelAnswer: typeof record.modelAnswer === "string" ? record.modelAnswer : null,
  };
}

function cleanOutOf10(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}
