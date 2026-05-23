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
          content: `You are a FIFA-level referee English instructor. You correct technical refereeing language, not casual English. ${languageInstruction}`,
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
- Evaluate the user answer in English, but write the feedback in the user interface language indicated by the system message.

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
        "No se pudo generar feedback en ingles.",
    });
  } catch (error: unknown) {
    console.error("ENGLISH FEEDBACK ERROR:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error generando feedback en ingles." },
      { status: 500 }
    );
  }
}
