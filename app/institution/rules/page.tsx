"use client";

import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { SportPageSwitch } from "@/components/SportPageSwitch";
import { getDisciplineDefinition, getDisciplineRoute } from "@/lib/discipline";
import { institutionalRules } from "@/lib/institutionalRules";
import { officialLibraryDocuments } from "@/lib/officialLibrary";
import { getLibraryTitleForSport } from "@/lib/sports";

export const dynamic = "force-dynamic";

export default function InstitutionRulesPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando reglas institucionales..." />}>
      <InstitutionRulesPageContent />
    </Suspense>
  );
}

function InstitutionRulesPageContent() {
  const { currentDiscipline: sportType } = useDiscipline();
  const featuredDocument = officialLibraryDocuments[sportType][0];
  const theme = getDisciplineDefinition(sportType).theme;

  return (
    <AppShell>
      <div className="space-y-6">
        <SportPageSwitch title="Disciplina reglamentaria" />

        <header
          className="rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), #0d1720`,
          }}
        >
          <p
            className="text-xs font-black uppercase tracking-[0.45em]"
            style={{ color: theme.accent }}
          >
            Escuela arbitral
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="break-words text-3xl font-black sm:text-5xl">
                {sportType === "futsal" ? "Biblioteca FIFA Futsal" : "Biblioteca resumida IFAB"}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                {sportType === "futsal"
                  ? "Acceso rapido a la normativa oficial de futsal y a la biblioteca separada por disciplina."
                  : "Resumen pedagogico para alumnos en formacion inicial. No reemplaza el texto oficial IFAB: ayuda a estudiar conceptos, puntos clave y errores frecuentes."}
              </p>
            </div>
            <Link
              href={getDisciplineRoute(sportType, "rulesExam")}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition"
              style={{
                backgroundColor: theme.button,
                color: theme.onAccent,
              }}
            >
              Rendir examen
              <ArrowRight size={18} />
            </Link>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[28px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
            <div className="flex items-start gap-4">
              <div
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.accentSoft,
                  color: theme.accent,
                }}
              >
                <BookOpen size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
                  Documento destacado
                </p>
                <h2 className="mt-2 break-words text-2xl font-black">
                  {featuredDocument?.title ?? getLibraryTitleForSport(sportType)}
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  {featuredDocument?.subtitle ?? "Acceso directo al documento oficial de la disciplina."}
                </p>
              </div>
            </div>

            {featuredDocument ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={featuredDocument.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
                  style={{
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }}
                >
                  Abrir fuente oficial
                  <ExternalLink size={16} />
                </a>
                <Link
                  href="/learning"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white"
                >
                  Ver biblioteca completa
                </Link>
              </div>
            ) : null}
          </article>

          <article
            className="rounded-[28px] border p-5 shadow-2xl"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.accentSoft,
            }}
          >
            <p
              className="text-[10px] font-black uppercase tracking-[0.24em]"
              style={{ color: theme.accent }}
            >
              Criterio de estudio
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <RuleBlock
                icon={BookOpen}
                title="Fuente correcta"
                theme={theme}
                items={[
                  sportType === "futsal" ? "FIFA Futsal Laws of the Game" : "Laws of the Game IFAB",
                  "Temporada vigente visible",
                  "Biblioteca separada por disciplina",
                ]}
              />
              <RuleBlock
                icon={CheckCircle2}
                title="Que conviene mirar"
                theme={theme}
                items={[
                  "Referencia reglamentaria",
                  "Topico tecnico",
                  "Consecuencia disciplinaria",
                ]}
              />
              <RuleBlock
                icon={TriangleAlert}
                title="Evitar mezclas"
                theme={theme}
                items={[
                  "No mezclar IFAB con FIFA Futsal",
                  "No usar fuera de juego en futsal",
                  "No estudiar material archivado como si fuera vigente",
                ]}
              />
            </div>
          </article>
        </section>

        {sportType === "football_11" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {institutionalRules.map((rule) => (
              <article
                key={rule.number}
                className="rounded-[28px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-black"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.accentSoft,
                      color: theme.accent,
                    }}
                  >
                    {rule.number}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">
                      Regla {rule.number}
                    </p>
                    <h2 className="mt-2 break-words text-xl font-black">{rule.title}</h2>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-6 text-zinc-300">
                  {rule.simpleExplanation}
                </p>

                <div className="mt-5 grid gap-4">
                  <RuleBlock icon={BookOpen} title="Conceptos principales" items={rule.mainConcepts} theme={theme} />
                  <RuleBlock icon={CheckCircle2} title="Puntos clave" items={rule.keyPoints} theme={theme} />
                  <RuleBlock icon={TriangleAlert} title="Errores frecuentes" items={rule.commonMistakes} theme={theme} />
                </div>

                <div
                  className="mt-5 rounded-2xl border p-4"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.accentSoft,
                  }}
                >
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.2em]"
                    style={{ color: theme.accent }}
                  >
                    Resumen rapido
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-zinc-200">
                    {rule.quickSummary}
                  </p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-[28px] border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
            <p className="text-lg font-black text-white">Material institucional de futsal</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
              Para futsal, RefLab redirige el estudio institucional a la biblioteca y a los examenes
              separados por disciplina. Asi evitamos resumir con criterio IFAB un reglamento que depende de FIFA.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function RuleBlock({
  icon: Icon,
  title,
  items,
  theme,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color: theme.accent }} />
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-sm font-semibold leading-5 text-zinc-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
