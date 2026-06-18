"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useI18n } from "@/lib/useI18n";
import type { TranslationKey } from "@/lib/languagePreference";
import {
  BookOpenCheck,
  ChevronRight,
  Languages,
  MonitorCheck,
  PlaySquare,
  ShieldCheck,
  Timer,
  type LucideIcon,
} from "lucide-react";

type EvaluationCard = {
  titleKey: TranslationKey;
  categoryKey: TranslationKey;
  descriptionKey: TranslationKey;
  status: "Disponible" | "Proximamente" | "Beta";
  href?: string;
  icon: LucideIcon;
};

const evaluations: EvaluationCard[] = [
  {
    titleKey: "evaluations.videoAnalysis.title",
    categoryKey: "evaluations.videoAnalysis.category",
    descriptionKey: "evaluations.videoAnalysis.description",
    status: "Disponible",
    href: "/training/video-analysis",
    icon: PlaySquare,
  },
  {
    titleKey: "evaluations.refereeExam.title",
    categoryKey: "evaluations.refereeExam.category",
    descriptionKey: "evaluations.refereeExam.description",
    status: "Disponible",
    href: "/training/exam",
    icon: ShieldCheck,
  },
  {
    titleKey: "evaluations.rulesExam.title",
    categoryKey: "evaluations.rulesExam.category",
    descriptionKey: "evaluations.rulesExam.description",
    status: "Disponible",
    href: "/training/rules-exam",
    icon: BookOpenCheck,
  },
  {
    titleKey: "evaluations.varExam.title",
    categoryKey: "evaluations.varExam.category",
    descriptionKey: "evaluations.varExam.description",
    status: "Proximamente",
    icon: MonitorCheck,
  },
  {
    titleKey: "evaluations.englishExam.title",
    categoryKey: "evaluations.englishExam.category",
    descriptionKey: "evaluations.englishExam.description",
    status: "Proximamente",
    icon: Languages,
  },
  {
    titleKey: "evaluations.timedSimulation.title",
    categoryKey: "evaluations.timedSimulation.category",
    descriptionKey: "evaluations.timedSimulation.description",
    status: "Proximamente",
    icon: Timer,
  },
];

export default function EvaluationsPage() {
  const { t } = useI18n();

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            {t("evaluations.kicker")}
          </p>

          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-4xl font-black md:text-5xl">{t("evaluations.title")}</h1>

              <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
                {t("evaluations.description")}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {evaluations.map((evaluation) => (
            <EvaluationModuleCard key={evaluation.titleKey} item={evaluation} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function EvaluationModuleCard({ item }: { item: EvaluationCard }) {
  const Icon = item.icon;
  const { t } = useI18n();
  const statusLabel =
    item.status === "Disponible"
      ? t("common.available")
      : item.status === "Beta"
        ? t("common.beta")
        : t("common.comingSoon");

  const content = (
    <>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
            {statusLabel}
          </span>
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {t(item.categoryKey)}
        </p>

        <h2 className="mt-3 text-2xl font-black">{t(item.titleKey)}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">{t(item.descriptionKey)}</p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {item.href ? t("common.open") : t("common.comingSoon")}
        </span>
        <ChevronRight
          className={`text-zinc-600 transition ${
            item.href ? "group-hover:translate-x-1 group-hover:text-[#6fc11f]" : ""
          }`}
        />
      </div>
    </>
  );

  if (!item.href) {
    return (
      <div className="flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 opacity-80 shadow-2xl">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="group flex min-h-[260px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      {content}
    </Link>
  );
}
