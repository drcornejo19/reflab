"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { insertAttemptSafely } from "@/lib/attemptPersistence";
import { getBrowserFeedbackLanguage } from "@/lib/feedbackLanguage";
import { supabase } from "@/lib/supabase";
import { getEnglishClips, type ClipRecord } from "@/lib/clips";

type EnglishClip = ClipRecord;

export function EnglishExercise() {
  const { user } = useUser();
  const startedAtRef = useRef<number>(0);
  const [clips, setClips] = useState<EnglishClip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingClips, setLoadingClips] = useState(true);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentClip = clips[currentIndex];

  useEffect(() => {
    let active = true;

    async function loadClips() {
      setLoadingClips(true);

      const { data, error } = await getEnglishClips(supabase);

      if (!active) return;

      if (error) {
        console.error("Error loading english clips:", error);
        setClips([]);
      } else {
        setClips((data ?? []) as EnglishClip[]);
      }

      setLoadingClips(false);
    }

    void loadClips();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [currentClip?.id]);

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
          feedbackLanguage: getBrowserFeedbackLanguage(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback(data.error ?? "No se pudo generar feedback.");
      } else {
        const feedbackText = data.feedback ?? "Sin feedback disponible.";
        setFeedback(feedbackText);
        await saveEnglishAttempt(feedbackText);
      }
    } catch (error) {
      console.error("English feedback error:", error);
      setFeedback("No se pudo generar feedback.");
    } finally {
      setLoadingAi(false);
    }
  }

  async function saveEnglishAttempt(feedbackText: string) {
    if (!currentClip) return;

    if (!user) {
      setSaveMessage("Feedback generado. Inicia sesion para guardar la respuesta en Rendimiento.");
      return;
    }

    const timeSpentSeconds = Math.max(
      1,
      Math.round((Date.now() - startedAtRef.current) / 1000)
    );

    const primaryPayload = {
      user_id: user.id,
      clip_id: currentClip.id,
      clip_title: currentClip.title ?? "Ingles arbitral",
      module: "english_referee",
      mode: "english",
      topic: currentClip.topic ?? "Ingles arbitral",
      answer_text: answer.trim() || (audioBlob ? "Respuesta de voz registrada" : null),
      score: null,
      feedback: feedbackText,
      english_score: null,
      vocabulary_score: null,
      clarity_score: null,
      terminology_score: null,
      grammar_score: null,
      technical_accuracy_score: null,
      pronunciation_score: audioBlob ? null : undefined,
      time_spent_seconds: timeSpentSeconds,
      created_at: new Date().toISOString(),
    };

    const fallbackPayload = {
      user_id: user.id,
      clip_title: currentClip.title ?? "Ingles arbitral",
      foul: null,
      restart: null,
      discipline: null,
      var_review: null,
      score: null,
      topic: currentClip.topic ?? "Ingles arbitral",
      difficulty: "english",
      technical_correct: null,
      restart_correct: null,
      discipline_correct: null,
      var_correct: null,
    };

    const result = await insertAttemptSafely(supabase, primaryPayload, fallbackPayload);

    if (result.saved) {
      setSaveMessage(
        result.usedFallback
          ? "Respuesta guardada con la estructura actual. Las metricas finas quedan preparadas."
          : "Respuesta de ingles guardada para Rendimiento."
      );
      return;
    }

    setSaveMessage(
      "Feedback generado. Registro de intento pendiente hasta habilitar campos opcionales de ingles en Supabase."
    );
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
      alert("No se pudo iniciar la grabacion. Revisa permisos del microfono.");
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
    setSaveMessage(null);
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
        Cargando clips de ingles...
      </div>
    );
  }

  if (!currentClip) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        Todavia no hay clips de ingles cargados.
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
            Anterior
          </button>

          <p className="text-sm font-black text-zinc-300">
            Clip {currentIndex + 1} / {clips.length}
          </p>

          <button
            onClick={nextClip}
            disabled={currentIndex >= clips.length - 1}
            className="rounded-xl bg-[#6fc11f] px-4 py-2 text-sm font-black text-black disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="absolute z-10 m-4 rounded-full bg-black/70 px-4 py-2 text-xs font-black">
            <span className="mr-2 text-[#6fc11f]">REC</span>
            Camara principal
          </div>

          <video
            key={currentClip.id}
            className="aspect-video w-full bg-black object-cover"
            controls
            src={currentClip.video_url}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111c25] p-4">
          <p className="text-sm font-black">Vocabulario util</p>

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
            Ingles arbitral
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Explica tu decision en ingles
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Escribila o grabala como si estuvieras comunicando en un
            contexto arbitral internacional.
          </p>
        </div>

        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder='Ejemplo: "The defender commits a reckless challenge stopping a promising attack. Direct free kick and yellow card."'
          className="min-h-40 w-full rounded-xl border border-white/10 bg-[#17222b] p-4 text-sm text-white outline-none placeholder:text-zinc-600"
        />

        <div className="grid gap-3 md:grid-cols-2">
          {!recording ? (
            <button
              onClick={startRecording}
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 font-black text-red-300 hover:bg-red-500/20"
            >
              Grabar respuesta de voz
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="rounded-xl bg-red-500 px-5 py-4 font-black text-white"
            >
              Detener grabacion
            </button>
          )}

          <button
            onClick={resetAnswer}
            className="rounded-xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
          >
            Limpiar respuesta
          </button>
        </div>

        {audioUrl && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-3 text-sm font-black text-[#6fc11f]">
              Respuesta de voz grabada
            </p>

            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        <button
          onClick={evaluate}
          disabled={(!answer.trim() && !audioBlob) || loadingAi}
          className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingAi ? "ANALIZANDO..." : "ENVIAR RESPUESTA"}
        </button>

        {saveMessage && (
          <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
            {saveMessage}
          </div>
        )}
        {feedback && (
          <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 p-5">
            <h3 className="font-black text-blue-300">Feedback IA</h3>

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




