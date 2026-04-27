import OpenAI from "openai";
import { NextResponse } from "next/server";

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

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Sos instructor VAR profesional con criterio IFAB/FIFA. Evaluás de forma técnica, estricta y concreta.",
        },
        {
          role: "user",
          content: `
Analizá esta decisión VAR.

DATOS DEL CLIP:
Título: ${body.clipTitle}
Incidente elegido por usuario: ${body.incidentType}
Incidente correcto: ${body.correctIncident}

DECISIÓN VAR:
Decisión VAR usuario: ${body.varDecision}
Decisión VAR correcta: ${body.correctDecision}
Decisión final usuario: ${body.finalDecision}

JUSTIFICACIÓN DEL USUARIO:
${body.justification || "Sin justificación"}

FUNDAMENTO OFICIAL:
${body.explanation || "Sin fundamento cargado"}

INSTRUCCIONES:
- Evaluá si el usuario aplicó bien el protocolo VAR.
- Determiná si correspondía intervenir o hacer check completo.
- Evaluá si hay error claro y manifiesto.
- Si eligió review/OFR cuando no correspondía, explicalo.
- Si eligió check complete cuando debía intervenir, explicalo.
- No contradigas la respuesta correcta cargada.
- No seas genérico.

FORMATO:
1. Veredicto VAR
2. ¿Hay error claro y manifiesto?
3. Evaluación de la intervención
4. Error principal
5. Recomendación técnica
`,
        },
      ],
    });

    const feedback =
      response.choices?.[0]?.message?.content ??
      "No se pudo generar feedback VAR.";

    return NextResponse.json({ feedback });
  } catch (error: any) {
    console.error("VAR FEEDBACK ERROR:", error);

    return NextResponse.json(
      { error: error?.message ?? "Error generando feedback VAR." },
      { status: 500 }
    );
  }
}