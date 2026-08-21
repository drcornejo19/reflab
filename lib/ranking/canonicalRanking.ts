import "server-only";

import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import { getPublicRankingName, resolveRefCardId } from "../refCard.ts";
import type { SportType } from "../sports.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import type { RankingResponse, RankingRow } from "./types.ts";

type RankingExamResult = {
  user_id?: string | null;
  sport_type?: string | null;
  avg_score?: number | string | null;
  total_questions?: number | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type RankingProfile = {
  user_id?: string | null;
  ref_card_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  ranking_display_name?: string | null;
  show_real_name_in_ranking?: boolean | null;
};

type RankingRecords = {
  examResults: RankingExamResult[];
  profiles: RankingProfile[];
};

export type CanonicalRankingDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  loadOfficialRecords(sportType: SportType): Promise<RankingRecords>;
};

type RankingRequestDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
  loadRanking(
    externalSubject: string,
    sportType: SportType
  ): Promise<RankingResponse>;
  logError(label: string, diagnostic: { code: string; message: string }): void;
};

export class RankingForbiddenError extends Error {
  constructor() {
    super("ranking_forbidden");
    this.name = "RankingForbiddenError";
  }
}

export async function executeCanonicalRankingRequest(
  request: Request,
  dependencies: RankingRequestDependencies
) {
  const externalSubject = await dependencies.getAuthenticatedUserId();
  if (!externalSubject) {
    return noStoreJson({ error: "authentication_required" }, { status: 401 });
  }

  const sportType = parseRankingSport(new URL(request.url));
  if (!sportType) {
    return noStoreJson({ error: "invalid_sport_type" }, { status: 400 });
  }

  try {
    return noStoreJson(
      await dependencies.loadRanking(externalSubject, sportType)
    );
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return noStoreJson(
        { error: "identity_link_required" },
        { status: 409 }
      );
    }
    if (error instanceof RankingForbiddenError) {
      return noStoreJson(
        { error: "ranking_forbidden" },
        { status: 403 }
      );
    }

    dependencies.logError(
      "Canonical ranking failed",
      sanitizeDiagnostic(error)
    );
    return noStoreJson(
      {
        error: "ranking_unavailable",
        message: "No se pudo cargar el ranking.",
      },
      { status: 500 }
    );
  }
}

export async function loadCanonicalGlobalRanking(
  externalSubject: string,
  sportType: SportType,
  dependencies = createCanonicalRankingDependencies()
) {
  const access = await dependencies.loadAccess(externalSubject);
  if (
    access.globalRole !== "super_admin" &&
    !access.capabilities.includes("ref_performance")
  ) {
    throw new RankingForbiddenError();
  }

  const records = await dependencies.loadOfficialRecords(sportType);
  return buildCanonicalRanking({
    ...records,
    sportType,
    canonicalUserId: access.userId,
  });
}

export function buildCanonicalRanking({
  examResults,
  profiles,
  sportType,
  canonicalUserId,
}: RankingRecords & {
  sportType: SportType;
  canonicalUserId: string;
}): RankingResponse {
  const profileMap = new Map(
    profiles
      .filter((profile) => validText(profile.user_id))
      .map((profile) => [profile.user_id as string, profile])
  );
  const grouped = new Map<string, Array<{ score: number; date: string }>>();

  for (const result of examResults) {
    const userId = validText(result.user_id) ? result.user_id : null;
    const score = canonicalScore(result.avg_score);
    if (
      !userId ||
      result.sport_type !== sportType ||
      score === null ||
      !profileMap.has(userId)
    ) {
      continue;
    }

    const date = officialResultDate(result);
    const values = grouped.get(userId) ?? [];
    values.push({ score, date });
    grouped.set(userId, values);
  }

  const internalRows = Array.from(grouped.entries()).map(
    ([userId, evaluations]) => {
      const profile = profileMap.get(userId)!;
      const scores = evaluations.map((evaluation) => evaluation.score);
      return {
        userId,
        displayName: getPublicRankingName(userId, profile, canonicalUserId),
        refCardId: resolveRefCardId(userId, profile),
        averageScore: roundScore(
          scores.reduce((total, score) => total + score, 0) / scores.length
        ),
        bestScore: Math.max(...scores),
        evaluations: scores.length,
        lastEvaluationAt: evaluations
          .map((evaluation) => evaluation.date)
          .sort(compareDatesDesc)[0] ?? "",
        isCurrentUser: userId === canonicalUserId,
      };
    }
  );

  // This is the global RefLab ranking. Institution-scoped ranking requires a
  // separate endpoint with exact tenant authorization and is intentionally absent.
  const rows: RankingRow[] = internalRows
    .sort(
      (left, right) =>
        right.averageScore - left.averageScore ||
        right.bestScore - left.bestScore ||
        right.evaluations - left.evaluations ||
        compareDatesDesc(left.lastEvaluationAt, right.lastEvaluationAt) ||
        left.refCardId.localeCompare(right.refCardId)
    )
    .map((row, index) => ({
      position: index + 1,
      displayName: row.displayName,
      refCardId: row.refCardId,
      averageScore: row.averageScore,
      bestScore: row.bestScore,
      evaluations: row.evaluations,
      lastEvaluationAt: row.lastEvaluationAt,
      isCurrentUser: row.isCurrentUser,
    }));

  return {
    rows,
    selfPosition: rows.find((row) => row.isCurrentUser) ?? null,
  };
}

function createCanonicalRankingDependencies(): CanonicalRankingDependencies {
  const supabase = createSupabaseAdminClient();
  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
    loadOfficialRecords: async (sportType) => {
      const examResultsResult = await supabase
        .from("exam_results")
        .select("user_id,sport_type,avg_score,submitted_at,created_at")
        .eq("sport_type", sportType)
        .order("submitted_at", { ascending: false });
      if (examResultsResult.error) throw examResultsResult.error;

      const userIds = [
        ...new Set(
          (examResultsResult.data ?? [])
            .map((result) => result.user_id)
            .filter((userId): userId is string => validText(userId))
        ),
      ];
      if (userIds.length === 0) {
        return { examResults: [], profiles: [] };
      }

      const profilesResult = await supabase
        .from("user_profiles")
        .select(
          "user_id,ref_card_id,first_name,last_name,ranking_display_name,show_real_name_in_ranking"
        )
        .in("user_id", userIds);
      if (profilesResult.error) throw profilesResult.error;

      return {
        examResults: examResultsResult.data ?? [],
        profiles: profilesResult.data ?? [],
      };
    },
  };
}

function parseRankingSport(url: URL): SportType | null {
  if (
    [...url.searchParams.keys()].some((key) => key !== "sport") ||
    url.searchParams.getAll("sport").length !== 1
  ) {
    return null;
  }
  const sport = url.searchParams.get("sport");
  return sport === "football_11" || sport === "futsal" ? sport : null;
}

function canonicalScore(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}

function officialResultDate(result: RankingExamResult) {
  return validText(result.submitted_at)
    ? result.submitted_at
    : validText(result.created_at)
      ? result.created_at
      : "";
}

function compareDatesDesc(left: string, right: string) {
  return dateValue(right) - dateValue(left);
}

function dateValue(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function sanitizeDiagnostic(error: unknown) {
  if (error instanceof Error) {
    return { code: "unexpected_error", message: sanitizeMessage(error.message) };
  }
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code:
        typeof record.code === "string" ? record.code : "unexpected_error",
      message: sanitizeMessage(
        typeof record.message === "string" ? record.message : "Unknown ranking error"
      ),
    };
  }
  return { code: "unexpected_error", message: "Unknown ranking error" };
}

function sanitizeMessage(message: string) {
  return message
    .replace(/user_[A-Za-z0-9_-]+/g, "[user]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  return Response.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
