"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  ClipboardCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  activeInstitutionTypes,
  associationAssistantMetrics,
  associationRefereeMetrics,
  institutionalExperiences,
  institutionalComparatives,
  institutionTypeLabels,
  schoolExamFormats,
  schoolVideoTopics,
  type InstitutionType,
} from "@/lib/institutionalExperience";

const institutionTypes: InstitutionType[] = activeInstitutionTypes;

export default function InstitutionDemoPage() {
  const [institutionType, setInstitutionType] =
    useState<InstitutionType>("school");
  const profile = institutionalExperiences[institutionType];
  const seatsAvailable = profile.seatsTotal - profile.seatsUsed;

  return (
    <main className="min-h-screen w-full max-w-full overflow-hidden bg-[#020b14] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[-18%] top-[-20%] h-[500px] w-[500px] rounded-full bg-[#6fc11f]/10 blur-[130px]" />
        <div className="absolute bottom-[-20%] right-[-20%] h-[520px] w-[520px] rounded-full bg-[#6fc11f]/8 blur-[140px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1220px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[32px] border border-white/10 bg-[#0b131b]/95 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[#6fc11f]">
              Demo comprador institucional
            </p>
            <h1 className="mt-3 break-words text-3xl font-black leading-tight sm:text-5xl">
              {profile.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              {profile.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                institutionTypeLabels[institutionType],
                profile.plan,
                "Activa",
                `${profile.seatsTotal} cupos`,
                `${profile.instructors} instructores`,
              ].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#b7ff67]"
                  >
                    {item}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[380px]">
            <HeaderMetric label="Alumnos activos" value={String(profile.seatsUsed)} />
            <HeaderMetric label="Cupos" value={String(profile.seatsTotal)} />
            <HeaderMetric label="Instructores" value={String(profile.instructors)} />
          </div>
        </header>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-[#0b131b] p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
            Tipo de institucion
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {institutionTypes.map((type) => {
              const active = type === institutionType;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setInstitutionType(type)}
                  className={`min-h-16 rounded-2xl border px-4 text-left transition active:scale-[0.98] ${
                    active
                      ? "border-[#6fc11f] bg-[#6fc11f] text-black shadow-[0_0_30px_rgba(111,193,31,0.22)]"
                      : "border-white/10 bg-white/[0.04] text-white hover:border-[#6fc11f]/40"
                  }`}
                >
                  <span className="block text-sm font-black">
                    {institutionTypeLabels[type]}
                  </span>
                  <span
                    className={`mt-1 block text-xs font-semibold ${
                      active ? "text-black/70" : "text-zinc-500"
                    }`}
                  >
                    {institutionalExperiences[type].tone}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
            Federaciones queda como etapa futura. Por ahora la demo institucional
            se concentra en escuelas, ligas y asociaciones.
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {profile.kpis.map((kpi) => (
            <article
              key={kpi.label}
              className="rounded-[26px] border border-white/10 bg-[#0b131b] p-5"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                {kpi.label}
              </p>
              <p className="mt-3 break-words text-3xl font-black text-white">{kpi.value}</p>
              <p className="mt-2 text-sm font-semibold text-zinc-400">{kpi.detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Modulos priorizados" kicker={profile.headline}>
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.modules.map((module) => (
                <div
                  key={module.title}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <BadgeCheck className="shrink-0 text-[#6fc11f]" size={18} />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-black text-zinc-200">{module.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{module.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Metricas institucionales" kicker="Analitica adaptada">
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.metrics.map((metric) => (
                <div
                  key={metric}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <BarChart3 className="text-[#6fc11f]" size={20} />
                  <p className="mt-3 text-sm font-black text-zinc-200">{metric}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        {institutionType === "school" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <Panel title="Reglas de Juego IFAB" kicker="Biblioteca escuela">
              <p className="text-sm leading-6 text-zinc-400">
                La escuela trabaja una biblioteca resumida, pedagogica y dividida
                de Regla 1 a Regla 17, con explicacion simple, puntos clave y
                errores frecuentes.
              </p>
              <Link
                href="/institution/rules"
                className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
              >
                Abrir biblioteca IFAB
                <ArrowRight size={18} />
              </Link>
            </Panel>

            <Panel title="Examenes y videos escuela" kicker="Formacion inicial">
              <div className="grid gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                    Formatos de examen
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {schoolExamFormats.map((format) => (
                      <Chip key={format} label={format} />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                    Topicos oficiales de video
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {schoolVideoTopics.map((topic) => (
                      <Chip key={topic} label={topic} />
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </section>
        ) : null}

        {institutionType === "association" ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Panel title="Metricas por rol" kicker="Asociacion avanzada">
              <div className="grid gap-4">
                {[...associationRefereeMetrics, ...associationAssistantMetrics].map((group) => (
                  <div key={group.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-sm font-black text-white">{group.title}</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{group.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.metrics.map((metric) => (
                        <Chip key={metric} label={metric} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Comparativas" kicker="Categoria / grupo / cohorte">
              <div className="grid gap-3">
                {institutionalComparatives.map((item) => (
                  <div
                    key={item.label}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-4 sm:items-center"
                  >
                    <p className="text-sm font-black">{item.label}</p>
                    <p className="text-xs font-bold text-zinc-400">Promedio {item.average}</p>
                    <p className="text-xs font-bold text-zinc-400">Ranking #{item.ranking}</p>
                    <p className="text-xs font-black text-[#6fc11f]">{item.trend}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Cohortes / grupos" kicker="Organizacion">
            <div className="grid gap-3">
              {profile.cohorts.map((cohort) => (
                <div
                  key={cohort.name}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black">{cohort.name}</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {cohort.students} alumnos
                      </p>
                    </div>
                    <span className="text-sm font-black text-[#6fc11f]">{cohort.progress}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-[#6fc11f]"
                      style={{ width: `${cohort.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Alumnos demo" kicker="Seguimiento">
            <div className="grid gap-3">
              {profile.students.map((student) => (
                <article
                  key={student.name}
                  className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words text-base font-black">{student.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      <span>{student.level}</span>
                      <span>Score {student.score}</span>
                      <span>Ultima actividad: {student.last}</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      Topico a mejorar: <span className="font-bold text-white">{student.weak}</span>
                    </p>
                  </div>
                  <Link
                    href="/demo/student"
                    className="flex min-h-11 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-xs font-black text-[#b7ff67] transition hover:border-[#6fc11f]"
                  >
                    Ver perfil del alumno
                  </Link>
                </article>
              ))}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <Panel title="Panel de instructor" kicker="Acciones">
            <div className="grid gap-3">
              {profile.instructorFocus.map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <ClipboardCheck className="shrink-0 text-[#6fc11f]" size={20} />
                  <p className="text-sm font-semibold leading-6 text-zinc-300">{item}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Gestion de licencias" kicker={profile.plan}>
            <div className="grid gap-3">
              <LicenseRow label="Licencias compradas" value={String(profile.seatsTotal)} />
              <LicenseRow label="Licencias usadas" value={String(profile.seatsUsed)} />
              <LicenseRow label="Disponibles" value={String(seatsAvailable)} />
              <LicenseRow label="Vencimiento" value="30 Nov 2026" />
            </div>
            <button className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black">
              Renovar licencia
            </button>
          </Panel>

          <Panel title="Acciones rapidas" kicker="Demo operativa">
            <div className="grid gap-3">
              <DemoButton icon={UserPlus} label="Invitar alumno" />
              <DemoButton icon={ClipboardCheck} label="Asignar modulo" />
              {profile.customVideoEnabled ? (
                <Link
                  href="/institution/videos"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-sm font-black text-[#b7ff67] transition hover:border-[#6fc11f]"
                >
                  Gestionar videos propios
                  <ArrowRight size={18} />
                </Link>
              ) : null}
              <Link
                href="/demo/student"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-sm font-black text-[#b7ff67] transition hover:border-[#6fc11f]"
              >
                Ver demo como alumno
                <ArrowRight size={18} />
              </Link>
            </div>
          </Panel>
        </section>

        <section className="mt-6 rounded-[30px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#b7ff67]">
            Modelo B2B
          </p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">
            La institucion compra cupos, los instructores gestionan y los alumnos entrenan.
          </h2>
          <p className="mt-3 max-w-[860px] text-sm leading-6 text-zinc-300">
            Esta demo muestra el flujo comercial: licencia institucional, cupos activos, seguimiento por cohorte,
            evaluaciones, analytics y experiencia individual para cada alumno dentro de RefLab.
          </p>
        </section>
      </div>
    </main>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#6fc11f]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 sm:p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
        {kicker}
      </p>
      <h2 className="mt-3 break-words text-2xl font-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function LicenseRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <span className="text-sm font-semibold text-zinc-400">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">
      {label}
    </span>
  );
}

function DemoButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white">
      <Icon size={18} className="text-[#6fc11f]" />
      {label}
    </button>
  );
}
