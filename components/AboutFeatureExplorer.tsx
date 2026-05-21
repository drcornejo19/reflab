"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  MonitorCheck,
  PlaySquare,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";

type FeatureId = "var" | "train" | "analyze" | "decide" | "improve" | "learn";

type Feature = {
  id: FeatureId;
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  cta: string;
  icon: LucideIcon;
};

const features: Feature[] = [
  {
    id: "var",
    title: "VAR Lab",
    eyebrow: "Protocolo",
    description:
      "Entrená protocolo VAR, OFR, APP, errores claros y obvios, factual vs interpretativo y decisión final.",
    href: "/training/var",
    cta: "Abrir VAR Lab",
    icon: MonitorCheck,
  },
  {
    id: "train",
    title: "Entrená",
    eyebrow: "Práctica",
    description:
      "Practicá situaciones arbitrales reales mediante clips, preguntas, criterios técnicos y simulaciones de partido.",
    href: "/training",
    cta: "Ir a Entrenamiento",
    icon: ShieldCheck,
  },
  {
    id: "analyze",
    title: "Analizá",
    eyebrow: "Lectura técnica",
    description:
      "Revisá jugadas, fundamentos, posicionamiento, comunicación y toma de decisiones con una mirada técnica.",
    href: "/training/video-analysis",
    cta: "Analizar clips",
    icon: PlaySquare,
  },
  {
    id: "decide",
    title: "Decidí",
    eyebrow: "Criterio",
    description:
      "Tomá decisiones arbitrales bajo contexto: infracción, reanudación, disciplina, VAR y justificación.",
    href: "/training/decision",
    cta: "Entrenar decisión",
    icon: Target,
  },
  {
    id: "improve",
    title: "Mejorá",
    eyebrow: "Datos",
    description:
      "Detectá fortalezas, puntos críticos y patrones para construir un plan de mejora personalizado.",
    href: "/performance",
    cta: "Ver rendimiento",
    icon: BarChart3,
  },
  {
    id: "learn",
    title: "Aprendé",
    eyebrow: "Biblioteca",
    description:
      "Accedé a reglas, biblioteca IFAB, protocolo VAR, inglés arbitral y material formativo.",
    href: "/learning",
    cta: "Abrir biblioteca",
    icon: BookOpen,
  },
];

export function AboutFeatureExplorer() {
  const [selectedId, setSelectedId] = useState<FeatureId>("train");
  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === selectedId) ?? features[0],
    [selectedId]
  );
  const SelectedIcon = selectedFeature.icon;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          const active = feature.id === selectedFeature.id;

          return (
            <button
              key={feature.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(feature.id)}
              className={`group cursor-pointer rounded-[24px] border p-4 text-center shadow-xl outline-none transition duration-300 active:scale-[0.98] ${
                active
                  ? "border-[#6fc11f]/70 bg-[#6fc11f]/15 shadow-[0_0_34px_rgba(111,193,31,0.2)]"
                  : "border-white/10 bg-[#101b24] hover:-translate-y-1 hover:border-[#6fc11f]/55 hover:bg-[#13212b] hover:shadow-[0_0_28px_rgba(111,193,31,0.14)]"
              }`}
            >
              <div
                className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl border transition duration-300 ${
                  active
                    ? "border-[#6fc11f]/80 bg-[#6fc11f] text-black"
                    : "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f] group-hover:border-[#6fc11f]/70 group-hover:bg-[#6fc11f]/20"
                }`}
              >
                <Icon className="h-6 w-6" />
              </div>

              <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-white">
                {feature.id === "var" ? "VAR" : feature.title}
              </p>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[30px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.14),transparent_36%),#0d1720] p-5 shadow-2xl lg:p-6">
        <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#6fc11f] shadow-[0_0_30px_rgba(111,193,31,0.14)]">
            <SelectedIcon className="h-8 w-8" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
              {selectedFeature.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-black text-white lg:text-3xl">
              {selectedFeature.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-300 lg:max-w-3xl">
              {selectedFeature.description}
            </p>
          </div>

          <Link
            href={selectedFeature.href}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] active:scale-[0.98] lg:w-auto"
          >
            {selectedFeature.cta}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
