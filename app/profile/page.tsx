"use client";

import { useEffect, useMemo, useState } from "react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import {
  BadgeCheck,
  ClipboardList,
  Download,
  Gauge,
  LogOut,
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
  type AttemptRecord,
  type ExamResultRecord,
  type RulesExamResultRecord,
} from "@/lib/performance";

type Attempt = AttemptRecord;
type Exam = ExamResultRecord;
type RulesExam = RulesExamResultRecord;

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
  const trend = useMemo(() => getRecentHistory(dataset.items, 6), [dataset.items]);

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
      <div className="mx-auto w-full max-w-[1120px] space-y-5">
        <section className="grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)] lg:items-stretch">
          <PlayerCard
            name={displayName}
            email={email}
            photo={photo}
            rating={stats.rating}
            level={stats.level}
            refereeType={refereeType}
            mainRole={mainRole}
            association={association || "Sin liga"}
            category={category || "Sin categoria"}
            uploadingAvatar={uploadingAvatar}
            onUpload={uploadAvatar}
            onDownload={downloadRefCard}
          />

          <div className="space-y-4 rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-6">
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
          </div>
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
  rating,
  level,
  refereeType,
  mainRole,
  association,
  category,
  uploadingAvatar,
  onUpload,
  onDownload,
}: {
  name: string;
  email: string;
  photo: string;
  rating: number;
  level: string;
  refereeType: string;
  mainRole: string;
  association: string;
  category: string;
  uploadingAvatar: boolean;
  onUpload: (file: File) => void;
  onDownload: () => void;
}) {
  return (
    <article className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[38px] border border-[#6fc11f]/35 bg-[radial-gradient(circle_at_20%_0%,rgba(111,193,31,0.32),transparent_34%),linear-gradient(145deg,#152213,#071019_54%,#02060b)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-x-8 top-0 h-px bg-[#b7ff8a]/70" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[#b7ff8a]">REF CARD</p>
          <p className="mt-2 text-5xl font-black leading-none text-white">{rating || "--"}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.28em] text-zinc-400">REF</p>
        </div>
        <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-2 text-right">
          <p className="text-xs font-black text-[#6fc11f]">{refereeType}</p>
          <p className="mt-1 text-[10px] text-zinc-400">{category}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        <label className="group relative cursor-pointer" title="Cambiar foto">
          {photo ? (
            <img
              src={photo}
              alt="Foto de perfil"
              className="h-36 w-36 rounded-full border-4 border-[#6fc11f] object-cover shadow-[0_0_45px_rgba(111,193,31,0.35)] transition group-hover:scale-[1.02] sm:h-40 sm:w-40"
            />
          ) : (
            <div className="grid h-36 w-36 place-items-center rounded-full border-4 border-[#6fc11f] bg-[#101b24] transition group-hover:scale-[1.02] sm:h-40 sm:w-40">
              <UserRound className="text-[#6fc11f]" size={58} />
            </div>
          )}
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/0 text-[10px] font-black uppercase tracking-[0.14em] text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100">
            Cambiar foto
          </span>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#6fc11f] px-4 py-1 text-[10px] font-black text-black">
            MATCH OFFICIAL
          </div>
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

        <h2 className="mt-6 max-w-full text-3xl font-black leading-tight text-white">{name}</h2>
        <p className="mt-2 max-w-full truncate text-sm text-zinc-400">{email}</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-sm font-black text-[#b7ff8a]">
          <Sparkles size={17} /> {level}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <CardInfo label="Rol" value={mainRole} />
        <CardInfo label="Liga" value={association} />
        <CardInfo label="Tipo" value={refereeType} />
        <CardInfo label="Categoria" value={category} />
      </div>

      <label className="mt-5 flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-xs font-black text-[#b7ff8a] transition hover:bg-[#6fc11f]/20">
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
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-xs font-black text-black transition hover:bg-[#82dc2a]"
      >
        <Download size={17} />
        DESCARGAR REF CARD
      </button>
    </article>
  );
}

function CardInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
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