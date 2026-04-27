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
            "Sos un instructor arbitral profesional experto en IFAB y VAR FIFA.",
        },
        {
          role: "user",
          content: `
Evaluá la decisión arbitral con rigor técnico.

Datos:
Clip: ${body.clipTitle}
Tema: ${body.topic}
Dificultad: ${body.difficulty}
Score: ${body.score}/100

Respuesta del usuario:
${JSON.stringify(body.userAnswer)}

Respuesta correcta:
${JSON.stringify(body.correctAnswer)}

Justificación del usuario:
${body.justification || "Sin justificación"}

Fundamento oficial:
${body.explanation || "Sin fundamento"}

Instrucciones:
- Detectá errores concretos
- No generalices
- No contradigas la respuesta correcta
- Usá criterio IFAB

Formato:
1. Veredicto
2. Error principal
3. Análisis técnico
4. Recomendación
`,
        },
      ],
    });

    const feedback =
      response.choices?.[0]?.message?.content ??
      "No se pudo generar el feedback.";

    return NextResponse.json({ feedback });
  } catch (error: any) {
    console.error("AI FEEDBACK ERROR:", error);

    return NextResponse.json(
      {
        error:
          error?.message ?? "Error desconocido generando feedback IA.",
      },
      { status: 500 }
    );
  }
}