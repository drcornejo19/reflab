import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Sos instructor arbitral profesional con criterio IFAB y VAR FIFA. Analizás desempeño global.",
        },
        {
          role: "user",
          content: `
Analizá este examen arbitral completo.

Resultados:
Promedio: ${body.avgScore}
Correctas: ${body.correctCount}/${body.totalQuestions}

Detalle:
${JSON.stringify(body.answers)}

Instrucciones:
- Detectar patrones de error
- Identificar el error más repetido
- Detectar si hay problema en técnica, disciplina, restart o VAR
- No generalizar
- Usar lenguaje arbitral real

Formato:

1. Nivel real del árbitro
2. Error más recurrente
3. Patrón detectado
4. Recomendación concreta de entrenamiento
`,
        },
      ],
    });

    const feedback =
      response.choices?.[0]?.message?.content ??
      "No se pudo generar análisis.";

    return NextResponse.json({ feedback });
  } catch (error: any) {
    console.error("AI EXAM ERROR:", error);

    return NextResponse.json(
      { error: error?.message ?? "Error IA examen" },
      { status: 500 }
    );
  }
}