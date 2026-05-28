"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

const institutionTypes = [
  "Escuela arbitral",
  "Asociacion",
  "Liga",
  "Federacion",
  "Otro",
];

const interestAreas = [
  "Entrenamiento",
  "Evaluaciones",
  "Video analisis",
  "VAR Lab",
  "Ref Performance",
  "Panel institucional",
  "Licencias para alumnos",
  "Otro",
];

type FormState = {
  fullName: string;
  role: string;
  institutionName: string;
  institutionType: string;
  country: string;
  city: string;
  refereeCount: string;
  instructorCount: string;
  email: string;
  whatsapp: string;
  interestAreas: string[];
  message: string;
};

const initialState: FormState = {
  fullName: "",
  role: "",
  institutionName: "",
  institutionType: institutionTypes[0],
  country: "",
  city: "",
  refereeCount: "",
  instructorCount: "",
  email: "",
  whatsapp: "",
  interestAreas: [],
  message: "",
};

export function InstitutionalLeadForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      form.fullName.trim().length > 0 &&
      form.institutionName.trim().length > 0 &&
      form.email.trim().length > 0,
    [form.email, form.fullName, form.institutionName]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleInterest(area: string) {
    setForm((current) => {
      const exists = current.interestAreas.includes(area);
      return {
        ...current,
        interestAreas: exists
          ? current.interestAreas.filter((item) => item !== area)
          : [...current.interestAreas, area],
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await fetch("/api/institutional-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        message?: string;
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(data.technical || data.error || "No se pudo enviar la solicitud.");
      }

      setSuccess(
        data.message ||
          "Solicitud recibida. Nos pondremos en contacto para coordinar una demo institucional."
      );
      setForm(initialState);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo enviar la solicitud institucional."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-[28px] border border-white/10 bg-[#0b131b]/95 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-6 lg:p-8"
    >
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
          Demo institucional
        </p>
        <h2 className="mt-3 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">
          Solicitar demo institucional
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Contanos que estructura queres profesionalizar y armamos una propuesta de implementacion.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Nombre y apellido"
          value={form.fullName}
          required
          onChange={(value) => updateField("fullName", value)}
        />
        <Field
          label="Cargo / rol"
          value={form.role}
          onChange={(value) => updateField("role", value)}
        />
        <Field
          label="Institucion"
          value={form.institutionName}
          required
          onChange={(value) => updateField("institutionName", value)}
        />
        <label className="grid gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
            Tipo de institucion
          </span>
          <select
            value={form.institutionType}
            onChange={(event) => updateField("institutionType", event.target.value)}
            className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white outline-none transition focus:border-[#6fc11f]/60"
          >
            {institutionTypes.map((type) => (
              <option key={type} value={type} className="bg-[#0b131b]">
                {type}
              </option>
            ))}
          </select>
        </label>
        <Field label="Pais" value={form.country} onChange={(value) => updateField("country", value)} />
        <Field label="Ciudad" value={form.city} onChange={(value) => updateField("city", value)} />
        <Field
          label="Cantidad aprox. de arbitros"
          value={form.refereeCount}
          inputMode="numeric"
          onChange={(value) => updateField("refereeCount", value)}
        />
        <Field
          label="Cantidad de instructores"
          value={form.instructorCount}
          inputMode="numeric"
          onChange={(value) => updateField("instructorCount", value)}
        />
        <Field
          label="Email"
          value={form.email}
          type="email"
          required
          onChange={(value) => updateField("email", value)}
        />
        <Field
          label="WhatsApp"
          value={form.whatsapp}
          onChange={(value) => updateField("whatsapp", value)}
        />
      </div>

      <div className="mt-5">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
          Que te interesa implementar
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {interestAreas.map((area) => {
            const active = form.interestAreas.includes(area);
            return (
              <button
                key={area}
                type="button"
                onClick={() => toggleInterest(area)}
                className={`min-h-11 rounded-2xl border px-3 text-left text-xs font-black transition active:scale-[0.98] ${
                  active
                    ? "border-[#6fc11f]/60 bg-[#6fc11f]/15 text-[#b7ff67]"
                    : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#6fc11f]/35"
                }`}
              >
                {area}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-5 grid gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
          Mensaje / objetivo
        </span>
        <textarea
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          rows={5}
          className="min-h-32 resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
          placeholder="Ejemplo: queremos evaluar una cohorte de alumnos, digitalizar examenes o armar un piloto con instructores."
        />
      </label>

      {success && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff67]">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || loading}
        className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] sm:w-auto"
      >
        {loading ? <Loader2 className="animate-spin" size={18} /> : null}
        Solicitar demo institucional
        {!loading ? <ArrowRight size={18} /> : null}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search";
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        required={required}
        type={type}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-[#6fc11f]/60"
      />
    </label>
  );
}
