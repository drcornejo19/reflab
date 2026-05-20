"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type EnglishClip = {
  id: string;
  title: string | null;
  description: string | null;
  video_url: string;
  topic: string | null;
  explanation: string | null;
  created_at?: string;
};

export function EnglishExercise() {
  const [clips, setClips] = useState<EnglishClip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingClips, setLoadingClips] = useState(true);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentClip = clips[currentIndex];

  useEffect(() => {
    loadEnglishClips();
  }, []);

  async function loadEnglishClips() {
    setLoadingClips(true);

    const { data, error } = await supabase
      .from("clips")
      .select("id,title,description,video_url,topic,explanation,created_at")
      .eq("mode", "english")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading english clips:", error);
      setClips([]);
    } else {
      setClips((data ?? []) as EnglishClip[]);
    }

    setLoadingClips(false);
  }

  async function evaluate() {
    if ((!answer.trim() && !audioBlob) || loadingAi) return;

    setLoadingAi(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/english-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clipTitle: currentClip?.title,
          topic: currentClip?.topic,
          answer,
          expected: currentClip?.explanation,
          hasVoiceRecording: Boolean(audioBlob),
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

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Tu navegador no permite grabar audio.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error("Recording error:", error);
      alert("No se pudo iniciar la grabación. Revisá permisos del micrófono.");
    }
  }

  function stopRecording() {
    if (!recorderRef.current) return;

    recorderRef.current.stop();
    setRecording(false);
  }

  function resetAnswer() {
    setAnswer("");
    setFeedback(null);
    setLoadingAi(false);
    setAudioBlob(null);

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioUrl(null);
  }

  function nextClip() {
    if (currentIndex >= clips.length - 1) return;
    resetAnswer();
    setCurrentIndex((prev) => prev + 1);
  }

  function previousClip() {
    if (currentIndex <= 0) return;
    resetAnswer();
    setCurrentIndex((prev) => prev - 1);
  }

  if (loadingClips) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        Loading English clips...
      </div>
    );
  }

  if (!currentClip) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        No English clips loaded yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
      <section className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0b131b] p-4">
          <button
            onClick={previousClip}
            disabled={currentIndex === 0}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
          >
            ← Previous
          </button>

          <p className="text-sm font-black text-zinc-300">
            Clip {currentIndex + 1} / {clips.length}
          </p>

          <button
            onClick={nextClip}
            disabled={currentIndex >= clips.length - 1}
            className="rounded-xl bg-[#6fc11f] px-4 py-2 text-sm font-black text-black disabled:opacity-40"
          >
            Next →
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="absolute z-10 m-4 rounded-full bg-black/70 px-4 py-2 text-xs font-black">
            <span className="mr-2 text-[#6fc11f]">●</span>
            MAIN CAMERA
          </div>

          <video
            key={currentClip.id}
            className="aspect-video w-full bg-black object-cover"
            controls
            src={currentClip.video_url}
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
              "red card",
              "SPA",
              "DOGSO",
              "not reviewable",
              "penalty kick",
              "corner kick",
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
            Write it or record it as if you were communicating in an
            international referee context.
          </p>
        </div>

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder='Example: "The defender commits a reckless challenge stopping a promising attack. Direct free kick and yellow card."'
          className="min-h-40 w-full rounded-xl border border-white/10 bg-[#17222b] p-4 text-sm text-white outline-none placeholder:text-zinc-600"
        />

        <div className="grid gap-3 md:grid-cols-2">
          {!recording ? (
            <button
              onClick={startRecording}
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 font-black text-red-300 hover:bg-red-500/20"
            >
              🎙 Start voice answer
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="rounded-xl bg-red-500 px-5 py-4 font-black text-white"
            >
              ⏹ Stop recording
            </button>
          )}

          <button
            onClick={resetAnswer}
            className="rounded-xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
          >
            Clear answer
          </button>
        </div>

        {audioUrl && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-3 text-sm font-black text-[#6fc11f]">
              Voice answer recorded
            </p>

            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        <button
          onClick={evaluate}
          disabled={(!answer.trim() && !audioBlob) || loadingAi}
          className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingAi ? "ANALYZING..." : "SUBMIT ANSWER"}
        </button>

        {feedback && (
          <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 p-5">
            <h3 className="font-black text-blue-300">AI English Feedback</h3>

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
      </section>
    </div>
  );
}