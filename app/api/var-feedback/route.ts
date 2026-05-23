import OpenAI from "openai";
import { NextResponse } from "next/server";
import { feedbackLanguageInstruction } from "@/lib/feedbackLanguage";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Falta OPENAI_API_KEY en .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const languageInstruction = feedbackLanguageInstruction(body.feedbackLanguage);

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Sos instructor VAR profesional con criterio IFAB/FIFA. Evaluas de forma tecnica, estricta y concreta. ${languageInstruction}`,
        },
        {
          role: "user",
          content: `
Analiza esta decision VAR.

DATOS DEL CLIP:
Titulo: ${body.clipTitle}
Incidente elegido por usuario: ${body.incidentType}
Incidente correcto: ${body.correctIncident}

DECISION VAR:
Decision VAR usuario: ${body.varDecision}
Decision VAR correcta: ${body.correctDecision}
Decision final usuario: ${body.finalDecision}

JUSTIFICACION DEL USUARIO:
${body.justification || "Sin justificacion"}

FUNDAMENTO OFICIAL:
${body.explanation || "Sin fundamento cargado"}

INSTRUCCIONES:
- Evalua si el usuario aplico bien el protocolo VAR.
- Determina si correspondia intervenir o hacer check completo.
- Evalua si hay error claro y manifiesto.
- Si eligio review/OFR cuando no correspondia, explicalo.
- Si eligio check complete cuando debia intervenir, explicalo.
- No contradigas la respuesta correcta cargada.
- No seas generico.
- Respeta el idioma de feedback indicado por el sistema.

FORMATO:
1. Veredicto VAR
2. Hay error claro y manifiesto?
3. Evaluacion de la intervencion
4. Error principal
5. Recomendacion tecnica
`,
        },
      ],
    });

    const feedback =
      response.choices?.[0]?.message?.content ??
      "No se pudo generar feedback VAR.";

    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    console.error("VAR FEEDBACK ERROR:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generando feedback VAR." },
      { status: 500 }
    );
  }
}
