import type { User as ClerkBackendUser } from "@clerk/backend";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeRole } from "@/lib/institutionalRoles";
import {
  ensureUserRecords,
  isConfiguredSuperAdmin,
} from "@/lib/reflabUserRecords";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AuditAttemptRow = {
  id?: string | null;
  user_id?: string | null;
  clip_id?: string | null;
  clip_title?: string | null;
  mode?: string | null;
  module?: string | null;
  topic?: string | null;
  score?: number | null;
  created_at?: string | null;
};

type AuditExamRow = {
  id?: string | null;
  user_id?: string | null;
  details?: AuditExamAnswer[] | null;
  created_at?: string | null;
};

type AuditRulesRow = {
  id?: string | null;
  user_id?: string | null;
  details?: AuditRulesAnswer[] | null;
  created_at?: string | null;
};

type AuditExamAnswer = {
  clipId?: string | null;
  clipTitle?: string | null;
  topic?: string | null;
  score?: number | null;
};

type AuditRulesAnswer = {
  question_id?: string | number | null;
  question?: string | null;
  topic?: string | null;
  is_correct?: boolean | null;
};

type AuditClipRow = {
  id?: string | null;
  title?: string | null;
  topic?: string | null;
  mode?: string | null;
  module?: string | null;
  is_active?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type AuditEntry = {
  id: string;
  source: "attempts" | "exam_results.details" | "rules_exam_results.details";
  userId: string;
  storedTopic: string;
  currentTopic: string;
  clipId: string;
  clipTitle: string;
  score: number | null;
  date: string;
  valid: boolean;
  reason: string;
  clipExists: boolean;
  clipActive: boolean;
  clipStatus: string;
  clipUpdatedAt: string;
  topicChanged: boolean;
  mode: string;
};

const topicDictionary: Record<string, string> = {
  Dispute: "Disputas",
  Challenge: "Disputas",
  "Tactical foul": "Faltas tacticas",
  Handball: "Manos",
  Mano: "Manos",
  Offside: "Fuera de juego",
  VAR: "VAR",
};

const coreTopics = ["VAR", "Fuera de juego", "Manos", "Disputas", "Faltas tacticas"];

export async function GET() {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  try {
    const [attemptsRes, examsRes, rulesRes, clipsRes] = await Promise.all([
      access.supabase
        .from("attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000),
      access.supabase
        .from("exam_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      access.supabase
        .from("rules_exam_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      access.supabase
        .from("clips")
        .select("*"),
    ]);

    if (attemptsRes.error) {
      throw new Error(`attempts: ${formatSupabaseError(attemptsRes.error)}`);
    }
    if (examsRes.error) {
      throw new Error(`exam_results: ${formatSupabaseError(examsRes.error)}`);
    }
    if (clipsRes.error) {
      throw new Error(`clips: ${formatSupabaseError(clipsRes.error)}`);
    }

    const warnings = rulesRes.error
      ? [`rules_exam_results no disponible: ${formatSupabaseError(rulesRes.error)}`]
      : [];

    const clips = (clipsRes.data ?? []) as AuditClipRow[];
    const clipMap = new Map(
      clips.filter((clip) => clip.id).map((clip) => [String(clip.id), clip])
    );
    const entries = [
      ...buildAttemptEntries((attemptsRes.data ?? []) as AuditAttemptRow[], clipMap),
      ...buildExamEntries((examsRes.data ?? []) as AuditExamRow[], clipMap),
      ...buildRulesEntries(rulesRes.error ? [] : ((rulesRes.data ?? []) as AuditRulesRow[])),
    ];
    const topics = buildTopicAudit(entries, clips);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sourceTables: ["attempts", "exam_results.details", "rules_exam_results.details", "clips"],
      warnings,
      totals: {
        attemptsRows: attemptsRes.data?.length ?? 0,
        examRows: examsRes.data?.length ?? 0,
        rulesExamRows: rulesRes.error ? 0 : (rulesRes.data?.length ?? 0),
        clips: clips.length,
        activeClips: clips.filter(isActiveClip).length,
      },
      topics,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo auditar el radar arbitral.",
        technical: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

function buildAttemptEntries(
  attempts: AuditAttemptRow[],
  clipMap: Map<string, AuditClipRow>
): AuditEntry[] {
  return attempts
    .map((attempt, index) => {
      const clipId = attempt.clip_id?.trim() ?? "";
      const clip = clipId ? clipMap.get(clipId) : undefined;
      const storedTopic = normalizeTopic(attempt.topic);
      return buildEntry({
        id: attempt.id ?? `attempt-${index}`,
        source: "attempts",
        userId: attempt.user_id ?? "",
        storedTopic,
        clip,
        clipId,
        clipTitle: attempt.clip_title ?? clip?.title ?? "Sin titulo",
        score: cleanScore(attempt.score),
        date: attempt.created_at ?? "",
        mode: [attempt.module, attempt.mode].filter(Boolean).join(" / ") || "attempt",
      });
    })
    .filter((entry) => coreTopics.includes(entry.storedTopic));
}

function buildExamEntries(
  exams: AuditExamRow[],
  clipMap: Map<string, AuditClipRow>
): AuditEntry[] {
  return exams.flatMap((exam, examIndex) => {
    const details = Array.isArray(exam.details) ? exam.details : [];
    return details
      .map((answer, answerIndex) => {
        const clipId = answer.clipId?.trim() ?? "";
        const clip = clipId ? clipMap.get(clipId) : undefined;
        const storedTopic = normalizeTopic(answer.topic);
        return buildEntry({
          id: `${exam.id ?? `exam-${examIndex}`}:${clipId || answerIndex}`,
          source: "exam_results.details",
          userId: exam.user_id ?? "",
          storedTopic,
          clip,
          clipId,
          clipTitle: answer.clipTitle ?? clip?.title ?? "Clip de examen",
          score: cleanScore(answer.score),
          date: exam.created_at ?? "",
          mode: "exam_result detail",
        });
      })
      .filter((entry) => coreTopics.includes(entry.storedTopic));
  });
}

function buildRulesEntries(rulesExams: AuditRulesRow[]): AuditEntry[] {
  return rulesExams.flatMap((exam, examIndex) => {
    const details = Array.isArray(exam.details) ? exam.details : [];
    return details
      .map((answer, answerIndex) => {
        const storedTopic = normalizeTopic(answer.topic);
        return buildEntry({
          id: `${exam.id ?? `rules-${examIndex}`}:${answer.question_id ?? answerIndex}`,
          source: "rules_exam_results.details",
          userId: exam.user_id ?? "",
          storedTopic,
          clip: undefined,
          clipId: "",
          clipTitle: answer.question ?? "Pregunta IFAB",
          score: typeof answer.is_correct === "boolean" ? (answer.is_correct ? 100 : 0) : null,
          date: exam.created_at ?? "",
          mode: "rules_exam_result detail",
        });
      })
      .filter((entry) => coreTopics.includes(entry.storedTopic));
  });
}

function buildEntry({
  id,
  source,
  userId,
  storedTopic,
  clip,
  clipId,
  clipTitle,
  score,
  date,
  mode,
}: {
  id: string;
  source: AuditEntry["source"];
  userId: string;
  storedTopic: string;
  clip?: AuditClipRow;
  clipId: string;
  clipTitle: string;
  score: number | null;
  date: string;
  mode: string;
}): AuditEntry {
  const currentTopic = normalizeTopic(getClipTopic(clip) || storedTopic);
  const clipExists = Boolean(clip);
  const clipActive = Boolean(clip && isActiveClip(clip));
  const topicChanged = clipExists && storedTopic !== currentTopic;
  const valid = Boolean(clipId && clipExists && clipActive && storedTopic === currentTopic);
  const reason = getValidityReason({ clipId, clipExists, clipActive, topicChanged });

  return {
    id,
    source,
    userId,
    storedTopic,
    currentTopic,
    clipId: clipId || "Sin clip",
    clipTitle,
    score,
    date,
    valid,
    reason,
    clipExists,
    clipActive,
    clipStatus: clip?.status ?? (clipActive ? "active" : "unknown"),
    clipUpdatedAt: clip?.updated_at ?? "",
    topicChanged,
    mode,
  };
}

function buildTopicAudit(entries: AuditEntry[], clips: AuditClipRow[]) {
  return coreTopics.map((topic) => {
    const topicEntries = entries.filter((entry) => entry.storedTopic === topic);
    const activeClips = clips.filter((clip) => normalizeTopic(getClipTopic(clip)) === topic && isActiveClip(clip));
    const clipsById = new Map<string, { id: string; title: string; active: boolean; exists: boolean; usedCount: number; lastDate: string }>();

    topicEntries.forEach((entry) => {
      const current = clipsById.get(entry.clipId) ?? {
        id: entry.clipId,
        title: entry.clipTitle,
        active: entry.clipActive,
        exists: entry.clipExists,
        usedCount: 0,
        lastDate: "",
      };

      current.usedCount += 1;
      current.lastDate = latestDate(current.lastDate, entry.date);
      current.active = current.active || entry.clipActive;
      current.exists = current.exists || entry.clipExists;
      clipsById.set(entry.clipId, current);
    });

    return {
      topic,
      totalAttempts: topicEntries.length,
      validAttempts: topicEntries.filter((entry) => entry.valid).length,
      invalidAttempts: topicEntries.filter((entry) => !entry.valid).length,
      activeClipCount: activeClips.length,
      lastDate: topicEntries.reduce((latest, entry) => latestDate(latest, entry.date), ""),
      clipsUsed: Array.from(clipsById.values()).sort((a, b) => b.usedCount - a.usedCount),
      entries: topicEntries.sort((a, b) => dateMs(b.date) - dateMs(a.date)),
    };
  });
}

async function requireSuperAdmin() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && normalizeRole(data?.role) === "super_admin") {
      return { response: null, supabase };
    }

    if (error) throw error;

    const client = await clerkClient();
    const clerkUser = (await client.users.getUser(userId)) as ClerkBackendUser;

    if (isConfiguredSuperAdmin(clerkUser)) {
      await ensureUserRecords(supabase, clerkUser);
      return { response: null, supabase };
    }

    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el acceso admin.",
          technical: getErrorMessage(error),
        },
        { status: 500 }
      ),
      supabase: null as never,
    };
  }
}

function getValidityReason({
  clipId,
  clipExists,
  clipActive,
  topicChanged,
}: {
  clipId: string;
  clipExists: boolean;
  clipActive: boolean;
  topicChanged: boolean;
}) {
  if (!clipId) return "Sin clip asociado";
  if (!clipExists) return "Clip eliminado o no encontrado";
  if (!clipActive) return "Clip inactivo";
  if (topicChanged) return "El topico del clip fue modificado";
  return "Valido para radar";
}

function normalizeTopic(topic?: string | null) {
  if (!topic) return "Sin topico";
  return topicDictionary[topic] ?? topic;
}

function getClipTopic(clip?: AuditClipRow) {
  if (!clip) return "";
  const value = `${clip.topic ?? ""} ${clip.mode ?? ""} ${clip.module ?? ""}`.toLowerCase();
  if (value.includes("var")) return "VAR";
  return clip.topic ?? "";
}

function isActiveClip(clip: AuditClipRow) {
  const status = String(clip.status ?? "").toLowerCase();
  return clip.is_active !== false && status !== "archived" && status !== "inactive";
}

function latestDate(a: string, b: string) {
  return dateMs(a) > dateMs(b) ? a : b;
}

function dateMs(value?: string | null) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function cleanScore(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return formatSupabaseError(error);
}

function formatSupabaseError(error: unknown) {
  if (!error) return "Error desconocido";

  if (typeof error === "string") return error;

  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [
      record.message,
      record.details,
      record.hint,
      record.code ? `code: ${record.code}` : null,
    ]
      .filter(Boolean)
      .map(String);

    if (parts.length > 0) return parts.join(" | ");

    try {
      return JSON.stringify(record);
    } catch {
      return "Error de Supabase no serializable";
    }
  }

  return String(error);
}
