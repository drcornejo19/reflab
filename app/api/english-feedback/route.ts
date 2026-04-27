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
            "You are a FIFA-level referee English instructor. You correct technical refereeing language, not casual English.",
        },
        {
          role: "user",
          content: `
Evaluate this referee explanation in English.

USER ANSWER:
${body.answer}

EXPECTED CONTEXT:
Foul: ${body.expected?.foul ?? "not specified"}
Restart: ${body.expected?.restart ?? "not specified"}
Discipline: ${body.expected?.discipline ?? "not specified"}
VAR: ${body.expected?.var ?? "not specified"}

Instructions:
- Correct technical football/refereeing vocabulary.
- Evaluate if the decision is communicated clearly.
- Detect misuse of terms like reckless, excessive force, SPA, DOGSO, careless, challenge, direct free kick.
- Suggest a better model answer.
- Be concise.

Format:
1. Technical accuracy
2. English clarity
3. Vocabulary corrections
4. Suggested model answer
`,
        },
      ],
    });

    return NextResponse.json({
      feedback:
        response.choices?.[0]?.message?.content ??
        "No se pudo generar feedback en inglés.",
    });
  } catch (error: any) {
    console.error("ENGLISH FEEDBACK ERROR:", error);

    return NextResponse.json(
      { error: error?.message ?? "Error generando feedback en inglés." },
      { status: 500 }
    );
  }
}