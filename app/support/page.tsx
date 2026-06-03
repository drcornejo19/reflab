"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  LifeBuoy,
  Loader2,
  Mail,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";

const categories = [
  "Error tecnico",
  "Problema con videos",
  "Problema con evaluaciones",
  "Cuenta y acceso",
  "Licencias institucionales",
  "Sugerencia de mejora",
  "Otro",
];

const faqs = [
  {
    question: "Como funciona RefLab?",
    answer:
      "RefLab combina entrenamiento arbitral, evaluaciones, video analisis, VAR Lab y metricas para transformar cada decision en aprendizaje.",
  },
  {
    question: "Como se calculan las estadisticas?",
    answer:
      "Las metricas se calculan con intentos reales guardados por usuario: respuestas, examenes, topicos, criterios y actividad reciente.",
  },
  {
    question: "Como funciona VAR Lab?",
    answer:
      "VAR Lab entrena protocolo, APP, OFR y lectura de errores claros y obvios mediante situaciones arbitrales.",
  },
  {
    question: "Como obtengo una licencia institucional?",
    answer:
      "Desde Instituciones podes solicitar una demo para escuelas, ligas o asociaciones arbitrales.",
  },
  {
    question: "Como reporto un error?",
    answer:
      "Selecciona Error tecnico, explica que paso y agrega la ruta o modulo donde ocurrio.",
  },
];

export default function SupportPage() {
  const { user } = useUser();
  const defaultName = useMemo(() => {
    const fullName = user?.fullName?.trim();
    if (fullName) return fullName;
    return [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  }, [user]);
  const defaultEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [category, setCategory] = useState(categories[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name && defaultName) setName(defaultName);
    if (!email && defaultEmail) setEmail(defaultEmail);
  }, [defaultEmail, defaultName, email, name]);

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, subject, message }),
      });
      const data = await response.json();

      if (!response.ok || data?.success === false) {
        throw new Error(data?.technical || data?.error || "No se pudo enviar la consulta.");
      }

      setSuccess(data.message || "Consulta enviada correctamente.");
      setSubject("");
      setMessage("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo enviar la consulta."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-[32px] border border-[#6fc11f]/20 bg-[#071019] p-5 shadow-[0_0_42px_rgba(111,193,31,0.08)] md:p-7">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
                Soporte
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white md:text-5xl">
                Centro de soporte RefLab
              </h1>
              <p className="mt-3 text-sm leading-7 text-zinc-400 md:text-base">
                Necesitas ayuda, reportar un error o realizar una consulta? Nuestro equipo
                respondera a la brevedad.
              </p>
            </div>

            <div className="grid h-20 w-20 place-items-center rounded-[28px] border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <LifeBuoy size={34} />
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#6fc11f] text-black">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Preguntas frecuentes</h2>
              <p className="text-sm text-zinc-500">Ayuda rapida antes de enviar una consulta.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-[22px] border border-white/10 bg-black/25 p-4"
              >
                <p className="text-sm font-black text-white">{faq.question}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {(success || error) && (
          <div
            className={`flex items-start gap-3 rounded-[22px] border p-4 text-sm ${
              error
                ? "border-red-500/25 bg-red-500/10 text-red-100"
                : "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-lime-100"
            }`}
          >
            {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <p className="font-black">{error ? "No se pudo enviar" : "Consulta enviada"}</p>
              <p className="mt-1">{error || success}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={submitSupport}
          className="rounded-[30px] border border-white/10 bg-[#071019] p-5 md:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <Mail size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">Enviar consulta</h2>
              <p className="text-sm text-zinc-500">
                El mensaje llegara al correo de soporte de RefLab.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
                placeholder="Tu nombre"
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
                placeholder="tu@email.com"
              />
            </Field>

            <Field label="Tipo de consulta">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#6fc11f]/60"
              >
                {categories.map((item) => (
                  <option key={item} value={item} className="bg-[#071019]">
                    {item}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Asunto">
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
                placeholder="Resumen de la consulta"
              />
            </Field>
          </div>

          <Field label="Mensaje" className="mt-4">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              rows={7}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
              placeholder="Contanos que paso o que necesitas resolver."
            />
          </Field>

          <button
            type="submit"
            disabled={sending}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#7de026] disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            {sending ? "Enviando..." : "Enviar consulta"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
