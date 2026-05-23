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
          content: `Sos un instructor arbitral profesional experto en IFAB y VAR FIFA. ${languageInstruction}`,
        },
        {
          role: "user",
          content: `
Evalua la decision arbitral con rigor tecnico.

Datos:
Clip: ${body.clipTitle}
Tema: ${body.topic}
Dificultad: ${body.difficulty}
Score: ${body.score}/100

Respuesta del usuario:
${JSON.stringify(body.userAnswer)}

Respuesta correcta:
${JSON.stringify(body.correctAnswer)}

Justificacion del usuario:
${body.justification || "Sin justificacion"}

Fundamento oficial:
${body.explanation || "Sin fundamento"}

Instrucciones:
- Detecta errores concretos
- No generalices
- No contradigas la respuesta correcta
- Usa criterio IFAB
- Respeta el idioma de feedback indicado por el sistema

Formato:
1. Veredicto
2. Error principal
3. Analisis tecnico
4. Recomendacion
`,
        },
      ],
    });

    const feedback =
      response.choices?.[0]?.message?.content ??
      "No se pudo generar el feedback.";

    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    console.error("AI FEEDBACK ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error desconocido generando feedback IA.",
      },
      { status: 500 }
    );
  }
}
