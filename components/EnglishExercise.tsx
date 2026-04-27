"use client";

import { useState } from "react";

export function EnglishExercise() {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  async function evaluate() {
    if (!answer.trim() || loadingAi) return;

    setLoadingAi(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/english-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answer,
          expected: {
            foul: "Yes",
            restart: "Direct free kick",
            discipline: "Yellow card",
            var: "Not reviewable",
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback(data.error ?? "No se pudo generar feedback.");
      } else {
        setFeedback(data.feedback ?? "Sin feedback disponible.");
      }
    } catch (error) {
      console.error("English feedback error:", error);
      setFeedback("No se pudo generar feedback.");
    } finally {
      setLoadingAi(false);
    }
  }

  function reset() {
    setAnswer("");
    setFeedback(null);
    setLoadingAi(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <section className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="absolute z-10 m-4 rounded-full bg-black/70 px-4 py-2 text-xs font-black">
            <span className="mr-2 text-[#6fc11f]">●</span>
            MAIN CAMERA
          </div>

          <video
            className="aspect-video w-full bg-black object-cover"
            controls
            src="/demo.mp4"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111c25] p-4">
          <p className="text-sm font-black">Useful vocabulary</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "reckless challenge",
              "excessive force",
              "direct free kick",
              "yellow card",
              "SPA",
              "DOGSO",
              "not reviewable",
            ].map((term) => (
              <span
                key={term}
                className="rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-1 text-xs text-[#6fc11f]"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-[24px] border border-white/10 bg-[#0b131b] p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            English Referee Mode
          </p>
          <h2 className="mt-3 text-2xl font-black">
            Explain your decision in English
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Write as if you were communicating in an international referee
            context.
          </p>
        </div>

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder='Example: "The defender commits a reckless challenge stopping a promising attack. Direct free kick and yellow card."'
          className="min-h-40 w-full rounded-xl border border-white/10 bg-[#17222b] p-4 text-sm text-white outline-none placeholder:text-zinc-600"
        />

        <button
          onClick={evaluate}
          disabled={!answer.trim() || loadingAi}
          className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingAi ? "ANALYZING..." : "SUBMIT ANSWER"}
        </button>

        {feedback && (
          <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 p-5">
            <h3 className="font-black text-blue-300">
              AI English Feedback
            </h3>

            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
              {feedback
                .split("\n")
                .filter(Boolean)
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
          </div>
        )}

        {feedback && (
          <button
            onClick={reset}
            className="w-full rounded-xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
          >
            TRY AGAIN
          </button>
        )}
      </section>
    </div>
  );
}