"use client";

import { useEffect, useMemo, useState } from "react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Download,
  Gauge,
  IdCard,
  LineChart,
  LogOut,
  MapPin,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import {
  buildPerformanceDataset,
  getCriterionPerformance,
  getPerformanceSummary,
  getRecentHistory,
  getTopicPerformance,
  type AttemptRecord,
  type CriterionMetric,
  type ExamResultRecord,
  type PerformanceSummary,
  type RulesExamResultRecord,
  type TopicMetric,
} from "@/lib/performance";

type Attempt = AttemptRecord;
type Exam = ExamResultRecord;
type RulesExam = RulesExamResultRecord;
type RefCardTopic = {
  label: string;
  shortLabel: string;
  value: number | null;
  attempts: number;
};

const refCardTopicConfig = [
  { label: "VAR", shortLabel: "VAR", aliases: ["VAR"] },
  { label: "Fuera de juego", shortLabel: "FDJ", aliases: ["Fuera de juego", "Offside"] },
  { label: "Manos", shortLabel: "Manos", aliases: ["Manos", "Mano", "Handball"] },
  { label: "Disputas", shortLabel: "Disputas", aliases: ["Disputas", "Dispute", "Challenge"] },
  { label: "Faltas tacticas", shortLabel: "Faltas", aliases: ["Faltas tacticas", "Tactical foul"] },
];

export default function ProfilePage() {
  const { user, isLoaded } = useUser();

  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [rulesResults, setRulesResults] = useState<RulesExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [refereeType, setRefereeType] = useState("Amateur");
  const [mainRole, setMainRole] = useState("Arbitro principal");
  const [association, setAssociation] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!isLoaded) return;

      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const [attemptsRes, examsRes, rulesRes, profileRes] = await Promise.all([
        supabase
          .from("attempts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("exam_results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rules_exam_results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setAttempts((attemptsRes.data ?? []) as Attempt[]);
      setExams((examsRes.data ?? []) as Exam[]);
      setRulesResults(rulesRes.error ? [] : ((rulesRes.data ?? []) as RulesExam[]));

      if (rulesRes.error) {
        console.warn("Rules exam profile metrics unavailable:", rulesRes.error.message);
      }

      if (profileRes.data) {
        setRefereeType(profileRes.data.referee_type ?? "Amateur");
        setMainRole(profileRes.data.main_role ?? "Arbitro principal");
        setAssociation(profileRes.data.association ?? "");
        setCategory(profileRes.data.category ?? "");
        setAvatarUrl(profileRes.data.avatar_url ?? "");
      }

      setLoading(false);
    }

    loadProfile();
  }, [isLoaded, user]);

  async function saveProfile() {
    if (!user) return;

    setSavingProfile(true);

    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        referee_type: refereeType,
        main_role: mainRole,
        association,
        category,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    setSavingProfile(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Perfil guardado correctamente.");
  }

  async function uploadAvatar(file: File) {
    if (!user) return;

    try {
      setUploadingAvatar(true);

      const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
      setAvatarUrl(publicUrl);

      const { error: profileError } = await supabase.from("user_profiles").upsert(
        {
          user_id: user.id,
          referee_type: refereeType,
          main_role: mainRole,
          association,
          category,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        alert(profileError.message);
        return;
      }

      alert("Foto actualizada correctamente.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const dataset = useMemo(
    () =>
      buildPerformanceDataset({
        attempts,
        examResults: exams,
        rulesExamResults: rulesResults,
      }),
    [attempts, exams, rulesResults]
  );

  const summary = useMemo(
    () => getPerformanceSummary(dataset.items, dataset.sessions),
    [dataset.items, dataset.sessions]
  );

  const stats = useMemo(() => {
    const trainingScores = dataset.sessions
      .filter((session) => session.source === "training")
      .map((session) => session.score)
      .filter(isFiniteNumber);
    const examScores = dataset.sessions
      .filter((session) => session.source !== "training")
      .map((session) => session.score)
      .filter(isFiniteNumber);

    return {
      hasData: summary.hasData,
      hasAttempts: trainingScores.length > 0,
      hasExams: examScores.length > 0,
      totalAttempts: summary.totalTrainings,
      totalExams: summary.totalEvaluations,
      avgAttempt: averageNumbers(trainingScores),
      avgExam: averageNumbers(examScores),
      bestExam: examScores.length ? Math.max(...examScores) : null,
      level: summary.hasData ? `Nivel ${summary.status}` : "Sin actividad",
      activity: summary.totalTrainings + summary.totalEvaluations,
      state: summary.status,
      rating: summary.avgScore ?? 0,
    };
  }, [dataset.sessions, summary]);

  const criteria = useMemo(() => getCriterionPerformance(dataset.items), [dataset.items]);
  const topics = useMemo(() => getTopicPerformance(dataset.items), [dataset.items]);
  const refCardTopics = useMemo(() => buildRefCardTopics(topics), [topics]);
  const trend = useMemo(() => getRecentHistory(dataset.items, 6), [dataset.items]);
  const trendScores = useMemo(
    () =>
      dataset.sessions
        .map((session) => session.score)
        .filter(isFiniteNumber)
        .slice(-8),
    [dataset.sessions]
  );
  const disciplineMetric = criteria.find((item) => item.key === "discipline");
  const lastTestDate = useMemo(() => {
    const testSessions = dataset.sessions
      .filter((session) => session.source !== "training" && session.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return testSessions[0]?.date ?? exams[0]?.created_at ?? rulesResults[0]?.created_at ?? null;
  }, [dataset.sessions, exams, rulesResults]);
  const refCardBadge = getRefCardBadge(summary, refereeType);
  const disciplineLabel = getDisciplineLabel(disciplineMetric);
  const trendLabel = getTrendLabel(trendScores);

  if (!isLoaded || loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#101b24] p-6 text-zinc-400">
          Cargando perfil...
        </div>
      </AppShell>
    );
  }

  const displayName = user?.fullName || "Arbitro RefLab";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Sin email";
  const photo = avatarUrl || user?.imageUrl || "";

  function downloadRefCard() {
    const svg = createRefCardSvg({
      name: displayName,
      email,
      rating: stats.rating,
      level: stats.level,
      refereeType,
      mainRole,
      association: association || "Sin liga",
      category: category || "Sin categoria",
      photo,
    });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(displayName)}-ref-card.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1240px] space-y-5 overflow-hidden">
        <PlayerCard
          name={displayName}
          email={email}
          photo={photo}
          score={summary.avgScore}
          evaluations={stats.totalExams}
          bestScore={summary.bestScore}
          status={stats.hasData ? summary.status : "Pendiente"}
          badge={refCardBadge}
          level={stats.level}
          refereeType={refereeType}
          mainRole={mainRole}
          association={association || "No registrado"}
          category={category || "No registrado"}
          location="No registrado"
          discipline={disciplineLabel}
          experience="No registrado"
          lastTest={formatShortDate(lastTestDate)}
          ranking="Pendiente"
          trainings={stats.totalAttempts}
          topics={refCardTopics}
          trendScores={trendScores}
          trendLabel={trendLabel}
          uploadingAvatar={uploadingAvatar}
          onUpload={uploadAvatar}
          onDownload={downloadRefCard}
        />

        <section className="space-y-4 rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Ficha tecnica
            </p>
            <h1 className="mt-3 text-3xl font-black lg:text-5xl">
              Perfil arbitral
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Identidad, rol, categoria y lectura rapida de rendimiento. La ficha conserva tus datos reales y usa las mismas metricas que Rendimiento.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Star />} title="Promedio training" value={stats.hasAttempts ? `${stats.avgAttempt}/100` : "-"} detail={stats.hasAttempts ? "Practicas individuales" : "Sin intentos"} />
            <MetricCard icon={<Trophy />} title="Promedio examen" value={stats.hasExams ? `${stats.avgExam}/100` : "-"} detail={stats.hasExams ? "Evaluaciones formales" : "Sin examenes"} />
            <MetricCard icon={<ClipboardList />} title="Actividad" value={stats.hasData ? stats.activity.toString() : "-"} detail={stats.hasData ? "Total registrado" : "Sin actividad"} />
            <MetricCard icon={<BadgeCheck />} title="Estado" value={stats.hasData ? stats.state : "-"} detail={stats.hasData ? "Lectura general" : "Sin evaluacion"} />
          </div>

          {!stats.hasData && (
            <div className="rounded-3xl border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-5 text-center">
              <p className="font-black text-white">Todavia no hay actividad real.</p>
              <p className="mt-2 text-sm text-zinc-400">
                Cuando completes ejercicios o examenes, tus estadisticas apareceran aca.
              </p>
            </div>
          )}

          <Panel title="Plan recomendado" subtitle="Sugerido con datos reales disponibles.">
            <InfoRow label="Modulo recomendado" value={stats.hasData ? summary.recommendedModule : "Sin datos suficientes"} />
            <InfoRow label="Topico fuerte" value={summary.strongestTopic?.topic ?? "Sin datos"} />
            <InfoRow label="Topico a mejorar" value={summary.weakestTopic?.topic ?? "Sin datos"} />
          </Panel>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ProfileSelect
            icon={<ShieldCheck />}
            label="Tipo de arbitro"
            value={refereeType}
            onChange={setRefereeType}
            options={["AFA", "Amateur", "Liga regional", "Instructor", "VAR"]}
          />

          <ProfileSelect
            icon={<Trophy />}
            label="Rol principal"
            value={mainRole}
            onChange={setMainRole}
            options={["Arbitro principal", "Arbitro asistente", "Cuarto arbitro", "VAR", "AVAR", "Instructor"]}
          />

          <ProfileInput label="Asociacion / Liga" value={association} onChange={setAssociation} placeholder="Ej: AFA, Liga regional, FAFI" />
          <ProfileInput label="Categoria" value={category} onChange={setCategory} placeholder="Ej: Primera, Reserva, Amateur, Inferiores" />
        </section>

        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
        >
          <Save size={22} />
          {savingProfile ? "GUARDANDO..." : "GUARDAR PERFIL"}
        </button>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Identidad arbitral" subtitle="Datos reales del perfil.">
            <InfoRow label="Tipo" value={refereeType} />
            <InfoRow label="Funcion" value={mainRole} />
            <InfoRow label="Asociacion / Liga" value={association || "Sin cargar"} />
            <InfoRow label="Categoria" value={category || "Sin cargar"} />
            <InfoRow label="Nivel RefLab" value={stats.level} />
          </Panel>

          <Panel title="Precision por criterio" subtitle="Perfil tecnico actual.">
            {criteria.some((item) => item.accuracy !== null) ? (
              criteria.map((item) => <Bar key={item.label} label={item.label} value={item.accuracy ?? 0} />)
            ) : (
              <Empty text="Completa ejercicios para calcular precision por criterio." />
            )}
          </Panel>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Panel title="Evolucion reciente" subtitle="Ultimos intentos registrados.">
            <div className="space-y-3">
              {trend.length === 0 ? (
                <Empty text="Todavia no hay intentos." />
              ) : (
                trend.map((item, index) => (
                  <HistoryRow
                    key={item.id}
                    title={`Intento #${index + 1}`}
                    date={item.date}
                    meta={`${item.topic ?? "Sin tema"} - ${item.modeLabel}`}
                    score={item.score}
                  />
                ))
              )}
            </div>
          </Panel>

          <Panel title="Historial de examenes" subtitle="Resultados guardados del modo examen.">
            <div className="space-y-3">
              {exams.length === 0 ? (
                <Empty text="Todavia no hay examenes guardados." />
              ) : (
                exams.slice(0, 6).map((exam) => (
                  <HistoryRow
                    key={exam.id}
                    title={`Examen - ${exam.correct_count ?? 0}/${exam.total_questions ?? 0}`}
                    date={exam.created_at}
                    meta="Evaluacion formal"
                    score={exam.avg_score ?? null}
                  />
                ))
              )}
            </div>
          </Panel>
        </section>

        <SignOutButton>
          <button className="flex w-full items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 font-black text-red-300 transition hover:bg-red-500/20">
            <LogOut size={22} />
            CERRAR SESION
          </button>
        </SignOutButton>
      </div>
    </AppShell>
  );
}

function PlayerCard({
  name,
  email,
  photo,
  score,
  evaluations,
  bestScore,
  status,
  badge,
  level,
  refereeType,
  mainRole,
  association,
  category,
  location,
  discipline,
  experience,
  lastTest,
  ranking,
  trainings,
  topics,
  trendScores,
  trendLabel,
  uploadingAvatar,
  onUpload,
  onDownload,
}: {
  name: string;
  email: string;
  photo: string;
  score: number | null;
  evaluations: number;
  bestScore: number | null;
  status: string;
  badge: string;
  level: string;
  refereeType: string;
  mainRole: string;
  association: string;
  category: string;
  location: string;
  discipline: string;
  experience: string;
  lastTest: string;
  ranking: string;
  trainings: number;
  topics: RefCardTopic[];
  trendScores: number[];
  trendLabel: string;
  uploadingAvatar: boolean;
  onUpload: (file: File) => void;
  onDownload: () => void;
}) {
  const scoreLabel = score === null ? "--" : score.toString();
  const bestLabel = bestScore === null ? "--" : bestScore.toString();
  const refLabId = score === null ? "#00000" : `#${String(Math.round(score)).padStart(5, "0")}`;

  return (
    <article className="relative w-full max-w-full overflow-hidden rounded-[34px] border border-[#6fc11f]/35 bg-[radial-gradient(circle_at_14%_8%,rgba(111,193,31,0.34),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(111,193,31,0.14),transparent_28%),linear-gradient(145deg,#05070d,#071019_48%,#0e1416)] p-3 shadow-[0_32px_110px_rgba(0,0,0,0.62)] sm:rounded-[42px] sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#b7ff8a] to-transparent" />
      <div className="pointer-events-none absolute bottom-5 left-5 top-5 hidden w-12 rounded-[28px] border border-white/10 bg-black/30 lg:block">
        <p className="absolute left-1/2 top-8 -translate-x-1/2 rotate-90 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.45em] text-zinc-400">
          REFLAB ID
        </p>
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 -rotate-90 whitespace-nowrap text-sm font-black tracking-[0.22em] text-[#6fc11f]">
          {refLabId}
        </p>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1fr)] lg:pl-16">
        <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(111,193,31,0.16),rgba(0,0,0,0.42))] p-3 sm:p-4">
          <div className="absolute -left-16 top-12 h-56 w-32 rotate-12 rounded-[32px] bg-[#6fc11f]/25 blur-sm" />
          <label className="group relative block cursor-pointer overflow-hidden rounded-[26px] border border-[#6fc11f]/35 bg-[#04080d] shadow-[0_0_55px_rgba(111,193,31,0.16)]" title="Cambiar foto">
            {photo ? (
              <img
                src={photo}
                alt="Foto de perfil"
                className="aspect-[4/5] w-full object-cover object-center opacity-95 transition duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.18),transparent_58%),#101b24]">
                <UserRound className="text-[#6fc11f]" size={86} />
              </div>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <span className="absolute inset-x-4 bottom-4 flex min-h-11 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-black/55 text-xs font-black uppercase tracking-[0.18em] text-[#b7ff8a] opacity-100 backdrop-blur transition group-hover:bg-[#6fc11f] group-hover:text-black">
              {uploadingAvatar ? "Subiendo..." : "Cambiar foto"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
          </label>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <RefCardInfo icon={<IdCard size={17} />} label="Tipo" value={refereeType} />
            <RefCardInfo icon={<Sparkles size={17} />} label="Badge" value={badge} tone="green" />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0 rounded-[30px] border border-white/10 bg-black/25 p-4 backdrop-blur sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.34em] text-[#6fc11f]">REFLAB</p>
                  <p className="mt-1 text-xs tracking-[0.34em] text-zinc-400">Referee Decision Lab</p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#b7ff8a]">
                  <CheckCircle2 size={16} />
                  Verificado RefLab
                </div>
              </div>

              <div className="mt-6 min-w-0">
                <h2 className="break-words text-4xl font-black leading-none text-white sm:text-5xl xl:text-6xl">
                  {name}
                </h2>
                <p className="mt-3 break-words text-base font-black uppercase tracking-[0.18em] text-[#6fc11f] sm:text-lg">
                  {mainRole}
                </p>
                <p className="mt-3 break-words text-sm leading-6 text-zinc-400">{email}</p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <RefCardInfo icon={<ShieldCheck size={18} />} label="Asociacion" value={association} />
                <RefCardInfo icon={<Gauge size={18} />} label="Nivel" value={level} />
                <RefCardInfo icon={<Trophy size={18} />} label="Categoria" value={category} />
                <RefCardInfo icon={<MapPin size={18} />} label="Ciudad / pais" value={location} />
              </div>
            </section>

            <aside className="grid gap-3 rounded-[30px] border border-white/10 bg-black/25 p-4 backdrop-blur">
              <SideMetric icon={<ShieldCheck size={22} />} label="Disciplina" value={discipline} />
              <SideMetric icon={<Clock3 size={22} />} label="Experiencia" value={experience} />
              <SideMetric icon={<CalendarDays size={22} />} label="Ultimo test" value={lastTest} />
              <SideMetric icon={<Trophy size={22} />} label="Ranking" value={ranking} />
              <SideMetric icon={<Activity size={22} />} label="Entrenamientos" value={trainings > 0 ? trainings.toString() : "Sin datos"} />
            </aside>
          </div>

          <section className="grid gap-3 rounded-[30px] border border-white/10 bg-black/35 p-3 shadow-[inset_0_0_42px_rgba(255,255,255,0.02)] sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
            <RefStatCard icon={<Target size={25} />} label="Score" value={scoreLabel} detail={status} featured />
            <RefStatCard icon={<ClipboardList size={25} />} label="Tests" value={evaluations > 0 ? evaluations.toString() : "--"} detail="Completados" />
            <RefStatCard icon={<Star size={25} />} label="Best" value={bestLabel} detail="Puntaje maximo" />
            <RefTrendCard scores={trendScores} label={trendLabel} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <RefRadar topics={topics} />
            <div className="grid gap-4">
              <div className="rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="text-[#6fc11f]" size={30} />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Verificado</p>
                    <p className="font-black text-[#b7ff8a]">REFLAB</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">REFLAB.APP</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-500">{refLabId} REFLAB ID</p>
                  </div>
                  <FakeQr />
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-xs font-black text-[#b7ff8a] transition hover:bg-[#6fc11f]/20">
              {uploadingAvatar ? "SUBIENDO FOTO..." : "CAMBIAR FOTO"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                }}
              />
            </label>

            <button
              type="button"
              onClick={onDownload}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-xs font-black text-black transition hover:bg-[#82dc2a]"
            >
              <Download size={17} />
              DESCARGAR REF CARD
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function RefCardInfo({ icon, label, value, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; tone?: "neutral" | "green" }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 ${tone === "green" ? "border-[#6fc11f]/25 bg-[#6fc11f]/10" : "border-white/10 bg-black/25"}`}>
      <div className="flex items-center gap-2 text-[#6fc11f]">{icon}</div>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-white">{value || "No registrado"}</p>
    </div>
  );
}

function SideMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <p className="mt-1 break-words text-sm font-black text-white">{value}</p>
      </div>
    </div>
  );
}

function RefStatCard({ icon, label, value, detail, featured = false }: { icon: React.ReactNode; label: string; value: string; detail: string; featured?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[24px] border p-4 ${featured ? "border-[#6fc11f]/35 bg-[#6fc11f]/10" : "border-white/10 bg-[#071019]"}`}>
      <div className="text-[#6fc11f]">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-5xl font-black leading-none text-white">{value}</p>
      <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${featured ? "border-[#6fc11f]/45 text-[#b7ff8a]" : "border-white/10 text-zinc-400"}`}>
        {detail}
      </p>
    </div>
  );
}

function RefTrendCard({ scores, label }: { scores: number[]; label: string }) {
  return (
    <div className="min-w-0 rounded-[24px] border border-white/10 bg-[#071019] p-4">
      <div className="text-[#6fc11f]"><LineChart size={25} /></div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">Rating trend</p>
      <TrendSparkline scores={scores} />
      <p className="mt-2 inline-flex rounded-full border border-[#6fc11f]/35 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#b7ff8a]">
        {label}
      </p>
    </div>
  );
}

function TrendSparkline({ scores }: { scores: number[] }) {
  const values = scores.length >= 2 ? scores : [18, 34, 27, 48, 56, 68, 74, 86];
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 150;
      const y = 58 - (Math.max(0, Math.min(value, 100)) / 100) * 48;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 150 64" className="mt-2 h-16 w-full overflow-visible">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6fc11f" stopOpacity="0.4" />
          <stop offset="1" stopColor="#6fc11f" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,62 ${points} 150,62`} fill="url(#trendFill)" stroke="none" />
      <polyline points={points} fill="none" stroke="#6fc11f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(" ").map((point) => {
        const [x, y] = point.split(",");
        return <circle key={point} cx={x} cy={y} r="3" fill="#b7ff8a" />;
      })}
    </svg>
  );
}

function RefRadar({ topics }: { topics: RefCardTopic[] }) {
  const points = profileRadarPoints(topics.map((topic) => topic.value ?? 0), 84, 110);
  const guideRings = [25, 50, 75, 100].map((value) => profileRadarPoints([value, value, value, value, value], 84, 110));
  const hasAnyData = topics.some((topic) => topic.value !== null);

  return (
    <div className="min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-[#050b12] p-4 shadow-[inset_0_0_60px_rgba(111,193,31,0.08)] sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="text-[#6fc11f]" size={22} />
        <p className="text-sm font-black uppercase tracking-[0.22em] text-[#b7ff8a]">Radar arbitral</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.78fr_1fr] lg:items-center">
        <div className="space-y-3">
          {topics.map((topic) => (
            <div key={topic.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <p className="break-words text-sm font-black uppercase tracking-[0.08em] text-zinc-200">{topic.shortLabel}</p>
              <p className="text-lg font-black text-[#6fc11f]">{topic.value === null ? "--" : topic.value}</p>
              <div className="col-span-2 h-px bg-gradient-to-r from-white/15 to-transparent" />
            </div>
          ))}
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-[26px] border border-[#6fc11f]/20 bg-black/30 p-3">
          <svg viewBox="0 0 220 220" className="h-full w-full">
            <defs>
              <filter id="profileRadarGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {guideRings.map((ring, index) => (
              <polygon key={index} points={ring} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
            ))}
            {topics.map((topic, index) => {
              const end = profileRadarAxisPoint(index, 84, 110);
              const label = profileRadarAxisPoint(index, 100, 110);
              return (
                <g key={topic.label}>
                  <line x1="110" y1="110" x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.12)" />
                  <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[7px] font-black uppercase">
                    {topic.shortLabel}
                  </text>
                </g>
              );
            })}
            <polygon points={points} fill="rgba(111,193,31,0.34)" stroke="#6fc11f" strokeWidth="4" filter="url(#profileRadarGlow)" />
            {points.split(" ").map((point) => {
              const [x, y] = point.split(",").map(Number);
              return <circle key={point} cx={x} cy={y} r="4" fill="#b7ff8a" />;
            })}
            <circle cx="110" cy="110" r="4" fill="#6fc11f" />
          </svg>

          {!hasAnyData && (
            <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-dashed border-[#6fc11f]/25 bg-[#050b12]/90 p-3 text-center text-xs font-bold text-zinc-300">
              Sin datos todavia
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FakeQr() {
  const active = new Set([0, 1, 2, 4, 5, 7, 8, 10, 13, 15, 16, 18, 20, 21, 23, 26, 28, 30, 31, 33, 35, 36, 37, 40, 42, 43, 45, 48]);
  return (
    <div className="grid h-20 w-20 shrink-0 grid-cols-7 gap-1 rounded-2xl border border-[#6fc11f]/45 bg-[#d9e5d2] p-2 shadow-[0_0_22px_rgba(111,193,31,0.2)]">
      {Array.from({ length: 49 }).map((_, index) => (
        <span key={index} className={active.has(index) ? "rounded-[2px] bg-black" : "rounded-[2px] bg-transparent"} />
      ))}
    </div>
  );
}

function ProfileSelect({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <div className="mb-3 flex items-center gap-3 text-[#6fc11f]">
        {icon}
        <p className="text-sm font-black uppercase tracking-[0.2em]">{label}</p>
      </div>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </div>
  );
}

function ProfileInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <p className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-[#6fc11f]">{label}</p>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none placeholder:text-zinc-600" />
    </div>
  );
}

function MetricCard({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#101b24] p-4">
      <div className="text-[#6fc11f]">{icon}</div>
      <p className="mt-3 text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-2 text-xs text-[#6fc11f]">{detail}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/25 px-4 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-black text-white">{value}</span>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-sm">
        <p className="font-black">{label}</p>
        <p className="text-[#6fc11f]">{value}%</p>
      </div>
      <div className="h-3 rounded-full bg-white/10">
        <div className="h-3 rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.35)]" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function HistoryRow({ title, date, meta, score }: { title: string; date?: string | null; meta: string; score?: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="min-w-0">
        <p className="truncate font-black">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{date ? new Date(date).toLocaleString("es-AR") : "Sin fecha"}</p>
        <p className="mt-1 truncate text-xs text-zinc-400">{meta}</p>
      </div>
      <p className="text-2xl font-black text-[#6fc11f]">{score ?? "-"}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-zinc-500">{text}</div>;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function averageNumbers(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function buildRefCardTopics(topicMetrics: TopicMetric[]): RefCardTopic[] {
  return refCardTopicConfig.map((target) => {
    const metric = topicMetrics.find((item) =>
      target.aliases.some((alias) => item.topic.toLowerCase() === alias.toLowerCase())
    );

    return {
      label: target.label,
      shortLabel: target.shortLabel,
      value: metric?.accuracy ?? null,
      attempts: metric?.attempts ?? 0,
    };
  });
}

function getRefCardBadge(summary: PerformanceSummary, refereeType: string) {
  if (!summary.hasData) return refereeType || "Amateur";
  if (summary.status === "Elite") return "Elite";
  if (summary.status === "Avanzado" || summary.status === "Solido") return "Avanzado";
  if (summary.status === "En desarrollo" || summary.status === "Inicial") return "Proyeccion";
  return refereeType || "Amateur";
}

function getDisciplineLabel(metric?: CriterionMetric) {
  if (!metric || metric.accuracy === null || metric.attempts === 0) return "Pendiente";
  if (metric.accuracy >= 85) return "Excelente";
  if (metric.accuracy >= 70) return "Correcta";
  return "A mejorar";
}

function getTrendLabel(scores: number[]) {
  if (scores.length < 2) return "Pendiente";
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (last - first >= 5) return "Subiendo";
  if (first - last >= 5) return "Bajando";
  return "Estable";
}

function formatShortDate(date?: string | null) {
  if (!date) return "Pendiente";
  return new Date(date).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function profileRadarPoints(values: number[], radius: number, center: number) {
  return values
    .map((value, index) => {
      const point = profileRadarAxisPoint(index, radius * (Math.max(0, Math.min(value, 100)) / 100), center);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function profileRadarAxisPoint(index: number, radius: number, center: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: Math.round((center + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((center + Math.sin(angle) * radius) * 10) / 10,
  };
}

function createRefCardSvg({
  name,
  email,
  rating,
  level,
  refereeType,
  mainRole,
  association,
  category,
  photo,
}: {
  name: string;
  email: string;
  rating: number;
  level: string;
  refereeType: string;
  mainRole: string;
  association: string;
  category: string;
  photo: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RF";
  const safePhoto = photo ? `<image href="${escapeXml(photo)}" x="160" y="170" width="280" height="280" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />` : `<text x="300" y="330" text-anchor="middle" font-size="76" font-weight="900" fill="#6fc11f">${escapeXml(initials)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#172613"/>
      <stop offset="0.5" stop-color="#071019"/>
      <stop offset="1" stop-color="#02060b"/>
    </linearGradient>
    <radialGradient id="glow" cx="30%" cy="8%" r="65%">
      <stop offset="0" stop-color="#6fc11f" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#6fc11f" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="avatarClip"><circle cx="300" cy="310" r="140"/></clipPath>
  </defs>
  <rect width="600" height="900" rx="44" fill="url(#cardBg)"/>
  <rect width="600" height="900" rx="44" fill="url(#glow)"/>
  <rect x="22" y="22" width="556" height="856" rx="36" fill="none" stroke="#6fc11f" stroke-opacity="0.45" stroke-width="3"/>
  <text x="48" y="82" font-family="Arial, sans-serif" font-size="23" font-weight="900" letter-spacing="8" fill="#b7ff8a">REF CARD</text>
  <text x="48" y="142" font-family="Arial, sans-serif" font-size="68" font-weight="900" fill="#ffffff">${rating || "--"}</text>
  <text x="48" y="176" font-family="Arial, sans-serif" font-size="22" font-weight="900" letter-spacing="10" fill="#7b8794">REF</text>
  <circle cx="300" cy="310" r="148" fill="#101b24" stroke="#6fc11f" stroke-width="8"/>
  ${safePhoto}
  <rect x="188" y="438" width="224" height="34" rx="17" fill="#6fc11f"/>
  <text x="300" y="462" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#05070d">MATCH OFFICIAL</text>
  <text x="300" y="535" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="900" fill="#ffffff">${escapeXml(name)}</text>
  <text x="300" y="570" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#b6c2cf">${escapeXml(email)}</text>
  <text x="300" y="620" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#b7ff8a">${escapeXml(level)}</text>
  ${svgInfoBox(58, 675, "ROL", mainRole)}
  ${svgInfoBox(320, 675, "LIGA", association)}
  ${svgInfoBox(58, 760, "TIPO", refereeType)}
  ${svgInfoBox(320, 760, "CATEGORIA", category)}
</svg>`;
}

function svgInfoBox(x: number, y: number, label: string, value: string) {
  return `<rect x="${x}" y="${y}" width="222" height="62" rx="18" fill="#050b12" stroke="#ffffff" stroke-opacity="0.12"/>
  <text x="${x + 18}" y="${y + 24}" font-family="Arial, sans-serif" font-size="12" font-weight="900" letter-spacing="3" fill="#7b8794">${label}</text>
  <text x="${x + 18}" y="${y + 48}" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff">${escapeXml(value).slice(0, 24)}</text>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ref-card";
}
