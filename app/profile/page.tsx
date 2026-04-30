"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import {
  BadgeCheck,
  ClipboardList,
  LogOut,
  Save,
  ShieldCheck,
  Star,
  Trophy,
  UserRound,
} from "lucide-react";

type Attempt = {
  id: string;
  score: number;
  topic: string | null;
  difficulty: string | null;
  created_at: string;
  technical_correct: boolean | null;
  restart_correct: boolean | null;
  discipline_correct: boolean | null;
  var_correct: boolean | null;
};

type Exam = {
  id: string;
  avg_score: number;
  correct_count: number;
  total_questions: number;
  created_at: string;
};

export default function ProfilePage() {

  const [avatarUrl, setAvatarUrl] = useState("");
const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const { user, isLoaded } = useUser();

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [refereeType, setRefereeType] = useState("Amateur");
  const [mainRole, setMainRole] = useState("Árbitro principal");
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

      const [{ data: attemptsData }, { data: examsData }, { data: profileData }] =
        await Promise.all([
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
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

      setAttempts(attemptsData ?? []);
      setExams(examsData ?? []);

      if (profileData) {
        setRefereeType(profileData.referee_type ?? "Amateur");
        setMainRole(profileData.main_role ?? "Árbitro principal");
        setAssociation(profileData.association ?? "");
        setCategory(profileData.category ?? "");
        setAvatarUrl(profileData.avatar_url ?? "");
      }

      setLoading(false);
    }

    loadProfile();
  }, [isLoaded, user]);

  async function saveProfile() {
    if (!user) return;

    setSavingProfile(true);

    const { error } = await supabase.from("user_profiles").upsert({
      user_id: user.id,
      referee_type: refereeType,
      main_role: mainRole,
      association,
      category,
       avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    });

    setSavingProfile(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Perfil guardado correctamente.");
  }

  const stats = useMemo(() => {
    const totalAttempts = attempts.length;
    const avgAttempt =
      totalAttempts > 0
        ? Math.round(
            attempts.reduce((acc, item) => acc + item.score, 0) / totalAttempts
          )
        : 0;

    const totalExams = exams.length;
    const avgExam =
      totalExams > 0
        ? Math.round(
            exams.reduce((acc, item) => acc + item.avg_score, 0) / totalExams
          )
        : 0;

    const bestExam =
      totalExams > 0 ? Math.max(...exams.map((exam) => exam.avg_score)) : 0;

    const level = getProfileLevel(avgAttempt, avgExam, totalAttempts, totalExams);

    return {
      totalAttempts,
      avgAttempt,
      totalExams,
      avgExam,
      bestExam,
      level,
      activity: totalAttempts + totalExams,
    };
}, [attempts, exams]);

async function uploadAvatar(file: File) {
  if (!user) return;

  setUploadingAvatar(true);

  const filePath = `${user.id}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    setUploadingAvatar(false);
    alert(uploadError.message);
    return;
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

  const publicUrl = data?.publicUrl ?? "";

  setAvatarUrl(publicUrl);

  const { error } = await supabase.from("user_profiles").upsert({
  user_id: user.id,
  referee_type: refereeType,
  main_role: mainRole,
  association,
  category,
  avatar_url: avatarUrl,
  updated_at: new Date().toISOString(),
});

  setUploadingAvatar(false);
}

  const criteria = useMemo(() => {
    return [
      { label: "Técnica", value: percent(attempts, "technical_correct") },
      { label: "Reanudación", value: percent(attempts, "restart_correct") },
      { label: "Disciplina", value: percent(attempts, "discipline_correct") },
      { label: "VAR", value: percent(attempts, "var_correct") },
    ];
  }, [attempts]);

  const trend = useMemo(() => attempts.slice(-6).reverse(), [attempts]);

  if (!isLoaded || loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#101b24] p-6 text-zinc-400">
          Cargando perfil...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[980px] space-y-5">
        <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.2),transparent_36%),#0d1720] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Perfil arbitral
          </p>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-center gap-5 text-center md:flex-row md:text-left">
<div className="relative mb-12">
 {avatarUrl || user?.imageUrl ? (
  <img
    src={avatarUrl || user?.imageUrl}
    alt="Foto de perfil"
    className="h-28 w-28 rounded-full border-4 border-[#6fc11f] object-cover shadow-[0_0_35px_rgba(111,193,31,0.28)]"
  />
) : (
  <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-[#6fc11f] bg-[#101b24]">
    <UserRound className="text-[#6fc11f]" size={46} />
  </div>
)}

                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#6fc11f] px-3 py-1 text-[10px] font-black text-black">
                  RF
                </div>
              </div>

              <div>
                <h1 className="text-3xl font-black md:text-5xl">
                  {user?.fullName || "Árbitro RefLab"}
                </h1>

                <p className="mt-2 text-sm text-zinc-400">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>

                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-sm font-black text-[#6fc11f]">
                  <BadgeCheck size={18} />
                  {stats.level}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <SmallStat title="Intentos" value={stats.totalAttempts} />
              <SmallStat title="Exámenes" value={stats.totalExams} />
              <SmallStat title="Best" value={stats.bestExam || "-"} />
            </div>
          </div>
        </section>

<label className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">
  {uploadingAvatar ? "SUBIENDO..." : "CAMBIAR FOTO"}
  <input
    type="file"
    accept="image/*"
    className="hidden"
    disabled={uploadingAvatar}
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (file) uploadAvatar(file);
    }}
  />
</label>

        <section className="grid gap-4 md:grid-cols-2">
          <ProfileSelect
            icon={<ShieldCheck />}
            label="Tipo de árbitro"
            value={refereeType}
            onChange={setRefereeType}
            options={["AFA", "Amateur", "Liga regional", "Instructor", "VAR"]}
          />

          <ProfileSelect
            icon={<Trophy />}
            label="Rol principal"
            value={mainRole}
            onChange={setMainRole}
            options={[
              "Árbitro principal",
              "Árbitro asistente",
              "Cuarto árbitro",
              "VAR",
              "AVAR",
              "Instructor",
            ]}
          />

          <ProfileInput
            label="Asociación / Liga"
            value={association}
            onChange={setAssociation}
            placeholder="Ej: AFA, Liga regional, FAFI, etc."
          />

          <ProfileInput
            label="Categoría"
            value={category}
            onChange={setCategory}
            placeholder="Ej: Primera, Reserva, Amateur, Inferiores"
          />
        </section>

        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
        >
          <Save size={22} />
          {savingProfile ? "GUARDANDO..." : "GUARDAR PERFIL"}
        </button>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricCard
            icon={<Star />}
            title="Promedio training"
            value={`${stats.avgAttempt}/100`}
            detail="Prácticas individuales"
          />

          <MetricCard
            icon={<Trophy />}
            title="Promedio examen"
            value={`${stats.avgExam}/100`}
            detail="Simulaciones completas"
          />

          <MetricCard
            icon={<ClipboardList />}
            title="Actividad"
            value={stats.activity.toString()}
            detail="Total registrado"
          />

          <MetricCard
            icon={<BadgeCheck />}
            title="Estado"
            value={stats.avgAttempt >= 80 ? "Sólido" : "En desarrollo"}
            detail="Lectura general"
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Identidad arbitral" subtitle="Datos reales del perfil.">
            <InfoRow label="Tipo" value={refereeType} />
            <InfoRow label="Función" value={mainRole} />
            <InfoRow label="Asociación / Liga" value={association || "Sin cargar"} />
            <InfoRow label="Categoría" value={category || "Sin cargar"} />
            <InfoRow label="Nivel RefLab" value={stats.level} />
            <InfoRow label="Módulo recomendado" value={recommendedModule(criteria)} />
          </Panel>

          <Panel title="Precisión por criterio" subtitle="Perfil técnico actual.">
            {criteria.map((item) => (
              <Bar key={item.label} label={item.label} value={item.value} />
            ))}
          </Panel>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl">
          <h2 className="text-xl font-black">Evolución reciente</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Últimos intentos registrados.
          </p>

          <div className="mt-5 space-y-3">
            {trend.length === 0 ? (
              <Empty text="Todavía no hay intentos." />
            ) : (
              trend.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div>
                    <p className="font-black">Intento #{index + 1}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(item.created_at).toLocaleString("es-AR")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {item.topic ?? "Sin tema"} · {item.difficulty ?? "-"}
                    </p>
                  </div>

                  <p className="text-2xl font-black text-[#6fc11f]">
                    {item.score}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl">
          <h2 className="text-xl font-black">Historial de exámenes</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Resultados guardados del modo examen.
          </p>

          <div className="mt-5 space-y-3">
            {exams.length === 0 ? (
              <Empty text="Todavía no hay exámenes guardados." />
            ) : (
              exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div>
                    <p className="font-black">
                      Examen · {exam.correct_count}/{exam.total_questions}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(exam.created_at).toLocaleString("es-AR")}
                    </p>
                  </div>

                  <p className="text-2xl font-black text-[#6fc11f]">
                    {exam.avg_score}/100
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <SignOutButton>
          <button className="flex w-full items-center justify-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 font-black text-red-300 transition hover:bg-red-500/20">
            <LogOut size={22} />
            CERRAR SESIÓN
          </button>
        </SignOutButton>
      </div>
    </AppShell>
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

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <p className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-[#6fc11f]">
        {label}
      </p>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

function SmallStat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4 text-center">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <div className="text-[#6fc11f]">{icon}</div>
      <p className="mt-4 text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="mt-2 text-sm text-[#6fc11f]">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-black/25 px-4 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <p className="font-black">{label}</p>
        <p className="text-[#6fc11f]">{value}%</p>
      </div>

      <div className="h-3 rounded-full bg-white/10">
        <div
          className="h-3 rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.35)]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-zinc-500">
      {text}
    </div>
  );
}

function getProfileLevel(
  avgAttempt: number,
  avgExam: number,
  attempts: number,
  exams: number
) {
  const combined = Math.round(avgAttempt * 0.55 + avgExam * 0.45);

  if (exams >= 3 && combined >= 90) return "Nivel FIFA";
  if (exams >= 2 && combined >= 80) return "Nivel Elite";
  if (attempts >= 10 && combined >= 70) return "Nivel Nacional";
  if (attempts >= 5 && combined >= 60) return "Nivel Regional";
  return "Nivel Inicial";
}

function percent(attempts: Attempt[], key: keyof Attempt) {
  const valid = attempts.filter((a) => typeof a[key] === "boolean");
  if (valid.length === 0) return 0;

  return Math.round(
    (valid.filter((a) => a[key] === true).length / valid.length) * 100
  );
}

function recommendedModule(criteria: { label: string; value: number }[]) {
  const weakest = [...criteria].sort((a, b) => a.value - b.value)[0];

  if (!weakest || weakest.value === 0) return "Entrenamiento técnico";
  if (weakest.label === "VAR") return "Modo VAR";
  if (weakest.label === "Disciplina") return "Faltas tácticas";
  if (weakest.label === "Reanudación") return "Fuera de juego";
  return "Disputas";
}