"use client";

import { useEffect, useMemo, useState } from "react";
import { SignOutButton, useUser } from "@clerk/nextjs";
import QRCode from "qrcode";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Download,
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
import { AvatarCropperModal } from "@/components/AvatarCropperModal";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useI18n } from "@/lib/useI18n";
import { supabase } from "@/lib/supabase";
import {
  buildPerformanceDataset,
  getCriterionPerformance,
  getPerformanceSummary,
  getTopicPerformance,
  type AttemptRecord,
  type CriterionMetric,
  type ExamResultRecord,
  type PerformanceClipRecord,
  type PerformanceSummary,
  type RulesExamResultRecord,
  type TopicMetric,
} from "@/lib/performance";
import { generateRefCardId, getRefCardPublicUrl } from "@/lib/refCard";
import { planLabels } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

type Attempt = AttemptRecord;
type Exam = ExamResultRecord;
type RulesExam = RulesExamResultRecord;
type ProfileClip = PerformanceClipRecord;
type RefCardTopic = {
  label: string;
  shortLabel: string;
  value: number | null;
  attempts: number;
};

type ProfileApiProfile = {
  reflabName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  city?: string | null;
  association?: string | null;
  associationLogo?: string | null;
  refereeType?: string | null;
  mainRole?: string | null;
  category?: string | null;
  level?: string | null;
  birthDate?: string | null;
  avatarUrl?: string | null;
  clerkImageUrl?: string | null;
  refCardId?: string | null;
  showRealNameInRanking?: boolean | null;
  publicProfile?: boolean | null;
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
  const { t } = useI18n();
  const { isPro, subscriptionPlan, loadingRole } = useUserRole();

  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [rulesResults, setRulesResults] = useState<RulesExam[]>([]);
  const [clips, setClips] = useState<ProfileClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [reflabName, setReflabName] = useState("");
  const [refereeType, setRefereeType] = useState("Amateur");
  const [mainRole, setMainRole] = useState("Arbitro principal");
  const [association, setAssociation] = useState("");
  const [associationLogo, setAssociationLogo] = useState("");
  const [category, setCategory] = useState("");
  const [profileLevel, setProfileLevel] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [refCardId, setRefCardId] = useState("");
  const [showRealNameInRanking, setShowRealNameInRanking] = useState(false);
  const [publicProfile, setPublicProfile] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!isLoaded) return;

      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setProfileError(null);

      const profileRequest = fetch("/api/profile", { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as {
            profile?: ProfileApiProfile;
            error?: string;
            technical?: string;
          };

          return { response, data };
        })
        .catch((error) => ({
          response: null,
          data: {
            error: error instanceof Error ? error.message : "No se pudo cargar el perfil.",
          },
        }));

      const [attemptsRes, examsRes, rulesRes, clipsRes, profileApiRes] = await Promise.all([
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
          .from("clips")
          .select("*"),
        profileRequest,
      ]);

      setAttempts((attemptsRes.data ?? []) as Attempt[]);
      setExams((examsRes.data ?? []) as Exam[]);
      setRulesResults(rulesRes.error ? [] : ((rulesRes.data ?? []) as RulesExam[]));
      setClips(clipsRes.error ? [] : ((clipsRes.data ?? []) as ProfileClip[]));

      if (rulesRes.error) {
        console.warn("Rules exam profile metrics unavailable:", rulesRes.error.message);
      }

      if (profileApiRes.response?.ok && profileApiRes.data.profile) {
        applyProfile(profileApiRes.data.profile);
      } else {
        const profileTechnical =
          "technical" in profileApiRes.data ? profileApiRes.data.technical : undefined;
        setProfileError(
          profileTechnical ||
            profileApiRes.data.error ||
            "No se pudo cargar el perfil persistido."
        );
        setReflabName(
          user.fullName ||
            user.username ||
            user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
            ""
        );
        setFirstName(user.firstName ?? "");
        setLastName(user.lastName ?? "");
        setAvatarUrl(user.imageUrl ?? "");
        setRefCardId(generateRefCardId(user.id));
      }

      setLoading(false);
    }

    loadProfile();
  }, [isLoaded, user]);

  function applyProfile(profile: ProfileApiProfile) {
    setReflabName(profile.reflabName ?? "");
    setRefereeType(profile.refereeType ?? "Amateur");
    setMainRole(profile.mainRole ?? "Arbitro principal");
    setAssociation(profile.association ?? "");
    setAssociationLogo(profile.associationLogo ?? "");
    setCategory(profile.category ?? "");
    setProfileLevel(profile.level ?? "");
    setBirthDate(profile.birthDate ?? "");
    setCountry(profile.country ?? "");
    setCity(profile.city ?? "");
    setAvatarUrl(profile.avatarUrl || profile.clerkImageUrl || "");
    setFirstName(profile.firstName ?? "");
    setLastName(profile.lastName ?? "");
    setRefCardId(profile.refCardId || (user ? generateRefCardId(user.id) : ""));
    setShowRealNameInRanking(Boolean(profile.showRealNameInRanking));
    setPublicProfile(profile.publicProfile !== false);
  }

  async function saveProfile() {
    if (!user) return;

    setSavingProfile(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reflabName,
          firstName,
          lastName,
          country,
          city,
          association,
          refereeType,
          mainRole,
          category,
          level: profileLevel,
          birthDate,
          publicProfile,
          hideRankingName: !showRealNameInRanking,
          showRealNameInRanking,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        profile?: ProfileApiProfile;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.technical || data.error || "No se pudo guardar el perfil.");
      }

      if (data.profile) applyProfile(data.profile);
      setProfileMessage(t("profile.saved"));
    } catch (saveError) {
      setProfileError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSavingProfile(false);
    }
  }

  function uploadAvatar(file: File) {
    setProfileError(null);
    setProfileMessage(null);
    setAvatarCropFile(file);
  }

  async function saveCroppedAvatar(blob: Blob) {
    if (!user) return;

    setUploadingAvatar(true);
    setProfileError(null);
    setProfileMessage(null);

    try {
      const formData = new FormData();
      formData.append("avatar", blob, "profile.png");

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        success?: boolean;
        avatarUrl?: string;
        profile?: ProfileApiProfile;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.technical || data.error || "No se pudo guardar la foto.");
      }

      if (data.profile) applyProfile(data.profile);
      if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
      setAvatarCropFile(null);
      setProfileMessage("Foto actualizada correctamente.");
    } catch (avatarError) {
      setProfileError(avatarError instanceof Error ? avatarError.message : "Error desconocido.");
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
        clips,
      }),
    [attempts, exams, rulesResults, clips]
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
  const effectiveRefCardId = useMemo(
    () => (user ? refCardId || generateRefCardId(user.id) : ""),
    [refCardId, user]
  );
  const refCardUrl = useMemo(
    () => (effectiveRefCardId ? getRefCardPublicUrl(effectiveRefCardId) : ""),
    [effectiveRefCardId]
  );

  useEffect(() => {
    if (!refCardUrl) return;

    QRCode.toDataURL(refCardUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: "#05070d",
        light: "#d9e5d2",
      },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [refCardUrl]);

  if (!isLoaded || loading || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#101b24] p-6 text-zinc-400">
          {t("profile.loading")}
        </div>
      </AppShell>
    );
  }

  const profileName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const displayName = reflabName || profileName || user?.fullName || "Arbitro RefLab";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Sin email";
  const photo = avatarUrl || user?.imageUrl || "";
  const location = [city, country].filter(Boolean).join(", ") || t("common.notRegistered");

  async function downloadRefCard() {
    const exportPhoto = photo ? await imageUrlToDataUrl(photo) : "";
    const exportQr = qrDataUrl || (refCardUrl
      ? await QRCode.toDataURL(refCardUrl, {
          margin: 1,
          width: 240,
          color: { dark: "#05070d", light: "#d9e5d2" },
        })
      : "");

    const svg = createRefCardSvg({
      name: displayName,
      rating: stats.rating,
      level: stats.level,
      mainRole,
      association: association || "Sin liga",
      associationLogo,
      location,
      photo: exportPhoto,
      refCardId: effectiveRefCardId,
      refCardUrl,
      qrDataUrl: exportQr,
      score: summary.avgScore,
      evaluations: stats.totalExams,
      bestScore: summary.bestScore,
      status: stats.hasData ? summary.status : "Pendiente",
      topics: refCardTopics,
      discipline: disciplineLabel,
      lastTest: formatShortDate(lastTestDate),
    });
    const url = await svgToPngObjectUrl(svg, 2);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(displayName)}-ref-card.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      {avatarCropFile && (
        <AvatarCropperModal
          file={avatarCropFile}
          saving={uploadingAvatar}
          onCancel={() => {
            if (!uploadingAvatar) setAvatarCropFile(null);
          }}
          onSave={saveCroppedAvatar}
        />
      )}
      <div className="mx-auto w-full max-w-[1240px] space-y-5 overflow-hidden">
        {isPro ? (
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
            associationLogo={associationLogo}
            category={category || "No registrado"}
            location={location}
            discipline={disciplineLabel}
            experience="No registrado"
            lastTest={formatShortDate(lastTestDate)}
            ranking="Pendiente"
            trainings={stats.totalAttempts}
            topics={refCardTopics}
            trendScores={trendScores}
            trendLabel={trendLabel}
            refCardId={effectiveRefCardId}
            refCardUrl={refCardUrl}
            qrDataUrl={qrDataUrl}
            uploadingAvatar={uploadingAvatar}
            onUpload={uploadAvatar}
            onDownload={downloadRefCard}
          />
        ) : (
          <>
            <BasicProfileCard
              name={displayName}
              email={email}
              photo={photo}
              plan={planLabels[subscriptionPlan]}
              mainRole={mainRole}
              association={association || "No registrado"}
              category={category || "No registrado"}
              location={location}
              uploadingAvatar={uploadingAvatar}
              onUpload={uploadAvatar}
            />
            <ProUpgradeCard
              title="RefCard premium disponible en RefLab Pro"
              description="Tu perfil basico queda activo en FREE. RefLab Pro desbloquea RefCard descargable, radar arbitral, ranking, historial y evolucion completa."
              compact
            />
          </>
        )}

        {profileMessage && (
          <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
            {profileMessage}
          </div>
        )}

        {profileError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {profileError}
          </div>
        )}

        <section className="space-y-4 rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              {t("profile.technicalSheet")}
            </p>
            <h1 className="mt-3 text-3xl font-black lg:text-5xl">
              {t("profile.title")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {t("profile.description")}
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
          <ProfileInput label="Nombre RefLab" value={reflabName} onChange={setReflabName} placeholder="Ej: DRC RefLab" />
          <ProfileInput label={t("profile.firstName")} value={firstName} onChange={setFirstName} placeholder="Ej: David" />
          <ProfileInput label={t("profile.lastName")} value={lastName} onChange={setLastName} placeholder="Ej: Cornejo" />

          <ProfileSelect
            icon={<ShieldCheck />}
            label={t("profile.refereeType")}
            value={refereeType}
            onChange={setRefereeType}
            options={["AFA", "Amateur", "Liga regional", "Instructor", "VAR"]}
          />

          <ProfileSelect
            icon={<Trophy />}
            label={t("profile.mainRole")}
            value={mainRole}
            onChange={setMainRole}
            options={["Arbitro principal", "Arbitro asistente", "Cuarto arbitro", "VAR", "AVAR", "Instructor"]}
          />

          <ProfileInput label={t("profile.association")} value={association} onChange={setAssociation} placeholder="Ej: AFA, Liga regional, FAFI" />
          <ProfileInput label={t("profile.category")} value={category} onChange={setCategory} placeholder="Ej: Primera, Reserva, Amateur, Inferiores" />
          <ProfileInput label="Nivel" value={profileLevel} onChange={setProfileLevel} placeholder="Ej: Nacional, Regional, Amateur" />
          <ProfileDateInput label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} />
          <ProfileInput label={t("profile.country")} value={country} onChange={setCountry} placeholder="Ej: Argentina" />
          <ProfileInput label={t("profile.city")} value={city} onChange={setCity} placeholder="Ej: Buenos Aires" />

          <section className="rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5 md:col-span-2">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#6fc11f]">{t("profile.rankingPrivacy")}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {t("profile.rankingPrivacyHelp")}
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              <input
                type="checkbox"
                checked={showRealNameInRanking}
                onChange={(event) => setShowRealNameInRanking(event.target.checked)}
                className="h-5 w-5 accent-[#6fc11f]"
              />
              <span className="font-black text-white">{t("profile.showRealName")}</span>
            </label>
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              <input
                type="checkbox"
                checked={publicProfile}
                onChange={(event) => setPublicProfile(event.target.checked)}
                className="h-5 w-5 accent-[#6fc11f]"
              />
              <span className="font-black text-white">Perfil publico</span>
            </label>
            <p className="mt-3 text-xs text-zinc-400">
              {t("profile.rankingFallback")} {effectiveRefCardId || t("common.pending")}.
            </p>
          </section>
        </section>

        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
        >
          <Save size={22} />
          {savingProfile ? t("profile.savingProfile").toUpperCase() : t("profile.saveProfile").toUpperCase()}
        </button>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Panel title="Informacion principal" subtitle="Datos visibles en tu perfil y credencial.">
            <InfoRow label="Nombre RefLab" value={reflabName || "Sin cargar"} />
            <InfoRow label="Tipo" value={refereeType} />
            <InfoRow label="Funcion" value={mainRole} />
            <InfoRow label="Asociacion / Liga" value={association || "Sin cargar"} />
            <InfoRow label="Categoria" value={category || "Sin cargar"} />
            <InfoRow label="Nivel" value={profileLevel || "Sin cargar"} />
            <InfoRow label="Nacimiento" value={birthDate || "Sin cargar"} />
            <InfoRow label={t("profile.country")} value={country || t("common.notRegistered")} />
            <InfoRow label={t("profile.city")} value={city || t("common.notRegistered")} />
            <InfoRow label="Nivel RefLab" value={stats.level} />
          </Panel>

          <Panel title="Configuracion" subtitle="Preferencias y accesos de cuenta.">
            <InfoRow label="Plan actual" value={planLabels[subscriptionPlan]} />
            <InfoRow label="Perfil publico" value={publicProfile ? "Activo" : "Oculto"} />
            <InfoRow label="Privacidad ranking" value={showRealNameInRanking ? "Nombre visible" : `Solo RefCard ${effectiveRefCardId || t("common.pending")}`} />
            <a
              href="/notifications"
              className="mt-4 flex min-h-12 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-sm font-black text-[#b7ff8a] transition hover:bg-[#6fc11f]/20"
            >
              Configurar notificaciones
            </a>
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

function BasicProfileCard({
  name,
  email,
  photo,
  plan,
  mainRole,
  association,
  category,
  location,
  uploadingAvatar,
  onUpload,
}: {
  name: string;
  email: string;
  photo: string;
  plan: string;
  mainRole: string;
  association: string;
  category: string;
  location: string;
  uploadingAvatar: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.16),transparent_34%),#071019] p-5 shadow-2xl sm:p-6">
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
        <div className="min-w-0">
          <div className="relative mx-auto h-56 w-full max-w-[220px] overflow-hidden rounded-[28px] border border-[#6fc11f]/30 bg-black/35 shadow-[0_0_38px_rgba(111,193,31,0.12)]">
            {photo ? (
              <img src={photo} alt={name} className="h-full w-full object-cover object-center" />
            ) : (
              <div className="grid h-full place-items-center text-[#6fc11f]">
                <UserRound size={58} />
              </div>
            )}
          </div>
          <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-sm font-black text-[#b7ff8a] transition hover:bg-[#6fc11f]/20">
            {uploadingAvatar ? "Subiendo foto..." : "Cambiar foto"}
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
        </div>

        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#b7ff8a]">
            <IdCard size={14} />
            Plan {plan}
          </div>
          <h1 className="mt-4 break-words text-3xl font-black leading-tight text-white sm:text-5xl">
            {name}
          </h1>
          <p className="mt-2 break-words text-sm font-bold text-zinc-400">{email}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <RefCardInfo icon={<ShieldCheck size={19} />} label="Rol" value={mainRole} tone="green" />
            <RefCardInfo icon={<BadgeCheck size={19} />} label="Asociacion" value={association} />
            <RefCardInfo icon={<Trophy size={19} />} label="Categoria" value={category} />
            <RefCardInfo icon={<MapPin size={19} />} label="Ubicacion" value={location} />
          </div>
        </div>
      </div>
    </section>
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
  associationLogo,
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
  refCardId,
  refCardUrl,
  qrDataUrl,
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
  associationLogo: string;
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
  refCardId: string;
  refCardUrl: string;
  qrDataUrl: string;
  uploadingAvatar: boolean;
  onUpload: (file: File) => void;
  onDownload: () => void;
}) {
  const { t } = useI18n();
  const scoreLabel = score === null ? "--" : score.toString();
  const bestLabel = bestScore === null ? "--" : bestScore.toString();
  const visibleRefCard = refCardId || "Pendiente";

  return (
    <article className="relative w-full max-w-full overflow-hidden rounded-[34px] border border-[#6fc11f]/35 bg-[radial-gradient(circle_at_14%_8%,rgba(111,193,31,0.34),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(111,193,31,0.14),transparent_28%),linear-gradient(145deg,#05070d,#071019_48%,#0e1416)] p-3 shadow-[0_32px_110px_rgba(0,0,0,0.62)] sm:rounded-[42px] sm:p-5 lg:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#b7ff8a] to-transparent" />
      <div className="pointer-events-none absolute left-5 top-5 hidden max-w-[260px] rounded-2xl border border-[#6fc11f]/25 bg-black/45 px-4 py-2 shadow-[0_0_26px_rgba(111,193,31,0.12)] lg:block">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-400">
          RefCard
        </p>
        <p className="mt-1 max-w-full truncate text-xs font-black tracking-[0.12em] text-[#b7ff8a]">
          {visibleRefCard}
        </p>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-[minmax(230px,0.58fr)_minmax(0,1fr)] lg:pt-14">
        <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(111,193,31,0.16),rgba(0,0,0,0.42))] p-3 sm:p-4">
          <div className="absolute -left-16 top-12 h-56 w-32 rotate-12 rounded-[32px] bg-[#6fc11f]/25 blur-sm" />
          <label className="group relative block cursor-pointer overflow-hidden rounded-[26px] border border-[#6fc11f]/35 bg-[#04080d] shadow-[0_0_55px_rgba(111,193,31,0.16)]" title="Cambiar foto">
            {photo ? (
              <img
                src={photo}
                alt="Foto de perfil"
                className="aspect-[3/4] w-full object-cover object-center opacity-95 transition duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="grid aspect-[3/4] w-full place-items-center bg-[radial-gradient(circle_at_center,rgba(111,193,31,0.18),transparent_58%),#101b24]">
                <UserRound className="text-[#6fc11f]" size={86} />
              </div>
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
            <span className="absolute inset-x-4 bottom-4 flex min-h-11 items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-black/55 text-xs font-black uppercase tracking-[0.18em] text-[#b7ff8a] opacity-100 backdrop-blur transition group-hover:bg-[#6fc11f] group-hover:text-black">
              {uploadingAvatar ? t("profile.uploadingPhoto") : t("profile.changePhoto")}
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
                <AssociationCard association={association} associationLogo={associationLogo} level={level} />
                <RefCardInfo icon={<Trophy size={18} />} label="Categoria" value={category} />
                <RefCardInfo icon={<MapPin size={18} />} label={t("profile.cityCountry")} value={location} />
              </div>
            </section>

            <aside className="grid gap-3 rounded-[30px] border border-white/10 bg-black/25 p-4 backdrop-blur">
              <SideMetric icon={<ShieldCheck size={22} />} label={t("profile.discipline")} value={discipline} />
              <SideMetric icon={<Clock3 size={22} />} label={t("profile.experience")} value={experience} />
              <SideMetric icon={<CalendarDays size={22} />} label={t("profile.lastTest")} value={lastTest} />
              <SideMetric icon={<Trophy size={22} />} label={t("profile.ranking")} value={ranking} />
              <SideMetric icon={<Activity size={22} />} label={t("profile.trainings")} value={trainings > 0 ? trainings.toString() : t("common.notRegistered")} />
            </aside>
          </div>

          <section className="grid gap-3 rounded-[30px] border border-white/10 bg-black/35 p-3 shadow-[inset_0_0_42px_rgba(255,255,255,0.02)] sm:grid-cols-2 sm:p-4 xl:grid-cols-4">
            <RefStatCard icon={<Target size={25} />} label={t("profile.score")} value={scoreLabel} detail={status} featured />
            <RefStatCard icon={<ClipboardList size={25} />} label={t("profile.tests")} value={evaluations > 0 ? evaluations.toString() : "--"} detail={t("common.saved")} />
            <RefStatCard icon={<Star size={25} />} label={t("profile.best")} value={bestLabel} detail="Puntaje maximo" />
            <RefTrendCard scores={trendScores} label={trendLabel} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
            <RefRadar topics={topics} />
            <div className="grid gap-4">
              <div className="rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
                <div className="flex items-center gap-3">
                  <BadgeCheck className="text-[#6fc11f]" size={30} />
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">{t("profile.verified")}</p>
                    <p className="font-black text-[#b7ff8a]">REFLAB</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
                <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">REFLAB.APP</p>
                    <p className="mt-2 max-w-[13rem] break-all text-xs leading-5 text-zinc-500">RefCard {visibleRefCard}</p>
                  </div>
                  <RefCardQr value={refCardUrl} qrDataUrl={qrDataUrl} />
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 text-xs font-black text-[#b7ff8a] transition hover:bg-[#6fc11f]/20">
              {uploadingAvatar ? t("profile.uploadingPhoto").toUpperCase() : t("profile.changePhoto").toUpperCase()}
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
              {t("profile.downloadRefCard")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function AssociationCard({
  association,
  associationLogo,
  level,
}: {
  association: string;
  associationLogo: string;
  level: string;
}) {
  const fallback = association || "No registrado";
  const initials = fallback
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RF";
  const levelLabel = level
    ? level.toLowerCase().startsWith("nivel")
      ? level
      : `Nivel ${level}`
    : "Nivel no registrado";

  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3 sm:col-span-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10">
          {associationLogo ? (
            <img
              src={associationLogo}
              alt=""
              className="h-full w-full object-contain p-2"
            />
          ) : (
            <span className="text-lg font-black text-[#b7ff8a]">{initials}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Asociacion</p>
          <p className="mt-1 break-words text-lg font-black text-white">{fallback}</p>
          <p className="mt-1 text-sm font-bold text-[#b7ff8a]">{levelLabel}</p>
        </div>
      </div>
    </div>
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
    <div className={`flex min-h-[168px] min-w-0 flex-col rounded-[24px] border p-4 ${featured ? "border-[#6fc11f]/35 bg-[#6fc11f]/10" : "border-white/10 bg-[#071019]"}`}>
      <div className="text-[#6fc11f]">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-1 break-words text-4xl font-black leading-none text-white sm:text-5xl">{value}</p>
      <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${featured ? "border-[#6fc11f]/45 text-[#b7ff8a]" : "border-white/10 text-zinc-400"}`}>
        {detail}
      </p>
    </div>
  );
}

function RefTrendCard({ scores, label }: { scores: number[]; label: string }) {
  return (
    <div className="flex min-h-[168px] min-w-0 flex-col rounded-[24px] border border-white/10 bg-[#071019] p-4">
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
  if (scores.length < 2) {
    return (
      <div className="mt-2 grid h-16 place-items-center rounded-2xl border border-dashed border-white/10 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
        Sin datos
      </div>
    );
  }

  const values = scores;
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
              Sin datos suficientes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RefCardQr({ value, qrDataUrl }: { value: string; qrDataUrl: string }) {
  const active = useMemo(() => buildQrFallbackCells(value), [value]);

  if (qrDataUrl) {
    return (
      <img
        src={qrDataUrl}
        alt="QR unico de RefCard"
        className="h-20 w-20 shrink-0 rounded-2xl border border-[#6fc11f]/45 bg-[#d9e5d2] p-1 shadow-[0_0_22px_rgba(111,193,31,0.2)]"
      />
    );
  }

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

function ProfileDateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <p className="mb-3 text-sm font-black uppercase tracking-[0.2em] text-[#6fc11f]">{label}</p>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      />
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
  if (!date) return "Sin registros";
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
  rating,
  level,
  mainRole,
  association,
  associationLogo,
  location,
  photo,
  refCardId,
  refCardUrl,
  qrDataUrl,
  score,
  evaluations,
  bestScore,
  status,
  topics,
  discipline,
  lastTest,
}: {
  name: string;
  rating: number;
  level: string;
  mainRole: string;
  association: string;
  associationLogo: string;
  location: string;
  photo: string;
  refCardId: string;
  refCardUrl: string;
  qrDataUrl: string;
  score: number | null;
  evaluations: number;
  bestScore: number | null;
  status: string;
  topics: RefCardTopic[];
  discipline: string;
  lastTest: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RF";
  const scoreLabel = score === null ? "--" : String(score ?? rating ?? "--");
  const bestLabel = bestScore === null ? "--" : String(bestScore ?? "--");
  const testsLabel = evaluations > 0 ? String(evaluations) : "--";
  const associationInitials = association
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RF";
  const associationMark = associationLogo
    ? `<image href="${escapeXml(associationLogo)}" x="458" y="500" width="82" height="82" preserveAspectRatio="xMidYMid meet" />`
    : `<rect x="458" y="500" width="82" height="82" rx="20" fill="#0a1308" stroke="#6fc11f" stroke-opacity="0.7"/><text x="499" y="551" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="900" fill="#b7ff8a">${escapeXml(associationInitials)}</text>`;
  const safePhoto = photo
    ? `<image href="${escapeXml(photo)}" x="60" y="132" width="322" height="492" clip-path="url(#photoClip)" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="60" y="132" width="322" height="492" rx="34" fill="#0d1821"/><text x="221" y="386" text-anchor="middle" font-size="94" font-weight="900" fill="#6fc11f">${escapeXml(initials)}</text>`;
  const qr = qrDataUrl
    ? `<image href="${escapeXml(qrDataUrl)}" x="734" y="1176" width="104" height="104" preserveAspectRatio="xMidYMid meet" />`
    : svgQrFallback(refCardUrl || refCardId, 734, 1176, 104);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1340" viewBox="0 0 900 1340">
  <defs>
    <linearGradient id="cardBg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#18240f"/>
      <stop offset="0.38" stop-color="#071019"/>
      <stop offset="1" stop-color="#02060b"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="10%" r="66%">
      <stop offset="0" stop-color="#6fc11f" stop-opacity="0.46"/>
      <stop offset="1" stop-color="#6fc11f" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="radarGlow" cx="50%" cy="50%" r="56%">
      <stop offset="0" stop-color="#6fc11f" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#6fc11f" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="photoClip"><rect x="60" y="132" width="322" height="492" rx="34"/></clipPath>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="900" height="1340" rx="54" fill="url(#cardBg)"/>
  <rect width="900" height="1340" rx="54" fill="url(#glow)"/>
  <path d="M58 60 H842 Q862 60 862 80 V1260 Q862 1280 842 1280 H58 Q38 1280 38 1260 V80 Q38 60 58 60Z" fill="none" stroke="#6fc11f" stroke-width="2.6" stroke-opacity="0.88"/>
  <path d="M76 78 H824 Q844 78 844 98 V1242 Q844 1262 824 1262 H76 Q56 1262 56 1242 V98 Q56 78 76 78Z" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-opacity="0.18"/>
  <path d="M78 80 L170 80 L54 238 L54 164 Q54 112 78 80Z" fill="#6fc11f" fill-opacity="0.16"/>
  <path d="M74 322 L170 178 L252 80 H174 L54 238 V426 Z" fill="#6fc11f" fill-opacity="0.34"/>
  <rect x="60" y="132" width="322" height="492" rx="34" fill="#081018" stroke="#6fc11f" stroke-opacity="0.34"/>
  ${safePhoto}
  <rect x="76" y="150" width="48" height="384" rx="24" fill="#050b12" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.15"/>
  <text transform="translate(100 332) rotate(-90)" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="6" fill="#a7b2bd">REFCARD</text>
  <text transform="translate(100 496) rotate(-90)" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" letter-spacing="3" fill="#b7ff8a">${escapeXml(refCardId)}</text>

  <text x="430" y="150" font-family="Arial, sans-serif" font-size="54" font-weight="900" fill="#ffffff">REF<tspan fill="#6fc11f">LAB</tspan></text>
  <text x="432" y="183" font-family="Arial, sans-serif" font-size="21" letter-spacing="7" fill="#d6dde5">Referee Decision Lab</text>
  <text x="430" y="278" font-family="Arial, sans-serif" font-size="70" font-weight="900" fill="#ffffff">${escapeXml(firstLine(name))}</text>
  <text x="430" y="350" font-family="Arial, sans-serif" font-size="70" font-weight="900" fill="#6fc11f">${escapeXml(secondLine(name))}</text>
  <line x1="434" y1="380" x2="484" y2="380" stroke="#6fc11f" stroke-width="4"/>
  <text x="430" y="428" font-family="Arial, sans-serif" font-size="24" font-weight="900" letter-spacing="5" fill="#b7ff8a">${escapeXml(mainRole.toUpperCase())}</text>

  <rect x="430" y="470" width="410" height="162" rx="24" fill="#071019" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.14"/>
  ${associationMark}
  <text x="560" y="512" font-family="Arial, sans-serif" font-size="17" letter-spacing="4" fill="#9aa4af">ASOCIACION</text>
  <text x="560" y="552" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#ffffff">${escapeXml(compactText(association, 15))}</text>
  <line x1="560" y1="580" x2="812" y2="580" stroke="#ffffff" stroke-opacity="0.14"/>
  <text x="560" y="610" font-family="Arial, sans-serif" font-size="17" letter-spacing="4" fill="#9aa4af">NIVEL</text>
  <text x="560" y="646" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#b7ff8a">${escapeXml(compactText(level, 20))}</text>

  <rect x="54" y="680" width="792" height="170" rx="28" fill="#071019" fill-opacity="0.9" stroke="#ffffff" stroke-opacity="0.18"/>
  ${svgMetricBox(84, 714, 160, "SCORE", scoreLabel, status, "#6fc11f")}
  ${svgMetricBox(270, 714, 160, "TESTS", testsLabel, "COMPLETADOS", "#ffffff")}
  ${svgMetricBox(456, 714, 160, "BEST", bestLabel, "PUNTAJE MAXIMO", "#6fc11f")}
  ${svgTrendSparkline(trendScoresFromTopics(topics), 666, 734, 130, 64)}
  <text x="664" y="726" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#a7b2bd">RATING TREND</text>
  <rect x="664" y="802" width="138" height="30" rx="15" fill="#0a1308" stroke="#6fc11f" stroke-opacity="0.7"/>
  <text x="733" y="823" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="900" letter-spacing="3" fill="#b7ff8a">${escapeXml(compactText(status, 10).toUpperCase())}</text>

  <rect x="54" y="866" width="610" height="258" rx="28" fill="#071019" fill-opacity="0.86" stroke="#ffffff" stroke-opacity="0.14"/>
  <text x="88" y="910" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="5" fill="#b7ff8a">RADAR</text>
  ${svgRadarLegend(topics, 92, 948)}
  ${svgExportRadar(topics, 470, 992, 78, 100)}
  <rect x="686" y="866" width="160" height="258" rx="28" fill="#071019" fill-opacity="0.86" stroke="#ffffff" stroke-opacity="0.14"/>
  ${svgSideInfo(714, 918, "DISCIPLINA", discipline)}
  ${svgSideInfo(714, 996, "UBICACION", location)}
  ${svgSideInfo(714, 1074, "ULTIMO TEST", lastTest)}

  <rect x="54" y="1150" width="792" height="150" rx="26" fill="#071019" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.12"/>
  <circle cx="104" cy="1204" r="28" fill="#6fc11f" fill-opacity="0.14" stroke="#6fc11f" stroke-width="3"/>
  <path d="M92 1205 L101 1214 L117 1191" fill="none" stroke="#b7ff8a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="154" y="1196" font-family="Arial, sans-serif" font-size="17" letter-spacing="4" fill="#a7b2bd">VERIFICADO</text>
  <text x="154" y="1228" font-family="Arial, sans-serif" font-size="20" font-weight="900" letter-spacing="4" fill="#b7ff8a">REFLAB</text>
  <text x="154" y="1268" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2" fill="#8d98a5">${escapeXml(refCardId)}</text>
  <text x="505" y="1220" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="4" fill="#b7ff8a">REFLAB.APP</text>
  <text x="505" y="1252" font-family="Arial, sans-serif" font-size="13" letter-spacing="2" fill="#8d98a5">CREDENCIAL DIGITAL</text>
  <rect x="720" y="1164" width="126" height="126" rx="20" fill="#d9e5d2" stroke="#6fc11f" stroke-width="4"/>
  ${qr}
</svg>`;
}

function svgMetricBox(x: number, y: number, width: number, label: string, value: string, detail: string, color: string) {
  return `<line x1="${x + width + 12}" y1="${y + 16}" x2="${x + width + 12}" y2="${y + 128}" stroke="#ffffff" stroke-opacity="0.16"/>
  <text x="${x}" y="${y + 18}" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="3" fill="#a7b2bd">${escapeXml(label)}</text>
  <text x="${x}" y="${y + 90}" font-family="Arial, sans-serif" font-size="76" font-weight="900" fill="${color}">${escapeXml(value)}</text>
  <text x="${x}" y="${y + 126}" font-family="Arial, sans-serif" font-size="15" font-weight="900" letter-spacing="2" fill="#8d98a5">${escapeXml(compactText(detail, 18).toUpperCase())}</text>`;
}

function svgTrendSparkline(scores: number[], x: number, y: number, width: number, height: number) {
  if (scores.length < 2) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#050b12" stroke="#ffffff" stroke-opacity="0.12" stroke-dasharray="4 4"/>
  <text x="${x + width / 2}" y="${y + height / 2 + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" letter-spacing="2" fill="#8d98a5">SIN DATOS</text>`;
  }

  const values = scores;
  const points = values.map((value, index) => {
    const px = x + (index / Math.max(values.length - 1, 1)) * width;
    const py = y + height - (Math.max(0, Math.min(value, 100)) / 100) * height;
    return `${Math.round(px)},${Math.round(py)}`;
  }).join(" ");

  return `<polyline points="${x},${y + height + 4} ${points} ${x + width},${y + height + 4}" fill="#6fc11f" fill-opacity="0.16"/>
  <polyline points="${points}" fill="none" stroke="#6fc11f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#softGlow)"/>
  ${points.split(" ").map((point) => {
    const [px, py] = point.split(",");
    return `<circle cx="${px}" cy="${py}" r="4" fill="#b7ff8a"/>`;
  }).join("")}`;
}

function svgRadarLegend(topics: RefCardTopic[], x: number, y: number) {
  return topics.map((topic, index) => {
    const rowY = y + index * 36;
    const value = topic.value === null ? "--" : String(topic.value);
    return `<text x="${x}" y="${rowY}" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#ffffff">${escapeXml(topic.shortLabel)}</text>
    <line x1="${x}" y1="${rowY + 12}" x2="${x + 170}" y2="${rowY + 12}" stroke="#ffffff" stroke-opacity="0.12" stroke-dasharray="5 5"/>
    <text x="${x + 188}" y="${rowY}" text-anchor="end" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#b7ff8a">${value}</text>`;
  }).join("");
}

function svgExportRadar(
  topics: RefCardTopic[],
  cx: number,
  cy: number,
  radius = 96,
  labelRadius = 122
) {
  const values = topics.map((topic) => topic.value ?? 0);
  const polygon = exportRadarPoints(values, radius, cx, cy);
  const rings = [25, 50, 75, 100].map((value) => exportRadarPoints([value, value, value, value, value], radius, cx, cy));
  const hasData = topics.some((topic) => topic.value !== null);
  const labels = topics.map((topic, index) => {
    const point = exportRadarAxisPoint(index, labelRadius, cx, cy);
    return `<text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#ffffff">${escapeXml(topic.shortLabel)}</text>`;
  }).join("");

  const base = `<circle cx="${cx}" cy="${cy}" r="${labelRadius + 6}" fill="url(#radarGlow)"/>
  ${rings.map((ring) => `<polygon points="${ring}" fill="none" stroke="#ffffff" stroke-opacity="0.17"/>`).join("")}
  ${[0, 1, 2, 3, 4].map((index) => {
    const end = exportRadarAxisPoint(index, radius + 2, cx, cy);
    return `<line x1="${cx}" y1="${cy}" x2="${end.x}" y2="${end.y}" stroke="#ffffff" stroke-opacity="0.12"/>`;
  }).join("")}
  ${labels}`;

  if (!hasData) {
    return `${base}
  <rect x="${cx - 104}" y="${cy - 22}" width="208" height="44" rx="18" fill="#050b12" fill-opacity="0.92" stroke="#6fc11f" stroke-opacity="0.35" stroke-dasharray="5 5"/>
  <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="900" letter-spacing="1.8" fill="#d6dde5">SIN DATOS SUFICIENTES</text>`;
  }

  return `${base}
  <polygon points="${polygon}" fill="#6fc11f" fill-opacity="0.36" stroke="#6fc11f" stroke-width="5" filter="url(#softGlow)"/>
  ${polygon.split(" ").map((point) => {
    const [x, y] = point.split(",");
    return `<circle cx="${x}" cy="${y}" r="7" fill="#b7ff8a"/>`;
  }).join("")}`;
}

function exportRadarPoints(values: number[], radius: number, cx: number, cy: number) {
  return values.map((value, index) => {
    const point = exportRadarAxisPoint(index, radius * (Math.max(0, Math.min(value, 100)) / 100), cx, cy);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function exportRadarAxisPoint(index: number, radius: number, cx: number, cy: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: Math.round((cx + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((cy + Math.sin(angle) * radius) * 10) / 10,
  };
}

function svgSideInfo(x: number, y: number, label: string, value: string) {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="13" font-weight="900" letter-spacing="2.4" fill="#a7b2bd">${escapeXml(label)}</text>
  <text x="${x}" y="${y + 28}" font-family="Arial, sans-serif" font-size="15" font-weight="900" fill="#ffffff">${escapeXml(compactText(value, 16).toUpperCase())}</text>
  <line x1="${x}" y1="${y + 48}" x2="${x + 112}" y2="${y + 48}" stroke="#ffffff" stroke-opacity="0.13"/>`;
}

function svgQrFallback(value: string, x: number, y: number, size: number) {
  const cells = Array.from(buildQrFallbackCells(value));
  const cellSize = size / 7;
  return cells.map((cell) => {
    const cx = x + (cell % 7) * cellSize;
    const cy = y + Math.floor(cell / 7) * cellSize;
    return `<rect x="${cx + 2}" y="${cy + 2}" width="${cellSize - 4}" height="${cellSize - 4}" rx="2" fill="#05070d"/>`;
  }).join("");
}

function trendScoresFromTopics(topics: RefCardTopic[]) {
  const values = topics.map((topic) => topic.value).filter(isFiniteNumber);
  if (values.length >= 2) return values;
  return [];
}

function firstLine(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return parts[0] || "Arbitro";
}

function secondLine(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return parts.slice(1).join(" ") || "RefLab";
}

function compactText(value: string, maxLength: number) {
  if (!value) return "Pendiente";
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}.` : value;
}

function buildQrFallbackCells(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const active = new Set<number>();

  for (let index = 0; index < 49; index += 1) {
    const finder =
      (index < 2 && index % 7 < 2) ||
      (index < 2 && index % 7 > 4) ||
      (index > 34 && index % 7 < 2);
    const generated = ((hash >>> (index % 24)) + index * 13) % 5 < 2;

    if (finder || generated) {
      active.add(index);
    }
  }

  return active;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function imageUrlToDataUrl(url: string) {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return "";

    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

async function svgToPngObjectUrl(svg: string, scale = 2) {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo renderizar la RefCard."));
      img.src = svgUrl;
    });
    const imageWidth = image.naturalWidth || image.width || 900;
    const imageHeight = image.naturalHeight || image.height || 1340;
    const canvas = document.createElement("canvas");
    canvas.width = imageWidth * scale;
    canvas.height = imageHeight * scale;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se pudo preparar la exportacion PNG.");
    }

    context.fillStyle = "#02060b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se pudo generar el PNG."));
      }, "image/png", 1);
    });

    return URL.createObjectURL(pngBlob);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ref-card";
}
